"""
app/services/calendar_import_service.py

Reads an institution's academic calendar (a PDF or a photo/scan) into a DRAFT that an admin
reviews before anything is saved.

What the AI does, and what it does not:
  - The model only transcribes the table: for every row, the section it sits in, the period text
    exactly as printed ("Mon 17/08/2026 - Fri 11/09/2026"), the activity and the audience.
  - Everything that matters is then decided by plain code, which can be tested: the dates are
    parsed from the printed text, each date is checked against the weekday printed next to it
    (a misread digit shows up as a mismatch), the kind of each row comes from keywords, and the
    semesters take the dates of their "Teaching and assessment" row.
  - Rows the checks doubt carry a `warning`; the review screen shows them first.

A scanned page can be sideways, so the caller chooses a rotation (the screen shows a preview).
Providers: Gemini when GEMINI_API_KEY is set, otherwise the Groq vision model. A PDF with a real
text layer needs no vision model at all.
"""

from __future__ import annotations

import asyncio
import base64
import json
import re
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import date
from typing import Any

import fitz
import httpx

from app.core.config import settings
from app.core.exceptions import (
    BadRequestError,
    RateLimitError,
    ServiceUnavailableError,
    ValidationError,
)
from app.core.logging import get_logger
from app.db.enums import AcademicPeriodType, CalendarEventType
from app.schemas.academic_calendar import (
    CalendarDraft,
    CalendarDraftEvent,
    CalendarDraftSemester,
    normalize_audience,
)

logger = get_logger(__name__)

MAX_BYTES = 8 * 1024 * 1024
MAX_PAGES = 4
IMAGE_TYPES = {"image/png", "image/jpeg", "image/webp"}
TEXT_LAYER_MIN_CHARS = 400

PROMPT = """You are reading an institution's academic calendar: a table whose columns are
Period | Number of Weeks | Activity | Year of study. The page may be sideways or scanned.

Return ONLY JSON of this exact shape:
{"academic_year_label": "2026/2027",
 "rows": [{"section": "SEMESTER 1", "period_text": "Mon 17/08/2026 - Fri 11/09/2026",
           "activity": "Online Registration", "audience": "All"}]}

Rules:
- One entry per table row, in the order they appear. Do not skip, merge or invent rows.
- "section" is the heading the row sits under ("SEMESTER 1", "SEMESTER 2"), or null before it.
- "period_text" is copied EXACTLY as printed, with the weekday names and every digit. Never convert.
- "audience" is the Year of study cell as printed (All, Y3, BTech…), or null when empty.
- Ignore titles, letterheads, signatures and the "Key considerations" paragraph.
"""


# ── parsing and checks (pure, unit-tested) ────────────────────────────────────

_DATE = re.compile(
    r"(?:(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*\.?\s*)?(\d{1,2})\s*[/.\-]\s*(\d{1,2})\s*[/.\-]\s*(\d{4})",
    re.I,
)
_WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


@dataclass
class ParsedPeriod:
    start: date
    end: date | None
    warning: str | None = None


def parse_period_text(text: str) -> ParsedPeriod | None:
    """Dates from the printed period (day/month/year), each checked against its printed weekday."""
    found: list[tuple[date, str | None]] = []
    for weekday, day, month, year in _DATE.findall(text or ""):
        try:
            found.append((date(int(year), int(month), int(day)), weekday.lower()[:3] or None))
        except ValueError:
            return None
    if not found or len(found) > 2:
        return None
    problems = []
    for day, weekday in found:
        if weekday and _WEEKDAYS[day.weekday()] != weekday:
            problems.append(
                f"{day:%d/%m/%Y} is a {_WEEKDAYS[day.weekday()].title()}, but the document says "
                f"{weekday.title()}: one of the digits may have been misread."
            )
    start = found[0][0]
    end = found[1][0] if len(found) == 2 and found[1][0] != start else None
    if end is not None and end < start:
        problems.append("The end date is before the start date.")
    return ParsedPeriod(start=start, end=end, warning=" ".join(problems) or None)


