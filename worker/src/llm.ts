/**
 * Gemini API client (REST, no SDK). Chat + streaming use a flash-class model
 * (env CHAT_MODEL); embeddings use gemini-embedding-001 at 768 dims so stored
 * vectors match the 768-dim float32 BLOBs in knowledge_chunks.embedding.
 *
 * Free-tier limits are volatile and only visible in AI Studio, so callers must
 * degrade gracefully (§5.7 of ../hf-docker-exit-spec.md): retry once on 429,
 * then let the chat handler fail over / show a friendly message.
 */
import { chatModel, embedModel, embedDimensions, type Env } from './config'

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta'

export class LLMError extends Error {
  status: number
  retryAfterSeconds?: number
  constructor(status: number, message: string, retryAfterSeconds?: number) {
    super(message)
    this.status = status
    this.retryAfterSeconds = retryAfterSeconds
  }
}

export interface LlmMessage {
  role: 'user' | 'assistant'
  text: string
}

interface GemChatRequest {
  system?: string
  messages: LlmMessage[]
  temperature?: number
  maxTokens?: number
}

async function geminiFetch(
  env: Env,
  path: string,
  init: RequestInit,
): Promise<Response> {
  const url = `${API_BASE}${path}?key=${encodeURIComponent(env.GEMINI_API_KEY)}`
  const res = await fetch(url, init)
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    let retryAfter: number | undefined
    const ra = res.headers.get('retry-after')
    if (ra) retryAfter = parseInt(ra, 10) || undefined
    if (res.status === 429 || res.status >= 500) {
      // One retry with backoff for transient / throttled failures.
      const waitSeconds = retryAfter ?? 1 + Math.floor(Math.random() * 2)
      await new Promise((r) => setTimeout(r, Math.min(waitSeconds * 1000, 4000)))
      const res2 = await fetch(url, init)
      if (res2.ok) return res2
      const body2 = await res2.text().catch(() => '')
      throw new LLMError(res2.status, body2.slice(0, 300), retryAfter)
    }
    throw new LLMError(res.status, body.slice(0, 300), retryAfter)
  }
  return res
}

/** Non-streaming text completion. */
export async function generateText(
  env: Env,
  req: GemChatRequest,
): Promise<string> {
  const body: Record<string, unknown> = {
    contents: req.messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.text }],
    })),
    generationConfig: {
      temperature: req.temperature ?? 0.3,
      maxOutputTokens: req.maxTokens ?? 800,
    },
  }
  if (req.system) {
    body.systemInstruction = { parts: [{ text: req.system }] }
  }
  const res = await geminiFetch(
    env,
    `/models/${chatModel(env)}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  )
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  }
  const text = (data.candidates?.[0]?.content?.parts || [])
    .map((p) => p.text || '')
    .join('')
  return text
}

/** Streaming text completion (SSE from Gemini, relayed as string chunks). */
export async function* streamText(
  env: Env,
  req: GemChatRequest,
): AsyncGenerator<string> {
  const body: Record<string, unknown> = {
    contents: req.messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.text }],
    })),
    generationConfig: {
      temperature: req.temperature ?? 0.3,
      maxOutputTokens: req.maxTokens ?? 800,
    },
  }
  if (req.system) {
    body.systemInstruction = { parts: [{ text: req.system }] }
  }
  const res = await geminiFetch(
    env,
    `/models/${chatModel(env)}:streamGenerateContent?alt=sse`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  )
  const reader = res.body?.getReader()
  if (!reader) throw new LLMError(500, 'No stream body')
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      try {
        const data = JSON.parse(line.slice(6)) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
        }
        const text = (data.candidates?.[0]?.content?.parts || [])
          .map((p) => p.text || '')
          .join('')
        if (text) yield text
      } catch {
        // Skip malformed SSE frames (e.g. keep-alive or final metadata).
      }
    }
  }
}

/** Batch embeddings for a list of texts (chunked to stay within request caps). */
export async function embedTexts(env: Env, texts: string[]): Promise<number[][]> {
  const model = embedModel(env)
  const dims = embedDimensions(env)
  const out: number[][] = []
  const BATCH = 25
  for (let i = 0; i < texts.length; i += BATCH) {
    const slice = texts.slice(i, i + BATCH)
    const res = await geminiFetch(env, `/models/${model}:batchEmbedContents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: slice.map((t) => ({
          model: `models/${model}`,
          content: { parts: [{ text: t }] },
          outputDimensionality: dims,
        })),
      }),
    })
    const data = (await res.json()) as {
      embeddings?: Array<{ values?: number[]; embedding?: { values?: number[] } }>
    }
    const got = data.embeddings || []
    if (got.length !== slice.length) {
      throw new LLMError(500, `Expected ${slice.length} embeddings, got ${got.length}`)
    }
    for (const e of got) {
      const values = e.values || e.embedding?.values
      if (!values) throw new LLMError(500, 'Embedding response missing values')
      out.push(values)
    }
  }
  return out
}

export async function embedSingle(env: Env, text: string): Promise<number[]> {
  const res = await embedTexts(env, [text])
  return res[0] || []
}

/** Port of backend llm.py intent classifier (few-shot prompt). */
export async function classifyIntent(env: Env, text: string): Promise<string> {
  const prompt = `Classify the user's intent into ONE category:
- book_appointment: Wants to schedule a meeting
- cancel_appointment: Wants to cancel or reschedule
- check_availability: Asks about open slots
- general_query: Information question
- transfer_human: Explicitly asks for human
- unclear: Ambiguous or off-topic

Examples:
User: "Book a meeting for Tuesday 2pm" -> book_appointment
User: "Cancel my appointment" -> cancel_appointment
User: "What times are open Friday?" -> check_availability
User: "What's your refund policy?" -> general_query
User: "Talk to a person" -> transfer_human
User: "Hello" -> unclear

User: "${text}"
Intent:`
  let response: string
  try {
    response = await generateText(env, {
      messages: [{ role: 'user', text: prompt }],
      temperature: 0.1,
      maxTokens: 20,
    })
  } catch {
    return 'unclear'
  }
  const intent = response.trim().toLowerCase()
  console.error(`[classifyIntent] input:${text.length <= 80 ? text : text.slice(0, 80) + '...'} | raw:${response.slice(0, 140)} | intent:${intent}`)
  const valid = [
    'book_appointment',
    'cancel_appointment',
    'check_availability',
    'general_query',
    'transfer_human',
    'unclear',
  ]
  for (const v of valid) {
    if (intent.includes(v)) return v
  }
  return 'unclear'
}

/** Port of backend llm.py synthesize_answer (RAG answer from context). */
export async function* synthesizeAnswer(
  env: Env,
  query: string,
  contextChunks: string[],
): AsyncGenerator<string> {
  const context = contextChunks
    .map((c, i) => `Source ${i + 1}: ${c}`)
    .join('\n')
  const prompt = `Answer the user's question using ONLY the provided context. 
If the answer isn't in the context, say "I don't have that information in my knowledge base."

Context:
${context}

Question: ${query}

Answer:`
  yield* streamText(env, {
    messages: [{ role: 'user', text: prompt }],
    temperature: 0.2,
    maxTokens: 800,
  })
}
