import io
from pptx import Presentation

from app.agents.slide_deck_agent import SlideDeckOutput, SlideItem
from app.core.pptx_exporter import build_slide_deck_pptx


def test_build_slide_deck_pptx_generates_valid_presentation():
    deck = SlideDeckOutput(
        title="Introduction to Database Systems",
        target_audience="First Year CS",
        estimated_minutes=50,
        slides=[
            SlideItem(
                title="What is a DBMS?",
                bullet_points=["Software managing structured data", "ACID compliance guarantees", "Multi-user concurrency"],
                visual_idea="DBMS architecture box diagram",
                speaker_notes="Begin by asking students how they currently store state in applications."
            ),
            SlideItem(
                title="Relational Model Overview",
                bullet_points=["Tables, rows, and columns", "Primary keys and Foreign keys", "Declarative SQL interface"],
                visual_idea="ER diagram sample",
                speaker_notes="Emphasize mathematical foundations by Codd."
            ),
            SlideItem(
                title="ACID Properties",
                bullet_points=["Atomicity (all or nothing)", "Consistency (valid states)", "Isolation (concurrency)", "Durability (persistence)"],
                visual_idea="Transaction commit timeline",
                speaker_notes="Give a classic bank transfer example."
            ),
            SlideItem(
                title="Summary & Questions",
                bullet_points=["Key takeaways review", "Lab assignment 1 release", "Office hours schedule"],
                speaker_notes="Open the floor for questions."
            ),
        ]
    )

    pptx_bytes = build_slide_deck_pptx(deck)

    assert isinstance(pptx_bytes, bytes)
    assert len(pptx_bytes) > 0

    # Verify that python-pptx can parse the generated file
    prs = Presentation(io.BytesIO(pptx_bytes))
    
    # 1 Title Slide + 4 Content Slides = 5 Slides
    assert len(prs.slides) == 5

    # Check title slide
    title_slide = prs.slides[0]
    assert title_slide.shapes.title.text == "Introduction to Database Systems"

    # Check content slide 1
    content_slide_1 = prs.slides[1]
    assert content_slide_1.shapes.title.text == "What is a DBMS?"

    # Check speaker notes on slide 1
    assert content_slide_1.notes_slide.notes_text_frame.text == "Begin by asking students how they currently store state in applications."


def _deck(**slide_overrides):
    slide = dict(
        title="Normalisation",
        bullet_points=["1NF", "2NF", "3NF"],
        visual_idea="Dependency diagram",
        speaker_notes="Walk through an example.",
    )
    slide.update(slide_overrides)
    return SlideDeckOutput(
        title="Databases",
        slides=[SlideItem(**slide), SlideItem(**slide), SlideItem(**slide)],
    )


def _reload(deck):
    return Presentation(io.BytesIO(build_slide_deck_pptx(deck)))


def test_every_placeholder_fits_inside_the_widescreen_slide():
    prs = _reload(_deck())

    for slide in prs.slides:
        for shape in slide.shapes:
            assert shape.left >= 0 and shape.top >= 0
            assert shape.left + shape.width <= prs.slide_width
            assert shape.top + shape.height <= prs.slide_height


def test_font_sizes_are_set_on_runs_where_powerpoint_honours_them():
    prs = _reload(_deck())

    body = prs.slides[1].placeholders[1].text_frame
    sizes = {run.font.size.pt for p in body.paragraphs for run in p.runs}
    title_run = prs.slides[1].shapes.title.text_frame.paragraphs[0].runs[0]

    assert None not in sizes and sizes
    assert title_run.font.size.pt == 32 and title_run.font.bold is True


def test_dense_slides_use_a_smaller_font_than_sparse_ones():
    sparse = _reload(_deck(bullet_points=["One short point"]))
    dense = _reload(_deck(bullet_points=["A fairly long bullet point about indexing. " * 5] * 10))

    def body_size(prs):
        return prs.slides[1].placeholders[1].text_frame.paragraphs[0].runs[0].font.size.pt

    assert body_size(dense) < body_size(sparse)


def test_xml_illegal_control_characters_do_not_crash_the_export():
    deck = _deck(title="Bad\x00title\x0c", bullet_points=["null\x00byte", "escape\x1b code"], speaker_notes="n\x08otes")

    prs = _reload(deck)

    assert prs.slides[1].shapes.title.text == "Badtitle"


def test_overlong_bullets_are_capped_by_the_schema():
    slide = SlideItem(title="T", bullet_points=["x" * 5000])

    assert len(slide.bullet_points[0]) == 400
