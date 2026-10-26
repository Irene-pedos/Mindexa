import io
import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest
from app.core.config import settings
from app.core.exceptions import ValidationError
from app.core.uploads import (
    assert_content_matches_extension,
    read_limited,
    validated_extension,
)
from app.services.document_processing_service import (
    DocumentLimitError,
    DocumentProcessingService,
    _public_processing_error,
)
from app.services.resource_service import ResourceService


class _Reader:
    """Async file stand-in that records how much was actually read."""

    def __init__(self, data: bytes):
        self._buf = io.BytesIO(data)
        self.bytes_read = 0

    async def read(self, size: int = -1) -> bytes:
        chunk = self._buf.read(size)
        self.bytes_read += len(chunk)
        return chunk


@pytest.mark.asyncio
async def test_read_limited_returns_small_files_intact():
    assert await read_limited(_Reader(b"abc"), 10, limit_label="10B") == b"abc"


@pytest.mark.asyncio
async def test_read_limited_stops_reading_once_over_the_limit():
    reader = _Reader(b"x" * (10 * 1024 * 1024))

    with pytest.raises(ValidationError) as exc_info:
        await read_limited(reader, 1024, limit_label="1KB")

    assert exc_info.value.code == "FILE_TOO_LARGE"
    assert reader.bytes_read < 3 * 1024 * 1024  # never slurped the whole 10MB


@pytest.mark.parametrize("name", [None, "", "   "])
def test_missing_filename_is_rejected_cleanly(name):
    with pytest.raises(ValidationError) as exc_info:
        validated_extension(name, [".pdf"])

    assert exc_info.value.code == "INVALID_FILE_NAME"


@pytest.mark.parametrize(
    "raw, cleaned",
    [
        ("notes.pdf", "notes.pdf"),
        ("../../etc/passwd.txt", "passwd.txt"),
        ("C:\\Users\\me\\Desktop\\essay.docx", "essay.docx"),
        ("evil\x00name\n.txt", "evilname.txt"),
        ("/", "file"),
        ("a" * 400 + ".txt", ("a" * 400 + ".txt")[:255]),
    ],
)
def test_display_name_never_carries_directories_or_control_characters(raw, cleaned):
    from app.core.uploads import clean_display_name

    assert clean_display_name(raw) == cleaned


def test_empty_upload_is_rejected():
    from app.core.uploads import assert_not_empty

    with pytest.raises(ValidationError) as exc:
        assert_not_empty(b"")
    assert exc.value.code == "EMPTY_FILE"
    assert_not_empty(b"x")  # anything else passes


def test_disallowed_extension_is_rejected():
    with pytest.raises(ValidationError) as exc_info:
        validated_extension("run.exe", [".pdf", ".docx"])

    assert exc_info.value.code == "INVALID_FILE_TYPE"
    assert validated_extension("Notes.PDF", [".pdf"]) == ".pdf"


@pytest.mark.parametrize(
    "ext,content",
    [
        (".pdf", b"%PDF-1.7\n..."),
        (".docx", b"PK\x03\x04rest"),
        (".png", b"\x89PNG\r\n\x1a\nrest"),
        (".jpg", b"\xff\xd8\xff\xe0rest"),
        (".txt", "plain text é".encode()),
    ],
)
def test_genuine_files_pass_the_signature_check(ext, content):
    assert_content_matches_extension(ext, content)


@pytest.mark.parametrize(
    "ext,content",
    [
        (".pdf", b"MZ\x90\x00 this is an executable"),
        (".docx", b"%PDF-1.7"),
        (".png", b"not a png"),
        (".txt", b"binary\x00data"),
    ],
)
def test_renamed_files_are_rejected(ext, content):
    with pytest.raises(ValidationError) as exc_info:
        assert_content_matches_extension(ext, content)

    assert exc_info.value.code == "INVALID_FILE_CONTENT"


def _service_with_usage(count, total_bytes):
    service = ResourceService(AsyncMock())
    service.repo = MagicMock()
    service.repo.student_resource_usage = AsyncMock(return_value=(count, total_bytes))
    return service


@pytest.mark.asyncio
async def test_student_at_file_count_limit_cannot_upload_more():
    service = _service_with_usage(settings.STUDENT_MAX_RESOURCES, 0)

    with pytest.raises(ValidationError) as exc_info:
        await service._assert_student_within_quota(uuid.uuid4(), 1)

    assert exc_info.value.code == "STUDENT_UPLOAD_COUNT_LIMIT"


@pytest.mark.asyncio
async def test_student_storage_quota_counts_the_incoming_file():
    service = _service_with_usage(1, settings.student_storage_quota_bytes - 10)

    with pytest.raises(ValidationError) as exc_info:
        await service._assert_student_within_quota(uuid.uuid4(), 11)

    assert exc_info.value.code == "STUDENT_STORAGE_QUOTA_EXCEEDED"
    await service._assert_student_within_quota(uuid.uuid4(), 10)  # exactly fits


def test_page_limit_error_message_is_shown_to_the_user_unchanged():
    message = "This document has too many pages (limit 1000). Split it up."

    assert _public_processing_error(DocumentLimitError(message)) == message


def test_oversized_pdf_is_refused_before_any_page_is_extracted(monkeypatch):
    monkeypatch.setattr(settings, "MAX_DOCUMENT_PAGES", 2)

    class FakeDoc:
        def __len__(self):
            return 3

        def __iter__(self):
            raise AssertionError("pages must not be read once the limit is exceeded")

        def close(self):
            self.closed = True

    from app.services import document_processing_service as dps

    monkeypatch.setattr(dps.fitz, "open", lambda _path: FakeDoc())
    # The constructor tries to download a tiktoken encoding; a failure falls back to no tokenizer.
    monkeypatch.setattr(dps.tiktoken, "get_encoding", MagicMock(side_effect=RuntimeError("offline")))

    with pytest.raises(DocumentLimitError):
        DocumentProcessingService()._extract_text_pdf("ignored.pdf")
