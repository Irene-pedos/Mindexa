"""The pure parts of the calendar import: dates, weekday checks, kinds and the draft."""

from __future__ import annotations

from datetime import date

import pytest

from app.core.exceptions import ValidationError
from app.db.enums import CalendarEventType as K
from app.services import calendar_import_service as svc


def test_parses_a_range_and_a_single_day() -> None:
    p = svc.parse_period_text("Mon 17/08/2026 - Fri 11/09/2026")
    assert p is not None
    assert (p.start, p.end, p.warning) == (date(2026, 8, 17), date(2026, 9, 11), None)

    single = svc.parse_period_text("Tue 12/01/2027")
    assert single is not None
    assert (single.start, single.end, single.warning) == (date(2027, 1, 12), None, None)


def test_a_misread_digit_is_caught_by_the_weekday() -> None:
    # 18/08/2026 is a Tuesday, but the document says Mon.
    p = svc.parse_period_text("Mon 18/08/2026 - Fri 11/09/2026")
    assert p is not None
    assert p.warning is not None
    assert "18/08/2026" in p.warning and "Tue" in p.warning


def test_unreadable_dates_return_nothing() -> None:
    assert svc.parse_period_text("N/A") is None
    assert svc.parse_period_text("Mon 31/02/2026") is None
    assert svc.parse_period_text("") is None


@pytest.mark.parametrize(
    ("title", "kind"),
    [
        ("Online Registration for ongoing & admitted students", K.REGISTRATION),
        ("Students' Holiday for semester 1", K.HOLIDAY),
        ("Special exams", K.EXAM_PERIOD),
        ("College Academic Council to approve special exams", K.DELIBERATION),
        ("End of submission and compilation of Semester 1 results and booklets", K.MARKS_DEADLINE),
        ("Departmental Board to consolidate the provisional results of semester 1", K.DELIBERATION),
        ("College Academic Council to approve and publish semester 1 provisional results", K.RESULTS_PUBLICATION),
        ("Appeals on Semester 1 provisional results", K.APPEAL_WINDOW),
        ("Consideration of appeals and remarking", K.DELIBERATION),
        ("RP Academic Senate to approve semester 1 final results", K.DELIBERATION),
        ("Industrial Attachment", K.PLACEMENT),
        ("Deadline to submit Industrial Attachment Report", K.MARKS_DEADLINE),
        ("Final Defense of Capstone Projects", K.DEFENSE),
        ("Induction and Orientation Program", K.OTHER),
    ],
)
def test_kind_comes_from_the_wording(title: str, kind: K) -> None:
    assert svc.classify(title) == kind


def test_audience_labels() -> None:
    assert svc.normalize_audience_label("Y3") == "Year 3"
    assert svc.normalize_audience_label("All") is None
    assert svc.normalize_audience_label("BTech") == "BTech"
    assert svc.normalize_audience_label(None) is None


REAL_ROWS = {
    "academic_year_label": "2026/2027",
    "rows": [
        {"section": None, "period_text": "Mon 17/08/2026 - Fri 11/09/2026", "activity": "Online Registration", "audience": "All"},
        {"section": "SEMESTER 1", "period_text": "Tue 01/09/2026 - Fri 18/12/2026", "activity": "Teaching and assessment for semester 1", "audience": "All"},
        {"section": "SEMESTER 1", "period_text": "Mon 21/12/2026 - Fri 01/01/2027", "activity": "Students' Holiday for semester 1", "audience": None},
        {"section": "SEMESTER 1", "period_text": "Tue 12/01/2027", "activity": "College Academic Council to approve special exams", "audience": None},
        {"section": "SEMESTER 2", "period_text": "Mon 04/01/2027 - Fri 04/06/2027", "activity": "Teaching and Assessments for Semester 2", "audience": "All"},
        {"section": "SEMESTER 2", "period_text": "Mon 11/01/2027 - Fri 05/03/2027", "activity": "Industrial Attachment", "audience": "Y3"},
        {"section": "SEMESTER 2", "period_text": "Tue 27/07/2027", "activity": "RP Academic Senate meeting to approve end of Year Results", "audience": None},
    ],
}


