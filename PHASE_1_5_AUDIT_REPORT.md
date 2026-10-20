# Mindexa — Phase 1–5 Implementation Audit Report
**Date:** 2026-10-20  
**Scope:** Phases 1–5 of MINDEXA_INSTITUTIONAL_WORKFLOWS_SPEC.md  
**Purpose:** Pre-implementation review before Phase 1→5 finalization work begins 2026-10-26

---

## Phase Completion Summary

| Phase | Title | Completion | Blocking Issues |
|---|---|---|---|
| Phase 1 | Duties, Roles & Policies | ~95% | CRITICAL: permission helper argument bug |
| Phase 2 | Choice-based Sections & Structure Rules | ~100% | None |
| Phase 3 | Moderation & Exam Office | ~95% | HIGH: missing rate limit on public endpoint |
| Phase 4 | Authoring, Delegation & Post-Approval Edits | ~90% | MEDIUM: missing DELEGATION_CREATED notification |
| Phase 5 | Marking, Schemes, Partial Credit, AI-Assisted Review | ~85% | HIGH: AIGradeReview missing key fields; anonymous marking not enforced |

---

## CRITICAL ISSUES (P0 — Fix Before Any Phase Work)

### C-01 · `is_hod_of()` and `is_moderator_for()` argument order bug
**File:** `backend/app/core/permissions.py` lines 306–313, 328–335  
**Phase:** 1  
**Description:** Both convenience helpers pass arguments in the wrong positional order to `has_duty()`. The second argument is expected to be the user object but receives `department_id_or_user` (often a `uuid.UUID` or `None`). This silently breaks every duty-based permission check in the codebase.  
**Impact:** All moderation, authoring, and marking HOD/moderator checks fail — `is_hod_of()` and `is_moderator_for()` used in `assessment_service.py:2237`, `authoring_service.py:194`, `moderation_service.py:401, 463, 851, 948`.  
**Fix:** Correct the positional argument routing in both helpers.

---

## HIGH ISSUES (P1 — Fix Before Production)

### H-01 · Missing rate limiting on public seal verification endpoint
**File:** `backend/app/api/v1/routes/seal.py` lines 177–193  
**Phase:** 3  
**Spec ref:** Section 7.7, 7.4 — "rate-limited"  
**Description:** `GET /public/verify-seal/{code}` has no rate-limiting decorator or middleware applied. Verification codes are 16+ chars but without throttling this is vulnerable to brute-force enumeration.  
**Fix:** Apply `@limiter.limit(...)` using the existing slowapi instance. Suggested: 20/minute per IP.

### H-02 · AIGradeReview model missing Phase 5 persistence fields
**File:** `backend/app/db/models/` (AIGradeReview)  
**Phase:** 5  
**Spec ref:** Section 9.4  
**Description:** ReviewAgent v2 generates three new output fields (`key_points_coverage` JSONB list, `interpretation_note` text, `suggested_score`) but these are not stored as columns in `AIGradeReview`. The validation runs in-memory but outputs are ephemeral — lost after the request.  
**Fix:** Add migration to add `key_points_coverage (JSONB nullable)`, `interpretation_note (text nullable)`, `suggested_score (float nullable)` columns to AIGradeReview.

### H-03 · Anonymous marking not enforced in grading endpoints
**File:** `backend/app/api/v1/routes/grading.py` and `backend/app/services/grading_service.py`  
**Phase:** 5  
**Spec ref:** Section 9.7 — "when true, grading endpoints hide student identity (use attempt alias)"  
**Description:** `Assessment.anonymous_marking` field exists in the model, but no code applies the masking. Grading queues and response lists still expose student names and IDs when `anonymous_marking=True`.  
**Fix:** Add a masking layer in the grading service that substitutes student identity fields with attempt aliases when `assessment.anonymous_marking is True`.

