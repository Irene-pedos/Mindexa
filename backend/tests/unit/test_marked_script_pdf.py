"""
Unit tests for the marked-paper PDF renderer and snapshot hashing.
"""
from __future__ import annotations

from datetime import UTC, datetime

import fitz  # PyMuPDF, used here only to read the text back out of the PDF

from app.services.marked_script_pdf import clean_text, format_answer, render_marked_script_pdf
from app.services.marked_script_service import canonical_hash, make_verification_code

Q1 = "11111111-1111-1111-1111-111111111111"
Q2 = "22222222-2222-2222-2222-222222222222"


def _snapshot() -> dict:
    return {
        "schema_version": 1,
        "student": {"id": "s1", "name": "Aline Uwase", "student_number": "REG-0042"},
        "paper": {
            "assessment_title": "Digital Logic CAT",
            "course_code": "DS101",
            "course_name": "Digital Systems",
            "assessment_type": "CAT",
            "institution_name": "Test College",
            "total_score": 7,
            "max_score": 10,
            "percentage": 70,
            "letter_grade": "B",
            "is_passing": True,
            "breakdowns": [
                {
                    "question_id": Q1,
                    "question_text": "What is 2 + 2? <script>alert(1)</script> & more",
                    "question_type": "mcq",
                    "student_answer": "4",
                    "correct_answer": "4",
                    "is_correct": True,
                    "score": 2,
                    "max_score": 2,
                    "feedback": "Well done",
                },
                {
                    "question_id": Q2,
                    "question_text": "Match the gates",
                    "question_type": "matching",
                    "student_answer": "",
                    "student_answer_json": {"AND": "multiply", "OR": "add"},
                    "correct_answer": "AND -> multiply, OR -> add",
                    "is_correct": False,
                    "score": 5,
                    "max_score": 8,
                    "feedback": "Second pair reversed",
                },
            ],
        },
        "marking": [
            {
                "question_id": Q2,
                "score": 5,
                "marked_by": "Dr Mukamana",
                "grading_mode": "AI_ASSISTED",
                "ai_suggested_score": 6,
                "lecturer_override": True,
                "rubric_scores": [],
            }
        ],
    }


def _text(pdf: bytes) -> str:
    with fitz.open(stream=pdf, filetype="pdf") as doc:
        return "\n".join(page.get_text() for page in doc)


def _render(audience: str) -> bytes:
    return render_marked_script_pdf(
        snapshot=_snapshot(),
        verification_code="MX-ABC-V1",
        version=1,
        created_at=datetime(2026, 11, 10, 9, 0, tzinfo=UTC),
        audience=audience,
    )


def test_hash_ignores_key_order_and_changes_with_content() -> None:
    a = {"x": 1, "y": [1, 2], "z": {"k": "v"}}
    b = {"z": {"k": "v"}, "y": [1, 2], "x": 1}
    assert canonical_hash(a) == canonical_hash(b)
    assert canonical_hash(a) != canonical_hash({**a, "x": 2})
    assert len(canonical_hash(a)) == 64


def test_verification_code_carries_version() -> None:
    digest = canonical_hash({"a": 1})
    assert make_verification_code(digest, 2) == f"MX-{digest[:12].upper()}-V2"


def test_clean_text_strips_tags_and_escapes() -> None:
    cleaned = clean_text("<b>bold</b> a & b < c\nline two")
    assert "<b>" not in cleaned
    assert "&amp;" in cleaned
    assert "<br/>" in cleaned


def test_format_answer_handles_structured_answers() -> None:
    assert format_answer("plain", None) == "plain"
    assert "AND: multiply" in format_answer("", {"AND": "multiply"})
    assert format_answer("", ["a", "b"]).splitlines() == ["1. a", "2. b"]
    assert format_answer(None, None) == ""


def test_pdf_has_marks_answers_feedback_and_code() -> None:
    pdf = _render("student")
    assert pdf.startswith(b"%PDF")
    text = _text(pdf)
    for expected in (
        "Digital Logic CAT",
        "Aline Uwase",
        "REG-0042",
        "7 / 10",
        "Correct answer:",
        "Well done",
        "Second pair reversed",
        "AND: multiply",
        "MX-ABC-V1",
    ):
        assert expected in text, expected


def test_hostile_question_text_is_printed_not_executed() -> None:
    text = _text(_render("student"))
    # Tags are stripped from the markup, the rest of the text survives
    assert "alert(1)" in text
    assert "<script>" not in text


def test_student_copy_hides_marker_and_ai_details() -> None:
    text = _text(_render("student"))
    assert "Dr Mukamana" not in text
    assert "AI suggested" not in text


def test_staff_copy_shows_marker_and_ai_beside_final_mark() -> None:
    text = _text(_render("staff"))
    assert "Dr Mukamana" in text
    assert "AI suggested 6" in text
    assert "final 5" in text


def test_reviewer_copy_is_anonymous() -> None:
    text = _text(_render("reviewer"))
    assert "Aline Uwase" not in text
    assert "REG-0042" not in text
    assert "Anonymised for appeal review" in text


def test_same_snapshot_gives_identical_pdf() -> None:
    assert _render("staff") == _render("staff")


def test_symbols_helvetica_cannot_draw_are_replaced() -> None:
    cleaned = clean_text("non\u2011linear, x \u2264 5, A \u2192 B, caf\u00e9, \u4e2d")
    assert "non-linear" in cleaned
    assert "x &lt;= 5" in cleaned
    assert "A -&gt; B" in cleaned
    assert "caf\u00e9" in cleaned  # accents are fine
    assert cleaned.endswith("?")


def _png_data_url(width: int = 120, height: int = 60) -> str:
    import base64
    import io

    from PIL import Image as PILImage

    buf = io.BytesIO()
    PILImage.new("RGB", (width, height), (31, 78, 121)).save(buf, "PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def test_logo_is_drawn_in_the_letterhead() -> None:
    pdf = render_marked_script_pdf(
        snapshot=_snapshot(),
        verification_code="MX-ABC-V1",
        version=1,
        created_at=datetime(2026, 11, 10, 9, 0, tzinfo=UTC),
        audience="staff",
        logo_data_url=_png_data_url(),
    )
    with fitz.open(stream=pdf, filetype="pdf") as doc:
        assert len(doc[0].get_images()) == 1
    assert "Test College" in _text(pdf)


def test_no_logo_still_gives_a_paper() -> None:
    with fitz.open(stream=_render("staff"), filetype="pdf") as doc:
        assert len(doc[0].get_images()) == 0


def test_unusable_logos_are_left_out_not_fatal() -> None:
    from app.services.marked_script_pdf import logo_image

    assert logo_image(None) is None
    assert logo_image("") is None
    assert logo_image("https://example.com/logo.png") is None, "remote URLs are never fetched"
    assert logo_image("data:image/svg+xml;base64,PHN2Zy8+") is None
    assert logo_image("data:image/png;base64,not-an-image") is None
    assert logo_image("data:image/png;base64," + "A" * (3 * 1024 * 1024)) is None
    assert logo_image(_png_data_url()) is not None


def test_wide_logo_is_kept_within_its_box() -> None:
    from reportlab.lib.units import mm

    from app.services.marked_script_pdf import LOGO_MAX_WIDTH_MM, logo_image

    wide = logo_image(_png_data_url(1000, 100))
    assert wide is not None and wide.drawWidth <= LOGO_MAX_WIDTH_MM * mm + 0.01
