// frontend/components/mindexa/onboarding/guided-tour-data.ts

export interface TourStep {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  tip?: string;
  path?: string;
  iconName: string;
  badge: string;
  actionLabel?: string;
  highlights: string[];
}

export interface RoleTourConfig {
  role: string;
  roleName: string;
  welcomeTitle: string;
  welcomeDescription: string;
  steps: TourStep[];
}

export const ROLE_TOURS: Record<string, RoleTourConfig> = {
  student: {
    role: "student",
    roleName: "Student",
    welcomeTitle: "Welcome to Mindexa Student Portal",
    welcomeDescription:
      "A quick walkthrough of your learning dashboard, test taking environment, results breakdown, and AI study companion.",
    steps: [
      {
        id: "student-dashboard",
        title: "Your Academic Dashboard",
        subtitle: "Real-time overview of your learning journey",
        description:
          "Your central hub for tracking upcoming assessments, recent course announcements, current GPA, and quick shortcuts to active study sessions.",
        tip: "Check the top banner for urgent notifications and upcoming scheduled exam windows.",
        path: "/student/dashboard",
        iconName: "LayoutDashboard",
        badge: "Overview",
        actionLabel: "View Dashboard",
        highlights: [
          "Active course progress and attendance indicators",
          "Quick links to pending quizzes and tests",
          "Recent grades and instructor feedback summaries",
        ],
      },
      {
        id: "student-assessments",
        title: "Assessments & Quizzes",
        subtitle: "View scheduled, active, and completed tests",
        description:
          "All your course assessments appear here. Filter by status, see total marks allocated, duration limits, and launch available exams during their permitted window.",
        tip: "Green badges indicate an exam is open now; yellow indicates an upcoming scheduled test.",
        path: "/student/assessments",
        iconName: "FileText",
        badge: "Core Feature",
        actionLabel: "Open Assessments",
        highlights: [
          "Clear countdown timers before test availability begins",
          "Question type previews (MCQ, Essays, Matching, Fill-in-blanks)",
          "Submission deadline and maximum attempt counters",
        ],
      },
      {
        id: "student-taking",
        title: "Starting a Test & Integrity Rules",
        subtitle: "Distraction-free, secure exam environment",
        description:
          "When starting a timed assessment, Mindexa opens an integrity-monitored workspace. Fullscreen enforcement and focus monitoring ensure fairness for every student.",
        tip: "Avoid switching browser tabs or minimizing the window during an active assessment.",
        path: "/student/assessments",
        iconName: "ShieldCheck",
        badge: "Exam Security",
        actionLabel: "Learn Test Rules",
        highlights: [
          "Automated server-side timing with extended time accommodation",
          "Continuous auto-saving so no answers are ever lost",
          "Accessible list-mode fallback for keyboard and screen-reader users",
        ],
      },
      {
        id: "student-submit",
        title: "Answering & Confident Submission",
        subtitle: "Review matrix and instant confirmation",
        description:
          "Use the question matrix to jump between answered and flagged questions. When finished, a confirmation screen verifies all questions before recording your submission timestamp.",
        tip: "You can flag tricky questions and return to them before submitting your exam.",
        path: "/student/assessments",
        iconName: "CheckCircle2",
        badge: "Submissions",
        highlights: [
          "Visual indicator for unanswered and reviewed questions",
          "Explicit confirmation prompt to prevent accidental submission",
          "Cryptographically verifiable submission receipt timestamp",
        ],
      },
      {
        id: "student-results",
        title: "Transparent Results & Feedback",
        subtitle: "Explainable marks and rubric breakdowns",
        description:
          "After grading is published, inspect your question-by-question breakdown, model answers, and detailed constructive notes provided by your lecturers and AI grading.",
        tip: "Click on any question to view the exact marking criteria and lecturer feedback basis.",
        path: "/student/results",
        iconName: "Trophy",
        badge: "Grades & Rubrics",
        actionLabel: "Explore Results",
        highlights: [
          "Clear distinction between human and AI-assisted evaluations",
          "Actionable suggestions to improve in future assignments",
          "Downloadable PDF assessment performance report",
        ],
      },
      {
        id: "student-study",
        title: "AI Study Support & Tutoring",
        subtitle: "24/7 personalized course guidance",
        description:
          "Generate customized revision plans, interactive practice flashcards, and topic knowledge checks grounded directly in your syllabus and course materials.",
        tip: "Ask the AI tutor to break down complex lecture concepts step-by-step.",
        path: "/student/study",
        iconName: "Brain",
        badge: "AI Learning",
        actionLabel: "Start Study Session",
        highlights: [
          "Curriculum-grounded explanations without hallucinations",
          "Automated knowledge checks with real-time feedback",
          "Personalized study streak and topic confidence tracking",
        ],
      },
    ],
  },
  lecturer: {
    role: "lecturer",
    roleName: "Lecturer",
    welcomeTitle: "Welcome to Mindexa Teaching Portal",
    welcomeDescription:
      "A guided overview of assessment creation, AI-assisted question authoring, explainable grading queues, and live proctoring.",
    steps: [
      {
        id: "lecturer-dashboard",
        title: "Teaching Hub & Course Analytics",
        subtitle: "Monitor student cohorts and pending tasks",
        description:
          "Get immediate visibility into your assigned courses, active assessments, submission turn-in rates, and items awaiting your grading review.",
        tip: "Pending grading submissions are prioritized on your dashboard daily.",
        path: "/lecturer/dashboard",
        iconName: "LayoutDashboard",
        badge: "Overview",
        actionLabel: "Go to Dashboard",
        highlights: [
          "Cohort performance distributions and attendance stats",
          "Quick alerts for flagged academic integrity events",
          "Recent assessment engagement metrics",
        ],
      },
      {
        id: "lecturer-create",
        title: "Assessment Builder & Scheduling",
        subtitle: "Design structured exams with granular policies",
        description:
          "Create timed assessments with diverse question types. Configure time limits, attempt limits, target class sections, and strictness thresholds for proctoring.",
        tip: "Use section targeting to release assessments only to specific tutorial or lab groups.",
        path: "/lecturer/assessments",
        iconName: "PlusCircle",
        badge: "Authoring",
        actionLabel: "Manage Assessments",
        highlights: [
          "Support for MCQ, essays, code, matching, and fill-in-the-blanks",
          "Granular scheduling with automated release and closing windows",
          "Configurable group submission rules and peer leadership",
        ],
      },
      {
        id: "lecturer-bank",
        title: "Question Bank & AI Co-Authoring",
        subtitle: "Generate curriculum-aligned question items",
        description:
          "Create and organize items by Bloom's taxonomy level. Use the AI generator grounded in your uploaded lecture PDFs and course notes for fast draft generation.",
        tip: "Every AI-generated question can be edited and vetted before adding to exams.",
        path: "/lecturer/question-bank",
        iconName: "BookOpenCheck",
        badge: "AI Authoring",
        actionLabel: "Open Question Bank",
        highlights: [
          "RAG-grounded question drafting from syllabus documents",
          "Tagging by difficulty, topic domain, and learning objectives",
          "One-click question promotion into active exam pools",
        ],
      },
      {
        id: "lecturer-grading",
        title: "Explainable Grading & AI Review",
        subtitle: "Human-in-the-loop transparent mark evaluation",
        description:
          "Review student responses with AI-suggested marks and rubric rationale. Retain 100% control to adjust grades, provide annotations, and release results.",
        tip: "Grades are never shown to students until you explicitly click 'Release Grades'.",
        path: "/lecturer/grading",
        iconName: "Sparkles",
        badge: "Grading Workflow",
        actionLabel: "View Grading Queue",
        highlights: [
          "Side-by-side student answer and rubric criteria comparison",
          "AI grading confidence ratings with explainable reasoning",
          "Bulk and individual feedback release workflows",
        ],
      },
      {
        id: "lecturer-integrity",
        title: "Real-Time Integrity & Proctoring",
        subtitle: "Audit session focus and potential infractions",
        description:
          "Monitor active exam sessions with detailed event logs, tab switch counters, and anomaly scores calculated per student attempt.",
        tip: "Flagged infractions provide exact timestamped evidence for departmental review.",
        path: "/lecturer/integrity",
        iconName: "ShieldAlert",
        badge: "Integrity",
        actionLabel: "Monitor Integrity",
        highlights: [
          "Live focus-loss timelines and full-screen exit tracking",
          "Incident logs with student browser session metadata",
          "Exportable integrity reports for academic hearing compliance",
        ],
      },
    ],
  },
  admin: {
    role: "admin",
    roleName: "Administrator",
    welcomeTitle: "Welcome to Mindexa Administration",
    welcomeDescription:
      "A guided overview of institutional user governance, academic campus setup, disability accommodations, and AI audit controls.",
    steps: [
      {
        id: "admin-users",
        title: "User Management & Identity Governance",
        subtitle: "Manage accounts, approvals, and security roles",
        description:
          "Manage student, lecturer, and administrator accounts. Review self-registration requests, verify institutional emails, and manage security statuses.",
        tip: "Admins can filter by department, account status, and role instantly.",
        path: "/admin/users",
        iconName: "Users",
        badge: "Identity",
        actionLabel: "Manage Users",
        highlights: [
          "Role assignment and account suspension controls",
          "Student ID and staff number deduplication",
          "Batch user verification and password resets",
        ],
      },
      {
        id: "admin-academic",
        title: "Academic Structure & Hierarchies",
        subtitle: "Campuses, departments, courses & cohorts",
        description:
          "Set up institutional hierarchies: campuses, colleges, departments, academic programs, courses, and active class section enrollments.",
        tip: "Assign lecturers directly to courses and class sections for seamless access.",
        path: "/admin/academic",
        iconName: "Building2",
        badge: "Academic Setup",
        actionLabel: "View Academic Setup",
        highlights: [
          "Multi-campus organizational hierarchy support",
          "Term and academic year cohort structuring",
          "Bulk student enrollment mapping",
        ],
      },
      {
        id: "admin-accommodations",
        title: "Accessibility Accommodations & Audit",
        subtitle: "Disability support with immutable audit logs",
        description:
          "Configure student-specific accommodations such as extra time percentages (+25%, +50%), screen-reader requirements, and simplified UI modes.",
        tip: "Every accommodation update automatically records an immutable AuditLog entry.",
        path: "/admin/users",
        iconName: "Accessibility",
        badge: "Accommodations",
        actionLabel: "Manage Accommodations",
        highlights: [
          "Server-side enforcement of extra time duration on exam start",
          "Screen-reader & list-mode UI preference presets",
          "Complete audit log trail (who approved, when, reason)",
        ],
      },
      {
        id: "admin-integrity",
        title: "Integrity Settings & AI Action Audit",
        subtitle: "System governance and AI model oversight",
        description:
          "Monitor platform-wide proctoring policies, token usage across AI providers, cost tracking, and system security event logs.",
        tip: "Inspect real-time token costs and latency metrics per AI capability.",
        path: "/admin/integrity",
        iconName: "Activity",
        badge: "System Governance",
        actionLabel: "Platform Settings",
        highlights: [
          "Institution-wide anti-cheat threshold configuration",
          "AI prompt and response auditing with cost metrics",
          "Full system event logging and exportable compliance records",
        ],
      },
    ],
  },
};