### H-04 · `AIGradeReview.grading_decision` never updated from PENDING
**File:** `backend/app/services/grading_service.py` — `finalize_grade()`  
**Phase:** 5  
**Spec ref:** Section 9.4 — "decision PENDING; only a lecturer action finalizes: ACCEPTED/MODIFIED/REJECTED"  
**Description:** `finalize_grade()` does not update the `grading_decision` field on `AIGradeReview` rows from `PENDING` to `ACCEPTED`, `MODIFIED`, or `REJECTED`. Every finalized grade still shows `PENDING` in AI audit history.  
**Fix:** After grade finalization, update the linked `AIGradeReview.grading_decision`, `score_delta`, and `review_duration_seconds` fields.

---

## MEDIUM ISSUES (P2 — Fix Before Phase Completion Sign-off)

### M-01 · DELEGATION_CREATED notification missing
**File:** `backend/app/services/authoring_service.py` — `create_delegation()`  
**Phase:** 4  
**Spec ref:** Section 8.3 Notifications  
**Description:** `NotificationType.DELEGATION_CREATED` enum value exists but no notification is sent when a delegation is created. The delegate is never informed.  
**Fix:** Add `await self.notif_repo.create(type=DELEGATION_CREATED, ...)` in `create_delegation()` targeting the delegate user.

### M-02 · No default ApprovalPolicy seeded on fresh installation
**File:** Migrations / startup  
**Phase:** 1, 3  
**Description:** `ApprovalPolicy` requires an institution + assessment_type record to exist. On a fresh DB with a new institution, no policy exists. `_resolve_policy()` returns `None`, causing silent fallback to hardcoded defaults (`policy_total=100`) instead of failing visibly.  
**Fix:** Add an idempotent seed in a migration or institution-creation service that creates default ApprovalPolicy records for all 6 assessment types (as defined in spec Section 5.2).

### M-03 · Delegate department validation may be incomplete
**File:** `backend/app/services/authoring_service.py` — `create_delegation()`  
**Phase:** 4  
**Spec ref:** Section 8.1 — "Delegate must be a lecturer in the same department"  
**Description:** `is_lecturer_in_department()` helper exists in the repository but it's unclear if it is actually called during delegation creation. If not called, lecturers from other departments can be granted delegation access.  
**Fix:** Verify and add the `is_lecturer_in_department()` check in `create_delegation()` and add a test case that rejects cross-department delegation.

### M-04 · `require_duty()` FastAPI dependency unused in route layer
**File:** `backend/app/api/v1/routes/` — moderation, seal, authoring routes  
**Phase:** 1  
**Description:** `require_duty()` is defined as a FastAPI dependency in `core/permissions.py` but is not injected in any route function. Permission checks happen deep in the service layer instead of failing fast at the transport layer. This means request parsing, DB session creation, and input validation all run before authorization fails.  
**Fix:** Add `Depends(require_duty(Duty.MODERATOR))` to moderator route functions and `Depends(require_duty(Duty.EXAM_OFFICER))` to exam office routes as a fast-fail guard.

### M-05 · IDOR risk in `draft_feedback` endpoint for group work
**File:** `backend/app/api/v1/routes/grading.py` lines 294–399  
**Phase:** 5  
**Description:** The endpoint handles both `SubmissionGrade` and `GroupSubmissionAnswer`. When a `response_id` maps to a `GroupSubmissionAnswer`, no ownership/scope check verifies the requesting lecturer has access to that group submission's assessment before generating feedback.  
**Fix:** Add an explicit ownership check (`assert_can_grade(user, group_submission.assessment_id)`) in the group work fallback path.

### M-06 · AIGradeReview missing v2 evidence persistence for audit
**Phase:** 5  
**Spec ref:** Section 9.4 — "every AI call produces AIActionLog rows"  
**Description:** `validate_v2_output()` correctly validates that `evidence_quotes` appear as substrings in the student answer, but validated (or dropped) quotes are not stored anywhere. If a quote is dropped (hallucination detected), there is no audit record of the AI hallucination.  
**Fix:** Store validation results (valid quotes kept, invalid quotes dropped with reason) in the `AIGradeReview` row or as an `AIActionLog` detail.

---

## LOW ISSUES (P3 — Code Quality / Polish)

### L-01 · `AssessmentSectionUpdate` schema uses loose `str` for `section_kind`
**File:** `backend/app/schemas/assessment.py` line ~41  
**Phase:** 2  
**Description:** `section_kind: str | None = None` instead of `section_kind: SectionKind | None = None`. Allows any string value to pass Pydantic validation, relying on DB-level enum enforcement only.  
**Fix:** Change type annotation to use the `SectionKind` enum.

