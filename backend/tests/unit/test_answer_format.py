import json
from types import SimpleNamespace as NS

from app.services.answer_format import readable_answer

OPTS = [
    NS(id="b-id", content="Second sub-question?", order_index=1),
    NS(id="a-id", content="First sub-question?", order_index=0),
]


def test_case_study_json_is_labelled_by_sub_question_in_order() -> None:
    raw = json.dumps({"b-id": "two", "a-id": "one"})
    out = readable_answer(raw, OPTS)
    assert out.index("Part 1: First sub-question?") < out.index("Part 2: Second sub-question?")
    assert "Student's answer: one" in out and "Student's answer: two" in out
    assert "b-id" not in out


def test_blank_parts_are_marked_blank() -> None:
    assert "(blank)" in readable_answer(json.dumps({"a-id": "  "}), OPTS)


def test_plain_text_and_foreign_json_are_untouched() -> None:
    assert readable_answer("just an essay", OPTS) == "just an essay"
    foreign = json.dumps({"unknown": "x"})
    assert readable_answer(foreign, OPTS) == foreign
    table = json.dumps({"headers": ["a"], "rows": []})
    assert readable_answer(table, OPTS) == table
    assert readable_answer(None, OPTS) == ""
    assert readable_answer("{not json}", OPTS) == "{not json}"
