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
  const sep = path.includes('?') ? '&' : '?'
  const url = `${API_BASE}${path}${sep}key=${encodeURIComponent(env.GEMINI_API_KEY)}`
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
      // Gemini 3.x can't have reasoning disabled (thinkingBudget is 2.5-only),
      // so pin the lowest supported thinking level to keep responses short and
      // ensure the output budget is left for visible text.
      thinkingConfig: { thinkingLevel: 'MINIMAL' },
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
      // Gemini 3.x can't have reasoning disabled (thinkingBudget is 2.5-only),
      // so pin the lowest supported thinking level to keep responses short and
      // ensure the output budget is left for visible text.
      thinkingConfig: { thinkingLevel: 'MINIMAL' },
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
  try {
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
  } catch (e) {
    console.error(
      `[streamText] failed model:${chatModel(env)} | ${e instanceof Error ? e.stack || e.message : String(e)}`,
    )
    throw e
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
  const prompt = `Classify the user's intent into ONE category from the list below. Respond with ONLY the category name, nothing else — no explanation, no punctuation.

Categories:
- book_appointment: User wants to schedule a meeting, book a time slot, or reserve an appointment
- cancel_appointment: User wants to cancel or reschedule an existing appointment
- check_availability: User asks about open/free time slots, when someone is available
- greeting: Pure greeting like "hello", "hi", "hey", "good morning", "good afternoon", "good evening", "howdy", "sup", "yo" — no question, just saying hello
- general_query: User asks any question about the business — hours, services, prices, location, contact info, policies, packages, what they do, how their process works, testimonials, experience, or anything else answerable from their information
- transfer_human: User explicitly asks to talk to a person, a human, support, or a real person
- unclear: Messages with completely no clear intent — gibberish ("asdf", "lol"), yes/no without context ("Yes", "Maybe"), or random noise

STRICT RULES:
- ANY question seeking information is general_query, NEVER unclear or greeting. This includes short questions like "Price?", "Hours?", "Location?", "Services?", "Contact?"
- Questions starting with Who, What, Where, When, Why, How, Can, Do, Is, Are, Does, Will, Would, Could, Should, May, Might are ALWAYS general_query (unless specifically about booking/canceling/availability)
- Expressions of interest like "I need a website", "I'm looking for a designer", "I want a redesign" are general_query
- ONLY classify as greeting if it's a pure greeting ("Hi", "Hello", "Hey", "Good morning", "Good afternoon", "Good evening", "Howdy", "Yo", "Sup") with absolutely no question attached
- If the message has ANY question word or seeks ANY information, it is NOT greeting and NOT unclear — it's general_query
- Only classify as unclear if it's gibberish, random noise, or yes/no without any context — not greetings
- Booking-related words (book, schedule, appointment, slot, time, reserve) take priority: book_appointment if they want to book, check_availability if they're asking about open times

Examples:
User: "Book a meeting for Tuesday 2pm" -> book_appointment
User: "Cancel my appointment" -> cancel_appointment
User: "What times are open Friday?" -> check_availability
User: "What's your refund policy?" -> general_query
User: "Talk to a person" -> transfer_human
User: "Hello" -> unclear
User: "Hi" -> unclear
User: "hey" -> unclear
User: "What are your hours?" -> general_query
User: "What services do you offer?" -> general_query
User: "What does your company do?" -> general_query
User: "How much does a website cost?" -> general_query
User: "How much does it cost?" -> general_query
User: "Where are you located?" -> general_query
User: "How do I get in touch?" -> general_query
User: "Do you do custom websites?" -> general_query
User: "Can you redesign my site?" -> general_query
User: "Tell me about your packages" -> general_query
User: "I need a website" -> general_query
User: "What's included in the Professional package?" -> general_query
User: "How long does a project take?" -> general_query
User: "Do you work with international clients?" -> general_query
User: "What's your phone number?" -> general_query
User: "Can I see some examples?" -> general_query
User: "Who are your clients?" -> general_query
User: "What's your experience?" -> general_query
User: "I'm looking for a web designer" -> general_query
User: "Price?" -> general_query
User: "Show me pricing" -> general_query
User: "What's the cheapest option?" -> general_query
User: "I want to book" -> book_appointment
User: "Schedule something" -> book_appointment
User: "Book an appointment" -> book_appointment
User: "When are you free?" -> check_availability
User: "What slots do you have?" -> check_availability
User: "Cancel my booking" -> cancel_appointment
User: "I need to reschedule" -> cancel_appointment
User: "Talk to a human" -> transfer_human
User: "Get me a real person" -> transfer_human
User: "Yes" -> unclear
User: "Maybe" -> unclear
User: "lol" -> unclear
User: "asdf" -> unclear
User: "What is your refund policy and can I book a meeting" -> book_appointment
User: "How much and where are you?" -> general_query
User: "What does Weblyft Design do?" -> general_query
User: "Tell me about your business" -> general_query

User message: "${text}"
Intent:`
  let response: string
  try {
    response = await generateText(env, {
      messages: [{ role: 'user', text: prompt }],
      temperature: 0.1,
      maxTokens: 300,
    })
  } catch (e) {
    // Surface quota exhaustion (429) to the caller so the chat handler can show
    // a clear "usage limit" message instead of a misleading unclear fallback.
    if (e instanceof LLMError && e.status === 429) throw e
    return 'unclear'
  }
  const intent = response.trim().toLowerCase().replace(/[^a-z_]/g, '')
  console.error(`[classifyIntent] input:${text.length <= 80 ? text : text.slice(0, 80) + '...'} | raw:${response.slice(0, 140)} | intent:${intent}`)
  const valid = [
    'book_appointment',
    'cancel_appointment',
    'check_availability',
    'greeting',
    'general_query',
    'transfer_human',
    'unclear',
  ]
  for (const v of valid) {
    if (intent.includes(v)) return v
  }
  return 'unclear'
}

