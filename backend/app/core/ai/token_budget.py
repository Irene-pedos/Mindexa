"""Token budget utilities for AI prompt construction.

Provides a lightweight helper for estimating prompt token counts and
dynamically trimming RAG context so that prompt + max_tokens never exceeds
the target provider budget — without importing the heavy tiktoken library at
module load time.

Design goals:
- Zero mandatory dependencies: works with or without tiktoken.
- If tiktoken is available it uses `cl100k_base` for accurate counts.
- Falls back to a conservative 3.5 chars-per-token heuristic if not.
- All functions are pure and synchronous — safe to call from async contexts.
"""
from __future__ import annotations

import logging
from typing import Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Token counting
# ---------------------------------------------------------------------------

_ENCODER: Optional[object] = None
_ENCODER_TRIED: bool = False


def _get_encoder() -> Optional[object]:
    """Lazily load the tiktoken cl100k_base encoder (used by GPT-4 / Groq)."""
    global _ENCODER, _ENCODER_TRIED
    if _ENCODER_TRIED:
        return _ENCODER
    _ENCODER_TRIED = True
    try:
        import tiktoken  # type: ignore
        _ENCODER = tiktoken.get_encoding("cl100k_base")
    except Exception:  # pragma: no cover
        _ENCODER = None
    return _ENCODER


def estimate_tokens(text: str) -> int:
    """Estimate the token count of *text*.

    Uses tiktoken when available; falls back to ``len(text) // 3`` (slightly
    conservative for English prose to avoid underestimation).
    """
    if not text:
        return 0
    enc = _get_encoder()
    if enc is not None:
        try:
            return len(enc.encode(text))  # type: ignore[attr-defined]
        except Exception:
            pass
    # Fallback heuristic: ~3 chars per token is conservative for English
    return max(1, len(text) // 3)


# ---------------------------------------------------------------------------
# Context trimming
# ---------------------------------------------------------------------------

# Conservative overhead for message structure / metadata / templates.
# The actual system prompt template (study_lesson_v1.txt) + profile JSON is
# roughly 1 200 – 1 500 tokens before any RAG content is injected.
_TEMPLATE_OVERHEAD_TOKENS: int = 1_600


def trim_rag_context(
    rag_context: str,
    max_tokens_budget: int,
    reserved_for_completion: int,
    template_overhead: int = _TEMPLATE_OVERHEAD_TOKENS,
) -> str:
    """Trim *rag_context* so that the assembled prompt fits within the provider budget.

    Args:
        rag_context: Raw RAG context string to potentially trim.
        max_tokens_budget: Hard token limit for the provider (e.g. 8 000 for
            Groq free-tier ``openai/gpt-oss-120b``).
        reserved_for_completion: Tokens reserved for the model's reply
            (``max_tokens`` in the completion request).
        template_overhead: Estimated token cost of the system prompt template,
            user message, and other fixed content, *excluding* rag_context.

    Returns:
        Trimmed rag_context string that fits the computed token budget, or the
        original string if it already fits.
    """
    if not rag_context:
        return rag_context

    # Tokens available for RAG content
    available = max_tokens_budget - reserved_for_completion - template_overhead
    if available <= 0:
        logger.warning(
            "token_budget.trim_rag_context: no budget left for RAG context",
            max_tokens_budget=max_tokens_budget,
            reserved_for_completion=reserved_for_completion,
            template_overhead=template_overhead,
        )
        return ""

    current_tokens = estimate_tokens(rag_context)
    if current_tokens <= available:
        return rag_context

    # Binary-search for the right char cutoff so we don't over-trim.
    # chars_per_token heuristic: use measured ratio when tiktoken is available.
    chars_per_token = len(rag_context) / max(1, current_tokens)
    target_chars = int(available * chars_per_token)

    trimmed = rag_context[:target_chars]
    logger.info(
        "token_budget.trim_rag_context: trimmed RAG context",
        original_tokens=current_tokens,
        available_tokens=available,
        original_chars=len(rag_context),
        trimmed_chars=len(trimmed),
    )
    return trimmed
