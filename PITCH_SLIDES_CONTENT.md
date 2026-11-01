# MINDEXA — Presentation Content (for slide design)

> **Brief for the designer (Claude Design):** This is the full content for a ~15-minute competition interview deck about **Mindexa**, a secure academic assessment platform with explainable AI. One slide = one idea. Keep on-slide text short (the "On the slide" lines); the "Speaker notes" are for the presenter, not for the slide.
> **Look and feel:** the product itself is dark navy with a vivid blue accent, rounded cards, clean sans-serif, subtle motion. Match that. Use real product screenshots wherever a slide says **[SCREENSHOT]**. Use simple icons and diagrams, not stock photos.
> **Items in [BRACKETS] are numbers or facts the presenter must fill in** before the interview. Do not invent figures.

---

## SLIDE 1 — Title
**On the slide**
- **Mindexa**
- The academic assessment operating system with explainable AI
- [Presenter name] · [Competition name] · [Date]

**Visual:** logo, one hero screenshot of the student dashboard on a laptop frame.

---

## SLIDE 2 — The problem
**Headline:** Assessment in our institutions runs on paper, Excel and trust.

**On the slide (4 pain points, each with an icon)**
1. **Exam papers** are drafted, checked and approved by hand, with no record of who changed what.
2. **Marking** is slow, subjective, and the same answer can get different marks from different markers.
3. **Marks live in Excel**, with no common template, so results, eligibility and appeals are tracked manually.
4. **Cheating and AI misuse** are hard to detect, and students who struggle get help too late.

**Speaker notes:** Frame this with what we learned from institutional rules we modelled: summative papers go to moderators, then an exam office stamps, prints and distributes; lecturers mark by hand; marks are kept in Excel with no official template; students below the pass line retake; appeals are re-marked by another lecturer. Every step is a manual hand-off that can be lost, delayed or disputed. [Add one real anecdote or number from your own experience.]

---

## SLIDE 3 — Who it hurts
**Headline:** Everyone in the assessment chain loses time and trust.

**On the slide (3 columns)**
- **Students:** wait for results, don't know why they lost marks, unclear on whether they are even allowed to sit the exam.
- **Lecturers:** hours of repetitive marking and paperwork instead of teaching.
- **Institutions:** no audit trail, hard to prove fairness when a result is challenged.

**Visual:** three simple persona cards.

---

## SLIDE 4 — Our solution
**Headline:** One platform from paper creation to released results, with AI that assists and humans who decide.

**On the slide (a left-to-right flow diagram)**
`Author → Moderate → Seal & Print → Sit exam (monitored) → Mark (AI-assisted) → Release → Appeal / Retake`

**Under the diagram, 3 principles**
- **Secure:** sealed papers, monitored attempts, full audit trail.
- **Explainable:** every AI suggestion shows its reasoning and can be overridden.
- **Institution-ready:** built around real academic rules, not generic quizzes.

**Speaker notes:** Mindexa is not a quiz tool. It models the full institutional workflow, including the roles (lecturer, moderator, exam officer, head of department, admin) and the rules between them.

---

## SLIDE 5 — Product tour: three roles, one system
**Headline:** A tailored workspace for every role.

**On the slide (3 screenshots side by side)**
- **Student:** dashboard, courses, assessments, results and feedback, study support, schedule, requests.
- **Lecturer:** courses, assessment builder, question bank, review queue, live supervision, AI assistant, analytics.
- **Admin / staff:** users and duties, assessment rules, exam-entry rules, academic structure and calendar, exam office, integrity, analytics.

**Visual:** **[SCREENSHOT]** of each dashboard. Staff roles (moderators, exam officers) work inside the lecturer workspace through assigned **duties**, so one person can hold the right responsibility without needing admin access.

---

## SLIDE 6 — Innovation 1: the institutional workflow engine
**Headline:** The rules of a real institution, enforced by software.

