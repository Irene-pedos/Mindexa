"""Lightweight text similarity for spotting inconsistent grading of similar answers."""

from __future__ import annotations

import re
from dataclasses import dataclass

_WORD = re.compile(r"[a-z0-9]+")

# Answers shorter than this are too thin for overlap to mean anything.
MIN_WORDS = 8
SIMILARITY_THRESHOLD = 0.6


def _words(text: str) -> list[str]:
    return _WORD.findall(text.lower())


def _shingles(words: list[str]) -> set[tuple[str, ...]]:
    """Word bigrams, so reordered one-word overlaps do not look similar."""
    if len(words) < 2:
        return {(w,) for w in words}
    return {(words[i], words[i + 1]) for i in range(len(words) - 1)}


def similarity(a: str, b: str) -> float:
    """Jaccard overlap of word bigrams in [0, 1]; 0 when either answer is too short."""
    wa, wb = _words(a), _words(b)
    if len(wa) < MIN_WORDS or len(wb) < MIN_WORDS:
        return 0.0
    sa, sb = _shingles(wa), _shingles(wb)
    union = sa | sb
    return len(sa & sb) / len(union) if union else 0.0


@dataclass(frozen=True)
class PeerAnswer:
    attempt_id: object
    answer_text: str
    score: float
    max_score: float


@dataclass(frozen=True)
class SimilarPeer:
    attempt_id: object
    similarity: float
    score: float
    max_score: float


def find_similar_peers(
    answer_text: str,
    peers: list[PeerAnswer],
    *,
    threshold: float = SIMILARITY_THRESHOLD,
    limit: int = 3,
) -> list[SimilarPeer]:
    """Most similar already-graded answers to `answer_text`, best first."""
    scored = [
        SimilarPeer(p.attempt_id, similarity(answer_text, p.answer_text), p.score, p.max_score)
        for p in peers
    ]
    matches = [s for s in scored if s.similarity >= threshold]
    matches.sort(key=lambda s: s.similarity, reverse=True)
    return matches[:limit]


def mean_bias_ratio(pairs: list[tuple[float, float, float]]) -> float:
    """
    Average of (lecturer_score - ai_score) / max_score over (score, ai, max) tuples.
    Negative = the lecturer scores below the AI on average.
    """
    usable = [(s, a, m) for s, a, m in pairs if m and m > 0]
    if not usable:
        return 0.0
    return sum((s - a) / m for s, a, m in usable) / len(usable)
