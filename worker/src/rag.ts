/**
 * RAG service (port of backend/app/services/rag.py).
 *
 * - Vectors are stored twice, exactly like the FastAPI backend: a float32
 *   BLOB in knowledge_chunks.embedding (searched with vec_distance_cosine)
 *   and rows in the knowledge_vec vec0 virtual table.
 * - Provider-mixing rule (§5.3 of ../hf-docker-exit-spec.md): never embed with
 *   a different model while existing rows use another — always
 *   gemini-embedding-001 @ 768 dims.
 */
import type { Client } from '@libsql/client/web'
import { query, rowString, type SqlRow } from './db'
import { embedSingle, embedTexts, LLMError } from './llm'
import { similarityThreshold, topK, type Env } from './config'
import { vectorToBlob } from './vec'

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

    // vec0 has no unique key on chunk_id, so remove any prior row for this
    // chunk before inserting (mirrors the intent of INSERT OR REPLACE).
    await query(db, 'DELETE FROM knowledge_vec WHERE chunk_id = ?', [chunkId])

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
    await query(
      db,
      'INSERT INTO knowledge_vec (embedding, chunk_id) VALUES (?, ?)',
      [blob, chunkId],
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
  const blob = vectorToBlob(queryEmbedding)

  let result
  try {
    result = await query(
      db,
      `SELECT
         kc.id, kc.tenant_id, kc.source_id, kc.source_type, kc.content,
         kc.metadata, kc.created_at,
         vec_distance_cosine(kc.embedding, ?) AS distance
       FROM knowledge_chunks kc
       WHERE kc.tenant_id = ?
       ORDER BY distance ASC
       LIMIT ?`,
      [blob, tenantId, k * 2],
    )
  } catch (e) {
    console.warn('Vector search unavailable:', e)
    return []
  }

  const hits: SearchHit[] = []
  for (const row of result.rows) {
    const distance = Number(row['distance'] ?? 1)
    const similarity = 1 - distance
    if (similarity < threshold) continue
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
  const placeholders = chunkIds.map(() => '?').join(',')
  await query(
    db,
    `DELETE FROM knowledge_vec WHERE chunk_id IN (${placeholders})`,
    chunkIds,
  )
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