**On the slide (4 short cards)**
- **Moderation and exam office:** summative papers go to moderators (marks, distribution, wording, structure), then are **sealed with a SHA-256 hash and a verification code**, and printed for the right number of students (+5% spares).
- **Structure rules:** summative papers must total exactly 100 marks, with sections A / B / C and choice questions (students answer N of M; first-N or best-N marking).
- **Audited edits:** a lecturer can fix a mistake after approval, nobody has to authorize it, **but every change is recorded**. Edits are blocked once any student has started.
- **Role separation:** a moderator can never review a paper they authored.

**Speaker notes:** The point is "trust by design": instead of forbidding things, we allow them and record them. Public seal verification lets anyone confirm a printed paper is the approved version without exposing data.

---

## SLIDE 7 — Innovation 2: eligibility, retakes and appeals, automated
**Headline:** Progression decisions made by configurable rules, not by memory.

**On the slide**
- **Formative below ~70%** → reassessment required (does not replace the original score).
- **Pending reassessment** → blocked from the next CAT.
- **Coursework average below 50%** → not eligible for the summative → retake course.
- **Summative below 50%** → retake in the next academic period, flagged as a retake.
- **Appeals:** a student appeals within a window; a **different lecturer who taught the same course** re-marks; the head of department assigns the reviewer.
- **Absence excuses:** approved by lecturer or head of department.
- **Every threshold is configurable per institution; overrides need a written reason and are audited.**

**Speaker notes:** The system never handles money and never auto-enrols: retake fees go through the college's own payment system, then an admin finalises enrolment. This keeps us within what institutions already trust.

---

## SLIDE 8 — Innovation 3: academic calendar and structure that fit any institution
**Headline:** Not one-size-fits-all: each institution defines its own shape.

**On the slide**
- **Flexible academic structure:** university, polytechnic, school or training centre, with their own level names (campus, college, department, programme, year, class).
- **Academic calendar with AI import:** upload the institution's calendar PDF, AI transcribes it, **code (not AI) parses and validates the dates** (including weekday checks), and an administrator reviews before anything is saved.
- Built and tested with **a real institutional calendar** (one academic year, two semesters, dated registration, holidays and exam periods).
- Students see the running semester and upcoming key dates on their dashboard.

**Speaker notes:** This is a good example of how we use AI: the model reads the messy document, deterministic code does the risky part, a human approves.

---

## SLIDE 9 — Smart assessment authoring (AI for lecturers)
**Headline:** From course materials to a ready assessment in minutes.

**On the slide**
- **AI question generation** grounded in the lecturer's own uploaded materials (retrieval-augmented, not generic).
- **9 question types:** multiple choice, true/false, short answer, essay, matching, fill-in-the-blank, computational, case study, ordering.
- **Per-question AI:** enhance wording, review quality, suggest rubrics and marking schemes.
- **Readiness checklist** before submitting for moderation; **question bank** for reuse.
- **Group work** assessments with team submissions.
- Every AI draft is **reviewed and approved by the lecturer** before students ever see it.

**Visual:** **[SCREENSHOT]** of the assessment wizard with the AI generation panel.

---

## SLIDE 10 — AI innovation 1: explainable grading
**Headline:** AI that shows its working, and the lecturer always has the last word.

**On the slide**
- **Auto-grading** for objective questions; **AI-assisted marking** for open answers against a marking scheme, key points and partial credit.
- Open answers are judged on the four criteria institutions already use: understanding the question, quality of the answer, use of course materials, and coverage of key points.
- **Second-opinion check:** after the lecturer marks, AI flags **score too high / too low, missed credit, unsupported credit, feedback mismatch**, each with an evidence quote.
- **Consistency check:** detects when **similar answers received different marks**.
- Result: a **review queue and batch review** that speeds marking without removing human judgement.

**Speaker notes:** "Explainable" is the key word. The AI never silently assigns a final mark; it proposes, explains and flags. Lecturer overrides are recorded.

**Visual:** **[SCREENSHOT]** of the grading review screen showing an AI suggestion with its reasoning.

---

