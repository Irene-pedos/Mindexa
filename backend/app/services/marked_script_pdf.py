"""
app/services/marked_script_pdf.py

Renders a marked-paper snapshot as a PDF with ReportLab (pure Python, so it needs
no system libraries on Windows or in the container).

Audiences:
  staff    - lecturers/admins: marker names and the AI suggestion beside the final mark
  student  - the student's own copy: marks, correct answers and feedback only
  reviewer - appeal reviewer: like staff, but the student's identity is left out
"""
from __future__ import annotations

import base64
import binascii
import io
import re
from datetime import datetime
from typing import Any
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Image,
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from app.utils.spreadsheet import format_letter_grade

_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"[ \t]+")


# The built-in PDF fonts only draw Western European (cp1252) characters. Map the
# common typographic and maths symbols to readable equivalents so they do not
# print as black boxes; anything else outside cp1252 becomes "?".
_SYMBOLS = {
    "‐": "-", "‑": "-", "‒": "-", "―": "-", "−": "-",
    " ": " ", " ": " ", " ": " ", " ": " ", "​": "",
    "≤": "<=", "≥": ">=", "≠": "!=", "≈": "~", "∞": "inf",
    "→": "->", "←": "<-", "↔": "<->", "⇒": "=>",
    "✓": "[x]", "✔": "[x]", "✗": "[ ]", "✘": "[ ]",
    "α": "alpha", "β": "beta", "λ": "lambda", "π": "pi", "Σ": "Sum",
    "⁴": "^4", "¹": "^1", "⁰": "^0", "₀": "_0", "₁": "_1", "₂": "_2",
}


def to_pdf_safe(text: str) -> str:
    out: list[str] = []
    for ch in text:
        ch = _SYMBOLS.get(ch, ch)
        try:
            ch.encode("cp1252")
        except UnicodeEncodeError:
            ch = "?"
        out.append(ch)
    return "".join(out)


def clean_text(value: Any, limit: int = 6000) -> str:
    """Plain text safe for ReportLab's mini-markup: no tags, escaped, newlines kept."""
    if value is None:
        return ""
    text = to_pdf_safe(_TAG_RE.sub("", str(value)))
    text = _WS_RE.sub(" ", text).strip()
    if len(text) > limit:
        text = text[:limit] + " ..."
    return escape(text).replace("\n", "<br/>")


def format_answer(text: Any, structured: Any) -> str:
    """Readable form of a student answer, including matching / ordering / blanks."""
    if structured not in (None, "", [], {}):
        if isinstance(structured, dict):
            parts = [f"{k}: {v}" for k, v in structured.items()]
            return "\n".join(parts)
        if isinstance(structured, list):
            parts = []
            for i, item in enumerate(structured, 1):
                if isinstance(item, dict):
                    parts.append(", ".join(f"{k}: {v}" for k, v in item.items()))
                else:
                    parts.append(f"{i}. {item}")
            return "\n".join(parts)
    return str(text) if text not in (None, "") else ""


MAX_LOGO_BYTES = 2 * 1024 * 1024
LOGO_HEIGHT_MM = 14
LOGO_MAX_WIDTH_MM = 34


def logo_image(data_url: str | None) -> Image | None:
    """
    An institution logo as a ReportLab image, or None when it cannot be used.

    Only inline ``data:image/png|jpeg`` logos are read. Remote URLs are deliberately not
    fetched from the server, and a broken or unsupported logo (e.g. SVG) must never stop
    a paper from being produced.
    """
    if not data_url or not data_url.startswith("data:image/"):
        return None
    header, _, payload = data_url.partition(",")
    if ";base64" not in header or header.split(";")[0] not in ("data:image/png", "data:image/jpeg", "data:image/jpg"):
        return None
    try:
        raw = base64.b64decode(payload, validate=False)
    except (binascii.Error, ValueError):
        return None
    if not raw or len(raw) > MAX_LOGO_BYTES:
        return None
    try:
        from PIL import Image as PILImage

        with PILImage.open(io.BytesIO(raw)) as probe:
            probe.verify()
        with PILImage.open(io.BytesIO(raw)) as probe:
            width_px, height_px = probe.size
        if width_px <= 0 or height_px <= 0:
            return None
        height = LOGO_HEIGHT_MM * mm
        width = height * width_px / height_px
        if width > LOGO_MAX_WIDTH_MM * mm:
            width = LOGO_MAX_WIDTH_MM * mm
            height = width * height_px / width_px
        return Image(io.BytesIO(raw), width=width, height=height)
    except Exception:  # noqa: BLE001 - an unreadable logo is simply left out
        return None


