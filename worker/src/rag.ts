/**
 * RAG service (port of backend/app/services/rag.py).
 *
 * - Vectors live ONLY in knowledge_chunks.embedding as float32 BLOBs. Turso's
 *   hosted database does not ship the sqlite-vec extension (vec0), so search
 *   decodes blobs and ranks by cosine similarity inside the Worker — fine at
 *   this product's scale (a business's FAQ/hours). If a tenant's chunk count
 *   grows large, move retrieval to Turso's native FLOAT32 vector columns.
 * - Provider-mixing rule (§5.3 of ../hf-docker-exit-spec.md): never embed with
 *   a different model while existing rows use another — always
 *   gemini-embedding-001 @ 768 dims.
 */
import type { Client } from '@libsql/client/web'
import { query, rowString, type SqlRow } from './db'
import { embedSingle, embedTexts, LLMError } from './llm'
import { similarityThreshold, topK, type Env } from './config'
import { blobToVector, cosineSimilarity, vectorToBlob } from './vec'

export interface KnowledgeChunk {
  id: string
  source_id: string
  source_type: string
  content: string
  metadata?: Record<string, unknown>
}

export interface SearchHit {
  id: string
  tenant_id: string
  source_id: string
  source_type: string
  content: string
  metadata: string
  created_at: number
  similarity: number
}

export async function addChunks(
  db: Client,
  env: Env,
  tenantId: string,
  chunks: KnowledgeChunk[],
): Promise<string[]> {
  if (!chunks.length) return []
  const texts = chunks.map((c) => c.content)
  const embeddings = await embedTexts(env, texts)
  const ids: string[] = []
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!
    const embedding = embeddings[i]!
    const chunkId = chunk.id || `${tenantId}_${chunk.source_id}_${i}`
    const blob = vectorToBlob(embedding)
    const now = Math.floor(Date.now() / 1000)

    // knowledge_chunks is the single source of truth (no vec0 table): the
    // primary key (id) makes INSERT OR REPLACE idempotent on re-upload.
    await query(
      db,
      `INSERT OR REPLACE INTO knowledge_chunks
         (id, tenant_id, source_id, source_type, content, embedding, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        chunkId,
        tenantId,
        chunk.source_id,
        chunk.source_type,
        chunk.content,
        blob,
        JSON.stringify(chunk.metadata || {}),
        now,
      ],
    )
    ids.push(chunkId)
  }
  return ids
}

export async function search(
  db: Client,
  env: Env,
  tenantId: string,
  queryText: string,
): Promise<SearchHit[]> {
  const k = topK(env)
  const threshold = similarityThreshold(env)
  let queryEmbedding: number[]
  try {
    queryEmbedding = await embedSingle(env, queryText)
  } catch (e) {
    if (e instanceof LLMError) throw e
    queryEmbedding = []
  }
  if (!queryEmbedding.length) return []

  const result = await query(
    db,
    `SELECT id, tenant_id, source_id, source_type, content, metadata, created_at, embedding
     FROM knowledge_chunks
     WHERE tenant_id = ? AND embedding IS NOT NULL`,
    [tenantId],
  )

  const scored: Array<{ row: SqlRow; similarity: number }> = []
  for (const row of result.rows) {
    const vec = blobToVector(row['embedding'])
    if (!vec) continue
    scored.push({ row, similarity: cosineSimilarity(queryEmbedding, vec) })
  }
  scored.sort((a, b) => b.similarity - a.similarity)

  const hits: SearchHit[] = []
  for (const { row, similarity } of scored) {
    if (similarity < threshold) break // sorted desc — nothing below will pass
    hits.push({
      id: rowString(row, 'id'),
      tenant_id: rowString(row, 'tenant_id'),
      source_id: rowString(row, 'source_id'),
      source_type: rowString(row, 'source_type'),
      content: rowString(row, 'content'),
      metadata: rowString(row, 'metadata', '{}'),
      created_at: Number(row['created_at'] || 0),
      similarity,
    })
    if (hits.length >= k) break
  }
  return hits
}

export async function deleteChunks(
  db: Client,
  tenantId: string,
  sourceId: string,
): Promise<number> {
  const result = await query(
    db,
    'SELECT id FROM knowledge_chunks WHERE tenant_id = ? AND source_id = ?',
    [tenantId, sourceId],
  )
  const chunkIds = result.rows.map((r) => rowString(r, 'id'))
  if (!chunkIds.length) return 0
  await query(
    db,
    'DELETE FROM knowledge_chunks WHERE tenant_id = ? AND source_id = ?',
    [tenantId, sourceId],
  )
  return chunkIds.length
}

export async function listSources(
  db: Client,
  tenantId: string,
): Promise<SqlRow[]> {
  const result = await query(
    db,
    `SELECT
       source_id, source_type, COUNT(*) AS chunk_count,
       MAX(created_at) AS last_updated
     FROM knowledge_chunks
     WHERE tenant_id = ?
     GROUP BY source_id, source_type
     ORDER BY last_updated DESC`,
    [tenantId],
  )
  return result.rows
}
