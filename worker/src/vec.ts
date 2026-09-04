/**
 * Vector <-> blob helpers.
 *
 * sqlite-vec stores float32 vectors as raw little-endian IEEE-754 blobs
 * (identical to what backend/ produced with sqlite_vec.serialize_float32),
 * so `vec_distance_cosine(kc.embedding, ?)` keeps working when the query
 * embedding is written from TypeScript.
 */

export function vectorToBlob(vector: number[] | Float32Array): Uint8Array {
  const f32 = vector instanceof Float32Array ? vector : Float32Array.from(vector)
  // Hosts are little-endian (x86/arm); sqlite-vec expects little-endian blobs.
  return new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength)
}

export function zeroVector(dim: number): number[] {
  return new Array<number>(dim).fill(0)
}