def classify(title: str) -> CalendarEventType:
    t = title.lower()
    if "registration" in t:
        return CalendarEventType.REGISTRATION
    if re.search(r"holiday|vacation|recess", t):
        return CalendarEventType.HOLIDAY
    if t.startswith("consideration"):
        return CalendarEventType.DELIBERATION
    if "appeal" in t:
        return CalendarEventType.APPEAL_WINDOW
    if re.search(r"publi(?:sh|cation)", t) and "special" not in t:
        return CalendarEventType.RESULTS_PUBLICATION
    if re.search(r"council|board|senate|consolidat", t):
        return CalendarEventType.DELIBERATION
    if re.search(r"special exam|exam", t):
        return CalendarEventType.EXAM_PERIOD
    if re.search(r"submission|deadline|compilation", t):
        return CalendarEventType.MARKS_DEADLINE
    if re.search(r"attachment|internship|placement", t):
        return CalendarEventType.PLACEMENT
    if re.search(r"defen[cs]e|capstone|final year project", t):
        return CalendarEventType.DEFENSE
    return CalendarEventType.OTHER


def normalize_audience_label(raw: str | None) -> str | None:
    """ "Y3" becomes "Year 3"; "All" and blank mean everyone."""
    text = (raw or "").strip()
    match = re.fullmatch(r"[Yy](?:ear)?\s*(\d)", text)
    if match:
        return f"Year {match.group(1)}"
    return normalize_audience(text)


def _is_teaching(title: str) -> bool:
    return bool(re.search(r"teaching\s+and\s+assessments?", title, re.I))


def _section_name(raw: str | None) -> str | None:
    match = re.search(r"semester\s*(\d|[ivx]+)", raw or "", re.I)
    if not match:
        return None
    token = match.group(1).upper()
    return f"Semester { ({'I': 1, 'II': 2, 'III': 3}.get(token) or token) }"


def _year_label(raw: str | None, first: date, last: date) -> str:
    match = re.search(r"(\d{4})\s*[/\-–]\s*(\d{2,4})", raw or "")
    if match:
        end = match.group(2)
        return f"{match.group(1)}-{end if len(end) == 4 else match.group(1)[:2] + end}"
    return f"{first.year}-{last.year}" if first.year != last.year else str(first.year)


def build_draft(model_output: dict[str, Any], *, source: str) -> CalendarDraft:
    """The model's transcription as a draft for review; nothing here touches the database."""
    rows = model_output.get("rows")
    if not isinstance(rows, list) or not rows:
        raise ValidationError(
            "No calendar rows could be read from this file. Try a clearer scan or rotate it."
        )

    warnings: list[str] = []
    events: list[CalendarDraftEvent] = []
    teaching: dict[str, tuple[date, date]] = {}
    section_dates: dict[str, list[date]] = {}

    for row in rows:
        if not isinstance(row, dict):
            continue
        activity = str(row.get("activity") or "").strip()
        parsed = parse_period_text(str(row.get("period_text") or ""))
        if not activity or parsed is None:
            if activity:
                warnings.append(f"Skipped “{activity[:60]}”: its dates could not be read.")
            continue
        # The heading is the best hint; a row that names its semester ("... for semester 1") fills
        # the gap when the model lost the heading.
        section = _section_name(row.get("section")) or _section_name(activity)
        end = parsed.end or parsed.start
        if section:
            section_dates.setdefault(section, []).extend([parsed.start, end])
        if _is_teaching(activity) and section:
            teaching[section] = (parsed.start, end)
            continue  # the semester itself, not a date inside it
        events.append(
            CalendarDraftEvent(
                semester=section,
                kind=classify(activity),
                title=activity[:255],
                start_date=parsed.start,
                end_date=parsed.end,
                audience=normalize_audience_label(row.get("audience")),
                warning=parsed.warning,
            )
        )

    all_days = [d for e in events for d in (e.start_date, e.end_date or e.start_date)]
    all_days += [d for pair in teaching.values() for d in pair]
    if not all_days:
        raise ValidationError("No dates could be read from this file.")
    year_start, year_end = min(all_days), max(all_days)
    year_name = _year_label(
        str(model_output.get("academic_year_label") or ""), year_start, year_end
    )

    semesters: list[CalendarDraftSemester] = []
    renamed: dict[str, str] = {}
    for name in sorted(section_dates):
        if name in teaching:
            start, end = teaching[name]
        else:
            start, end = min(section_dates[name]), max(section_dates[name])
            warnings.append(
                f"{name} has no “Teaching and assessment” row; "
                "its dates were taken from its other rows."
            )
        if (end - start).days < 28:
            warnings.append(
                f"{name} lasts only {(end - start).days + 1} day(s): its dates were probably "
                "misread. Check them before saving."
            )
        # Names are unique per institution, so a semester carries its year ("Semester 1 2026-2027").
        renamed[name] = f"{name} {year_name}"
        semesters.append(
            CalendarDraftSemester(
                name=renamed[name],
                period_type=AcademicPeriodType.SEMESTER,
                start_date=start,
                end_date=end,
            )
        )
    for event in events:
        if event.semester:
            event.semester = renamed.get(event.semester, event.semester)

    flagged = sum(1 for e in events if e.warning)
    if flagged:
        warnings.insert(
            0, f"{flagged} row(s) need a second look: a date does not match its weekday."
        )
    return CalendarDraft(
        year_name=year_name,
        year_start=year_start,
        year_end=year_end,
        semesters=semesters,
        events=events,
        warnings=warnings,
        source=source,
    )


