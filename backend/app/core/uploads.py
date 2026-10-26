"""Shared, defensive handling of user-uploaded files.

Every upload path (student resources, lecturer materials, text extraction) goes through these
helpers so size, name and content checks are identical and cannot drift apart.
"""

from __future__ import annotations

import os
from collections.abc import Sequence
from typing import Protocol

from app.core.exceptions import ValidationError

_READ_CHUNK_BYTES = 1024 * 1024

_ZIP_MAGIC = b"PK\x03\x04"
_OLE_MAGIC = b"\xd0\xcf\x11\xe0"


class _AsyncReadable(Protocol):
    async def read(self, size: int = -1) -> bytes: ...


async def read_limited(file: _AsyncReadable, max_bytes: int, *, limit_label: str) -> bytes:
    """Read an upload, aborting as soon as it exceeds ``max_bytes``.

    Unlike ``await file.read()`` this never buffers more than ``max_bytes`` plus one chunk, so
    an oversized upload cannot be used to exhaust memory before the size check runs.
    """
    buffer = bytearray()
    while True:
        chunk = await file.read(_READ_CHUNK_BYTES)
        if not chunk:
            break
        buffer.extend(chunk)
        if len(buffer) > max_bytes:
            raise ValidationError(
                f"File size exceeds the {limit_label} limit.",
                code="FILE_TOO_LARGE",
            )
    return bytes(buffer)


def validated_extension(filename: str | None, allowed: Sequence[str]) -> str:
    """Lower-case extension of ``filename`` (with dot), rejecting missing names and bad types."""
    if not filename or not filename.strip():
        raise ValidationError("The uploaded file has no name.", code="INVALID_FILE_NAME")
    ext = os.path.splitext(filename)[1].lower()
    if ext not in allowed:
        raise ValidationError(
            f"File extension {ext or '(none)'} is not allowed.",
            code="INVALID_FILE_TYPE",
        )
    return ext


def clean_display_name(filename: str) -> str:
    """The file's own name, safe to store and show: no directories, no control characters.

    Clients can send ``../../x.txt`` or ``C:\\dir\\x.txt`` as the name. Storage never uses it (files
    are saved under a generated name), but it is shown back to users and used to match versions.
    """
    base = filename.replace("\\", "/").rsplit("/", 1)[-1]
    base = "".join(ch for ch in base if ch.isprintable()).strip()
    return base[:255] or "file"


def assert_not_empty(content: bytes) -> None:
    """An empty file has nothing to read or index; refuse it up front."""
    if not content:
        raise ValidationError("The uploaded file is empty.", code="EMPTY_FILE")


def assert_content_matches_extension(ext: str, content: bytes) -> None:
    """Reject files whose bytes do not look like what their extension claims.

    This is a sniff test, not a malware scan: it stops a renamed executable or archive from
    being stored and handed to a parser as a document. Extensions without a known signature
    are not checked here.
    """
    head = content[:4096]
    ok = True
    if ext == ".pdf":
        ok = b"%PDF-" in head[:1024]
    elif ext == ".docx":
        ok = head.startswith(_ZIP_MAGIC)
    elif ext == ".doc":
        ok = head.startswith(_OLE_MAGIC) or head.startswith(_ZIP_MAGIC)
    elif ext == ".png":
        ok = head.startswith(b"\x89PNG\r\n\x1a\n")
    elif ext in (".jpg", ".jpeg"):
        ok = head.startswith(b"\xff\xd8\xff")
    elif ext == ".txt":
        ok = b"\x00" not in head
    if not ok:
        raise ValidationError(
            f"The file content does not look like a valid {ext} file.",
            code="INVALID_FILE_CONTENT",
        )
