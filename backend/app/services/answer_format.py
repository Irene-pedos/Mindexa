"""Turn stored answers into text a reviewer (human or model) can read."""

from __future__ import annotations

import json
from typing import Any, Iterable


def readable_answer(answer_text: str | None, options: Iterable[Any] | None) -> str:
    """
    Case-study answers are stored as a JSON map of sub-question option id -> text.
    Shown raw, the ids mean nothing; label each part with its sub-question instead.
    Anything else is returned unchanged.
    """
    if not answer_text:
        return answer_text or ""
    trimmed = answer_text.strip()
    if not (trimmed.startswith("{") and trimmed.endswith("}")):
        return answer_text
    try:
        data = json.loads(trimmed)
    except (ValueError, TypeError):
        return answer_text
    if not isinstance(data, dict) or not data:
        return answer_text

    ordered = sorted(options or [], key=lambda o: getattr(o, "order_index", 0) or 0)
    by_id = {str(o.id): (number, o) for number, o in enumerate(ordered, start=1)}
    # Only reformat when the keys really are this question's sub-question ids.
    if not all(str(key) in by_id for key in data):
        return answer_text

    parts: list[str] = []
    for key, value in sorted(data.items(), key=lambda kv: by_id[str(kv[0])][0]):
        number, option = by_id[str(key)]
        prompt = (getattr(option, "content", "") or "").strip()
        text = str(value).strip() if value is not None else ""
        parts.append(f"Part {number}: {prompt}\nStudent's answer: {text or '(blank)'}")
    return "\n\n".join(parts)
