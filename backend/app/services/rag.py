import json
import logging
from typing import List, Dict, Any, Optional, Tuple
import sqlite_vec
from app.database import get_db
from app.services.llm import llm_service
from app.config import settings

logger = logging.getLogger(__name__)


class RAGService:
    def __init__(self):
        self.top_k = 5
        self.similarity_threshold = 0.7

    def _serialize_vector(self, vector: List[float]) -> bytes:
        """Serialize vector to the vec0 blob format for storage"""
        return sqlite_vec.serialize_float32(list(vector))

    def _deserialize_vector(self, data: bytes) -> List[float]:
        """Deserialize a vec0-format blob back into floats"""
        try:
            return list(sqlite_vec.deserialize_float32(data))
        except Exception:
            return []

    async def add_chunks(
        self,
        tenant_id: str,
        chunks: List[Dict[str, Any]]
    ) -> List[str]:
        """Add knowledge chunks with embeddings"""
        db = get_db()
        chunk_ids = []

        # Generate embeddings for all chunks
        texts = [chunk['content'] for chunk in chunks]
        embeddings = await llm_service.embed(texts)

        for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
            chunk_id = chunk.get('id') or f"{tenant_id}_{chunk['source_id']}_{i}"
            embedding_bytes = self._serialize_vector(embedding)

            await db.execute("""
                INSERT OR REPLACE INTO knowledge_chunks
                (id, tenant_id, source_id, source_type, content, embedding, metadata, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%s','now'))
            """, [
                chunk_id,
                tenant_id,
                chunk['source_id'],
                chunk['source_type'],
                chunk['content'],
                embedding_bytes,
                json.dumps(chunk.get('metadata', {}))
            ])

            # Add to vector index (vec0 table). If the vec extension isn't
            # available this is a no-op with a warning; search degrades too.
            try:
                await db.execute("""
                    INSERT OR REPLACE INTO knowledge_vec (embedding, chunk_id)
                    VALUES (?, ?)
                """, [embedding_bytes, chunk_id])
            except Exception as e:
                logger.warning(f"Could not insert into knowledge_vec: {e}")

            chunk_ids.append(chunk_id)

        return chunk_ids

    async def search(
        self,
        tenant_id: str,
        query: str,
        top_k: int = None
    ) -> List[Dict[str, Any]]:
        """Search knowledge base using vector similarity"""
        db = get_db()
        top_k = top_k or self.top_k

        # Generate query embedding
        query_embedding = await llm_service.embed_single(query)
        query_bytes = self._serialize_vector(query_embedding)

        # Vector search with tenant filter
        try:
            result = await db.execute("""
                SELECT
                    kc.id,
                    kc.tenant_id,
                    kc.source_id,
                    kc.source_type,
                    kc.content,
                    kc.metadata,
                    kc.created_at,
                    vec_distance_cosine(kc.embedding, ?) as distance
                FROM knowledge_chunks kc
                WHERE kc.tenant_id = ?
                ORDER BY distance ASC
                LIMIT ?
            """, [query_bytes, tenant_id, top_k * 2])  # Get more for filtering
        except Exception as e:
            logger.warning(f"Vector search unavailable ({e}); returning no chunks")
            return []

        chunks = []
        for row in result.rows:
            chunk = dict(zip(result.columns, row))
            similarity = 1 - chunk['distance']
            if similarity >= self.similarity_threshold:
                chunk['similarity'] = similarity
                chunks.append(chunk)

        return chunks[:top_k]

    async def delete_chunks(self, tenant_id: str, source_id: str) -> int:
        """Delete all chunks for a source"""
        db = get_db()

        # Get chunk IDs first
        result = await db.execute(
            "SELECT id FROM knowledge_chunks WHERE tenant_id = ? AND source_id = ?",
            [tenant_id, source_id]
        )

        chunk_ids = [row[0] for row in result.rows]
        if not chunk_ids:
            return 0

        # Delete from vector index
        placeholders = ','.join(['?'] * len(chunk_ids))
        await db.execute(
            f"DELETE FROM knowledge_vec WHERE chunk_id IN ({placeholders})",
            chunk_ids
        )

        # Delete from chunks table
        await db.execute(
            "DELETE FROM knowledge_chunks WHERE tenant_id = ? AND source_id = ?",
            [tenant_id, source_id]
        )

        return len(chunk_ids)

    async def get_sources(self, tenant_id: str) -> List[Dict[str, Any]]:
        """Get all knowledge sources for a tenant"""
        db = get_db()
        result = await db.execute("""
            SELECT
                source_id,
                source_type,
                COUNT(*) as chunk_count,
                MAX(created_at) as last_updated
            FROM knowledge_chunks
            WHERE tenant_id = ?
            GROUP BY source_id, source_type
            ORDER BY last_updated DESC
        """, [tenant_id])

        return [dict(zip(result.columns, row)) for row in result.rows]

    async def chunk_text(
        self,
        text: str,
        chunk_size: int = 500,
        overlap: int = 50
    ) -> List[str]:
        """Split text into overlapping chunks"""
        words = text.split()
        chunks = []

        for i in range(0, len(words), chunk_size - overlap):
            chunk = ' '.join(words[i:i + chunk_size])
            if chunk.strip():
                chunks.append(chunk.strip())

        return chunks


rag_service = RAGService()