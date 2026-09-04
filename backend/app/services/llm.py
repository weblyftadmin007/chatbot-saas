import ollama
import httpx
from typing import List, Dict, Any, Optional, AsyncGenerator
import json
import asyncio
from app.config import settings


class LLMService:
    def __init__(self):
        self.client = ollama.AsyncClient(host=settings.ollama_host)
        self.chat_model = settings.ollama_chat_model
        self.embed_model = settings.ollama_embed_model

    async def chat(
        self,
        messages: List[Dict[str, str]],
        stream: bool = True,
        temperature: float = 0.3,
        max_tokens: int = 1000
    ):
        """Chat with LLM.

        Returns an async generator when ``stream=True`` (yielding content
        chunks, or an error message on failure) and a plain ``str`` when
        ``stream=False``.
        """
        if stream:
            async def _stream():
                try:
                    async for chunk in await self.client.chat(
                        model=self.chat_model,
                        messages=messages,
                        stream=True,
                        options={
                            "temperature": temperature,
                            "num_predict": max_tokens,
                        }
                    ):
                        if chunk.get('message', {}).get('content'):
                            yield chunk['message']['content']
                except Exception as e:
                    # Ollama raises connection/stream errors lazily during
                    # iteration, so the error must be yielded from in here.
                    yield f"LLM error: {str(e)}"
            return _stream()

        try:
            response = await self.client.chat(
                model=self.chat_model,
                messages=messages,
                stream=False,
                options={
                    "temperature": temperature,
                    "num_predict": max_tokens,
                }
            )
            return response['message']['content']
        except Exception as e:
            return f"LLM error: {str(e)}"

    async def embed(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings for texts"""
        embeddings = []
        for text in texts:
            try:
                response = await self.client.embeddings(
                    model=self.embed_model,
                    prompt=text
                )
                embeddings.append(response['embedding'])
            except Exception as e:
                print(f"Embedding error: {e}")
                embeddings.append([0.0] * 768)  # nomic-embed-text dimension
        return embeddings

    async def embed_single(self, text: str) -> List[float]:
        """Generate embedding for single text"""
        try:
            response = await self.client.embeddings(
                model=self.embed_model,
                prompt=text
            )
            return response['embedding']
        except Exception as e:
            print(f"Embedding error: {e}")
            return [0.0] * 768

    async def classify_intent(self, text: str) -> str:
        """Classify user intent using few-shot prompt"""
        prompt = f"""Classify the user's intent into ONE category:
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

User: "{text}"
Intent:"""

        response = await self.chat(
            messages=[{"role": "user", "content": prompt}],
            stream=False,
            temperature=0.1,
            max_tokens=20
        )

        # Extract intent from response
        intent = response.strip().lower()
        valid_intents = [
            'book_appointment', 'cancel_appointment', 'check_availability',
            'general_query', 'transfer_human', 'unclear'
        ]

        for valid in valid_intents:
            if valid in intent:
                return valid

        return 'unclear'

    async def extract_booking_details(self, text: str) -> Dict[str, Any]:
        """Extract date/time preferences from booking request"""
        prompt = f"""Extract booking details from user message. Return JSON only.

User: "{text}"

Return format:
{{
  "preferred_date": "YYYY-MM-DD or null",
  "preferred_time": "HH:MM or null",
  "duration_minutes": 30,
  "title": "Appointment title or null",
  "notes": "Any notes or null"
}}

If date/time not specified, use null."""

        response = await self.chat(
            messages=[{"role": "user", "content": prompt}],
            stream=False,
            temperature=0.1,
            max_tokens=200
        )

        try:
            return json.loads(response.strip())
        except Exception:
            return {
                "preferred_date": None,
                "preferred_time": None,
                "duration_minutes": 30,
                "title": None,
                "notes": None
            }

    async def synthesize_answer(self, query: str, context_chunks: List[str]) -> AsyncGenerator[str, None]:
        """Generate answer from context using RAG"""
        context = "\n\n".join([f"Source {i+1}: {chunk}" for i, chunk in enumerate(context_chunks)])

        prompt = f"""Answer the user's question using ONLY the provided context. 
If the answer isn't in the context, say "I don't have that information in my knowledge base."

Context:
{context}

Question: {query}

Answer:"""

        async for chunk in self.chat(
            messages=[{"role": "user", "content": prompt}],
            stream=True,
            temperature=0.2,
            max_tokens=800
        ):
            yield chunk


llm_service = LLMService()