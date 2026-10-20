# MINDEXA — Institutional Workflows Implementation Spec (v1.0)

Audience: the coding agent working on the Mindexa backend.
Scope: moderation, exam office, choice-based exams, eligibility and retakes, appeals, absences, marking, calendar, Excel export.
Source: confirmed answers from the lecturer interview. Everything marked **ASSUMPTION** was NOT confirmed and must be built as configuration, not hardcoded.

---

## 0. HOW TO WORK (read first, obey always)

1. **Work strictly phase by phase** (Phase 0 → 1 → 2 → 3 → 4 → 5 → 6A → 6B → 6C). Do not start a phase until the previous phase is green (see Definition of Done).
2. **No partial implementations.** A feature is done only when it has: model + Alembic migration (up AND down), repository, service, schema (request/response), route, permission checks, audit logging, notifications (where listed), and tests. If something cannot be finished, STOP and report; do not stub silently, do not leave TODOs in shipped paths.
3. **Read before writing.** Before each phase, read the existing code it touches (listed per phase). Reuse existing models, enums, services, and patterns. Do NOT create duplicate tables or parallel implementations. If a name in this spec differs from the existing code, adapt to the code and record the mapping in your phase report.
4. **Do not touch unrelated files.** Minimal diffs outside the phase scope.
5. **Never trust the frontend.** Every rule here is enforced in the service layer. Routes only do transport (auth, schema, call service).
6. **AI is advisory.** AI never publishes, seals, releases grades, approves moderation, or decides eligibility/appeals. Eligibility is deterministic code, not AI.
7. **Every state-changing action writes an audit record** (see 3.4).
8. **Report after every phase** using the template in section 14. If you make a decision this spec does not cover, list it under "Decisions to confirm".

---

## 1. CONFIRMED INSTITUTIONAL RULES (source of truth)

