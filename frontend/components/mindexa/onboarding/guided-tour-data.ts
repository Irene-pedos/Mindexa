// frontend/components/mindexa/onboarding/guided-tour-data.ts

export interface TourStep {
  id: string;
  targetSelector: string;
  fallbackSelector?: string;
  path: string;
  placement?: "bottom" | "top" | "left" | "right" | "bottom-start" | "bottom-end" | "top-start" | "top-end";
  title: string;
  subtitle: string;
  description: string;
  tip?: string;
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
      "A quick walkthrough of your learning dashboard, assessments environment, AI study companion, and feedback reports.",
    steps: [
      {
        id: "student-dashboard",
        targetSelector: "[data-tour='student-dashboard-metrics']",
        fallbackSelector: "[data-tour='student-dashboard']",
        placement: "bottom",
        title: "Academic Metrics & Overview",
        subtitle: "Real-time overview of your learning metrics",
        description:
          "Your central hub for tracking GPA trends, active enrolled courses, attendance rates, and upcoming exam deadlines.",
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
        targetSelector: "[data-tour='student-assessments']",
        fallbackSelector: "[data-tour='student-assessments-list']",
        placement: "bottom",
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
          "Question type previews (MCQ, Essays, Case Studies, Matching)",
          "Submission deadline and maximum attempt counters",
        ],
      },
      {
        id: "student-study",
        targetSelector: "[data-tour='student-study']",
        fallbackSelector: "[data-tour='student-study-planner']",
        placement: "bottom",
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
      {
        id: "student-results",
        targetSelector: "[data-tour='student-results']",
        fallbackSelector: "[data-tour='student-results-table']",
        placement: "bottom",
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
        targetSelector: "[data-tour='lecturer-dashboard-metrics']",
        fallbackSelector: "[data-tour='lecturer-dashboard']",
        placement: "bottom",
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
        targetSelector: "[data-tour='lecturer-create-assessment']",
        fallbackSelector: "[data-tour='lecturer-create']",
        placement: "bottom",
        title: "Assessment Builder & Registry",
        subtitle: "Design structured exams with granular policies",
        description:
          "Create timed assessments with diverse question types. Configure time limits, attempt limits, target class sections, and strictness thresholds for proctoring.",
        tip: "Use section targeting to release assessments only to specific tutorial or lab groups.",
        path: "/lecturer/assessments",
        iconName: "PlusCircle",
        badge: "Authoring",
        actionLabel: "Manage Assessments",
        highlights: [
          "Support for MCQ, essays, case studies, matching, and code",
          "Granular scheduling with automated release and closing windows",
          "Configurable group submission rules and peer leadership",
        ],
      },
      {
        id: "lecturer-bank",
        targetSelector: "[data-tour='lecturer-bank']",
        fallbackSelector: "[data-tour='lecturer-bank-search']",
        placement: "bottom",
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
        targetSelector: "[data-tour='lecturer-grading']",
        fallbackSelector: "[data-tour='lecturer-grading-table']",
        placement: "bottom",
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
        targetSelector: "[data-tour='lecturer-integrity']",
        fallbackSelector: "[data-tour='lecturer-integrity-table']",
        placement: "bottom",
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
        targetSelector: "[data-tour='admin-users']",
        fallbackSelector: "[data-tour='admin-users-table']",
        placement: "bottom",
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
        targetSelector: "[data-tour='admin-academic']",
        fallbackSelector: "[data-tour='admin-academic-tree']",
        placement: "bottom",
        title: "Academic Structure & Hierarchies",
        subtitle: "Campuses, departments, courses & cohorts",
        description:
          "Set up institutional hierarchies: campuses, colleges, departments, academic programs, courses, and active class section enrollments.",
        tip: "Assign lecturers directly to courses and class sections for seamless access.",
        path: "/admin/academic/structure",
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
        targetSelector: "[data-tour='admin-accommodations']",
        fallbackSelector: "[data-tour='admin-users']",
        placement: "bottom",
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
        targetSelector: "[data-tour='admin-integrity']",
        fallbackSelector: "[data-tour='admin-integrity-stats']",
        placement: "bottom",
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