def test_draft_takes_semester_dates_from_the_teaching_rows() -> None:
    draft = svc.build_draft(REAL_ROWS, source="test")
    assert draft.year_name == "2026-2027"
    assert (draft.year_start, draft.year_end) == (date(2026, 8, 17), date(2027, 7, 27))
    sems = {s.name: (s.start_date, s.end_date) for s in draft.semesters}
    assert sems == {
        "Semester 1 2026-2027": (date(2026, 9, 1), date(2026, 12, 18)),
        "Semester 2 2026-2027": (date(2027, 1, 4), date(2027, 6, 4)),
    }
    # The teaching rows became semesters; the rest are dated items.
    titles = [e.title for e in draft.events]
    assert not any("Teaching" in t for t in titles)
    holiday = next(e for e in draft.events if e.kind == K.HOLIDAY)
    assert holiday.semester == "Semester 1 2026-2027"
    attachment = next(e for e in draft.events if e.kind == K.PLACEMENT)
    assert attachment.audience == "Year 3"
    registration = next(e for e in draft.events if e.kind == K.REGISTRATION)
    assert registration.semester is None and registration.audience is None


def test_rows_with_unreadable_dates_are_reported_not_invented() -> None:
    out = {"rows": [{"section": None, "period_text": "N/A", "activity": "Mystery", "audience": None},
                    {"section": None, "period_text": "Mon 17/08/2026", "activity": "Registration", "audience": None}]}
    draft = svc.build_draft(out, source="test")
    assert len(draft.events) == 1
    assert any("Mystery" in w for w in draft.warnings)


def test_weekday_mismatch_flags_the_row() -> None:
    out = {"rows": [{"section": None, "period_text": "Mon 18/08/2026", "activity": "Registration", "audience": None}]}
    draft = svc.build_draft(out, source="test")
    assert draft.events[0].warning
    assert draft.warnings


def test_a_semester_that_is_too_short_is_flagged() -> None:
    out = {
        "rows": [
            {"section": "SEMESTER 1", "period_text": "Mon 21/12/2026 - Fri 01/01/2027", "activity": "Teaching and assessment for semester 1", "audience": None},
        ]
    }
    draft = svc.build_draft(out, source="test")
    assert any("probably misread" in w for w in draft.warnings)


def test_empty_reading_is_an_error() -> None:
    with pytest.raises(ValidationError):
        svc.build_draft({"rows": []}, source="test")


def test_model_reply_with_fences_and_reasoning_is_read() -> None:
    reply = '<think>hmm</think>\n```json\n{"rows": [], "academic_year_label": "2026/2027"}\n```'
    assert svc.extract_json(reply)["academic_year_label"] == "2026/2027"


def test_provider_wait_time_is_read_from_the_reply() -> None:
    import httpx

    body = '{"error":{"message":"Please try again in 39.12s."}}'
    assert svc._retry_seconds(httpx.Response(429, text=body)) == pytest.approx(39.12)
    assert svc._retry_seconds(httpx.Response(429, text=body, headers={"retry-after": "7"})) == 7
    assert svc._retry_seconds(httpx.Response(429, text='{"error":"try again in 1m5.5s"}')) == 65.5
    assert svc._retry_seconds(httpx.Response(429, text="no hint")) is None


async def test_a_short_rate_limit_is_waited_out_once(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.core.exceptions import RateLimitError

    sleeps: list[float] = []

    async def fake_sleep(seconds: float) -> None:
        sleeps.append(seconds)

    monkeypatch.setattr(svc.asyncio, "sleep", fake_sleep)
    calls = {"n": 0}

    async def flaky() -> str:
        calls["n"] += 1
        if calls["n"] == 1:
            raise RateLimitError("busy", retry_after=5)
        return "ok"

    assert await svc._call_with_one_retry(flaky) == "ok"
    assert sleeps == [6]

    async def long_wait() -> str:
        raise RateLimitError("busy", retry_after=45)

    with pytest.raises(RateLimitError):
        await svc._call_with_one_retry(long_wait)
