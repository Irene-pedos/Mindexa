"""
app/services/email_service.py

Transactional email service for Mindexa Platform.

MODES:
    Development (EMAIL_DEV_MODE=True):
        Emails are logged to stdout. Nothing is sent.
        This means the seed system and registration flow work with no SMTP config.

    Production (EMAIL_DEV_MODE=False):
        Emails are sent via SMTP (SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASSWORD).
        TLS is enforced. Failures raise EmailDeliveryError.

TEMPLATES:
    All email bodies are generated inline (no template engine dependency).
    HTML is kept intentionally simple to maximize email client compatibility.

    verification      — Email address verification link
    password_reset    — Password reset link
    result_released   — Assessment result is available
    integrity_warning — Integrity warning notification to student
    account_suspended — Account suspension notice

USAGE:
    # Direct (in services):
    email_service = EmailService()
    await email_service.send_verification_email(
        to_email="student@example.com",
        first_name="Alex",
        verification_url="https://app.mindexa.ac/verify?token=...",
    )

    # Via Celery (in auth_service, result_service, etc.):
    from app.workers.tasks import send_email_notification
    send_email_notification.delay(
        to_email="student@example.com",
        subject="Verify your email",
        template_name="verification",
        context={"first_name": "Alex", "verification_url": "..."},
    )
"""

from __future__ import annotations

import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any

from app.core.config import settings
from app.core.exceptions import InternalError
from app.core.logger import get_logger

logger = get_logger("mindexa.email")


# ---------------------------------------------------------------------------
# EXCEPTIONS
# ---------------------------------------------------------------------------

class EmailDeliveryError(InternalError):
    """Raised when email delivery fails after all retries."""
    code = "EMAIL_DELIVERY_FAILED"
    message = "Failed to deliver email. Please try again later."


# ---------------------------------------------------------------------------
# EMAIL SERVICE
# ---------------------------------------------------------------------------