## SLIDE 11 — AI innovation 2: integrity monitoring with an AI explainer
**Headline:** Detect suspicious behaviour fairly, explain it clearly, decide as a human.

**On the slide**
- **Live signals during an exam:** tab switching, leaving fullscreen, copy/paste attempts, developer tools, long inactivity, multiple sessions or devices.
- **Graduated escalation:** Warning 1 → Warning 2 → Warning 3, which automatically raises a flag for review. Events are **append-only and tamper-proof**.
- **Live supervision dashboard** for invigilators.
- **AI integrity explainer:** turns raw events into a plain-language summary for the reviewer.
- Flags are never final: a reviewer confirms, and a confirmed flag holds the result.

**Speaker notes:** Be honest about scope: these are behavioural signals, not camera proctoring. That choice protects privacy and works on low-bandwidth connections. [Optional: mention camera proctoring as a roadmap item.]

---

## SLIDE 12 — AI innovation 3: the student's personal study companion
**Headline:** After the exam, help students actually improve.

**On the slide**
- **AI Study Tutor** grounded in the student's own enrolled course materials, not the open internet.
- **Guided study sessions:** lesson → exercise → knowledge check → summary.
- **Smart study planner:** builds a plan from upcoming assessments and **weak topics found in past results**, with **spaced-repetition** scheduling and conflict detection.
- **Study Reader:** read materials in the app, highlight, annotate, mark key points, quick-skim with page references, **export a revision sheet**.
- Students can upload their **own resources** and study from them.

**Visual:** **[SCREENSHOT]** of the tutor chat and of the study plan.

---

## SLIDE 13 — Responsible AI: our governance model
**Headline:** AI with guardrails: safe, audited, and fair.

**On the slide (6 icons)**
1. **Human-in-the-loop:** all AI content is reviewed by a person before it takes effect.
2. **Full audit trail:** every AI call is logged (who, what, when, outcome) through a single gateway.
3. **Exam gate:** student AI tools are **automatically locked while the student has an open exam**, enforced on the server, so it cannot be bypassed from the browser.
4. **Language policy:** AI is disabled for Kinyarwanda-medium content until models are reliable enough, and past use is auditable.
5. **Cost and abuse control:** daily token budgets per role, rate limits, retries and timeouts.
6. **Provider-independent:** multiple AI providers behind one gateway, so we are never locked in.

**Speaker notes:** This slide answers the jury's likely worry: "can we trust AI in exams?" Our answer is: AI assists, rules are enforced by code, and nothing is hidden.

---

## SLIDE 14 — Built for everyone: accessibility and inclusion
**Headline:** Every student can take part.

**On the slide**
- **Individual accommodations:** extra time (percentage per student), screen-reader mode, large-text default, reduced motion.
- **Simple mode** for low digital literacy (larger controls, clearer text), as an opt-in.
- **Guided product tours** for each role and **step-by-step onboarding** for students.
- Multi-institution, multi-campus, timezone-aware.
- Math input and rendering (equations), code and diagrams in questions.

**Speaker notes:** Inclusion is part of the product, not a later add-on.

---

## SLIDE 15 — Expected community impact
**Headline:** Faster, fairer, more transparent assessment for students and institutions.

**On the slide (impact cards; fill the numbers)**
- **Time saved:** lecturers spend less time on marking and paperwork. Target: **[X]% reduction in marking time**, measured in pilot.
- **Fairness:** consistent marking and a visible reason for every mark. Target: **[X]% fewer grade disputes**.
- **Faster feedback:** results and feedback to students in **[X] days instead of [Y]**.
- **Integrity:** every exam has a sealed paper and an audit trail.
- **Learning outcomes:** students receive personal study plans targeted at weak topics.
- **Reach:** [X] institutions, [Y] lecturers, [Z] students could be served.

**Speaker notes:** Be specific about who benefits first: students in public higher-education and technical institutions, lecturers with large classes, and exam offices. Replace every [X] with a number from a pilot, a survey or a conservative estimate you can defend. Say plainly which numbers are estimates.

---

