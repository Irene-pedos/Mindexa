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
      "A guided walkthrough of your enrolled courses, testing environment, AI study tutor, explainable feedback, and eligibility appeals.",
    steps: [
      {
        id: "student-dashboard",
        targetSelector: "[data-tour='student-dashboard-metrics']",
        fallbackSelector: "[data-tour='student-dashboard']",
        placement: "bottom",
        title: "Academic Metrics & Overview",
        subtitle: "Real-time overview of your learning performance",
        description:
          "Your central command hub for tracking GPA trends, enrolled courses, attendance rates, and upcoming exam deadlines.",
        tip: "Check the top banner for urgent notifications and active scheduled exam windows.",
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
        id: "student-courses",
        targetSelector: "[data-tour='student-courses']",
        fallbackSelector: "h1:has-text('My Courses'), [data-tour='student-dashboard']",
        placement: "bottom",
        title: "My Courses & Study Workspaces",
        subtitle: "Course syllabus, lecture notes & announcements",
        description:
          "All your enrolled modules in one place. Access lecture materials, syllabus documents, reading lists, and direct links to your instructors.",
        tip: "Filter by academic year or term to easily locate course archives.",
        path: "/student/courses",
        iconName: "BookOpen",
        badge: "Core Learning",
        actionLabel: "Open Courses",
        highlights: [
          "Syllabus documents and lecture slide repositories",
          "Announcements and course calendar schedules",
          "Direct launchpads into course-specific study sessions",
        ],
      },
      {
        id: "student-assessments",
        targetSelector: "[data-tour='student-assessments']",
        fallbackSelector: "[data-tour='student-assessments-list']",
        placement: "bottom",
        title: "Assessments & Examinations",
        subtitle: "Scheduled, active, and completed tests",
        description:
          "Launch and take course assessments. Review time limits, attempt rules, question types, and submission deadlines.",
        tip: "Green indicators signal an assessment is open right now; yellow indicates an upcoming scheduled test.",
        path: "/student/assessments",
        iconName: "FileText",
        badge: "Assessment Engine",
        actionLabel: "Open Assessments",
        highlights: [
          "Live countdown timers for scheduled exam windows",
          "Question type previews (MCQ, Essays, Case Studies, Tables)",
          "Real-time autosave protecting your answers during power loss",
        ],
      },
      {
        id: "student-study",
        targetSelector: "[data-tour='student-study']",
        fallbackSelector: "[data-tour='student-study-planner']",
        placement: "bottom",
        title: "AI Study Support & Tutoring",
        subtitle: "24/7 personalized course revision",
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
        title: "Transparent Results & Diagnostics",
        subtitle: "Explainable marks, rubrics & model answers",
        description:
          "After grading is published, inspect your question-by-question breakdown, model answers, and detailed constructive notes provided by your lecturers.",
        tip: "Use the Jump Navigator pills to instantly review questions where marks were deducted.",
        path: "/student/results",
        iconName: "Trophy",
        badge: "Grades & Rubrics",
        actionLabel: "Explore Results",
        highlights: [
          "Interactive question navigator filtering correct vs attention items",
          "Clear distinction between human and AI-assisted evaluations",
          "Downloadable PDF assessment performance report",
        ],
      },
      {
        id: "student-requests",
        targetSelector: "[data-tour='student-requests']",
        fallbackSelector: "h1:has-text('Eligibility & Academic Requests'), [data-tour='student-dashboard']",
        placement: "bottom",
        title: "Eligibility, Retakes & Appeals",
        subtitle: "Manage exam entry rules, retakes & mark appeals",
        description:
          "Verify your eligibility for summative exams, track course retake obligations, submit formal mark recalculation appeals, and report absence excuses.",
        tip: "You can request a mark appeal directly from any released result slip or manage them here.",
        path: "/student/requests",
        iconName: "ClipboardList",
        badge: "Governance & Rights",
        actionLabel: "View Requests",
        highlights: [
          "Summative exam entry eligibility checks based on coursework",
          "Formal mark review appeals with faculty decision tracking",
          "Documented absence excuses with institutional review status",
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
        id: "lecturer-courses",
        targetSelector: "[data-tour='lecturer-courses']",
        fallbackSelector: "h1:has-text('Workspaces'), [data-tour='lecturer-dashboard']",
        placement: "bottom",
        title: "Workspaces & Cohort Management",
        subtitle: "Manage enrolled cohorts, syllabus & course files",
        description:
          "Your teaching workspaces for every assigned module. Upload syllabus files, curate lecture documents, view student rosters, and configure group structures.",
        tip: "Uploaded syllabus PDFs are used to ground AI question generation and the student study tutor.",
        path: "/lecturer/courses",
        iconName: "BookOpen",
        badge: "Course Operations",
        actionLabel: "Manage Workspaces",
        highlights: [
          "Class section roster inspections with performance indicators",
          "Syllabus file uploads feeding AI grounding engines",
          "Collaborative group assessment team formation",
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
          "Support for MCQ, essays, case studies, matching, and tables",
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
        id: "admin-dashboard",
        targetSelector: "[data-tour='admin-dashboard']",
        fallbackSelector: "h1:has-text('Admin'), [data-tour='admin-users']",
        placement: "bottom",
        title: "Institutional Command Center",
        subtitle: "Campus-wide activity, active exams & health",
        description:
          "Your executive dashboard for institutional metrics. Monitor active exam sessions across all departments, system health, user onboarding, and duty assignments.",
        tip: "Review the daily integrity alert summary to spot systemic issues early.",
        path: "/admin/dashboard",
        iconName: "LayoutDashboard",
        badge: "Executive Hub",
        actionLabel: "View Dashboard",
        highlights: [
          "Active user counts and concurrent exam metrics",
          "Staff duty distribution and exam officer seal status",
          "Quick links to urgent system approval queues",
        ],
      },
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
        subtitle: "Campuses, departments, programs & cohorts",
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
        id: "admin-courses",
        targetSelector: "[data-tour='admin-courses']",
        fallbackSelector: "h1:has-text('Courses'), [data-tour='admin-users']",
        placement: "bottom",
        title: "Courses & Class Cohorts Directory",
        subtitle: "Institutional course offerings & curriculum",
        description:
          "Manage all active and archived course modules. Verify department affiliations, module leaders, class cohorts, and syllabus compliance.",
        tip: "Ensure each class section is properly linked to an academic term for exam eligibility rules.",
        path: "/admin/courses",
        iconName: "BookOpen",
        badge: "Curriculum",
        actionLabel: "Manage Courses",
        highlights: [
          "Course code registry with department allocations",
          "Cohort section sizing and lecturer assignment",
          "Curriculum status verification across faculties",
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
