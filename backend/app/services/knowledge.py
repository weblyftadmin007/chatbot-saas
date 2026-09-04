import fitz  # PyMuPDF
from typing import List, Dict, Any, Optional
import uuid
import json
from app.services.rag import rag_service
from app.database import get_db


class KnowledgeService:
    def __init__(self):
        self.chunk_size = 500
        self.chunk_overlap = 50

    async def process_pdf(
        self,
        tenant_id: str,
        file_content: bytes,
        source_id: str
    ) -> Dict[str, Any]:
        """Extract text from PDF and chunk it"""
        doc = fitz.open(stream=file_content, filetype="pdf")
        full_text = ""

        for page_num in range(len(doc)):
            page = doc[page_num]
            text = page.get_text()
            full_text += f"\n--- Page {page_num + 1} ---\n{text}"

        doc.close()

        # Split into chunks
        chunks = self._chunk_text(full_text)

        # Prepare chunk objects
        chunk_objects = []
        for i, chunk_text in enumerate(chunks):
            chunk_objects.append({
                'id': f"{source_id}_{i}",
                'source_id': source_id,
                'source_type': 'pdf',
                'content': chunk_text,
                'metadata': {'page': i // 5 + 1}  # Approximate page
            })

        # Add to RAG
        added_ids = await rag_service.add_chunks(tenant_id, chunk_objects)

        return {
            'source_id': source_id,
            'chunks_created': len(added_ids),
            'total_chars': len(full_text)
        }

    async def process_text(
        self,
        tenant_id: str,
        text: str,
        source_id: str,
        source_type: str = 'txt'
    ) -> Dict[str, Any]:
        """Process plain text content"""
        chunks = self._chunk_text(text)

        chunk_objects = []
        for i, chunk_text in enumerate(chunks):
            chunk_objects.append({
                'id': f"{source_id}_{i}",
                'source_id': source_id,
                'source_type': source_type,
                'content': chunk_text,
                'metadata': {}
            })

        added_ids = await rag_service.add_chunks(tenant_id, chunk_objects)

        return {
            'source_id': source_id,
            'chunks_created': len(added_ids),
            'total_chars': len(text)
        }

    async def process_faq(
        self,
        tenant_id: str,
        faq_items: List[Dict[str, str]],
        source_id: str
    ) -> Dict[str, Any]:
        """Process FAQ items (list of {question, answer})"""
        chunk_objects = []

        for i, item in enumerate(faq_items):
            question = item.get('question', '').strip()
            answer = item.get('answer', '').strip()

            if question and answer:
                content = f"Q: {question}\nA: {answer}"
                chunk_objects.append({
                    'id': f"{source_id}_{i}",
                    'source_id': source_id,
                    'source_type': 'faq',
                    'content': content,
                    'metadata': {'question': question}
                })

        if chunk_objects:
            added_ids = await rag_service.add_chunks(tenant_id, chunk_objects)
        else:
            added_ids = []

        return {
            'source_id': source_id,
            'chunks_created': len(added_ids),
            'total_items': len(faq_items)
        }

    def _chunk_text(self, text: str) -> List[str]:
        """Split text into overlapping chunks"""
        words = text.split()
        chunks = []

        for i in range(0, len(words), self.chunk_size - self.chunk_overlap):
            chunk = ' '.join(words[i:i + self.chunk_size])
            if chunk.strip():
                chunks.append(chunk.strip())

        return chunks

    async def extract_business_hours(self, text: str) -> Dict[str, Any]:
        """Extract business hours from text using LLM"""
        from app.services.llm import llm_service

        prompt = f"""Extract business hours from the following text. Return JSON only.

Text:
{text[:3000]}

Return format:
{{
  "monday": {{"open": "09:00", "close": "17:00"}},
  "tuesday": {{"open": "09:00", "close": "17:00"}},
  "wednesday": {{"open": "09:00", "close": "17:00"}},
  "thursday": {{"open": "09:00", "close": "17:00"}},
  "friday": {{"open": "09:00", "close": "17:00"}},
  "saturday": {{"open": null, "close": null}},
  "sunday": {{"open": null, "close": null}},
  "timezone": "America/New_York"
}}

If a day is closed, use null. If not mentioned, use null.
If timezone not mentioned, use "UTC"."""

        response = await llm_service.chat(
            messages=[{"role": "user", "content": prompt}],
            stream=False,
            temperature=0.1,
            max_tokens=300
        )

        try:
            import json
            return json.loads(response.strip())
        except Exception as e:
            print(f"Business hours extraction error: {e}")
            return {}

    async def delete_source(self, tenant_id: str, source_id: str) -> int:
        """Delete all chunks for a source"""
        return await rag_service.delete_chunks(tenant_id, source_id)

    async def list_sources(self, tenant_id: str) -> List[Dict[str, Any]]:
        """List all knowledge sources for a tenant"""
        return await rag_service.get_sources(tenant_id)


knowledge_service = KnowledgeService()