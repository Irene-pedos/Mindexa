"""Shared, validated chat-history schema for the student and lecturer AI endpoints.

Clients must never be able to inject ``system`` turns or oversized/odd payloads into the
prompt, so history is normalised at the schema boundary instead of trusted downstream.
"""

from __future__ import annotations

import re
from typing import Annotated, Any, Literal

from pydantic import BaseModel, BeforeValidator, Field

MAX_HISTORY_TURNS = 20
MAX_TURN_CHARS = 4000

_ASSISTANT_ALIASES = {"assistant", "model", "ai", "bot"}


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., min_length=1, max_length=MAX_TURN_CHARS)


def _normalise_history(value: Any) -> list[dict[str, str]]:
    """Keep only well-formed user/assistant turns; clamp count and length.

    Unknown roles (notably ``system``) and malformed turns are dropped rather than
    rejected so a stale client cannot turn history into a 4xx/5xx, only into less context.
    """
    if not isinstance(value, list):
        return []
    turns: list[dict[str, str]] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        raw_role = str(item.get("role", "")).strip().lower()
        content = item.get("content")
        if not isinstance(content, str) or not content.strip():
            continue
        if raw_role == "user":
            role = "user"
        elif raw_role in _ASSISTANT_ALIASES:
            role = "assistant"
        else:
            continue
        turns.append({"role": role, "content": content[:MAX_TURN_CHARS]})
    return turns[-MAX_HISTORY_TURNS:]


ChatHistory = Annotated[list[ChatTurn], BeforeValidator(_normalise_history)]

_ATTACHED_FILE_BLOCK = re.compile(r"\n?--- ATTACHED STUDY FILE: (.+?) ---\n[\s\S]*?\n--- END FILE ---")
_ATTACHED_FILE_NAME_ONLY = re.compile(r"\n?\[Attached Study File: (.+?)\]")


def strip_attached_files(question: str) -> str:
    """What the user typed, without the text of files attached to the message.

    The client sends attached-file text inside ``question`` using these markers (the frontend
    parses them back the same way). Listings and previews should show the typed words, or the
    file names when that is all there was, never a page of document text.
    """
    typed = _ATTACHED_FILE_BLOCK.sub("", question)
    typed = _ATTACHED_FILE_NAME_ONLY.sub("", typed).strip()
    if typed:
        return typed
    names = _ATTACHED_FILE_BLOCK.findall(question) + _ATTACHED_FILE_NAME_ONLY.findall(question)
    return f"Attached: {', '.join(names)}" if names else question.strip()
