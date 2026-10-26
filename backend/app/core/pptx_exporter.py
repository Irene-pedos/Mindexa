from __future__ import annotations

import io
import re

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.text import MSO_AUTO_SIZE
from pptx.text.text import _Paragraph
from pptx.util import Inches, Pt

from app.agents.slide_deck_agent import SlideDeckOutput

# python-pptx raises ValueError for characters that are illegal in XML 1.0; model output and
# pasted text occasionally contain them (form feeds, NULs, stray escape codes).
_XML_ILLEGAL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")

_SLATE_900 = RGBColor(15, 23, 42)
_SLATE_800 = RGBColor(30, 41, 59)
_SLATE_500 = RGBColor(100, 116, 139)
_SLATE_400 = RGBColor(148, 163, 184)

# 16:9. The default template is 4:3, so placeholder geometry is set explicitly below; changing
# only the slide size would leave every placeholder where it was, crammed to the left.
_SLIDE_W, _SLIDE_H = Inches(13.333), Inches(7.5)
_MARGIN = Inches(0.8)
_CONTENT_W = _SLIDE_W - 2 * _MARGIN


def _clean(text: str | None) -> str:
    return _XML_ILLEGAL.sub("", text or "").strip()


def _style(paragraph: _Paragraph, *, size: int, color: RGBColor, bold: bool = False, italic: bool = False) -> None:
    """Style at run level. ``paragraph.font`` only sets default paragraph properties, which
    PowerPoint frequently ignores for runs that already exist, so size/colour were being lost."""
    for run in paragraph.runs:
        run.font.size = Pt(size)
        run.font.bold = bold
        run.font.italic = italic
        run.font.color.rgb = color


def _place(shape, left, top, width, height) -> None:
    shape.left, shape.top, shape.width, shape.height = left, top, width, height


def _body_font_size(bullets: list[str], has_visual: bool) -> int:
    """Pick a size that keeps the bullets inside the body box instead of overflowing it."""
    chars = sum(len(b) for b in bullets) + (80 if has_visual else 0)
    lines = len(bullets) + (1 if has_visual else 0)
    if lines <= 5 and chars <= 450:
        return 22
    if lines <= 7 and chars <= 700:
        return 20
    if lines <= 9 and chars <= 950:
        return 18
    if lines <= 11 and chars <= 1200:
        return 16
    return 14


def build_slide_deck_pptx(deck: SlideDeckOutput) -> bytes:
    """
    Render a validated SlideDeckOutput schema into a clean, professional .pptx presentation file.
    """
    prs = Presentation()
    prs.slide_width, prs.slide_height = _SLIDE_W, _SLIDE_H

    # 1. Title Slide (Layout 0)
    title_slide = prs.slides.add_slide(prs.slide_layouts[0])
    if title_slide.shapes.title is not None:
        shape = title_slide.shapes.title
        _place(shape, _MARGIN, Inches(2.0), _CONTENT_W, Inches(1.8))
        shape.text = _clean(deck.title)
        shape.text_frame.word_wrap = True
        shape.text_frame.auto_size = MSO_AUTO_SIZE.TEXT_TO_FIT_SHAPE
        _style(shape.text_frame.paragraphs[0], size=40, color=_SLATE_900, bold=True)

    if len(title_slide.placeholders) > 1:
        subtitle = title_slide.placeholders[1]
        _place(subtitle, _MARGIN, Inches(4.1), _CONTENT_W, Inches(1.5))
        subtitle.text = (
            f"Audience: {_clean(deck.target_audience)} • Duration: ~{deck.estimated_minutes} min\n"
            "Mindexa Academic Operating System"
        )
        subtitle.text_frame.word_wrap = True
        for paragraph in subtitle.text_frame.paragraphs:
            _style(paragraph, size=18, color=_SLATE_500)

    # 2. Content Slides (Layout 1)
    content_layout = prs.slide_layouts[1]
    for slide_data in deck.slides:
        slide = prs.slides.add_slide(content_layout)

        if slide.shapes.title is not None:
            shape = slide.shapes.title
            _place(shape, _MARGIN, Inches(0.5), _CONTENT_W, Inches(1.2))
            shape.text = _clean(slide_data.title)
            shape.text_frame.word_wrap = True
            shape.text_frame.auto_size = MSO_AUTO_SIZE.TEXT_TO_FIT_SHAPE
            _style(shape.text_frame.paragraphs[0], size=32, color=_SLATE_900, bold=True)

        if len(slide.placeholders) > 1:
            body = slide.placeholders[1]
            _place(body, _MARGIN, Inches(1.9), _CONTENT_W, Inches(5.0))
            tf = body.text_frame
            tf.clear()
            tf.word_wrap = True
            tf.auto_size = MSO_AUTO_SIZE.TEXT_TO_FIT_SHAPE

            bullets = [b for b in (_clean(b) for b in slide_data.bullet_points) if b]
            visual = _clean(slide_data.visual_idea)
            size = _body_font_size(bullets, bool(visual))

            for idx, bullet in enumerate(bullets):
                p = tf.paragraphs[0] if idx == 0 else tf.add_paragraph()
                p.text = bullet
                p.level = 0
                p.space_after = Pt(12)
                _style(p, size=size, color=_SLATE_800)

            if visual:
                p_vis = tf.paragraphs[0] if not bullets else tf.add_paragraph()
                p_vis.text = f"[Visual Cue: {visual}]"
                p_vis.space_before = Pt(14)
                _style(p_vis, size=max(12, size - 6), color=_SLATE_400, italic=True)

        notes = _clean(slide_data.speaker_notes)
        if notes:
            slide.notes_slide.notes_text_frame.text = notes

    buffer = io.BytesIO()
    prs.save(buffer)
    return buffer.getvalue()