/** Port of backend llm.py synthesize_answer (RAG answer from context).
 * Adds conversation history so follow-up questions ("How much is that one?",
 * "What about the cheaper option?") can be answered from context + history.
 */
export async function* synthesizeAnswer(
  env: Env,
  query: string,
  contextChunks: string[],
  previousMessages: { role: 'user' | 'assistant'; text: string }[] = [],
): AsyncGenerator<string> {
  const context = contextChunks
    .map((c, i) => `Source ${i + 1}: ${c}`)
    .join('\n')
  const history = previousMessages
    .map((m) => `${m.role === 'assistant' ? 'Assistant' : 'User'}: ${m.text}`)
    .join('\n')
  const prompt = `You are a friendly, conversational AI assistant. Your goal is to have natural, engaging conversations with users — like a helpful mini ChatGPT. You can chat about all kinds of topics, be witty, thoughtful, and personable.

## TWO MODES:

### MODE 1 — General conversation (default):
When the user says something that's NOT specifically about the business (Weblyft Design), just chat naturally. Be friendly, helpful, engaging. You can:
- Chat about their day, interests, ideas
- Give opinions (respectfully)
- Tell jokes or be playful
- Give general advice or information
- Have back-and-forth conversations
- Be creative and curious

Talk like a real person would — use "I", share perspectives, ask follow-up questions. Don't be overly formal or robotic.

### MODE 2 — Business knowledge (when relevant):
When the user asks about Weblyft Design (the business), answer ONLY from the knowledge base below. This includes questions about:
- What the business does
- Services, packages, pricing
- Process, timeline, delivery
- Contact info, location, hours
- Testimonials, experience
- Any other business-specific question

For business questions: be accurate, use the knowledge base, never make up facts about the business. But still keep it conversational — don't just recite facts dryly.

## HOW TO TELL THE MODES APART:
- If the user mentions "Weblyft", "your business", "your services", "your packages", "you" (referring to the business), or asks something that matches the knowledge base — use MODE 2 (business answers)
- If the user is just chatting, asking about life, sharing thoughts, asking general questions not about the business, saying hello, or talking about random topics — use MODE 1 (chat freely)
- When unsure, ALWAYS lean toward MODE 1 (chat freely) — it's better to have a natural conversation than to say "I don't have that info"
- The absence of knowledge base context (empty context) means the user is NOT asking about the business — chat freely!

## CRITICAL RULE — DON'T SAY "I DON'T HAVE THAT INFO" FOR NON-BUSINESS QUESTIONS:
- If the knowledge base context is EMPTY or the question is NOT about the business, DO NOT say "I don't have that information" or reference the knowledge base at all
- Just chat naturally like a friendly AI assistant
- Only say you don't have business info if the user explicitly asks about the business AND the knowledge base doesn't have it
- For everything else: be friendly, give your perspective, ask follow-ups, have a conversation

## FORMATTING:
- Plain text only. No markdown, no bullet points.
- Natural paragraphs.
- Conversational tone.

Conversation history:
${history || '(no prior messages)'}

Knowledge base (only for business questions):
${context}

User says: ${query}

Your reply:`
  yield* streamText(env, {
    messages: [{ role: 'user', text: prompt }],
    temperature: 0.3,
    maxTokens: 600,
  })
}