def extract_json(text: str) -> dict[str, Any]:
    """The model's reply as a dict, tolerating code fences and reasoning blocks."""
    cleaned = re.sub(r"<think>.*?</think>", "", text or "", flags=re.S).strip()
    cleaned = re.sub(r"^```(?:json)?|```$", "", cleaned, flags=re.M).strip()
    start, end = cleaned.find("{"), cleaned.rfind("}")
    if start < 0 or end <= start:
        raise ServiceUnavailableError("The AI answered in an unreadable format. Please try again.")
    try:
        data = json.loads(cleaned[start : end + 1])
    except json.JSONDecodeError as exc:
        raise ServiceUnavailableError(
            "The AI answered in an unreadable format. Please try again."
        ) from exc
    return data if isinstance(data, dict) else {}


# ── input handling ────────────────────────────────────────────────────────────


def _open(data: bytes, content_type: str) -> fitz.Document:
    if len(data) > MAX_BYTES:
        raise BadRequestError("That file is over 8 MB. Use a smaller scan.")
    kind = "pdf" if content_type == "application/pdf" else "png"
    if content_type != "application/pdf" and content_type not in IMAGE_TYPES:
        raise BadRequestError("Upload a PDF, PNG, JPG or WebP file.")
    try:
        doc = fitz.open(stream=data, filetype=kind if kind == "pdf" else content_type.split("/")[1])
    except Exception as exc:  # corrupt or encrypted file
        raise BadRequestError("That file could not be opened. Is it a valid PDF or image?") from exc
    if doc.page_count == 0:
        raise BadRequestError("That file has no pages.")
    return doc


def _render(page: fitz.Page, rotation: int, dpi: int) -> bytes:
    page.set_rotation((page.rotation + rotation) % 360)
    return bytes(page.get_pixmap(dpi=dpi).tobytes("jpeg", jpg_quality=75))


def _text_layer(doc: fitz.Document) -> str:
    return "\n".join(doc[i].get_text() for i in range(min(doc.page_count, MAX_PAGES))).strip()


def preview(data: bytes, content_type: str, rotation: int) -> dict[str, Any]:
    """First page as a small image (no AI), so a sideways scan can be rotated before reading."""
    doc = _open(data, content_type)
    text = _text_layer(doc)
    image = _render(doc[0], rotation if rotation in (0, 90, 180, 270) else 0, 70)
    return {
        "pages": doc.page_count,
        "has_text_layer": len(text) >= TEXT_LAYER_MIN_CHARS,
        "image_base64": base64.b64encode(image).decode(),
    }


# ── model calls ───────────────────────────────────────────────────────────────


MAX_AUTO_WAIT_SECONDS = 20


def _retry_seconds(res: httpx.Response) -> float | None:
    """How long the provider asks us to wait: the Retry-After header, else "try again in 39.1s"."""
    header = res.headers.get("retry-after", "")
    if header.replace(".", "", 1).isdigit():
        return float(header)
    match = re.search(r"try again in\s+(?:(\d+)m)?\s*(\d+(?:\.\d+)?)s", res.text)
    if match:
        return int(match.group(1) or 0) * 60 + float(match.group(2))
    return None


