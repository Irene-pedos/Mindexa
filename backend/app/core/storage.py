"""
app/core/storage.py

File storage abstraction for Mindexa Platform.

BACKENDS:
    local   — Saves files to the local filesystem (development)
    s3      — Uploads to AWS S3 (production)

Controlled by settings.STORAGE_BACKEND.

The interface is identical regardless of backend. Code that calls
storage.save() or storage.url() never needs to know where files are stored.

SUPPORTED CONTENT:
    - Student answer file uploads (pdf, images, docs)
    - User avatars
    - Assessment resources (attachments, rubrics)

SECURITY:
    - Files are stored under content-addressed paths (UUID-based), never
      directly under user-supplied filenames.
    - File extension is validated against ALLOWED_UPLOAD_EXTENSIONS.
    - Max upload size enforced before any storage call.

USAGE:
    from app.core.storage import storage

    # Save a file
    path = await storage.save(
        file_bytes=content,
        filename="submission.pdf",
        folder="submissions/{attempt_id}",
    )

    # Get a public/presigned URL
    url = await storage.url(path)

    # Delete
    await storage.delete(path)

    # Check existence
    exists = await storage.exists(path)
"""

from __future__ import annotations

import uuid
from pathlib import Path

from app.core.config import settings
from app.core.logger import get_logger

logger = get_logger("mindexa.storage")


# ---------------------------------------------------------------------------
# EXCEPTIONS
# ---------------------------------------------------------------------------

class StorageError(Exception):
    """Raised when a storage operation fails."""


class FileTooLargeError(StorageError):
    """Raised when uploaded file exceeds MAX_UPLOAD_SIZE_BYTES."""


class FileTypeNotAllowedError(StorageError):
    """Raised when file extension is not in ALLOWED_UPLOAD_EXTENSIONS."""


# ---------------------------------------------------------------------------
# BASE CLASS
# ---------------------------------------------------------------------------

class StorageBackend:
    """Abstract interface for all storage backends."""

    async def save(
        self,
        file_bytes: bytes,
        filename: str,
        folder: str = "",
        content_type: str | None = None,
    ) -> str:
        """
        Persist file_bytes and return the storage path/key.

        Args:
            file_bytes:   Raw file content.
            filename:     Original filename (used for extension only).
            folder:       Logical folder prefix (e.g., "submissions/uuid").
            content_type: MIME type hint for S3 object metadata.

        Returns:
            Storage path/key (use with url() and delete()).
        """
        raise NotImplementedError

    async def url(self, path: str, expires_seconds: int = 3600) -> str:
        """
        Return a URL to access the stored file.

        For local storage: returns a relative path (frontend serves via static).
        For S3: returns a presigned URL valid for expires_seconds.
        """
        raise NotImplementedError

    async def delete(self, path: str) -> None:
        """Remove a stored file. Silently succeeds if file does not exist."""
        raise NotImplementedError

    async def exists(self, path: str) -> bool:
        """Return True if the file at path exists in storage."""
        raise NotImplementedError

    # ── Shared Validation ─────────────────────────────────────────────────────

    def _validate(self, file_bytes: bytes, filename: str) -> str:
        """
        Validate size and extension.
        Returns the normalized (lowercase) file extension.
        Raises FileTooLargeError or FileTypeNotAllowedError on violation.
        """
        if len(file_bytes) > settings.max_upload_size_bytes:
            raise FileTooLargeError(
                f"File exceeds maximum size of {settings.MAX_UPLOAD_SIZE_MB} MB."
            )

        suffix = Path(filename).suffix.lower()
        if suffix not in settings.ALLOWED_UPLOAD_EXTENSIONS:
            raise FileTypeNotAllowedError(
                f"File type '{suffix}' is not allowed. "
                f"Allowed: {', '.join(settings.ALLOWED_UPLOAD_EXTENSIONS)}"
            )
        return suffix

    def _unique_path(self, filename: str, folder: str) -> str:
        """Build a UUID-based content-addressed storage path."""
        suffix = Path(filename).suffix.lower()
        unique_name = f"{uuid.uuid4().hex}{suffix}"
        if folder:
            return f"{folder.rstrip('/')}/{unique_name}"
        return unique_name


# ---------------------------------------------------------------------------
# LOCAL STORAGE (development)
# ---------------------------------------------------------------------------

