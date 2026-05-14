# Mindexa AI Agents Design

This document defines how Mindexa should use AI agents without violating the
platform's security and grading rules.

## Goal

AI agents are bounded assistants that sit on top of the service layer. They can
reason, summarize, draft, and explain. They must not own persistence, access
repositories directly, or make final academic decisions.

## Core Rules

1. AI never accesses the database directly.
2. All data access must flow through `Route -> Service -> Repository -> DB`.
3. AI output is advisory unless a human confirms it.
4. Every AI call must be logged in `AIActionLog`.
5. Rules engines decide enforcement; AI may explain results after the fact.
6. The frontend never calls AI providers directly.

## System Layers

- `frontend/` sends user requests to FastAPI.
- `backend/app/api/v1/routes/` exposes explicit AI endpoints.
- `backend/app/services/` enforces business rules, permissions, and DB access.
- `backend/app/agents/` contains agent orchestration only.
- `backend/app/core/ai/` contains prompt and model wrappers.
- `backend/app/db/models/ai.py` stores AI audit and review history.

## Recommended Agent Set

### 1. Student Support Agent

Purpose:
- Explain topics
- Guide revision
- Answer study questions

Inputs:
- Student question
- Allowed curriculum context
- Retrieved embeddings or approved study resources

Outputs:
- Plain-language explanation
- Revision plan
- Follow-up questions

Constraints:
- Must not access active exam content
- Must not read arbitrary student records
- Must be retrieval-augmented, not free-form over hidden data

Suggested placement:
- `backend/app/agents/student_support_agent.py`

### 2. Lecturer Assessment Generator

Purpose:
- Generate question drafts
- Suggest assessment structure
- Create distractors and answer guidance

Inputs:
- Subject
- Topic
- Difficulty
- Bloom level
- Lecturer constraints

Outputs:
- Structured question candidates
- Draft rubric suggestions
- Batch metadata

Constraints:
- Generated questions stay in a pending state until lecturer review
- The agent cannot promote content into the question bank

Suggested placement:
- `backend/app/agents/assessment_generator_agent.py`
- Existing batch lifecycle stays in `app/services/ai_generation_service.py`

### 3. Lecturer Review Agent

Purpose:
- Analyze student answers
- Compare answers with rubric
- Suggest marks and rationale

Inputs:
- Student response
- Question
- Rubric or marking guide
- Context from the attempt

Outputs:
- Suggested score
- Rubric alignment notes
- Confidence and rationale

Constraints:
- AI can suggest only
- Lecturer remains the final scorer
- Final grade update must happen in the service layer

Suggested placement:
- `backend/app/agents/review_agent.py`
- Existing grading workflow stays in `app/services/grading_service.py`

### 4. Feedback Generation Agent

Purpose:
- Draft feedback text
- Explain marks
- Summarize strengths and gaps

Inputs:
- Final score
- Rubric
- Lecturer notes
- Assessment context

Outputs:
- Draft feedback only

Constraints:
- Feedback is editable by the lecturer
- The agent must not finalize grades

Suggested placement:
- `backend/app/agents/feedback_agent.py`

### 5. Analytics Agent

Purpose:
- Summarize class performance
- Detect weak topics
- Explain trends in readable language

Inputs:
- Precomputed aggregates
- Cohort performance stats
- Topic-level summaries

Outputs:
- Narrative summary
- Risk areas
- Suggested interventions

Constraints:
- The agent receives structured aggregates, not raw table access
- The service layer computes the metrics first

Suggested placement:
- `backend/app/agents/analytics_agent.py`

### 6. Integrity Monitoring Agent

Purpose:
- Explain suspicious behavior
- Summarize rule-triggered incidents

Inputs:
- Integrity events
- Flags
- Warning history

Outputs:
- Human-readable explanation
- Escalation summary

Constraints:
- Detection remains rules-first in `app/services/integrity_service.py`
- AI must never decide whether cheating occurred

Suggested placement:
- `backend/app/agents/integrity_explainer_agent.py`

## LangChain Role

LangChain is the orchestrator, not the brain.

Use it for:
- Prompt templates
- Tool routing
- Output shaping
- Optional multi-step reasoning

Do not use it for:
- Permission checks
- Final grade decisions
- Direct DB access
- Domain ownership

Suggested placement:
- `backend/app/agents/orchestrator.py`

## Model Mapping

Use a small number of model capabilities:

1. Main LLM
- Student support
- Assessment generation
- Review suggestions
- Feedback drafting
- Analytics narration
- Integrity explanations

2. Embedding model
- Student support retrieval
- Resource search
- Curriculum matching

3. Rules engine
- Integrity detection
- Permission checks
- Final grading validation

## Audit and Traceability

Every AI invocation must create an `AIActionLog` entry with:
- Action type
- Actor
- Subject entity
- Model name
- Prompt summary
- Latency
- Token usage
- Status
- Raw output or failure reason

This is required even for:
- Embedding calls
- Batch generation
- Review suggestions
- Explanatory calls

## Recommended Request Flow

1. Route validates authentication and role.
2. Service loads and validates domain data.
3. Agent builds the prompt and calls the model.
4. Service validates and stores the result.
5. Repository writes rows.
6. AIActionLog records the invocation.

## Endpoint Shape

Prefer explicit endpoints over one generic chat endpoint.

Recommended examples:
- `/api/v1/student/ai/support`
- `/api/v1/lecturer/ai/generate`
- `/api/v1/lecturer/ai/review`
- `/api/v1/lecturer/ai/feedback`
- `/api/v1/analytics/ai/summary`
- `/api/v1/integrity/ai/explain`

## What Not To Do

- Do not let each feature use a different model by default.
- Do not call AI from the frontend.
- Do not let AI assign final grades.
- Do not let AI decide permissions.
- Do not mix AI logic with repository logic.
- Do not trust model output without validation.

## Implementation Order

1. Add shared AI gateway utilities for model calls and logging.
2. Add the agent package and base agent contract.
3. Refactor question generation to use the assessment generator agent.
4. Add student support retrieval and embeddings.
5. Add review and feedback agents.
6. Add analytics and integrity explanation agents.
7. Remove or narrow any generic AI chat endpoint that bypasses these controls.

## Current Codebase Alignment

The existing backend already contains the right foundations:
- `app/services/ai_generation_service.py`
- `app/services/grading_service.py`
- `app/services/integrity_service.py`
- `app/services/gemini_service.py`
- `app/db/models/ai.py`

The agent layer should sit above these services, not replace them.
