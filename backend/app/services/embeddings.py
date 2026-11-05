"""
Embeddings service — multilingual-e5-small running locally on CPU.
Handles Hindi, English and Hinglish text.
"""
import logging
from functools import lru_cache
from typing import List

logger = logging.getLogger(__name__)

_model = None


def _hash_embed(text: str, dim: int = 384) -> List[float]:
    """Deterministic pseudo-embedding for environments without torch."""
    import hashlib
    import math
    seed = hashlib.sha256(text.encode("utf-8")).digest()
    vec = []
    for i in range(dim):
        b = seed[i % len(seed)]
        val = math.sin((b + 1) * (i + 1))
        vec.append(val)
    norm = math.sqrt(sum(x * x for x in vec)) or 1.0
    return [x / norm for x in vec]


def _get_model():
    """Lazy-load the sentence-transformer model (avoids startup delay)."""
    global _model
    if _model is None:
        try:
            from sentence_transformers import SentenceTransformer
            from app.config import settings
            logger.info(f"Loading embedding model: {settings.embedding_model}")
            _model = SentenceTransformer(settings.embedding_model)
            logger.info("Embedding model loaded")
        except ImportError:
            logger.warning("sentence-transformers not installed; using deterministic pseudo-embeddings")
            _model = "fallback"
    return _model


def embed_texts(texts: List[str]) -> List[List[float]]:
    """
    Embed a list of texts → list of 384-dim float vectors.
    Runs synchronously on CPU; call from a thread pool in async context.
    Prefix with 'query: ' or 'passage: ' for e5-style prompts.
    """
    model = _get_model()
    if model == "fallback":
        return [_hash_embed(t) for t in texts]
    # e5 models expect "passage: " prefix for passages being indexed
    prefixed = [f"passage: {t}" for t in texts]
    embeddings = model.encode(prefixed, normalize_embeddings=True)
    return embeddings.tolist()


def embed_query(text: str) -> List[float]:
    """Embed a single query with 'query: ' prefix (e5 convention)."""
    model = _get_model()
    if model == "fallback":
        return _hash_embed(text)
    prefixed = f"query: {text}"
    embedding = model.encode(prefixed, normalize_embeddings=True)
    return embedding.tolist()


def cosine_similarity(a: List[float], b: List[float]) -> float:
    """Cosine similarity between two normalised vectors (dot product)."""
    return sum(x * y for x, y in zip(a, b))


async def embed_texts_async(texts: List[str]) -> List[List[float]]:
    """Async wrapper — runs embedding in thread pool to avoid blocking event loop."""
    import asyncio
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, embed_texts, texts)


async def embed_query_async(text: str) -> List[float]:
    """Async wrapper for query embedding."""
    import asyncio
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, embed_query, text)