## SLIDE 16 — Feasibility: it already works
**Headline:** This is a working system, not a concept.

**On the slide (proof points)**
- **Full-stack platform in production-style architecture:** FastAPI + PostgreSQL (with vector search) + Redis + background workers; Next.js 16 / React 19 front end.
- **Five roles end-to-end tested** in a real browser: student, lecturer, moderator, exam officer, admin.
- **Automated test suite:** [verify: 700+] backend tests, type-checked front end, production build passing.
- **Modelled on real institutional rules and a real institutional calendar** (Rwandan context).
- **Security by default:** token-based login with rotation, account lockout, rate limiting, role guards on every endpoint, soft-deletes only (nothing is ever hard-deleted).
- **Lean to run:** containerised infrastructure, background jobs for heavy work, AI cost caps.

**Visual:** architecture diagram (see Slide 17) and a screenshot grid.

---

## SLIDE 17 — Architecture at a glance
**Headline:** Clean layers, replaceable parts.

**On the slide (diagram)**
`Browser (Next.js)` → `API (FastAPI)` → `Services (business rules)` → `Repositories` → `PostgreSQL + pgvector`
Side boxes: `Redis + Celery workers (grading, email, documents, exports)` · `AI Gateway → [OpenAI / Anthropic / Gemini / Groq / Jina]` · `Audit log`

**Speaker notes:** Business rules live in one layer, AI only goes through one audited gateway, and every layer can be swapped or scaled independently.

---

## SLIDE 18 — Implementation plan
**Headline:** From pilot to scale in phases.

**On the slide (timeline)**
1. **Now:** working platform, tested with institutional rules and calendar.
2. **Phase 1 (pilot, [X] months):** one institution, 1–2 departments, real assessments alongside the current process.
3. **Phase 2 (expand, [X] months):** more departments, exam-office workflow, results export to the institution's formats.
4. **Phase 3 (scale):** multiple institutions, integration with existing student information systems, **promotion and repeat handling across years** (in design).
5. **Ongoing:** feedback loops, accessibility, Kinyarwanda-language AI when quality allows.

**Speaker notes:** Replace the durations with your real plan. Be clear on what you need from the jury or institutions to start the pilot.

---

## SLIDE 19 — Sustainability and business model
**Headline:** A model that institutions can afford and that keeps itself running.

**On the slide (choose what fits your plan)**
- **Per-institution licence** or **per-active-student yearly fee** [fill pricing].
- **Free tier for small schools / training centres.**
- **Costs controlled by design:** AI token budgets, provider choice, background processing.
- Support and onboarding services for institutions.

**Speaker notes:** Only present what you actually intend; judges notice vague models. [Fill in.]

---

## SLIDE 20 — Risks and how we handle them
**Headline:** We have thought about what could go wrong.

**On the slide (table)**
| Risk | Our answer |
|---|---|
| AI makes a wrong judgement | Human decides; AI shows reasoning; second-opinion and consistency checks |
| Cheating with AI during exams | Server-side exam gate locks student AI tools; integrity signals |
| Data privacy | Role- and ownership-based access on every request; audit trail; minimal public data |
| Low connectivity / low digital skill | Lightweight behavioural monitoring, simple mode, guided onboarding |
| Institution resistance to change | Mirrors their existing workflow and rules; configurable thresholds |
| AI cost | Token budgets, rate limits, multi-provider |

---

## SLIDE 21 — Demo (live or recorded)
**Headline:** See it in 3 minutes.

**On the slide:** a short numbered path, one line each
1. Lecturer generates questions from course materials and submits the paper.
2. Moderator approves; exam office seals it (show the verification code).
3. Student takes the exam; an integrity warning appears.
4. Lecturer marks with AI assistance; the second-opinion check flags an issue.
5. Result is released; the student sees feedback and a study plan.

**Speaker notes:** Log in to all accounts **before** the interview and keep a screen recording as a backup. Do not log in repeatedly on stage (login is rate-limited). Prepare data in advance.

---