### L-02 · `finalize_grade()` has a 89-line authorization block
**File:** `backend/app/services/grading_service.py` lines 987–1075  
**Phase:** 5  
**Description:** Complex authorization logic embedded inline makes the function hard to test in isolation. No functional bug, just structural debt.  
**Fix:** Extract to `_verify_grading_authorization(user, attempt, assessment)` helper method.

### L-03 · Function-level imports in `finalize_grade()`
**File:** `backend/app/services/grading_service.py` lines 988–994  
**Phase:** 5  
**Description:** `Course`, `TeachingAssignment`, `Assessment` etc. are imported inside the function body on every call. Minor performance cost; all should be at module level.  
**Fix:** Move imports to the top of the file.

### L-04 · Disabled `grading_reminder` Celery task with no implementation
**File:** `backend/app/core/celery_app.py`  
**Phase:** 5 / 6C (calendar)  
**Description:** A TODO comment exists for the `grading_reminder` task that is referenced in spec Section 12.1 (Phase 6C). The task is commented out and has no implementation. Not a bug for Phase 5, but must be implemented in Phase 6C.  
**Note:** Do not implement yet; flag for Phase 6C.

### L-05 · Language policy guard not audited across all AI-triggered paths
**File:** `backend/app/services/grading_service.py` and `agents/`  
**Phase:** 5  
**Spec ref:** Section 3.7 — "Every AI feature must call `assert_ai_allowed(language, ...)`"  
**Description:** `assert_ai_allowed()` is confirmed called in `review_response_v2()` and grading_service.py line 663. However no systematic scan has verified all AI-triggered code paths (e.g. group work feedback, study planner integration) call this guard.  
**Fix:** Grep for all `AIGateway` calls and verify each one is preceded by `assert_ai_allowed()`.

### L-06 · No explicit `min_length` on `AuthorDelegation.reason` in schemas
**File:** `backend/app/schemas/authoring.py`  
**Phase:** 4  
**Description:** Spec requires reason ≥ 10 chars. The service enforces this but the Pydantic schema does not, so the constraint only fires after DB round-trip instead of at request validation.  
**Fix:** Add `Field(min_length=10)` to the `reason` field in `AuthorDelegationCreate` schema.

### L-07 · Rate limiting missing on AI grading trigger endpoints
**File:** `backend/app/api/v1/routes/grading.py`  
**Phase:** 5  
**Spec ref:** Section 3.3 — AI endpoints 20/min  
**Description:** `POST /grading/grade-attempt/{attempt_id}`, `POST /grading/confirm-ai`, and `POST /grading/feedback-ai` do not have explicit per-endpoint rate limiting. The global middleware provides a broad limit but these endpoints trigger expensive AI calls that should be individually throttled.  
**Fix:** Apply `@limiter.limit("20/minute")` or equivalent to each of these three endpoints.

---

## PHASE 0 DEFECTS (from spec Section 4 — original bugs to verify are fixed)

These were listed in the spec as suspected defects in Phase 0. Verify each is resolved:

| # | Spec defect | Status to verify |
|---|---|---|
| 1 | `ai_language_audit_service.py` filters `AIActionLog.is_deleted` (AppendOnly model) | Verify removed |
| 2 | `gateway.py::log_action` passes `prompt_version=` arg that doesn't exist | Verify removed or column added |
| 3 | `study_planner_service.py`: (a) `or_` not imported; (b) `_generate_fallback_lesson` undefined; (c) `m.title` vs `display_name`; (d) `get_workspace_learning_units` defined twice; (e) `Tuple`/`Any` annotation issues | Verify all 5 sub-issues fixed |
| 4 | `assessment_repo.py`: `count_sections`, `count_questions`, `sum_marks` defined more than once | Verify deduplicated |
| 5 | `review_agent.py`: return annotation uses `AICompletionResponse` without import | Verify fixed |
| 6 | `student_ai.py`: uses `Any` without import | Verify fixed |
| 7 | `assessment_repo.list_by_creator/list_all`: uses Python `@property` values inside SQL | Verify replaced with `Course` join |
| 8 | `rag_service.py`: logs `workspace_id=str(teaching_workspace_id)` wrong variable | Verify fixed |
| 9 | Enums: all `AIActionType`/`AIActionStatus` members exist in `enums.py` | Verify no missing members |
| 10 | `Assessment.subject` relationship / lazy-load in async context | Verify no `MissingGreenlet` |

