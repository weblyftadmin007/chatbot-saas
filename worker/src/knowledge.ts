/**
 * Knowledge processing (port of backend/app/services/knowledge.py).
 *
 * Phase 1 supports text/markdown/FAQ sources. PDF text extraction happens
 * outside the Worker (browser-side in the admin dashboard, or a local CLI
 * extractor) and is POSTed as text — see §5.6 of ../hf-docker-exit-spec.md.
 */
import type { Client } from '@libsql/client/web'
import { chunkOverlap, chunkSize, type Env } from './config'
import { addChunks, deleteChunks, listSources, type KnowledgeChunk } from './rag'

export { deleteChunks, listSources }

export function chunkText(text: string, size: number, overlap: number): string[] {
  // Word-level chunking identical to the Python backend (str.split()).
  const words = text.split(/\s+/).filter(Boolean)
  const chunks: string[] = []
  const step = size - overlap
  for (let i = 0; i < words.length; i += step) {
    const chunk = words.slice(i, i + size).join(' ')
    if (chunk.trim()) chunks.push(chunk.trim())
  }
  return chunks
}

export async function processText(
  db: Client,
  env: Env,
  tenantId: string,
  text: string,
  sourceId: string,
  sourceType = 'txt',
): Promise<{ source_id: string; chunks_created: number; total_chars: number }> {
  const raw = chunkText(text, chunkSize(env), chunkOverlap(env))
  const chunks: KnowledgeChunk[] = raw.map((c, i) => ({
    id: `${sourceId}_${i}`,
    source_id: sourceId,
    source_type: sourceType,
    content: c,
    metadata: {},
  }))
  const added = await addChunks(db, env, tenantId, chunks, sourceId)
  return { source_id: sourceId, chunks_created: added.length, total_chars: text.length }
}

export async function processFaq(
  db: Client,
  env: Env,
  tenantId: string,
  faqItems: Array<{ question?: string; answer?: string }>,
  sourceId: string,
): Promise<{ source_id: string; chunks_created: number; total_items: number }> {
  const chunks: KnowledgeChunk[] = []
  for (let i = 0; i < faqItems.length; i++) {
    const q = (faqItems[i]?.question || '').trim()
    const a = (faqItems[i]?.answer || '').trim()
    if (q && a) {
      chunks.push({
        id: `${sourceId}_${i}`,
        source_id: sourceId,
        source_type: 'faq',
        content: `Q: ${q}\nA: ${a}`,
        metadata: { question: q },
      })
    }
  }
  const added = await addChunks(db, env, tenantId, chunks, sourceId)
  return { source_id: sourceId, chunks_created: added.length, total_items: faqItems.length }
}