class EmailService:
    """
    Async-compatible email service.

    send() is the primary entry point used by Celery tasks.
    Convenience wrappers (send_verification_email, etc.) build the payload
    and call send().
    """

    def __init__(self) -> None:
        self._from_addr = f"{settings.EMAILS_FROM_NAME} <{settings.EMAILS_FROM_EMAIL}>"

    # ── Main Dispatch ─────────────────────────────────────────────────────────

    async def send(
        self,
        to_email: str,
        subject: str,
        template_name: str,
        context: dict[str, Any],
    ) -> None:
        """
        Send a templated email.

        In EMAIL_DEV_MODE, logs the email instead of sending it.
        In production, delivers via SMTP.

        Raises:
            EmailDeliveryError: If SMTP delivery fails.
        """
        html_body = self._render_template(template_name, context)
        text_body = self._render_text_fallback(template_name, context)

        if settings.EMAIL_DEV_MODE:
            self._log_email(to_email, subject, template_name, context)
            return

        await self._send_smtp(
            to_email=to_email,
            subject=subject,
            html_body=html_body,
            text_body=text_body,
        )

    # ── Convenience Wrappers ──────────────────────────────────────────────────

    async def send_verification_email(
        self,
        to_email: str,
        first_name: str,
        verification_url: str,
    ) -> None:
        await self.send(
            to_email=to_email,
            subject="Verify your Mindexa account",
            template_name="verification",
            context={
                "first_name": first_name,
                "verification_url": verification_url,
                "expires_hours": settings.EMAIL_VERIFICATION_EXPIRE_MINUTES // 60,
                "app_name": settings.APP_NAME,
            },
        )

    async def send_password_reset_email(
        self,
        to_email: str,
        first_name: str,
        reset_url: str,
    ) -> None:
        await self.send(
            to_email=to_email,
            subject="Reset your Mindexa password",
            template_name="password_reset",
            context={
                "first_name": first_name,
                "reset_url": reset_url,
                "expires_minutes": settings.PASSWORD_RESET_EXPIRE_MINUTES,
                "app_name": settings.APP_NAME,
            },
        )

    async def send_result_released_email(
        self,
        to_email: str,
        first_name: str,
        assessment_title: str,
        results_url: str,
        percentage: float,
        letter_grade: str,
        is_passing: bool,
    ) -> None:
        await self.send(
            to_email=to_email,
            subject=f"Results available: {assessment_title}",
            template_name="result_released",
            context={
                "first_name": first_name,
                "assessment_title": assessment_title,
                "results_url": results_url,
                "percentage": round(percentage, 1),
                "letter_grade": letter_grade,
                "is_passing": is_passing,
                "app_name": settings.APP_NAME,
            },
        )

    async def send_integrity_warning_email(
        self,
        to_email: str,
        first_name: str,
        assessment_title: str,
        warning_message: str,
    ) -> None:
        await self.send(
            to_email=to_email,
            subject=f"Assessment integrity warning — {assessment_title}",
            template_name="integrity_warning",
            context={
                "first_name": first_name,
                "assessment_title": assessment_title,
                "warning_message": warning_message,
                "app_name": settings.APP_NAME,
            },
        )

    async def send_account_suspended_email(
        self,
        to_email: str,
        first_name: str,
        reason: str,
    ) -> None:
        await self.send(
            to_email=to_email,
            subject="Your Mindexa account has been suspended",
            template_name="account_suspended",
            context={
                "first_name": first_name,
                "reason": reason,
                "support_email": settings.EMAILS_FROM_EMAIL,
                "app_name": settings.APP_NAME,
            },
        )

    # ── SMTP Delivery ─────────────────────────────────────────────────────────

    async def _send_smtp(
        self,
        to_email: str,
        subject: str,
        html_body: str,
        text_body: str,
    ) -> None:
        """
        Deliver email via SMTP.

        Uses smtplib in a thread-safe manner. For true async SMTP consider
        aiosmtplib as a drop-in replacement if throughput becomes an issue.
        """
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = self._from_addr
        msg["To"] = to_email
        msg["X-Mailer"] = f"{settings.APP_NAME}/{settings.APP_VERSION}"

        msg.attach(MIMEText(text_body, "plain", "utf-8"))
        msg.attach(MIMEText(html_body, "html", "utf-8"))

        try:
            if settings.SMTP_SSL:
                # Port 465 — SMTP over SSL
                context = ssl.create_default_context()
                with smtplib.SMTP_SSL(
                    settings.SMTP_HOST, settings.SMTP_PORT, context=context
                ) as server:
                    if settings.SMTP_USER:
                        server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                    server.sendmail(settings.EMAILS_FROM_EMAIL, to_email, msg.as_string())

            elif settings.SMTP_TLS:
                # Port 587 — SMTP with STARTTLS
                with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
                    server.ehlo()
                    server.starttls(context=ssl.create_default_context())
                    server.ehlo()
                    if settings.SMTP_USER:
                        server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                    server.sendmail(settings.EMAILS_FROM_EMAIL, to_email, msg.as_string())

            else:
                # Port 25 — plain SMTP (dev/internal only)
                with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
                    server.sendmail(settings.EMAILS_FROM_EMAIL, to_email, msg.as_string())

            logger.info("Email sent: '%s' → %s", subject, to_email)

        except smtplib.SMTPException as exc:
            logger.error(
                "SMTP error sending to %s: %s", to_email, str(exc), exc_info=True
            )
            raise EmailDeliveryError() from exc

    # ── Dev Mode Logging ──────────────────────────────────────────────────────

    def _log_email(
        self,
        to_email: str,
        subject: str,
        template_name: str,
        context: dict[str, Any],
    ) -> None:
        """Log email to stdout instead of sending it (development mode)."""
        logger.info(
            "\n"
            "╔══════════════════════════════════════════════════════╗\n"
            "║  [DEV] EMAIL (not sent)                              ║\n"
            "╠══════════════════════════════════════════════════════╣\n"
            "║  To:       %-43s║\n"
            "║  Subject:  %-43s║\n"
            "║  Template: %-43s║\n"
            "╚══════════════════════════════════════════════════════╝\n"
            "  Context: %s",
            to_email[:43],
            subject[:43],
            template_name[:43],
            str(context),
        )

    # ── Template Renderer ─────────────────────────────────────────────────────

    def _render_template(self, template_name: str, context: dict[str, Any]) -> str:
        """Return an HTML email body for the given template and context."""
        renderers = {
            "verification": self._tmpl_verification,
            "password_reset": self._tmpl_password_reset,
            "result_released": self._tmpl_result_released,
            "integrity_warning": self._tmpl_integrity_warning,
            "account_suspended": self._tmpl_account_suspended,
        }
        renderer = renderers.get(template_name)
        if not renderer:
            logger.warning("Unknown email template: %s", template_name)
            return self._tmpl_generic(context)
        return renderer(context)

    def _render_text_fallback(
        self, template_name: str, context: dict[str, Any]
    ) -> str:
        """Return a minimal plain-text fallback for the HTML email."""
        lines = [f"{settings.APP_NAME}\n"]
        for key, value in context.items():
            if key not in ("app_name",):
                lines.append(f"{key.replace('_', ' ').title()}: {value}")
        return "\n".join(lines)

    # ── HTML Templates ────────────────────────────────────────────────────────

    def _wrap(self, title: str, body_html: str, app_name: str) -> str:
        """Wrap email body in a minimal, responsive HTML shell."""
        return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{title}</title>
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: #f4f6f9; margin: 0; padding: 20px; color: #1a1a2e; }}
    .card {{ background: #fff; border-radius: 8px; max-width: 560px;
             margin: 0 auto; padding: 40px; box-shadow: 0 2px 8px rgba(0,0,0,.08); }}
    .logo {{ font-size: 22px; font-weight: 700; color: #5b4fe8; margin-bottom: 28px; }}
    h1 {{ font-size: 20px; margin: 0 0 16px; }}
    p {{ line-height: 1.6; margin: 0 0 16px; color: #444; }}
    .btn {{ display: inline-block; background: #5b4fe8; color: #fff !important;
            text-decoration: none; padding: 12px 28px; border-radius: 6px;
            font-weight: 600; margin: 16px 0; }}
    .note {{ font-size: 13px; color: #888; margin-top: 24px; padding-top: 20px;
             border-top: 1px solid #eee; }}
    .warning {{ background: #fff3cd; border-left: 4px solid #f59e0b;
                padding: 12px 16px; border-radius: 4px; margin: 16px 0; }}
    .danger {{ background: #fee2e2; border-left: 4px solid #ef4444;
               padding: 12px 16px; border-radius: 4px; margin: 16px 0; }}
    .success {{ color: #16a34a; font-weight: 600; }}
    .footer {{ text-align: center; font-size: 12px; color: #aaa; margin-top: 24px; }}
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">📚 {app_name}</div>
    {body_html}
    <div class="footer">
      &copy; {app_name} &mdash; This email was sent automatically. Do not reply.
    </div>
  </div>
</body>
</html>"""

    def _tmpl_verification(self, ctx: dict) -> str:
        body = f"""
        <h1>Verify your email address</h1>
        <p>Hi {ctx.get('first_name', 'there')},</p>
        <p>Welcome to {ctx['app_name']}! Click the button below to verify your
        email address and activate your account.</p>
        <p><a href="{ctx['verification_url']}" class="btn">Verify Email</a></p>
        <p>Or copy and paste this URL into your browser:</p>
        <p style="word-break:break-all;font-size:13px;">{ctx['verification_url']}</p>
        <div class="note">
          This link expires in {ctx.get('expires_hours', 24)} hours.
          If you did not create an account, you can safely ignore this email.
        </div>"""
        return self._wrap("Verify your email", body, ctx["app_name"])

    def _tmpl_password_reset(self, ctx: dict) -> str:
        body = f"""
        <h1>Reset your password</h1>
        <p>Hi {ctx.get('first_name', 'there')},</p>
        <p>We received a request to reset your {ctx['app_name']} password.
        Click the button below to choose a new password.</p>
        <p><a href="{ctx['reset_url']}" class="btn">Reset Password</a></p>
        <p style="word-break:break-all;font-size:13px;">{ctx['reset_url']}</p>
        <div class="warning">
          ⚠️ This link expires in <strong>{ctx.get('expires_minutes', 60)} minutes</strong>.
          If you did not request a password reset, please ignore this email and
          ensure your account is secure.
        </div>"""
        return self._wrap("Reset your password", body, ctx["app_name"])

    def _tmpl_result_released(self, ctx: dict) -> str:
        grade_class = "success" if ctx.get("is_passing") else ""
        body = f"""
        <h1>Your results are available</h1>
        <p>Hi {ctx.get('first_name', 'there')},</p>
        <p>The results for <strong>{ctx['assessment_title']}</strong> have been released.</p>
        <p>Your grade: <span class="{grade_class}">{ctx['letter_grade']} ({ctx['percentage']}%)</span></p>
        <p><a href="{ctx['results_url']}" class="btn">View Full Results</a></p>"""
        return self._wrap("Results available", body, ctx["app_name"])

    def _tmpl_integrity_warning(self, ctx: dict) -> str:
        body = f"""
        <h1>Assessment integrity warning</h1>
        <p>Hi {ctx.get('first_name', 'there')},</p>
        <p>A warning has been issued during your assessment:
        <strong>{ctx['assessment_title']}</strong>.</p>
        <div class="warning">⚠️ {ctx['warning_message']}</div>
        <p>Please ensure you are complying with all assessment rules. Repeated
        violations may result in your attempt being flagged for review.</p>"""
        return self._wrap("Integrity warning", body, ctx["app_name"])

    def _tmpl_account_suspended(self, ctx: dict) -> str:
        body = f"""
        <h1>Account suspended</h1>
        <p>Hi {ctx.get('first_name', 'there')},</p>
        <div class="danger">
          Your {ctx['app_name']} account has been suspended.
        </div>
        <p><strong>Reason:</strong> {ctx['reason']}</p>
        <p>If you believe this is an error, contact us at
        <a href="mailto:{ctx['support_email']}">{ctx['support_email']}</a>.</p>"""
        return self._wrap("Account suspended", body, ctx["app_name"])

    def _tmpl_generic(self, ctx: dict) -> str:
        body = "<h1>Notification</h1>"
        for key, val in ctx.items():
            body += f"<p><strong>{key}:</strong> {val}</p>"
        return self._wrap("Notification", body, settings.APP_NAME)