| ID | Rule |
|---|---|
| R-01 | An assessment is authored by the module lecturer alone, or collaboratively by lecturers who taught that course. |
| R-02 | Summative papers go to **moderators** (not the HOD). Moderators check: marks calculation, marks distribution, wording, and exam structure (structure check applies to summative only). |
| R-03 | After moderators approve, the **exam office** stamps the paper and prints it according to the number of students; also stores and distributes. This applies mainly to summative. |
| R-04 | **CATs, homework, group work (and by default formatives) have no approval path** and no structure/marks guidelines. Lecturer publishes directly. |
| R-05 | Summative structure: 3 sections. **Section A** suggested closed questions; **Section B** open or closed; **Section C** suggested open questions. B and C contain **more questions than required; students choose** which to answer. |
| R-06 | Summative total marks **must be exactly 100**. CAT/formative/other: any total. |
| R-07 | There is **no fixed lead time**: the lecturer submits to moderators when the paper is ready; after approval printing begins. |
| R-08 | If moderators reject, the lecturer corrects ASAP. **No limit on rounds.** |
| R-09 | If the lecturer misses the timeline (paper not approved in time), **the exam is shifted**. If the lecturer is unavailable, **another lecturer can correct and submit** on their behalf. |
| R-10 | After approval, the lecturer may still change the paper to fix mistakes. **No one authorizes it.** (Mindexa allows it but audits it.) |
| R-11 | Marking: lecturer only, using a marking scheme/guide. If absent, another lecturer may mark. **No anonymous marking.** |
| R-12 | Partial credit (method marks) is allowed in the software. |
| R-13 | Open answers are marked on: (a) how the student understood the question, (b) how they answered, (c) use of content from the learning materials, (d) coverage of key points the lecturer highlighted in the materials. AI-assisted marking is welcomed; lecturer overrides. |
| R-14 | Marks submission deadlines come from the **academic calendar** given at the start of the semester; then deliberation. |
| R-15 | Marks are currently kept in Excel. No official template exists. **Mindexa defines its own Excel export, changeable later.** |
| R-16 | **Lecturer releases results directly.** |
| R-17 | Appeal: the student **pays** (via the college's **external** payment system) and the script is re-marked by a **different lecturer who taught the same course**. **The HOD picks that reviewer.** |
| R-18 | **Formative < ~70%** ⇒ student must do a **reassessment**. The reassessment **does not replace** the formative score. |
| R-19 | A student with a **pending (not yet worked on) reassessment** in any formative **cannot sit a CAT**. |
| R-20 | A student sits the **summative** only if the **average of percentages of all CATs + formatives ≥ 50%**; otherwise they **retake the course**. |
| R-21 | **Summative < 50%** in a course ⇒ **retake the course**. |
| R-22 | **Retake = re-enrolment in the next academic period, flagged as a retake.** Retake fees are paid via the college's external payment system. |
| R-23 | Absence proof is approved by the **lecturer or the HOD**. Once confirmed, the student may attend the exam. |
| R-24 | Choice sections with over-answering: mark the **first N answered**, unless the assessment is configured **BEST_N** (per-assessment setting, default FIRST_N). |

---

## 2. ASSUMPTIONS (implement as configuration; list each in your phase report)

| ID | Assumption | Default | Where configured |
|---|---|---|---|
| A-01 | "~70%" applies **per formative** (each formative below threshold requires its own reassessment), not to the average of formatives. | per-formative | `EligibilityPolicy.formative_scope` |
| A-02 | Coursework average (R-20) uses only **finalized (graded) CATs and formatives of the same course and academic period**. Reassessment scores are NOT included. | as stated | policy |
| A-03 | Unexcused absence (window closed, no attempt) counts as **0%** in the average; approved-excused absence is **excluded**. | as stated | policy |
| A-04 | If coursework marks are still pending at summative-entry time: **block with reason `MARKS_PENDING`**. | BLOCK | `pending_marks_behavior` (BLOCK/EXCLUDE) |
| A-05 | Student has **no coursework at all**: route to HOD `MANUAL_REVIEW`. | MANUAL_REVIEW | `no_coursework_behavior` (MANUAL_REVIEW/ELIGIBLE) |
| A-06 | CAT gate scope for R-19 ("any formative") = **same course**. "Worked on" = reassessment attempt **submitted** (not necessarily passed) or excused. | COURSE | `reassessment_block_scope` (COURSE/ALL_COURSES) |
| A-07 | Appeal window = **7 days after result release**. | 7 | `AppealPolicy.window_days` |
| A-08 | Appeal outcome may **not lower** the mark: `final = max(original, reviewer_mark)`. | false | `AppealPolicy.allow_mark_decrease` |
| A-09 | If no other lecturer taught the course, HOD may assign any department lecturer with a recorded justification. No silent self-review. | as stated | service rule |
| A-10 | Content edits (questions/options/marks) are **blocked once any attempt has started**. | BLOCK | `ApprovalPolicy.post_start_edit_mode` (BLOCK/ALLOW_WITH_NOTICE) |
| A-11 | HOD may override an eligibility block for a single student/assessment with a mandatory reason; audited. | allowed | `EligibilityPolicy.allow_hod_override` |
| A-12 | Summative structure rules other than total=100 are **soft** (warnings the moderator can accept). | soft | blueprint rule `is_blocking=False` |
| A-13 | Printed copies = active enrolled students in target sections + **5% spares**. | 5% | `ExamPrintJob.spare_percent` |
| A-14 | A moderator cannot moderate a paper they authored or co-authored. | enforced | service rule |
| A-15 | Thresholds: formative exempt 70, summative entry 50, summative pass 50. | 70/50/50 | `EligibilityPolicy` |
| A-16 | Failing a reassessment has **no additional rule**; it is recorded but changes nothing. | none | (ask college later) |
| A-17 | Retake enrolment is **finalized by admin/HOD after payment is confirmed**; Mindexa never auto-enrols and never handles money. | as stated | service rule |

---

## 3. GLOBAL ENGINEERING STANDARDS

### 3.1 Architecture
`routes (transport) → services (business rules) → repositories (data) → models`. AI only through `AIGateway` + agents. No business logic in routes. Repositories do not commit; services commit (match existing convention).

### 3.2 Migrations
- One Alembic revision per phase (or per logical group), with working **downgrade**.
- Adding values to Postgres native enums: use `ALTER TYPE ... ADD VALUE` inside an autocommit block (check how existing enums such as `AssessmentStatus` are stored: native vs varchar+check) and test upgrade on a DB that already has data.
- New nullable columns first; backfill; then constrain.
- Seed data (rubric presets, export templates, default policies) via migration or an idempotent seed command, never at import time.

### 3.3 Security (every endpoint)
Authentication, role/duty check, **ownership/scope check (no IDOR)**, schema validation, rate limiting (reuse existing), safe errors with machine-readable `code`, no stack traces, no leaking other users' data. Public endpoints (seal verification) return minimal data and are rate-limited.

### 3.4 Audit
Use the existing audit/security-event mechanism if one exists. If none, create append-only `audit_event`:
`id, actor_id, actor_role, actor_duty, action, entity_type, entity_id, before_json, after_json, reason, request_id, ip, created_at`.
Never update/delete rows. Every action marked **[AUDIT]** below must write one.

### 3.5 Notifications
Reuse the existing `Notification` model and delivery service. Add new `NotificationType` values listed per phase. Notifications must not contain sensitive grades in the title.

### 3.6 Testing (required per phase)
- Unit tests for pure rule functions.
- Service tests for every state machine: all legal transitions AND all illegal transitions.
- **Permission tests**: for every endpoint, test allowed role, wrong role, and same role but wrong scope (IDOR).
- Migration test: upgrade → downgrade → upgrade.
- No flaky time-dependent tests: inject a clock.

### 3.7 Language policy
All AI features must keep calling `assert_ai_allowed(language, ...)` (Kinyarwanda is blocked). Deterministic features (eligibility, export, moderation checklist) are NOT blocked by language.

---

## 4. PHASE 0 — AUDIT AND FIX (no new features)

**Goal:** the existing code imports, runs, and passes tests before anything is added.

**Procedure**
1. `python -c` import every module under `app/`; run `ruff` (or flake8) and `mypy` in lenient mode; run the whole test suite; run `alembic upgrade head` on a fresh DB and `alembic check` for model/migration drift.
2. Verify each suspected defect below. For each: confirm by reproducing, fix, add a regression test. If it is not a real defect, say so.

| # | Location | Suspected defect |
|---|---|---|
| 1 | `services/ai_language_audit_service.py` | Filters `AIActionLog.is_deleted`, but `AIActionLog` is an `AppendOnlyModel` with no `is_deleted`. |
| 2 | `core/ai/gateway.py::log_action` | Passes `prompt_version=` to `AIActionLog`, which has no such field. Decide: add the column (migration) or remove the argument, then make all callers consistent. |
| 3 | `services/study_planner_service.py` | (a) `or_` used but not imported; (b) `_generate_fallback_lesson` called but not defined (only `_build_fallback_lesson_plan` exists); (c) `m.title` / `LecturerMaterial.title` used where model has `display_name`/`original_filename`; (d) `get_workspace_learning_units` defined twice (second overrides first, dropping the synthetic-unit fallback); (e) `Tuple`, `Any` and similar usage under `from __future__ import annotations`. |
| 4 | `db/repositories/assessment_repo.py` | `count_sections`, `count_questions`, `sum_marks` each defined more than once with different soft-delete filtering. Keep one correct version of each. |
| 5 | `agents/review_agent.py` | Return annotation uses `AICompletionResponse` without importing it. |
| 6 | `api/v1/routes/student_ai.py` | Uses `Any` without importing it; FastAPI may fail resolving annotations. |
| 7 | `assessment_repo.list_by_creator/list_all` | Uses Python `@property` values (`Assessment.course_name`, `course_code`) inside SQL (`col(...).ilike`). Must join `Course` instead. |
| 8 | `services/rag_service.py` | Logs `workspace_id=str(teaching_workspace_id)` where only `workspace_id` may be set. |
| 9 | Enums | Every `AIActionType`/`AIActionStatus` member referenced anywhere in code exists in `app/db/enums.py` (e.g. `ANALYZE_INTEGRITY`, `GENERATE_STUDY_PLAN`, `GRADE_RESPONSE`, `GENERATE_RUBRIC`, `ASSESSMENT_AI_SUPPORT`, `SEGMENT_LEARNING_UNITS`). |
| 10 | `Assessment` model | `Assessment.subject` relationship joins; `Assessment.course_name` property is used in `AssessmentSummaryResponse`; confirm no lazy-load in async context raises `MissingGreenlet`. |

3. Also scan for: unawaited coroutines, `except Exception: pass` that hides real errors in write paths, any `datetime.utcnow()` misuse mixing naive/aware datetimes.

**Definition of Done (Phase 0):** import-all passes; test suite green; migration chain clean; a table in the report (file | issue | confirmed? | fix | test).

---

## 5. PHASE 1 — DUTIES, ROLES AND POLICIES

**Read first:** `core/constants.py` (`UserRole`), `dependencies/auth.py` (`require_*`), `db/models/auth.py`, `db/models/academic.py`, `core/permissions` (if present).

### 5.1 Duties (scoped capabilities)
Keep base roles (Student/Lecturer/Admin). Add **duties** so a lecturer can also be a moderator or HOD without breaking role separation.

`UserDutyAssignment`
- `id, user_id (FK user), duty (enum MODERATOR | EXAM_OFFICER | DEPARTMENT_HEAD), institution_id (FK), department_id (FK nullable), is_active, valid_from, valid_to (nullable), assigned_by_id, created_at`
- Unique: `(user_id, duty, institution_id, department_id)` while active.
- MODERATOR and DEPARTMENT_HEAD require `department_id`. EXAM_OFFICER is institution- or campus-scoped (`department_id` NULL allowed).
- Base-role requirement: MODERATOR/DEPARTMENT_HEAD → base role LECTURER; EXAM_OFFICER → LECTURER or ADMIN. Enforce at assignment time.

Permission helpers (in `core/permissions`): `require_duty(duty)`, `has_duty(user, duty, department_id=None)`, `is_hod_of(user, department_id)`, `is_moderator_for(user, department_id)`. Department of an assessment = department of its course/teaching assignment. Cache-free, always query (duties change rarely; correctness over speed).

### 5.2 Policies
`ApprovalPolicy` (per institution + assessment_type; unique):
`requires_moderation (bool), enforce_structure_template (bool), summative_total_marks (int, nullable), post_approval_edit_mode (NOTIFY|REQUIRE_REAPPROVAL), post_start_edit_mode (BLOCK|ALLOW_WITH_NOTICE), sealing_warning_days (int nullable, soft)`.
Seeded defaults: SUMMATIVE → requires_moderation=true, enforce_structure_template=true, summative_total_marks=100, NOTIFY, BLOCK. CAT/FORMATIVE/HOMEWORK/GROUP_WORK/REASSESSMENT → requires_moderation=false, no structure, no total rule.

`EligibilityPolicy`, `AppealPolicy` are defined in Phases 6A/6B but their tables may be created here empty-schema-first only if convenient; otherwise create in their phase.

### 5.3 Endpoints
| Method | Path | Who |
|---|---|---|
| POST | `/admin/duties` | Admin |
| GET | `/admin/duties?user_id=&duty=&department_id=` | Admin |
| DELETE | `/admin/duties/{id}` (deactivate, never delete) | Admin |
| GET | `/admin/approval-policies` / PUT `/admin/approval-policies/{id}` | Admin |
| GET | `/me/duties` | any authenticated |

[AUDIT] duty assign/deactivate, policy change.

### 5.4 Tests
Duty assignment validation (wrong base role rejected, missing department rejected), scope checks, deactivated duty loses access immediately, seeded policies exist.

**DoD:** migration up/down; seeded defaults; permission helper unit tests; `/me/duties` works; audit rows written.

---

## 6. PHASE 2 — CHOICE-BASED SECTIONS AND STRUCTURE RULES

**Read first:** `db/models/assessment.py` (`Assessment`, `AssessmentSection`, `AssessmentBlueprintRule`, `AssessmentPublishValidation`), `db/models/question.py` (`AssessmentQuestion`, `Question`), `db/models/attempt.py`, `assessment_repo.py` (`sum_marks`, `count_questions`), the assessment service(s) that run publish validation, and the grading/percentage code that uses `total_marks`.

### 6.1 Model changes
`AssessmentSection` add:
- `section_kind` enum `CLOSED | OPEN | MIXED` (default MIXED)
- `questions_to_answer` int nullable (N). NULL = all questions are compulsory.
- `pool_size` is derived (count of questions in the section), never stored.

`Assessment` add:
- `over_answer_policy` enum `FIRST_N | BEST_N` default `FIRST_N` (R-24)
- `schedule_state` enum `ON_TRACK | AT_RISK | SHIFT_REQUIRED` default ON_TRACK (used in Phase 3)

New `AttemptSectionSelection`:
`id, attempt_id, assessment_section_id, question_id, selected_order (int, 1-based by selection time), selected_at`; unique `(attempt_id, question_id)`.

Response/grade rows get an `is_counted` boolean (default true) set at grading time (see 6.3).

### 6.2 Central marks calculation (single source of truth)
Create `services/assessment_marks.py` with pure functions:
- `required_marks(assessment) -> int`: for each section: if `questions_to_answer` is set → `N * marks_per_question` (all questions in a choice pool MUST have equal marks); else sum of its questions' effective marks (`marks_override` else `question.marks`). Questions with no section count as compulsory.
- `validate_choice_pools(assessment) -> list[Issue]`: N ≤ pool size; equal marks inside choice pools; N ≥ 1.
- `max_possible_score(assessment) == required_marks(assessment)`.

**Replace every place that sums ALL question marks** (publish validation, `sum_marks`, blueprint MARKS_TOTAL, percentage computation, `AIGradeReview.max_possible_score`, group distribution) with `required_marks`. Grep for `total_marks`, `sum_marks`, `marks_override` and list every call-site you changed in the report.

### 6.3 Attempt and grading behavior
- Student chooses questions per section via the attempt API; the **service enforces N**: selecting more than N in a section is rejected (`CHOICE_LIMIT_EXCEEDED`); selecting fewer is allowed until submit (unanswered = 0).
- If a student nevertheless has answers to more than N questions (e.g. legacy/edge), grading marks **FIRST_N**: the first N by `selected_order`/first-answered time; others get `is_counted=false` and 0 effective marks. With `BEST_N`: count the N highest-scoring; others `is_counted=false`. Never silently drop without recording `is_counted=false`.
- Total score = sum of counted responses only.

### 6.4 Structure rules (summative)
Implemented as blueprint rules / `ExamStructureTemplate` (seed one default "RP Summative 3-Section"):
| Rule | Type |
|---|---|
| Total required marks == `ApprovalPolicy.summative_total_marks` (100) | **HARD** (`is_blocking=True`) — blocks sealing and publish |
| Exactly 3 sections (A, B, C) | SOFT |
| Section A is CLOSED | SOFT |
| Section C is OPEN | SOFT |
| Sections B and C have `pool_size > questions_to_answer` | SOFT |
Non-summative types: none of these rules apply. The wizard may still let lecturers define sections and choice pools freely (R-04).

Soft rule violations appear in the checklist as warnings; the moderator can accept them (recorded).

### 6.5 Endpoints
| Method | Path | Who |
|---|---|---|
| PATCH | existing section endpoints: accept `section_kind`, `questions_to_answer` | Lecturer/co-author |
| POST | `/student/attempts/{attempt_id}/sections/{section_id}/select` | Student (own attempt only) |
| DELETE | `/student/attempts/{attempt_id}/questions/{question_id}/select` | Student |
| GET | `/lecturer/assessments/{id}/marks-summary` (required marks, pool issues, structure warnings) | Lecturer/co-author/moderator |

### 6.6 Tests
- `required_marks` for: all-compulsory, mixed, choice pools, unsectioned questions.
- Unequal marks in a choice pool rejected.
- Summative total != 100 blocks; CAT with 37 marks passes.
- Over-answer: FIRST_N and BEST_N produce expected totals and `is_counted` flags.
- Selection endpoint: IDOR (other student's attempt), N exceeded, after submit.
- Regression: percentage and `max_possible_score` use required marks.

**DoD:** no remaining call-site that sums all questions for scoring; migrations; tests green.

---

## 7. PHASE 3 — MODERATION AND EXAM OFFICE (summative flow)

**Read first:** `AssessmentStatus` enum and every place it is switched on; publish/finalize service; `AssessmentPublishValidation`; `Notification`; storage (`core/storage.py`); `StudentEnrollment`/`AssessmentTargetSection`.

### 7.1 Status machine
Add to `AssessmentStatus`: `PENDING_MODERATION`, `CHANGES_REQUESTED`, `APPROVED`, `SEALED`.

```
DRAFT ──submit──► PENDING_MODERATION ──approve──► APPROVED ──seal──► SEALED ──publish──► PUBLISHED ─► ACTIVE ...
                      │                                   
                      └──request changes──► CHANGES_REQUESTED ──resubmit──► PENDING_MODERATION   (unlimited rounds)
```
- If `ApprovalPolicy.requires_moderation = false` for the type: `DRAFT → PUBLISHED` as today (after the normal publish validation). The new statuses are never used.
- If true: `PUBLISHED` is reachable **only from SEALED**. Enforce in the service; test the bypass attempt.
- Any content edit after SEALED/PUBLISHED follows Phase 4 rules.

### 7.2 Tables
`AssessmentVersion`: `id, assessment_id, version_no, content_snapshot (JSONB: sections, questions, options, marks, instructions, structure), content_hash (SHA-256 of canonical JSON: sorted keys, UTF-8, no whitespace), created_by_id, reason, created_at`. A version is created at: submit for moderation, each resubmission, seal, and each post-approval edit.

`ModerationReview`: `id, assessment_id, version_id, round_no, reviewer_id, status (OPEN|CHANGES_REQUESTED|APPROVED), checklist_result (JSONB), decision_note, started_at, decided_at`.

`ModerationComment`: `id, review_id, target_type (ASSESSMENT|SECTION|QUESTION), target_id, category (MARKS|DISTRIBUTION|WORDING|STRUCTURE|OTHER), comment, resolved (bool), resolved_by_id, resolved_at`.

`AssessmentSeal`: `id, assessment_id, version_id, content_hash, sealed_by_id, sealed_at, verification_code (unique, random 16+ chars, unguessable), revoked_at, revoked_by_id, revoke_reason`. One active seal per assessment.

`ExamPrintJob`: `id, assessment_id, seal_id, enrolled_count, spare_percent, copies_total, status (REQUESTED|PRINTED|STORED|DISTRIBUTED), handled_by_id, timestamps per status, notes`.

### 7.3 Automated pre-moderation checklist (runs on submit and on demand)
`ModerationChecklistService.run(assessment) -> ChecklistResult` with items, each `{code, severity: BLOCKING|WARNING|INFO, passed, message}`:
1. `MARKS_TOTAL` — required marks == policy total (HARD for summative).
2. `MARKS_DISTRIBUTION` — section marks sum equals total; no section with 0 marks; choice pools have equal marks.
3. `STRUCTURE` — soft rules from 6.4.
4. `QUESTIONS_COMPLETE` — every question has stem, correct answer/marking scheme where required, marks > 0.
5. `WORDING_AI` — **optional, advisory**: AI wording/ambiguity review via an agent through `AIGateway`, `AIActionType.REVIEW_ASSESSMENT_WORDING` (add), respecting `assert_ai_allowed`. Never blocking; failures of the AI call must not fail the checklist (record `skipped`).
BLOCKING failures prevent **submission for moderation**. WARNINGs are shown to the moderator.

### 7.4 Moderation workflow rules
- Submit: author/co-author only, status DRAFT or CHANGES_REQUESTED, checklist has no BLOCKING failures → new `AssessmentVersion`, new `ModerationReview` round, notify moderators of the department. [AUDIT]
- Assignment: any active MODERATOR of the course's department may take the review (first to claim; show claimed state). **A moderator cannot review an assessment they authored/co-authored (A-14).** Moderators for other departments are denied.
- Moderator actions: add comments, **request changes** (≥1 comment required) or **approve** (all BLOCKING items passed; must acknowledge WARNINGs). [AUDIT]
- Resubmission: author marks comments resolved and resubmits. Unlimited rounds (R-08).
- Approve → status APPROVED → notify exam officer(s) and author.
- **Exam office:** an EXAM_OFFICER **seals** an APPROVED assessment: creates `AssessmentSeal` bound to the current version hash; status SEALED; creates an `ExamPrintJob` (copies = active enrolled students in target sections + `spare_percent`, A-13). Status transitions of the print job by the exam officer. [AUDIT]
- Publish (release to students): author, only from SEALED.
- Seal verification: `GET /public/verify-seal/{verification_code}` returns only `{valid, assessment_title, course_code, sealed_at, version_no}`; rate-limited; no content, no student data. Verification fails if the seal is revoked or the stored version hash no longer matches the current approved content hash.

### 7.5 Scheduling risk ("exam is shifted", R-09)
Celery beat task `check_sealing_deadlines` every 15 minutes, for assessments with `requires_moderation=true` and not yet SEALED:
- If `sealing_warning_days` is set and `window_start - now <= warning` → `schedule_state=AT_RISK`, notify author + moderators + HOD (once per state change).
- If `window_start <= now` and not SEALED → `schedule_state=SHIFT_REQUIRED`, **block publishing**, notify author, HOD, exam officer. No automatic date change; the lecturer (or delegate, Phase 4) reschedules by updating the window, which resets the state.

### 7.6 Documents (the college has no templates, so Mindexa provides them)
Generate with `python-docx` (DOCX required; PDF optional if a converter exists in the environment):
- **Moderation form** (assessment, course, round, checklist results, comments, decision, moderator, date).
- **Exam paper** (header, instructions, sections A/B/C with "answer N of M" notes, questions, marks, **seal block with verification code and QR image**). QR encodes the verification URL; use a pure-Python QR library.
- **Marking scheme document** (Phase 5 data).
Stored via `core/storage`; access limited to author/co-authors/moderators/exam officers of that assessment.

### 7.7 Endpoints
| Method | Path | Who |
|---|---|---|
| POST | `/lecturer/assessments/{id}/moderation/submit` | author/co-author |
| GET | `/lecturer/assessments/{id}/moderation` (rounds, comments, status) | author/co-author/moderator/HOD |
| POST | `/lecturer/assessments/{id}/moderation/resubmit` | author/co-author |
| POST | `/lecturer/moderation/comments/{id}/resolve` | author/co-author |
| GET | `/moderator/queue?status=` | MODERATOR (own department) |
| POST | `/moderator/reviews/{id}/claim` | MODERATOR |
| POST | `/moderator/reviews/{id}/comments` | reviewer |
| POST | `/moderator/reviews/{id}/request-changes` | reviewer |
| POST | `/moderator/reviews/{id}/approve` | reviewer |
| GET | `/exam-office/queue` (APPROVED / SEALED) | EXAM_OFFICER |
| POST | `/exam-office/assessments/{id}/seal` | EXAM_OFFICER |
| POST | `/exam-office/assessments/{id}/seal/revoke` (reason required) | EXAM_OFFICER |
| PATCH | `/exam-office/print-jobs/{id}` | EXAM_OFFICER |
| GET | `/assessments/{id}/documents/{moderation-form|paper|marking-scheme}` | scoped |
| GET | `/public/verify-seal/{code}` | public, rate-limited |

Notification types to add: `MODERATION_SUBMITTED`, `MODERATION_CHANGES_REQUESTED`, `MODERATION_APPROVED`, `ASSESSMENT_SEALED`, `PRINT_JOB_UPDATED`, `SCHEDULE_AT_RISK`, `SCHEDULE_SHIFT_REQUIRED`.

### 7.8 Tests
All legal/illegal transitions; publish-without-seal bypass fails for SUMMATIVE and succeeds for CAT; moderator conflict-of-interest; cross-department moderator denied; unlimited rounds (≥5); seal hash invalid after content change; revoked seal fails verification; print copies math; beat task state changes with injected clock; documents generate and contain the verification code.

**DoD:** full summative path works end-to-end in an integration test (draft → submit → changes → resubmit → approve → seal → publish); CAT path unaffected.

---

## 8. PHASE 4 — AUTHORING, DELEGATION AND AUDITED POST-APPROVAL EDITS

**Read first:** assessment create/update services, `LecturerCourseAssignment`, `TeachingAssignment`, `AssessmentSupervisor`.

### 8.1 Tables
`AssessmentCollaborator`: `id, assessment_id, lecturer_id, role (OWNER|CO_AUTHOR), added_by_id, added_at, is_active`. Only lecturers with a `TeachingAssignment`/`LecturerCourseAssignment` for the assessment's course may be added (R-01).

`AuthorDelegation`: `id, assessment_id, delegator_id (author), delegate_id (lecturer), created_by_id (author OR HOD), reason, valid_from, valid_to, status (ACTIVE|REVOKED|EXPIRED), created_at`. The delegate may edit the paper, resubmit to moderation, and reschedule **only for this assessment and only within validity**. Delegate must be a lecturer in the same department. HOD can create a delegation when the author is unavailable (R-09). [AUDIT] create/revoke and every action performed under delegation (record `acting_under_delegation_id`).

### 8.2 Edit rules
- Draft: normal editing by author, co-authors, active delegates.
- After SEALED/PUBLISHED, by `ApprovalPolicy.post_approval_edit_mode`:
  - `NOTIFY` (default, matches R-10): edit allowed, requires `reason` (min 10 chars), creates a new `AssessmentVersion` and a field-level changelog; notifies the moderator(s) of that review and the HOD (informational, not blocking). If a seal exists, the seal is marked **superseded** and the exam officer is notified that printed material may be outdated; the lecturer must confirm "reprint required: yes/no".
  - `REQUIRE_REAPPROVAL`: the assessment returns to PENDING_MODERATION.
- **Once any attempt has started** (`status != NOT_STARTED`, A-10) content edits (questions, options, marks, correct answers, section structure) are blocked with `EDIT_BLOCKED_ATTEMPTS_STARTED`. Cosmetic fields (title typo, instructions text) are allowed only under `ALLOW_WITH_NOTICE`, with a notice banner to students. Never alter the question set under a student mid-attempt.
- Every edit [AUDIT] with before/after.

### 8.3 Endpoints
| Method | Path | Who |
|---|---|---|
| POST/DELETE | `/lecturer/assessments/{id}/collaborators` | owner |
| POST | `/lecturer/assessments/{id}/delegations` | author or HOD |
| DELETE | `/lecturer/assessments/{id}/delegations/{did}` | author, delegator or HOD |
| GET | `/lecturer/assessments/{id}/versions` and `/versions/{n}/diff/{m}` | author/co-author/delegate/moderator/HOD |

Notification types: `COLLABORATOR_ADDED`, `DELEGATION_CREATED`, `POST_APPROVAL_EDIT`, `SEAL_SUPERSEDED`.

### 8.4 Tests
Co-author must be assigned to course; delegation scope/expiry; delegate cannot touch other assessments; edit after seal creates version + supersedes seal; edit after attempt start blocked; REQUIRE_REAPPROVAL path; audit contains `acting_under_delegation_id`.

**DoD:** every mutation of an approved paper is versioned, diffable, and audited.

---

## 9. PHASE 5 — MARKING: SCHEMES, PARTIAL CREDIT, KEY POINTS, AI-ASSISTED REVIEW

**Read first:** `Rubric*` models, `AIGradeReview`, `agents/review_agent.py`, `prompts/review_agent_v1.txt`, grading services/tasks (`workers/tasks/grading.py`), `StudentResponse`, `LecturerMaterial`/chunks, `RAGService`.

### 9.1 Marking scheme
`MarkingScheme`: `id, question_id (unique), model_answer (text), allow_partial_credit (bool default true), notes, created_by_id`.
`QuestionMarkStep` (method marks, R-12): `id, question_id, step_no, description, marks, kind (METHOD|ACCURACY|PRESENTATION)`; Σ step marks must equal the question's marks (validate).
Computational questions: grading = per-step marks (lecturer or AI suggestion), plus optional automatic final-answer check with numeric tolerance. Partial credit default ON for all types where steps exist.
Link schemes to existing `Rubric` when a rubric is used; do not duplicate criteria tables: a scheme may reference `rubric_id`.

### 9.2 Key points on learning materials (R-13c, R-13d)
`MaterialKeyPoint`: `id, lecturer_material_id, chunk_id (nullable), page_number (nullable), text (the highlighted statement), importance (CORE|SUPPORTING), created_by_id`. Lecturers add them from the material viewer. Endpoints: `POST/GET/DELETE /lecturer/materials/{id}/key-points`. Key points can also be attached to a question (`QuestionKeyPoint` link table) so grading knows which apply; if none attached, the agent receives key points of materials in the assessment's workspace retrieved via RAG for the question.

### 9.3 "Open Answer Standard" rubric preset (seed, editable by lecturers)
| Criterion | Meaning | Default weight |
|---|---|---|
| Interpretation of the question | Did the student understand what was asked | 20% |
| Quality of the answer | Correctness, reasoning, clarity | 40% |
| Use of course content | Uses ideas/terms from the learning materials | 20% |
| Key-point coverage | Covers the lecturer's highlighted key points | 20% |
Marks per criterion are scaled to the question's marks, with levels (Excellent/Good/Partial/Weak). Lecturer can clone and edit per question.

### 9.4 ReviewAgent v2 (backward compatible)
- New prompt `review_agent_v2.txt` (keep v1). New inputs: key points list, marking scheme/model answer, step marks (if any).
- New output fields: `key_points_coverage: [{key_point_id, covered: bool, evidence_quote (short), note}]`, `interpretation_note`. Existing fields stay.
- Validation after parsing: `suggested_score` within `[0, max_score]`; Σ `marks_awarded` ≈ `suggested_score` (tolerance 0.01) else flag `inconsistent_ai_output` and force lecturer review; every `evidence_quote` must appear in the student answer (substring check, case-insensitive) else drop it and lower confidence flag.
- Language policy guard stays. Temperature 0.
- The AI result is stored as a suggestion (`AIGradeReview`, decision PENDING); **only a lecturer action finalizes** a mark (ACCEPTED/MODIFIED/REJECTED), recording `score_delta` and `review_duration_seconds`.

### 9.5 Grading rules by question type (enforce in `GradingService`)
- Auto: MCQ, True/False, Matching, Ordering, deterministic Fill-in-the-blank.
- Semi-auto: Short answer, Computational (steps), flexible completion → suggestion + lecturer confirm.
- Human/AI-assisted: Essay, Case study, long reasoning → AI suggestion only after lecturer enables AI-assisted marking for that assessment; always lecturer-confirmed.
- Homework/Group work: "AI grades first → lecturer confirms/rejects" workflow (allowed). Summative/CAT: AI strictly suggestion.
- Totals use `required_marks` and `is_counted` from Phase 2.

### 9.6 Sample-check mode (trust-building, R-13)
`AIGradeSampleCheck`: `id, assessment_id, lecturer_id, sample_size, sampled_review_ids (JSONB), checked_count, agreement_rate, status, created_at`. Before **bulk-accepting** AI suggestions for an assessment, the lecturer must verify a random sample (default max(5, 10%)). The bulk-accept endpoint refuses while an unverified sample exists, or while agreement rate < configurable threshold (default 80%) unless the lecturer acknowledges. [AUDIT] bulk accept.

### 9.7 Delegated marking and anonymity
`GradingDelegation`: `id, assessment_id, delegator_id, delegate_id, scope (WHOLE|SECTION|SELECTED_STUDENTS), reason, valid_from, valid_to, status`. Delegate (a lecturer of the same course) may mark using the scheme (R-11). Every grade stores `graded_by_id` and `delegation_id`.
`Assessment.anonymous_marking` (bool, **default false**, R-11): when true, grading endpoints hide student identity (use attempt alias). Used mainly for appeals (Phase 6B).

### 9.8 Endpoints (additions)
`POST/PUT/GET /lecturer/questions/{id}/marking-scheme`, `.../steps`, key-point endpoints above, `POST /lecturer/assessments/{id}/grading/sample-check`, `POST .../grading/sample-check/{sid}/verify`, `POST /lecturer/assessments/{id}/grading/bulk-accept`, `POST/DELETE /lecturer/assessments/{id}/grading-delegations`.

### 9.9 Tests
Step marks sum validation; partial credit totals; agent output validation (inconsistent sums, fake evidence quotes); AI cannot finalize; bulk-accept blocked before sample check; delegated grader scope; RW language blocks AI path but manual path works; key points injected in prompt (assert prompt contains them) — mock the provider.

**DoD:** open-answer flow end-to-end with a mocked provider, every AI call produces `AIActionLog` rows, grades are lecturer-final.

---

## 10. PHASE 6A — ELIGIBILITY, REASSESSMENT AND RETAKE ENGINE (deterministic)

**Read first:** assessments/attempts/grades models, `reassessment_of_id`, `audience_type`/`target_student_ids`, `StudentEnrollment`, `AcademicPeriod`, `Course`, attempt-start service, available-assessments listing (`list_available_for_student`).

### 10.1 Policy
`EligibilityPolicy` (per institution; optional per department override): `formative_exempt_pct=70`, `summative_entry_pct=50`, `summative_pass_pct=50`, `formative_scope=PER_FORMATIVE`, `reassessment_block_scope=COURSE`, `pending_marks_behavior=BLOCK`, `no_coursework_behavior=MANUAL_REVIEW`, `allow_hod_override=true`.

### 10.2 Pure functions (no DB, fully unit-tested) in `services/eligibility_rules.py`
```
percentage(score, max_possible) -> float
coursework_average(items) -> Optional[float]      # mean of percentages (UNWEIGHTED), R-20
formative_requires_reassessment(pct, policy) -> bool     # pct < formative_exempt_pct
summative_entry(avg, pending_count, has_coursework, policy) -> EntryDecision
summative_outcome(pct, policy) -> PASS | RETAKE_REQUIRED
```
`coursework_average`: mean of the percentages of each finalized CAT and formative of the course in the period (R-20: "average of percentages", **not** weighted by marks). Items: unexcused absence → 0% (A-03); excused absence → excluded; reassessment scores → excluded (A-02); ungraded → counted as pending.
Example test: CAT 10/10 (100%) + formative 10/50 (20%) ⇒ average 60%, eligible; weighted-by-marks would give 33% — the test must pin the unweighted behavior.

### 10.3 Tables
`ReassessmentRequirement`: `id, student_id, course_id, academic_period_id, source_assessment_id (the formative), original_percentage, status (REQUIRED|ASSIGNED|SUBMITTED|GRADED|EXCUSED|WAIVED), reassessment_assessment_id (nullable), reassessment_attempt_id (nullable), created_at, closed_at`. Unique `(student_id, source_assessment_id)`. The original formative score is **never modified** (R-18).
`EligibilityDecision` (append-only audit of every computed decision): `id, student_id, course_id, assessment_id (nullable), decision_type (CAT_GATE|SUMMATIVE_ENTRY|COURSE_OUTCOME), result, reason_code, inputs_json, policy_snapshot_json, computed_at, computed_by (system|user id)`.
`AttemptEligibilityOverride`: `id, student_id, assessment_id, source (EXCUSE|HOD_OVERRIDE), allowed_window_start, allowed_window_end (nullable), reason, granted_by_id, excuse_id (nullable), created_at, revoked_at`.
`RetakeRecord`: `id, student_id, course_id (failed course), from_period_id, target_period_id (nullable until known), target_course_id (nullable), trigger (ENTRY_THRESHOLD_NOT_MET | SUMMATIVE_FAILED), status (FLAGGED|PAYMENT_PENDING|PAID|ENROLLED|CANCELLED), payment_reference_id (nullable), decided_decision_id, created_at, enrolled_at`.
`PaymentReference` (generic, external system only): `id, purpose (RETAKE|APPEAL), student_id, external_reference (string, nullable until supplied), amount_text (nullable, informational), status (PENDING|CONFIRMED|REJECTED), confirmed_by_id, confirmed_at, notes`. **Mindexa never processes payments**; an admin/finance user confirms. Leave a clean interface (`PaymentConfirmationPort`) for a future webhook.
`StudentEnrollment` add: `is_retake (bool default false)`, `retake_record_id (nullable)`.

### 10.3.1 Triggers
- **Formative results finalized/released** → for each student whose percentage < threshold: create `ReassessmentRequirement(REQUIRED)`; notify student and lecturer. Lecturer creates a reassessment (`assessment_type=REASSESSMENT`, `reassessment_of_id`, audience `selected` with exactly the required students); creating it moves those requirements to ASSIGNED. Reuse existing fields; no parallel assignment mechanism.
- Reassessment attempt submitted → requirement SUBMITTED (this satisfies the CAT gate, A-06); once graded → GRADED. Failing it changes nothing further (A-16).
- **Summative result finalized** → `COURSE_OUTCOME`: `< summative_pass_pct` ⇒ create `RetakeRecord(SUMMATIVE_FAILED)`.
- Everything idempotent: re-running a trigger must not duplicate rows (unique keys + upsert).

### 10.4 Gates (enforced in the attempt-start service, not UI)
`start_attempt` for a **CAT**: if the student has a requirement in REQUIRED/ASSIGNED within `reassessment_block_scope` ⇒ reject with `ELIGIBILITY_BLOCKED`, `reason_code=REASSESSMENT_PENDING` (R-19) unless an active override exists.
`start_attempt` for a **SUMMATIVE**: compute `summative_entry`; reject with `ELIGIBILITY_BLOCKED` and reason `ENTRY_THRESHOLD_NOT_MET` (also auto-create `RetakeRecord(ENTRY_THRESHOLD_NOT_MET)`), `MARKS_PENDING`, or `MANUAL_REVIEW_REQUIRED` as applicable (R-20). Other assessment types: no gate.
Every gate evaluation writes an `EligibilityDecision` row (store inputs: list of assessments with percentages) so a lecturer/HOD can explain a denial (appeal-proof).
`GET /student/assessments` shows `blocked_reason` per assessment so the student sees why, before clicking start.
Lecturer view: `GET /lecturer/assessments/{id}/blocked-students` (reason per student) and a warning when publishing a CAT while students still have pending reassessments.

### 10.5 Retake flow (R-22, A-17)
`RetakeRecord(FLAGGED)` → student/admin attaches payment info (`PaymentReference`) → admin/finance **confirms** → status PAID → admin/HOD **finalizes enrolment**: creates/links `StudentEnrollment` to the same course code's offering in the **next academic period**, `is_retake=true`, status ENROLLED. If the next period/offering does not exist yet, stay PAID with `target_period_id` NULL and show a pending-enrolment state. Never auto-enrol; never mark PAID without human confirmation. Students see retake status on their dashboard. Retake enrolments are visible in rosters/exports with a "RETAKE" flag.

### 10.6 Endpoints
| Method | Path | Who |
|---|---|---|
| GET | `/student/eligibility/courses/{course_id}` (explainable status) | Student (own) |
| GET | `/lecturer/courses/{course_id}/eligibility` | course lecturer/HOD |
| GET | `/lecturer/assessments/{id}/blocked-students` | author/co-author/HOD |
| POST | `/hod/eligibility-overrides` (reason required) | HOD of department |
| GET/PUT | `/admin/eligibility-policy` | Admin |
| GET | `/student/retakes` | Student |
| POST | `/student/retakes/{id}/payment-reference` | Student |
| POST | `/admin/payment-references/{id}/confirm` | Admin/finance |
| POST | `/admin/retakes/{id}/enroll` | Admin or HOD |

Notification types: `REASSESSMENT_REQUIRED`, `REASSESSMENT_ASSIGNED`, `CAT_BLOCKED_REASSESSMENT`, `RETAKE_FLAGGED`, `RETAKE_PAYMENT_CONFIRMED`, `RETAKE_ENROLLED`.

### 10.7 Tests
Pure-function matrix (boundary 49.99/50, 69.99/70; unweighted example above); trigger idempotency; CAT gate with pending/submitted/excused requirement; scope COURSE vs ALL_COURSES; summative gate for all four reasons; override audited; absence 0% vs excused excluded; reassessment not counted; original formative unchanged; retake never PAID/ENROLLED without confirmation; period-not-found path.

**DoD:** every denial is explainable from stored inputs; no hardcoded thresholds anywhere (grep for `70`/`50` in services).

---

## 11. PHASE 6B — APPEALS AND ABSENCE EXCUSES

### 11.1 Appeals
`AppealPolicy` (institution): `window_days=7`, `allow_mark_decrease=false`, `require_payment=true`, `anonymize_for_reviewer=false`.

`Appeal`: `id, student_id, attempt_id, assessment_id, course_id, reason (text, min 20 chars), items (JSONB: disputed questions optional), status, payment_reference_id, original_total, reviewer_id (nullable), assigned_by_id (HOD), assignment_justification (nullable), reviewer_total (nullable), final_total (nullable), outcome (MARK_CONFIRMED|MARK_INCREASED|MARK_DECREASED), decision_note, submitted_at, assigned_at, decided_at, closed_at`.

Status machine: `SUBMITTED → PAYMENT_PENDING → PAID → ASSIGNED → UNDER_REVIEW → DECIDED → CLOSED` (+ `REJECTED_INVALID` for late/invalid, `WITHDRAWN`).
Rules:
1. Only the attempt's student, only if results were released, only within `window_days` of release, and only one open appeal per attempt.
2. If `require_payment`: no assignment/review before the `PaymentReference` is CONFIRMED by admin/finance (external payment).
3. **The HOD of the course's department assigns the reviewer** (R-17). `GET /hod/appeals/{id}/eligible-reviewers` returns lecturers with a `TeachingAssignment`/`LecturerCourseAssignment` on the **same course**, **excluding** the original marker(s): everyone who is `graded_by_id`, the grading delegate, and the lecturer who confirmed AI grades. Service-layer hard rule: reviewer ∉ original markers. If the pool is empty, HOD may assign any department lecturer (not an original marker) with a mandatory `assignment_justification` (A-09). Never allow the original marker as reviewer, even if the HOD tries.
4. Reviewer sees responses, scheme, original per-question marks; identity of the original marker hidden; student identity hidden if `anonymize_for_reviewer`.
5. Reviewer submits per-question revised marks → the system creates a **new grade revision** (the original grade rows remain immutable history). `final_total = reviewer_total`, except when `allow_mark_decrease=false` and `reviewer_total < original_total` ⇒ `final_total = original_total` and outcome `MARK_CONFIRMED`; record the reviewer's proposed value anyway. [AUDIT]
6. A new `AIGradeReview` cycle may be used for AI suggestions on appeal, but the reviewer lecturer is the decider.
7. HOD sees the decision and can close; student is notified. Release of the revised mark follows normal result-release rules and notifies the student.
8. If reviewer conflicts (e.g., was a co-author of the paper): allowed, but flagged to HOD.

Endpoints: `POST /student/appeals`, `GET /student/appeals`, `POST /student/appeals/{id}/withdraw`, `POST /student/appeals/{id}/payment-reference`, `GET /hod/appeals`, `GET /hod/appeals/{id}/eligible-reviewers`, `POST /hod/appeals/{id}/assign`, `GET /lecturer/review-queue` (existing queue concept: add appeal items), `POST /lecturer/appeals/{id}/submit-review`, `POST /hod/appeals/{id}/close`.
Notification types: `APPEAL_SUBMITTED`, `APPEAL_PAYMENT_CONFIRMED`, `APPEAL_REVIEWER_ASSIGNED`, `APPEAL_DECIDED`.

### 11.2 Absence excuses
`AbsenceExcuseRequest`: `id, student_id, assessment_id, course_id, reason, evidence_file_ids (JSONB list of secure student-upload file ids), status (SUBMITTED|APPROVED|REJECTED|WITHDRAWN), decided_by_id, decided_at, decision_note, granted_window_start, granted_window_end`.
Rules:
1. Student submits for an assessment they were enrolled in; deadline = `AbsenceExcusePolicy.submit_days_after` (default 7, configurable; **ASSUMPTION**).
2. **Approver = the course lecturer(s) OR the HOD of the department (R-23)**; enforce scope. A lecturer cannot decide on a request for another course.
3. Evidence is mandatory (R-23: "show proof"); files use the existing secure upload pipeline with ownership checks; approvers can view evidence; nobody else.
4. APPROVED ⇒ create `AttemptEligibilityOverride(source=EXCUSE)` with the granted window, set `DEADLINE_EXTENDED`-style notification, and mark the absence **excused** for the eligibility engine (excluded from the average, A-03). For a missed CAT/summative the lecturer sets the make-up window; the override lets that student start inside it.
5. REJECTED ⇒ absence stays as 0% in eligibility.
Endpoints: `POST /student/excuses`, `GET /student/excuses`, `GET /lecturer/excuses?status=`, `GET /hod/excuses`, `POST /lecturer/excuses/{id}/decide`, `POST /hod/excuses/{id}/decide`.
Notification types: `EXCUSE_SUBMITTED`, `EXCUSE_DECIDED`.

### 11.3 Tests
Window enforcement (day 7 ok / day 8 rejected, injected clock); duplicate appeal; payment gate; original marker excluded from pool (including delegates); HOD cannot force original marker; fallback justification required; decrease policy both ways; original grades immutable; excuse scope (wrong-course lecturer denied, other-department HOD denied); evidence access control (IDOR); approved excuse allows start only inside the granted window; rejected excuse keeps 0%.

**DoD:** appeals and excuses fully audited; revised grade has history; student sees a status timeline.

---

## 12. PHASE 6C — ACADEMIC CALENDAR AND EXCEL EXPORT

### 12.1 Calendar
`AcademicCalendarEvent`: `id, institution_id, academic_period_id, department_id (nullable), event_type (MARKS_DEADLINE|DELIBERATION|APPEAL_WINDOW|REASSESSMENT_WINDOW|EXAM_PERIOD|OTHER), title, starts_at, ends_at, created_by_id`. Created by Admin/HOD (R-14: provided at semester start). 
- Enable and implement the commented-out `grading_reminder` Celery task: for each `MARKS_DEADLINE`, remind lecturers with ungraded attempts at T-7d, T-3d, T-1d and when overdue (once per milestone, idempotent). Notify HOD of overdue lecturers.
- Unified schedule endpoint `GET /me/calendar?from=&to=` merging assessments (window/due dates), reassessments, review windows, calendar events, study sessions, scoped to the user's role.
- Notification types: `MARKS_DEADLINE_REMINDER`, `MARKS_OVERDUE`.

### 12.2 Excel export (our own format, configurable later, R-15)
Library: `openpyxl`. Large exports via Celery.
`ExportTemplate`: `id, institution_id (nullable = global), code, name, config_json (columns, order, labels, grade bands, header branding), is_default, created_by_id`. Seed `default_marksheet` and `default_course_marksheet`. Changing the layout later = editing template data, not code.
`ExportJob`: `id, requested_by_id, export_type, assessment_id/course_id, template_id, status (QUEUED|RUNNING|DONE|FAILED), file_path, row_count, error, created_at, finished_at, expires_at (24h)`.

**Export 1 — Assessment mark sheet** (per assessment):
- Sheet "Marks": `No., Registration No., Full Name, Class/Section`, per-section columns (and optional per-question columns; for choice sections show scores only for counted questions, blank otherwise), `Raw Total, Max (required marks), Percentage, Grade/Band, Status` (GRADED | ABSENT | EXCUSED | UNDER_APPEAL | PENDING_MARKS), `Late` flag, `Lecturer/Marker`. **Do NOT export integrity flags or AI details.**
- Sheet "Summary": count, average, highest, lowest, median, pass count/rate (pass mark from assessment), distribution table (10-point bands or template bands), absent/excused counts.
- Sheet "Meta": assessment title/type, course code/name, period, lecturer(s), export timestamp, exporter, seal verification code + version hash (if sealed), template version.
**Export 2 — Course consolidated mark sheet** (per course + period, the deliberation sheet): one row per student with each CAT % and formative %, **coursework average (the exact R-20 average)**, reassessment status, summative %, **eligibility status and course outcome** (PASS / RETAKE_REQUIRED / PENDING), retake flag. Values come from the same `eligibility_rules` functions (single source of truth).
Rules: only course lecturers/delegates/HOD/Admin; scope-checked; synchronous when rows ≤ 300 else Celery + job polling; downloads via short-lived URL; every export [AUDIT] (who, what, row_count).
**Spreadsheet-injection protection (mandatory):** every user-controlled string cell (names, comments) goes through `sanitize_cell()` which prefixes `'` when the value starts with `=`, `+`, `-`, `@`, tab or CR. Test this.
Numbers are written as numeric cells (not strings); percentages rounded to 2 decimals via a single helper; freeze header row, set column widths, number formats, print setup (landscape, repeat header), sheet protection off (lecturers must edit).
Endpoints: `GET /lecturer/assessments/{id}/export/marksheet?template=`, `GET /lecturer/courses/{course_id}/export/consolidated?period=`, `GET /exports/{job_id}`, `GET /exports/{job_id}/download`, admin `GET/POST/PUT /admin/export-templates`.

### 12.3 Tests
Calendar reminder idempotency; export content correctness (open with openpyxl and assert cells), choice-section columns, unweighted average equals Phase 6A value, injection strings neutralized, access control/IDOR, async job lifecycle, expiry cleanup task.

**DoD:** a lecturer can export a clean Excel for any assessment and for a whole course; deliberation sheet matches eligibility decisions exactly.

---

## 13. CROSS-CUTTING MATRICES

### 13.1 Permission matrix (✓ allowed, scope in brackets)
| Action | Student | Lecturer (author/co-author) | Lecturer (other) | Moderator | Exam officer | HOD | Admin |
|---|---|---|---|---|---|---|---|
| Edit draft assessment | – | ✓ | – | – | – | – | – |
| Submit for moderation | – | ✓ | – | – | – | – | – |
| Review/approve (not own) | – | – | – | ✓ (dept) | – | – | – |
| Seal / print job | – | – | – | – | ✓ | – | – |
| Publish (needs SEALED if required) | – | ✓ | – | – | – | – | – |
| Create delegation | – | ✓ | – | – | – | ✓ (dept) | – |
| Mark / confirm AI grade | – | ✓ | delegate only | – | – | – | – |
| Release results | – | ✓ | – | – | – | – | – |
| Submit appeal | ✓ (own) | – | – | – | – | – | – |
| Assign appeal reviewer | – | – | – | – | – | ✓ (dept) | – |
| Review appeal | – | – | ✓ if assigned, not original marker | – | – | – | – |
| Decide absence excuse | – | ✓ (own course) | – | – | – | ✓ (dept) | – |
| Eligibility override | – | – | – | – | – | ✓ (dept) | – |
| Confirm external payment | – | – | – | – | – | – | ✓ |
| Finalize retake enrolment | – | – | – | – | – | ✓ | ✓ |
| Export marks | – | ✓ (own course) | – | – | – | ✓ | ✓ |
| Manage duties/policies/templates | – | – | – | – | – | – | ✓ |

### 13.2 New enum values summary
`AssessmentStatus`: PENDING_MODERATION, CHANGES_REQUESTED, APPROVED, SEALED.
`AIActionType`: REVIEW_ASSESSMENT_WORDING (+ any referenced but missing from Phase 0).
Duties: MODERATOR, EXAM_OFFICER, DEPARTMENT_HEAD.
`NotificationType`: all listed per phase.

### 13.3 Data retention
Audit events, versions, seals, eligibility decisions, grade revisions: never deleted (soft-delete not allowed). Export files expire after 24h; evidence files follow existing resource retention.

---

## 14. PHASE REPORT TEMPLATE (agent must output this after each phase)

```
PHASE X REPORT
1. Summary (what now works, in 5 lines max)
2. Migrations (revision ids, upgrade/downgrade tested: yes/no)
3. Files added / changed (grouped: models, repos, services, schemas, routes, workers, tests)
4. Endpoints added (method, path, role)
5. Rules implemented (map to R-xx / A-xx IDs)
6. Tests added (count, what they cover) + full test run result
7. Name mappings (spec name -> actual code name)
8. Assumptions implemented as config (A-xx -> setting name, default)
9. Decisions to confirm (anything not covered by this spec)
10. Known limitations / not done (must be empty or justified; never hide)
```

---

## 15. FINAL ACCEPTANCE CHECKLIST (after Phase 6C)

- [ ] Summative path: draft → moderation (multiple rounds) → approve → seal (QR verifies) → print job → publish; cannot be bypassed.
- [ ] CAT/formative/homework/group work publish without approval.
- [ ] Summative total must be 100; choice sections compute required marks correctly everywhere; FIRST_N/BEST_N verified.
- [ ] Post-approval edits versioned/audited; blocked after attempts start.
- [ ] Marking schemes, method marks, key points, Open Answer Standard rubric, AI suggestions validated, lecturer always final, sample-check enforced.
- [ ] Formative < 70% creates reassessment requirement; original score unchanged; CAT blocked while reassessment pending.
- [ ] Summative entry uses the **unweighted average of percentages** of CATs + formatives ≥ 50%; summative < 50% ⇒ retake; retake enrolment flagged `is_retake`, human-confirmed payment, no auto-enrol.
- [ ] Appeals: payment gate, HOD assigns reviewer, original marker never eligible, history immutable, decrease policy respected.
- [ ] Absence excuses approved by course lecturer or HOD; override only inside granted window.
- [ ] Calendar events drive grading reminders; Excel exports (assessment + course) correct, injection-safe, audited.
- [ ] Every thresholds/policy is configurable; no hardcoded 50/70/100 outside seeds and defaults.
- [ ] All tests green, migrations up/down clean, no `TODO`/stub in shipped paths, Phase 0 defects closed.