## SLIDE 22 — Why Mindexa (closing)
**Headline:** Fair assessments. Faster feedback. Smarter learning.

**On the slide (3 lines)**
- Built on real institutional rules.
- AI that explains itself and always defers to people.
- Working today, ready to pilot.

**Closing line:** "We're not replacing lecturers. We are giving them back their time, and giving students the clarity they deserve." — [Presenter name, contact, QR to demo or repo]

---

## APPENDIX A — Full feature inventory (for reference or a "More features" slide)

**Students:** guided onboarding (institution, department, programme, year, class); dashboard with CGPA / active tasks / performance; course workspaces with materials; assessments with timed exam-taking; results with feedback and academic record; schedule and calendar; eligibility and requests (appeals, absence excuses, reassessment, retake); study support (tutor, guided sessions, planner, reader); upload and study own resources; group work; notifications; profile; accessibility settings; guided tour.

**Lecturers:** assignments and course set-up; course workspace with materials and roster progress; assessment builder (unified create/edit wizard, AI generation, per-question AI, readiness checks, blueprint rules); question bank; moderation submission and revision; exam-office hand-off; grading review queue, batch review, release; assessment analytics; live supervision; integrity alerts; AI assistant; notifications.

**Moderators / Exam officers (as duties):** moderation checklist (marks, distribution, wording, structure) with comments and waivers; exam office: seal, print jobs, stored/distributed tracking, official DOCX documents, seal revocation with audit; deadline and sealing reminders.

**Admins:** users and roles; staff duties; assessment (approval) rules; exam-entry (eligibility) rules; institutions, campuses, colleges, departments, programmes, years, classes; academic periods and calendar with AI import; courses and teaching assignments; integrity and security overview; platform analytics; AI audit and language-policy audit; system settings; Excel export of marks.

**AI agents:** assessment generator, question enhancer, question reviewer, rubric generator, grading feedback, grade second-opinion check, analytics summary, integrity explainer, lecturer assistant, student support tutor, study planner, study reader (skim and page checks), slide-deck generator, review agent.

**Platform:** role-based access (student, lecturer, admin, coordinator, reviewer, supervisor); JWT with refresh rotation; account lockout; rate limiting; structured audit and security events; soft-deletes; Celery queues (default, grading, email, cleanup, high-priority, rag); Alembic migrations.

---

## APPENDIX B — Likely jury questions (prepare short answers)
1. **"How is this different from Google Classroom / Moodle / Kahoot?"** They run classes or quizzes; Mindexa runs the institution's *assessment process*: moderation, sealing, eligibility, appeals, audit, plus explainable AI.
2. **"Can AI be trusted to mark?"** It never finalises a mark. It proposes with reasoning, a second AI check flags disagreements, and the lecturer overrides.
3. **"What about students using AI to cheat?"** Server-side exam gate disables student AI tools during an open attempt, plus behavioural integrity signals and human review.
4. **"What about privacy and data protection?"** Access is scoped per role and ownership, every AI call is audited, public seal verification reveals minimal data. [State where data is hosted.]
5. **"Does it work with poor internet?"** [Answer honestly: lightweight signals, no video streaming; mention any offline plan.]
6. **"How do you make money / sustain it?"** See Slide 19.
7. **"Who will use it first?"** [Name the target institutions or departments.]
8. **"What is not finished?"** Promotion and repeat handling across academic years is being designed; payments are intentionally handled by the institution's own system; AI for Kinyarwanda is deliberately disabled until reliable.

---

## APPENDIX C — Facts to verify or fill before Sunday
- Competition name, jury expectations, time limit (tailor to the slot: 5, 10 or 15 minutes).
- Real pilot or survey numbers for the impact slide.
- Test count (earlier measured 754 backend tests; confirm with a fresh `pytest` run).
- Hosting location and data-protection statement.
- Business model and pricing.
- Team members and roles.
- Screenshots: take them from a clean demo database with realistic data (student dashboard, assessment wizard, moderation, seal verification, grading review with AI suggestion, live supervision, study tutor and plan).