def _raise_for(res: httpx.Response, who: str) -> None:
    if res.status_code in (429, 413):
        wait = _retry_seconds(res)
        hint = f"Try again in about {int(wait) + 1} seconds." if wait else "Wait a minute and try again."
        raise RateLimitError(
            f"{who} is busy right now. {hint}",
            code="AI_PROVIDER_RATE_LIMITED",
            retry_after=wait,
        )
    raise ServiceUnavailableError(
        f"{who} could not read the file (status {res.status_code}). {res.text[:200]}"
    )


async def _call_with_one_retry(call: Callable[[], Awaitable[str]]) -> str:
    """A short provider rate limit is waited out once, so the admin does not have to retry."""
    try:
        return await call()
    except RateLimitError as exc:
        if exc.retry_after is None or exc.retry_after > MAX_AUTO_WAIT_SECONDS:
            raise
        await asyncio.sleep(exc.retry_after + 1)
        return await call()


async def _gemini(images: list[bytes], text: str | None) -> str:
    parts: list[dict[str, Any]] = [
        {"text": PROMPT if text is None else f"{PROMPT}\n\nDocument text:\n{text}"}
    ]
    parts += [
        {"inline_data": {"mime_type": "image/jpeg", "data": base64.b64encode(i).decode()}}
        for i in images
    ]
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{settings.GEMINI_DEFAULT_MODEL}:generateContent"
    async with httpx.AsyncClient(timeout=120) as client:
        res = await client.post(
            url,
            headers={"x-goog-api-key": settings.GEMINI_API_KEY},
            json={
                "contents": [{"parts": parts}],
                "generationConfig": {"temperature": 0, "responseMimeType": "application/json"},
            },
        )
    if res.status_code != 200:
        _raise_for(res, "Gemini")
    try:
        return str(res.json()["candidates"][0]["content"]["parts"][0]["text"])
    except (KeyError, IndexError, TypeError) as exc:
        raise ServiceUnavailableError("Gemini returned an empty answer. Please try again.") from exc


async def _groq(model: str, images: list[bytes], text: str | None) -> str:
    content: list[dict[str, Any]] = [
        {"type": "text", "text": PROMPT if text is None else f"{PROMPT}\n\nDocument text:\n{text}"}
    ]
    content += [
        {
            "type": "image_url",
            "image_url": {"url": "data:image/jpeg;base64," + base64.b64encode(i).decode()},
        }
        for i in images
    ]
    async with httpx.AsyncClient(timeout=180) as client:
        res = await client.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {settings.GROQ_API_KEY}"},
            json={
                "model": model,
                "messages": [{"role": "user", "content": content}],
                "temperature": 0,
                "max_tokens": 8000,
                "response_format": {"type": "json_object"},
            },
        )
    if res.status_code != 200:
        _raise_for(res, "The AI service")
    return str(res.json()["choices"][0]["message"]["content"] or "")


async def extract(data: bytes, content_type: str, rotation: int = 0) -> CalendarDraft:
    doc = _open(data, content_type)
    text = _text_layer(doc)
    if len(text) >= TEXT_LAYER_MIN_CHARS:
        if not settings.GROQ_API_KEY and not settings.GEMINI_API_KEY:
            raise ServiceUnavailableError(
                "No AI provider is configured (set GEMINI_API_KEY or GROQ_API_KEY)."
            )
        if settings.GEMINI_API_KEY:
            reply = await _call_with_one_retry(lambda: _gemini([], text))
        else:
            reply = await _call_with_one_retry(lambda: _groq(settings.GROQ_DEFAULT_MODEL, [], text))
        source = "gemini-text" if settings.GEMINI_API_KEY else "groq-text"
    else:
        angle = rotation if rotation in (0, 90, 180, 270) else 0
        images = [_render(doc[i], angle, 130) for i in range(min(doc.page_count, MAX_PAGES))]
        if settings.GEMINI_API_KEY:
            reply = await _call_with_one_retry(lambda: _gemini(images, None))
            source = "gemini"
        elif settings.GROQ_API_KEY:
            reply = await _call_with_one_retry(
                lambda: _groq(settings.GROQ_VISION_MODEL, images, None)
            )
            source = "groq"
        else:
            raise ServiceUnavailableError(
                "No AI provider is configured (set GEMINI_API_KEY or GROQ_API_KEY)."
            )
    logger.info("calendar_import_read", source=source, pages=doc.page_count, bytes=len(data))
    return build_draft(extract_json(reply), source=source)