---

## SECURITY CHECKLIST (Cross-cutting)

| Check | Status | Notes |
|---|---|---|
| Authentication on all protected routes | ✓ | JWT dependency injected globally |
| IDOR on moderator queue (department scope) | ✓ | Department-scoped queries |
| IDOR on exam office queue (institution scope) | ✓ | Institution-scoped queries |
| IDOR on grading endpoints | ~ | Group work path (M-05) needs fix |
| Rate limiting on public endpoints | ✗ | Seal verification missing (H-01) |
| Rate limiting on AI endpoints | ~ | Global limit exists; per-endpoint missing (L-07) |
| SQL injection in JSONB queries | ✓ | All parameterized via SQLAlchemy |
| Sensitive data in verify-seal response | ✓ | Minimal payload enforced |
| Hardcoded secrets in code | ✓ | None found; uses pydantic-settings |
| Conflict-of-interest (A-14) | ✓ | Enforced in `claim_review()` |
| Original marker excluded from appeal review | Not yet — Phase 6B | Out of scope for now |

---

## MISSING ENUM VALUES (verify in `enums.py`)

These values are referenced in code across phases but may not yet exist in `app/db/enums.py`:

- `AIActionType.REVIEW_ASSESSMENT_WORDING` (Phase 3 checklist WORDING_AI)
- `AIActionType.ANALYZE_INTEGRITY` (Phase 0 defect #9)
- `AIActionType.GENERATE_STUDY_PLAN`
- `AIActionType.GRADE_RESPONSE`
- `AIActionType.GENERATE_RUBRIC`
- `AIActionType.ASSESSMENT_AI_SUPPORT`
- `AIActionType.SEGMENT_LEARNING_UNITS`
- `NotificationType.PRINT_JOB_UPDATED` (Phase 3 — listed in spec 7.7, may be missing)

---

## DEPENDENCIES CHECK

All required Phase 1–5 packages are present in `pyproject.toml`:

| Package | Required for | Status |
|---|---|---|
| `python-docx` | Document generation (Phase 3) | ✓ |
| `qrcode` | QR code in exam paper (Phase 3) | ✓ |
| `openpyxl` | Excel export (Phase 6C) | Verify present |
| `langchain`, `langgraph` | AI agents (Phase 5) | ✓ |
| `slowapi` | Rate limiting | ✓ |
| `structlog` | Logging | ✓ |

---

## RECOMMENDED FIX ORDER FOR AGY CLI

Run these in priority order before declaring any phase "done":

```
1. Fix C-01: permissions.py is_hod_of/is_moderator_for argument order
2. Fix H-01: Add rate limit to /public/verify-seal/{code}
3. Fix H-02: Add migration for AIGradeReview key_points_coverage, interpretation_note, suggested_score
4. Fix H-03: Enforce anonymous_marking masking in grading service/routes
5. Fix H-04: Update AIGradeReview.grading_decision in finalize_grade()
6. Fix M-01: Add DELEGATION_CREATED notification in create_delegation()
7. Fix M-02: Seed default ApprovalPolicy on institution creation
8. Fix M-03: Verify/add delegate department check in create_delegation()
9. Fix M-04: Add require_duty() Depends to moderator and exam-office routes
10. Fix M-05: Add ownership check in draft_feedback group work path
11. Fix M-06: Persist AI evidence validation results in AIGradeReview
12. Fix L-01 through L-07: Code quality items
13. Verify all Phase 0 defects (#1–#10) are closed
14. Verify PRINT_JOB_UPDATED and REVIEW_ASSESSMENT_WORDING enum values exist
```

---

*End of audit report. No code changes were made. All findings are for remediation before 2026-10-26 implementation work begins.*
