from __future__ import annotations

import json
import re
from typing import TypeVar, Type

from pydantic import BaseModel, ValidationError as PydanticValidationError

from app.core.ai.gateway import AIGateway
from app.core.ai.prompt_registry import get_prompt
from app.core.exceptions import ValidationError
from app.core.logging import get_logger

logger = get_logger(__name__)

T = TypeVar("T", bound=BaseModel)


def _repair_truncated_json(text: str) -> str:
    """Attempt to close an LLM-truncated JSON string into valid JSON.

    Strategy (in order):
    1. Use ``json_repair`` library if installed (most robust).
    2. Strip trailing comma artifacts.
    3. Count unmatched open braces/brackets and append matching closers.
       Handles mid-string-literal truncation by checking quote parity
       *after* stripping known JSON string escape sequences so that
       escaped quotes inside values don't confuse the count.
    """
    # Strategy 1 — json_repair (pip install json-repair)
    try:
        import json_repair  # type: ignore
        return json_repair.repair_json(text)  # type: ignore[no-any-return]
    except ImportError:
        pass

    # Strategy 2 — strip trailing commas
    repaired = re.sub(r",\s*([\]\}])", r"\1", text)

    # Strategy 3 — close unclosed structures
    open_braces = repaired.count("{") - repaired.count("}")
    open_brackets = repaired.count("[") - repaired.count("]")

    if open_braces > 0 or open_brackets > 0:
        suffix = repaired.rstrip().rstrip(",")
        # Count unescaped quotes to detect mid-string truncation.
        # Strip \\" (escaped quote inside string) before counting so they
        # don't skew parity — a naive count would misfire on long prose.
        unescaped = re.sub(r'\\"', "", suffix)
        if unescaped.count('"') % 2 == 1:
            # We're inside an open string literal — close it first
            suffix += '"'
        suffix += ("]" * max(0, open_brackets)) + ("}" * max(0, open_braces))
        return suffix

    return repaired


class BaseAgent:
    """Base contract for all Mindexa AI Agents."""

    prompt_name: str
    prompt_version: str

    def __init__(self, gateway: AIGateway) -> None:
        self.gateway = gateway

    def _get_prompt(self) -> str:
        """Load the configured prompt template for this agent."""
        return get_prompt(self.prompt_name, self.prompt_version)

    def _load_json_payload(self, content: str) -> object:
        """Extract the JSON object or array from raw AI text, repairing it if it was cut off.

        Raises ``json.JSONDecodeError`` when nothing parseable is found. Callers that want to keep
        the valid part of a partly broken answer (e.g. a list whose last item was cut off) use this
        directly and validate item by item; ``_parse_json_output`` is the strict version.
        """
        try:
            content_str = content.strip()

            # Ways the JSON can be wrapped, best guess first. The order matters: the old code
            # took the first ``` fence found *anywhere*, but a JSON string value can itself hold
            # a fenced code block (a lesson's code example does), and that would be mistaken for
            # the response's own fence, leaving only a code snippet to parse.
            candidates: list[str] = []

            # a) The whole response is wrapped in a fence: strip just the outer fence.
            if content_str.startswith("```"):
                inner = re.sub(r"^```[A-Za-z0-9_-]*\s*", "", content_str)
                inner = re.sub(r"\s*```\s*$", "", inner)
                candidates.append(inner.strip())

            # b) Everything between the outermost JSON brackets (also skips prose around it).
            first_curly = content_str.find("{")
            first_square = content_str.find("[")
            start = -1
            if first_curly != -1 and first_square != -1:
                start = min(first_curly, first_square)
            elif first_curly != -1:
                start = first_curly
            elif first_square != -1:
                start = first_square
            end = max(content_str.rfind("}"), content_str.rfind("]"))
            if start != -1 and end != -1 and start < end:
                candidates.append(content_str[start : end + 1].strip())
            else:
                candidates.append(content_str)

            # c) The first fenced block (prose, then a ```json fence): the original behaviour.
            fenced = re.search(r"```(?:json)?\s*(.*?)\s*```", content_str, re.DOTALL)
            if fenced:
                candidates.append(fenced.group(1).strip())

            def _usable(parsed: object) -> bool:
                # A repair attempt can "succeed" on junk (e.g. an empty string); only objects
                # and arrays are real answers.
                return isinstance(parsed, (dict, list))

            data: object = None
            for candidate in candidates:
                try:
                    parsed = json.loads(candidate, strict=False)
                except json.JSONDecodeError:
                    continue
                if _usable(parsed):
                    data = parsed
                    break

            if data is None:
                # Truncated / malformed LLM output (cut off mid-string, an unescaped quote, ...):
                # attempt robust recovery on each candidate in turn.
                for candidate in candidates:
                    try:
                        parsed = json.loads(_repair_truncated_json(candidate), strict=False)
                    except json.JSONDecodeError:
                        continue
                    if _usable(parsed):
                        data = parsed
                        break

            if data is None:
                raise json.JSONDecodeError("No parseable JSON in the AI response", content_str, 0)
            return data
        except json.JSONDecodeError:
            # Nothing parseable at all: the caller decides how to report it.
            raise

    def _parse_json_output(
        self,
        content: str,
        response_model: Type[T],
        extract_list: bool = False
    ) -> T | list[T]:
        """
        Parse and validate a JSON response from the AI.

        Args:
            content: Raw string response from the AI.
            response_model: The Pydantic model to validate against.
            extract_list: If True, expects a JSON array and returns a list of models.
        """
        try:
            data = self._load_json_payload(content)

            if extract_list:
                if not isinstance(data, list):
                    # Attempt to find list in dict if wrapped
                    if isinstance(data, dict):
                        for key in ("questions", "items", "data", "results", "slides"):
                            if key in data and isinstance(data[key], list):
                                data = data[key]
                                break
                        else:
                            raise ValueError("AI response is a dict but no list found.")
                    else:
                        raise ValueError("AI response must be a JSON array.")
                return [response_model.model_validate(item) for item in data]
            else:
                return response_model.model_validate(data)

        except (json.JSONDecodeError, PydanticValidationError, ValueError) as exc:
            # The parser error can quote model output; keep it in the logs, not the response.
            logger.warning(
                "ai_output_validation_failed",
                model=response_model.__name__,
                error=str(exc)[:500],
            )
            raise ValidationError(
                "The AI returned a response we could not use. Please try again.",
                code="AI_OUTPUT_VALIDATION_FAILED",
            ) from exc