class LocalStorage(StorageBackend):
    """
    Stores files on the local filesystem under settings.STORAGE_LOCAL_DIR.

    Suitable for development only. In production, switch to S3.
    """

    def __init__(self) -> None:
        self._root = Path(settings.STORAGE_LOCAL_DIR).resolve()
        self._root.mkdir(parents=True, exist_ok=True)
        logger.info("LocalStorage initialized at %s", self._root)

    async def save(
        self,
        file_bytes: bytes,
        filename: str,
        folder: str = "",
        content_type: str | None = None,
    ) -> str:
        suffix = self._validate(file_bytes, filename)
        path = self._unique_path(filename, folder)
        full_path = self._root / path
        full_path.parent.mkdir(parents=True, exist_ok=True)

        full_path.write_bytes(file_bytes)
        logger.info("LocalStorage saved: %s (%d bytes)", path, len(file_bytes))
        return path

    async def url(self, path: str, expires_seconds: int = 3600) -> str:
        # In development, assume the frontend serves /uploads via a static route.
        return f"/uploads/{path}"

    async def delete(self, path: str) -> None:
        full_path = self._root / path
        if full_path.exists():
            full_path.unlink()
            logger.debug("LocalStorage deleted: %s", path)

    async def exists(self, path: str) -> bool:
        return (self._root / path).exists()


# ---------------------------------------------------------------------------
# S3 STORAGE (production)
# ---------------------------------------------------------------------------

class S3Storage(StorageBackend):
    """
    Stores files in AWS S3 (or compatible: MinIO, R2, DigitalOcean Spaces).

    Requires: boto3 (pip install boto3)
    Config: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, AWS_S3_BUCKET
    """

    def __init__(self) -> None:
        try:
            import boto3
            from botocore.config import Config

            kwargs: dict = {
                "aws_access_key_id": settings.AWS_ACCESS_KEY_ID or None,
                "aws_secret_access_key": settings.AWS_SECRET_ACCESS_KEY or None,
                "region_name": settings.AWS_REGION,
                "config": Config(
                    retries={"max_attempts": 3, "mode": "adaptive"},
                    connect_timeout=5,
                    read_timeout=30,
                ),
            }
            if settings.AWS_S3_ENDPOINT_URL:
                # MinIO / local S3 compatibility
                kwargs["endpoint_url"] = settings.AWS_S3_ENDPOINT_URL

            self._client = boto3.client("s3", **kwargs)
            self._bucket = settings.AWS_S3_BUCKET
            logger.info("S3Storage initialized (bucket=%s, region=%s)",
                        self._bucket, settings.AWS_REGION)

        except ImportError:
            raise StorageError(
                "boto3 is required for S3 storage. "
                "Install it with: pip install boto3"
            )

    async def save(
        self,
        file_bytes: bytes,
        filename: str,
        folder: str = "",
        content_type: str | None = None,
    ) -> str:
        import io
        self._validate(file_bytes, filename)
        path = self._unique_path(filename, folder)

        extra_args: dict = {}
        if content_type:
            extra_args["ContentType"] = content_type

        try:
            self._client.upload_fileobj(
                io.BytesIO(file_bytes),
                self._bucket,
                path,
                ExtraArgs=extra_args or None,
            )
            logger.info("S3Storage saved: s3://%s/%s (%d bytes)",
                        self._bucket, path, len(file_bytes))
            return path
        except Exception as exc:
            logger.error("S3 upload failed: %s", str(exc), exc_info=True)
            raise StorageError(f"S3 upload failed: {exc}") from exc

    async def url(self, path: str, expires_seconds: int = 3600) -> str:
        try:
            url = self._client.generate_presigned_url(
                "get_object",
                Params={"Bucket": self._bucket, "Key": path},
                ExpiresIn=expires_seconds,
            )
            return url
        except Exception as exc:
            logger.error("S3 presign failed for %s: %s", path, str(exc))
            raise StorageError(f"S3 presign failed: {exc}") from exc

    async def delete(self, path: str) -> None:
        try:
            self._client.delete_object(Bucket=self._bucket, Key=path)
            logger.debug("S3Storage deleted: %s", path)
        except Exception as exc:
            logger.warning("S3 delete failed for %s: %s", path, str(exc))

    async def exists(self, path: str) -> bool:
        try:
            self._client.head_object(Bucket=self._bucket, Key=path)
            return True
        except Exception:
            return False


# ---------------------------------------------------------------------------
# FACTORY
# ---------------------------------------------------------------------------

def _create_storage() -> StorageBackend:
    backend = settings.STORAGE_BACKEND
    if backend == "s3":
        return S3Storage()
    if backend == "local":
        return LocalStorage()
    raise ValueError(f"Unknown STORAGE_BACKEND: '{backend}'")


# ---------------------------------------------------------------------------
# MODULE-LEVEL SINGLETON
# ---------------------------------------------------------------------------

# Lazy initialization — the backend is created on first access so that
# LocalStorage directories are not created at import time in tests.
_storage_instance: StorageBackend | None = None


def _get_storage() -> StorageBackend:
    global _storage_instance
    if _storage_instance is None:
        _storage_instance = _create_storage()
    return _storage_instance


class _StorageProxy:
    """
    Proxy that lazily initializes the storage backend.
    Use as a drop-in for StorageBackend.
    """
    def __getattr__(self, name: str):
        return getattr(_get_storage(), name)


storage: StorageBackend = _StorageProxy()  # type: ignore[assignment]
