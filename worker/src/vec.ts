/**
 * Vector <-> blob helpers.
 *
 * Embeddings are stored as raw little-endian IEEE-754 float32 BLOBs in
 * knowledge_chunks.embedding (the same encoding backend/ produced with
 * sqlite_vec.serialize_float32). Turso's hosted database does NOT ship the
 * sqlite-vec extension (vec0), so retrieval (rag.search) decodes these blobs
 * and ranks by cosine similarity inside the Worker — no DB vector functions.
 */

export function vectorToBlob(vector: number[] | Float32Array): Uint8Array {
  const f32 = vector instanceof Float32Array ? vector : Float32Array.from(vector)
  // Hosts are little-endian (x86/arm); float32 blobs are little-endian.
  return new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength)
}

export function blobToVector(value: unknown): number[] | null {
  if (!value) return null
  let bytes: Uint8Array
  if (value instanceof Uint8Array) bytes = value
  else if (value instanceof ArrayBuffer) bytes = new Uint8Array(value)
  else if (ArrayBuffer.isView(value))
    bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  else return null
  const n = Math.floor(bytes.length / 4)
  const out = new Array<number>(n)
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  for (let i = 0; i < n; i++) out[i] = dv.getFloat32(i * 4, true)
  return out
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!
    na += a[i]! * a[i]!
    nb += b[i]! * b[i]!
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

export function zeroVector(dim: number): number[] {
  return new Array<number>(dim).fill(0)
}
