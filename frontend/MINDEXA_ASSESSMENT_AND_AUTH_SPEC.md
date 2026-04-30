# 📘 MINDEXA SYSTEM SPECIFICATION (MID-DEVELOPMENT UPDATE)

**Version:** 0.5 (Mid-Development Alignment)
**Scope:** Assessment Builder, Grading, Authorization, and Core Academic Logic

## 1. ASSESSMENT BUILDER MODULE

### 1.1 Target Class / Section Selection

**Rule:**

- Lecturer MUST NOT type class/section manually
- Lecturer MUST SELECT from assigned teaching scope

**Requirements:**

- Data must come from:
  - Assigned Courses
  - Assigned Classes
  - Assigned Sections

**UI:**

- Searchable dropdown
- Grouped hierarchy: College → Department → Course → Class → Section

**Validation:**

- Lecturer cannot access unassigned classes

### 1.2 Subject / Module Selection

**Rule:**

- Must be selected from lecturer’s assigned modules
- No free-text input allowed

### 1.3 Assessment Instructions

**Structure:**
**A) Predefined Instructions (Selectable)**
_Examples:_

- Fullscreen required
- No tab switching
- No external materials allowed
- Time strictly enforced

**B) Custom Instruction**

- Optional input field
- Placed below predefined options
- Must be validated (length + content)

### 1.4 Assessment Mode (CRITICAL - NEW)

Each assessment MUST define:

**Mode Type:**

- Practice
- Homework
- CAT
- Summative

**Environment:**

- Open Book / Closed Book
- Supervised / Unsupervised

**Restrictions:**

- AI Allowed / Disabled
- Browser Restricted / Normal

### 1.5 Total Marks Calculation

**Rule:**

- Total marks MUST be auto-calculated
- Based on all questions

**System Must:**

- Calculate per section
- Calculate total
- Prevent: Empty sections, Zero-mark assessments

### 1.6 Step-Based Assessment Builder

**Required Steps:**

- **Step 1: Metadata** (Title, Assessment Type, Subject, Class, Schedule)
- **Step 2: Blueprint** (Sections, Marks per section, Time limit, Rules)
- **Step 3: Question Creation** (Add questions per section, Manual or AI-assisted)
- **Step 4: Review** (Full preview, Validation checks)
- **Step 5: Publish / Save Draft**

### 1.7 Draft Mode (NEW REQUIRED)

- Lecturer can save incomplete assessments
- Resume editing later

### 1.8 Question Shuffling

**Rules:**

- Shuffle ONLY within same section
- NEVER across sections

**Options:**

- Shuffle questions ✔
- Shuffle MCQ options ✔

### 1.9 Question Bank Integration

**Rule:**

- Questions are NOT auto-saved
- Instead, lecturer chooses: `[✓] Save to Question Bank`

**Question Metadata:**

- Course, Topic, Difficulty, Type, Usage count, Created by, AI-generated (true/false)

### 1.10 Stepper UI

**Requirements:**

- Top progress indicator
- **States:** Completed, Active, Locked
- **Navigation:** Next button, Back button, Auto-save per step

---

## 2. GRADING SYSTEM

### 2.1 Grading Types

- **A) Fully Auto-Graded:** MCQ, True/False, Matching, Ordering (exact), Fill-in (strict match)
- **B) Semi-Auto:** Short answers, Computational answers
- **C) Manual / AI-Assisted:** Essays, Case studies, Long answers

### 2.2 Grading Interface

**A) Overview Table**

- Columns: Student | Score | AI Score | Status | Action

**B) Detailed View**
For each student, show:

- Student info
- Answers per question
- AI score
- Lecturer editable score
- AI explanation

### 2.3 AI Grading Rules

AI provides:

- Suggested score
- Explanation
- Confidence level

**Rule:** AI MUST NOT finalize grading for open questions

### 2.4 Lecturer Controls

- Approve AI grading
- Edit score
- Reject AI result

### 2.5 Bulk Actions (NEW)

- Approve all AI scores
- Flag low-confidence answers

---

## 3. QUESTION BANK MODULE (NEW REQUIRED)

**Features:**

- Store reusable questions
- **Tagging system:** Course, Topic, Difficulty, Type
- **Optional:** Bloom’s Taxonomy tagging

---

## 4. AUTHENTICATION & AUTHORIZATION

### 4.1 Roles

- Student
- Lecturer

### 4.2 Student Required Fields

- Registration Number (UNIQUE)
- Full Name
- Email
- College
- Department
- Option
- Level
- Year

### 4.3 Lecturer Required Fields

- Full Name
- Email
- College
- Department
- Assigned Courses

### 4.4 Admin Required Fields

- Full Name
- Email
- admins should have there different login portal from students and lecturers

### 4.5 Account Control

**User States:** Active, Pending Approval, Suspended, Graduated (student)

### 4.6 Registration Model

**Recommended:** Controlled registration

- approval required after signup ✔
- admin should allow lecturer account creation ✔
- **Avoid:** Open public signup ❌

### 4.7 RP MIS Integration

- Add Button: Login with RP MIS
- Current State: Disabled / Coming Soon

### 4.8 Temporary System (Current Phase)

- Manual data entry in DB
- Required validation: Unique Reg Number, Email uniqueness

---

## 5. COURSE & ENROLLMENT SYSTEM (CRITICAL MISSING PART)

**Must Include:**

- Student → Course mapping
- Lecturer → Course assignment
- Class → Course linkage

_Without this, assessment targeting fails._

---

## 6. INTEGRITY & EXAM RULES (SUMMARY)

**System should detect:**

- Tab switching
- Fullscreen exit
- Window blur
- Copy/paste attempts

**System should:**

- Warn student
- Log event
- Send real-time alert to lecturer

---

## 7. AI USAGE POLICY

**Student AI Access:**

- **Allowed:** Before exam, After exam, Homework (if allowed)
- **Disabled:** CAT, Summative exams, Restricted assessments

**Lecturer AI Access:**

- Question generation
- Grading assistance
- Feedback generation
- Assessment analysis

**Admin AI:** Not required (for now)

---

## 8. STUDENT DASHBOARD

**Must Include:**

- Calendar
- **Schedule:** Assessments, Homework, Group work
- Notifications
- Reminder system

---

## 9. IMPORTANT MISSING FEATURES (NOW INCLUDED)

### 1. Submission Policy

- Late submission rules
- Attempt limits
- Auto-submit on timeout

### 2. Result Release Policy

- Immediate
- Delayed

### 3. Rubric System

- Criteria
- Marks
- Explanation

### 4. Lecturer Review Queue

- AI grading review
- Flagged submissions
- Pending grading

### 5. Appeal System

- Student can request review
- Lecturer responds

---

## FINAL SYSTEM PRINCIPLE

🔐 **Mindexa is a:**
Security-first, AI-assisted, role-based academic assessment platform with strict validation, explainable grading, and controlled assessment workflows.