def _fmt_marks(value: Any) -> str:
    if value is None:
        return "-"
    try:
        number = float(value)
    except (TypeError, ValueError):
        return str(value)
    return f"{number:g}"


def _outcome_label(score: Any, max_score: Any) -> str:
    """Full / partial / no marks, taken from the marks actually awarded."""
    try:
        got, top = float(score), float(max_score)
    except (TypeError, ValueError):
        return ""
    if top <= 0:
        return ""
    if got >= top:
        return "Full marks"
    if got <= 0:
        return "No marks"
    return "Partial marks"


def _fmt_date(value: Any) -> str:
    if not value:
        return "-"
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).strftime("%d %b %Y %H:%M")
    except ValueError:
        return str(value)


def render_marked_script_pdf(
    *,
    snapshot: dict[str, Any],
    verification_code: str,
    version: int,
    created_at: datetime | None,
    audience: str = "staff",
    logo_data_url: str | None = None,
) -> bytes:
    paper = snapshot.get("paper") or {}
    student = snapshot.get("student") or {}
    marking = {m.get("question_id"): m for m in (snapshot.get("marking") or [])}
    show_staff = audience in ("staff", "reviewer")
    anonymous = audience == "reviewer"

    styles = getSampleStyleSheet()
    body = ParagraphStyle("body", parent=styles["BodyText"], fontSize=9.5, leading=13)
    small = ParagraphStyle("small", parent=body, fontSize=8, leading=10.5, textColor=colors.HexColor("#555555"))
    label = ParagraphStyle("label", parent=body, fontSize=8, textColor=colors.HexColor("#555555"), leading=10)
    h1 = ParagraphStyle("h1", parent=styles["Title"], fontSize=17, leading=21, spaceAfter=2)
    h2 = ParagraphStyle("h2", parent=styles["Heading3"], fontSize=11, leading=14, spaceBefore=4, spaceAfter=2)
    qhead = ParagraphStyle("qhead", parent=body, fontName="Helvetica-Bold", fontSize=10)
    answer_style = ParagraphStyle("answer", parent=body, leftIndent=8)

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=16 * mm,
        rightMargin=16 * mm,
        topMargin=16 * mm,
        bottomMargin=18 * mm,
        title=f"Marked paper - {paper.get('assessment_title') or ''}".strip(),
        author="Mindexa",
        invariant=True,  # same snapshot -> byte-identical PDF
    )

    story: list[Any] = []
    logo = logo_image(logo_data_url or paper.get("institution_logo_url"))
    unit_line = " · ".join(
        x for x in [paper.get("college_name"), paper.get("department_name")] if x
    )
    name_block: list[Any] = [
        Paragraph(f"<b>{clean_text(paper.get('institution_name') or 'Institution')}</b>", body)
    ]
    if unit_line:
        name_block.append(Paragraph(clean_text(unit_line), small))
    letterhead = Table(
        [[logo or "", name_block]],
        colWidths=[(LOGO_MAX_WIDTH_MM + 4) * mm if logo else 0, None],
    )
    letterhead.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("LINEBELOW", (0, 0), (-1, 0), 1, colors.HexColor("#1F4E79")),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    story += [letterhead, Spacer(1, 6)]
    story.append(Paragraph(clean_text(paper.get("assessment_title") or "Marked paper"), h1))

    course = " - ".join(
        x for x in [paper.get("course_code"), paper.get("course_name")] if x
    )
    meta_rows = [
        ["Course", course or "-", "Type", str(paper.get("assessment_type") or "-")],
        [
            "Student",
            "Anonymised for appeal review" if anonymous else str(student.get("name") or "-"),
            "Student no.",
            "-" if anonymous else str(student.get("student_number") or "-"),
        ],
        ["Class", str(paper.get("class_name") or "-"), "Academic year", str(paper.get("academic_year") or "-")],
        ["Submitted", _fmt_date(paper.get("submitted_at")), "Released", _fmt_date(paper.get("released_at"))],
    ]
    meta = Table(
        [[Paragraph(clean_text(c), label if i % 2 == 0 else body) for i, c in enumerate(row)] for row in meta_rows],
        colWidths=[24 * mm, 62 * mm, 28 * mm, 62 * mm],
    )
    meta.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("BOTTOMPADDING", (0, 0), (-1, -1), 2)]))
    story += [Spacer(1, 4), meta, Spacer(1, 8)]

    letter = paper.get("letter_grade")
    result_table = Table(
        [
            [
                Paragraph(f"<b>Total</b><br/>{_fmt_marks(paper.get('total_score'))} / {_fmt_marks(paper.get('max_score'))}", body),
                Paragraph(f"<b>Percentage</b><br/>{_fmt_marks(paper.get('percentage'))}%", body),
                Paragraph(f"<b>Grade</b><br/>{clean_text(format_letter_grade(letter)) or '-'}", body),
                Paragraph(f"<b>Outcome</b><br/>{'Pass' if paper.get('is_passing') else 'Fail'}", body),
            ]
        ],
        colWidths=[44 * mm] * 4,
    )
    result_table.setStyle(
        TableStyle(
            [
                ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#1F4E79")),
                ("INNERGRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#BBBBBB")),
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F1F5FA")),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    story += [result_table, Spacer(1, 10)]

    if paper.get("is_group_result") and paper.get("group_feedback"):
        story += [Paragraph("Group feedback", h2), Paragraph(clean_text(paper["group_feedback"]), body), Spacer(1, 6)]

    current_section: str | None = None
    for number, item in enumerate(paper.get("breakdowns") or [], 1):
        block: list[Any] = []
        section = item.get("section_title")
        if section and section != current_section:
            story.append(Paragraph(clean_text(section), h2))
            current_section = section

        score = item.get("score")
        max_score = item.get("max_score")
        mark = _outcome_label(score, max_score)
        qtype = str(item.get("question_type") or "").replace("_", " ")
        head = f"Question {number}  <font size=8 color='#555555'>({clean_text(qtype)})</font>"
        marks_text = f"{_fmt_marks(score)} / {_fmt_marks(max_score)}"
        header = Table(
            [[Paragraph(head, qhead), Paragraph(f"<b>{marks_text}</b>", ParagraphStyle("r", parent=body, alignment=2))]],
            colWidths=[140 * mm, 32 * mm],
        )
        header.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#E8EEF6")),
                    ("TOPPADDING", (0, 0), (-1, -1), 3),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                ]
            )
        )
        block.append(header)
        if mark:
            block.append(Paragraph(mark, small))

        if item.get("case_study_context"):
            block.append(Paragraph(f"<i>Context:</i> {clean_text(item['case_study_context'], 2500)}", small))
        block.append(Spacer(1, 2))
        block.append(Paragraph(clean_text(item.get("question_text")), body))

        answer = format_answer(item.get("student_answer"), item.get("student_answer_json"))
        if item.get("was_skipped") or not answer:
            block.append(Paragraph("<b>Student answer:</b> <i>No answer given</i>", answer_style))
        else:
            block.append(Paragraph(f"<b>Student answer:</b><br/>{clean_text(answer)}", answer_style))

        if item.get("correct_answer"):
            block.append(
                Paragraph(f"<b>Correct answer:</b> {clean_text(item['correct_answer'])}", answer_style)
            )
        if item.get("feedback"):
            block.append(Paragraph(f"<b>Feedback:</b> {clean_text(item['feedback'])}", answer_style))

        if show_staff:
            info = marking.get(str(item.get("question_id")))
            if info:
                pieces = []
                if info.get("marked_by"):
                    pieces.append(f"Marked by {clean_text(info['marked_by'])}")
                if info.get("marked_at"):
                    pieces.append(_fmt_date(info["marked_at"]))
                if info.get("grading_mode"):
                    pieces.append(f"mode {clean_text(info['grading_mode'])}")
                if info.get("ai_suggested_score") is not None:
                    verdict = "overridden by lecturer" if info.get("lecturer_override") else "AI suggestion"
                    pieces.append(f"{verdict}: AI suggested {_fmt_marks(info['ai_suggested_score'])}, final {_fmt_marks(info.get('score'))}")
                if pieces:
                    block.append(Paragraph(" · ".join(pieces), small))
                for crit in info.get("rubric_scores") or []:
                    if isinstance(crit, dict):
                        name = crit.get("criterion_title") or crit.get("criterion") or crit.get("title") or "Criterion"
                        got = crit.get("marks_awarded", crit.get("score"))
                        top = crit.get("max_score", crit.get("max"))
                        block.append(Paragraph(f"Rubric - {clean_text(name)}: {_fmt_marks(got)} / {_fmt_marks(top)}", small))

        block.append(Spacer(1, 8))
        story.append(KeepTogether(block[:4]))
        story.extend(block[4:])

    generated = created_at.strftime("%d %b %Y %H:%M UTC") if created_at else "-"
    footer_text = f"Mindexa archived copy - version {version} - archived {generated} - verification code {verification_code}"

    def _decorate(canvas: Any, document: Any) -> None:
        canvas.saveState()
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(colors.HexColor("#666666"))
        canvas.drawString(16 * mm, 10 * mm, footer_text)
        canvas.drawRightString(A4[0] - 16 * mm, 10 * mm, f"Page {document.page}")
        canvas.restoreState()

    doc.build(story, onFirstPage=_decorate, onLaterPages=_decorate)
    return buffer.getvalue()
