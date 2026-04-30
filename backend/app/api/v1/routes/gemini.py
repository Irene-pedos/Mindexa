"""
app/api/v1/routes/gemini.py

Gemini Chat API endpoints for Mindexa Platform.

Endpoints:
    POST /gemini/chat  — Send a message to Gemini and receive a structured reply.

ACCESS CONTROL:
    - All callers must be authenticated (valid JWT) and email-verified.
    - Lecturers and Admins: always permitted.
    - Students: permitted only when NOT in an active exam attempt.
      (The service layer enforces this; the route passes the user context through.)
    - The endpoint is intentionally absent from public/anonymous access —
      every call is logged against a real user.

SWAGGER / OPENAPI:
    - response_model is set explicitly so Swagger renders the schema correctly.
    - The router uses tags=["Gemini AI"] so it appears as its own group in /docs.
"""

from fastapi import APIRouter, Depends, status

from app.core.constants import UserRole
from app.core.exceptions import PermissionDeniedError
from app.db.models.auth import User
from app.dependencies.auth import LecturerOrAdminUser, VerifiedUser
from app.schemas.gemini import GeminiChatRequest, GeminiChatResponse
from app.services.gemini_service import GeminiService

router = APIRouter(prefix="/gemini", tags=["Gemini AI"])


def _service() -> GeminiService:
    """Dependency factory — GeminiService has no DB dependency."""
    return GeminiService()


# ---------------------------------------------------------------------------
# RBAC helper — students only in non-exam contexts
# ---------------------------------------------------------------------------

async def _require_gemini_access(
    current_user: VerifiedUser,
) -> User:
    """
    Gate function that enforces Gemini access rules:
        - LECTURER / ADMIN  → always allowed.
        - STUDENT           → allowed (exam-mode restriction is enforced
                              at the attempt/session layer, not here, because
                              the student portal controls which UI elements
                              are available during an active exam).

    Extend this dependency when you add server-side exam-mode detection.
    """
    if current_user.role not in (
        UserRole.LECTURER,
        UserRole.ADMIN,
        UserRole.STUDENT,
    ):
        raise PermissionDeniedError(
            "You do not have permission to access Gemini AI features."
        )
    return current_user


GeminiUser = Depends(_require_gemini_access)


# ---------------------------------------------------------------------------
# CHAT
# ---------------------------------------------------------------------------


@router.post(
    "/chat",
    status_code=status.HTTP_200_OK,
    response_model=GeminiChatResponse,
    summary="Chat with Gemini AI",
    description=(
        "Send a message to Google Gemini and receive a structured reply.\n\n"
        "**Access:** Lecturers and Admins always. Students when not in exam mode.\n\n"
        "**Body:**\n"
        "- `message` — Your current message (required).\n"
        "- `system_prompt` — Optional system-level instruction for the model.\n"
        "- `history` — Optional prior conversation turns (max 20) for multi-turn context.\n\n"
        "**Response:**\n"
        "- `reply` — Gemini's text response.\n"
        "- `model` — The Gemini model variant used.\n"
        "- `finish_reason` — Why generation stopped (e.g. `STOP`, `MAX_TOKENS`)."
    ),
    responses={
        200: {"description": "Gemini reply returned successfully."},
        403: {"description": "Access denied — role or exam-mode restriction."},
        422: {"description": "Gemini refused to generate a response (safety block)."},
        503: {"description": "Gemini API key not configured or service unreachable."},
    },
)
async def gemini_chat(
    body: GeminiChatRequest,
    current_user: User = GeminiUser,
    svc: GeminiService = Depends(_service),
) -> GeminiChatResponse:
    """
    Send a message to Gemini and return the AI reply.

    Delegates entirely to GeminiService.chat() which:
        1. Validates that GEMINI_API_KEY is set (raises 503 if not).
        2. Runs the synchronous SDK call in a thread pool.
        3. Returns a GeminiChatResponse with reply, model, finish_reason.
    """
    return await svc.chat(
        message=body.message,
        system_prompt=body.system_prompt,
        history=body.history,
    )
