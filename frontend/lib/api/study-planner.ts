import { apiClient } from "./client";

export interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
}

export interface QuizQuestion {
  id: string;
  question_text: string;
  question_type?: string;
  options: string[];
  correct_option_index?: number;
  correct_answer?: string;
  explanation: string;
}

export interface LessonSection {
  section_title: string;
  content: string;
  key_points?: string[];
  diagram_prompt?: string;
  estimated_minutes?: number;
  examples?: Array<{ title?: string; code?: string; explanation?: string }>;
  tables?: Array<{ title?: string; headers?: string[]; rows?: string[][] }>;
  charts?: Array<Record<string, any>>;
  activities?: string[];
  micro_check?: { question: string; answer: string; hint?: string } | null;
  faded_example?: { problem: string; solution_steps?: string[]; completion_prompt: string; blank_index?: number } | null;
  self_explanation_prompt?: string | null;
  suggested_video_search?: string | null;
  source_learning_unit_id?: string | null;
}

export interface LessonPlanOutput {
  title: string;
  topic: string;
  estimated_duration_minutes?: number;
  objectives?: string[];
  introduction?: string;
  sections: LessonSection[];
  lecturer_references?: string[];
  summary?: string;
  citations?: SourceCitation[];
  glossary?: Array<{ term: string; definition: string }>;
  references?: string[];
  generated_by?: "ai" | "fallback" | string;
}

export interface KnowledgeCheckQuestionGrade {
  question_id: string;
  is_correct: boolean;
  score: number;
  student_answer?: string;
  correct_answer?: string;
  explanation?: string;
  feedback?: string;
}

export interface KnowledgeCheckReport {
  total_questions: number;
  score_percentage: number;
  question_grades: KnowledgeCheckQuestionGrade[];
  mastered_concepts: string[];
  weak_concepts: string[];
  estimated_confidence_level: number;
  recommendations: string[];
  generated_by?: "ai" | "fallback" | string;
}

export interface SourceCitation {
  resource_id?: string;
  resource_name?: string;
  title?: string;
  snippet?: string;
  excerpt?: string;
  page_number?: number | null;
  chunk_index?: number;
  relevance_score?: number;
}

export interface LearningUnit {
  id: string;
  teaching_workspace_id: string;
  source_material_id?: string | null;
  order_index: number;
  title: string;
  summary?: string | null;
  learning_outcomes?: string[];
  start_page?: number | null;
  end_page?: number | null;
  source_chunk_ids?: string[];
  estimated_study_minutes: number;
  is_active: boolean;
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "NEEDS_REVIEW" | string;
  confidence_score?: number | null;
}

export interface StudySession {
  id: string;
  study_plan_id: string;
  learning_unit_id?: string | null;
  title: string;
  topic: string;
  session_type: "STUDY" | "PRACTICE" | "REVISION" | string;
  scheduled_start: string;
  scheduled_end: string;
  duration_minutes: number;
  status: "SCHEDULED" | "COMPLETED" | "SKIPPED" | "MISSED" | "RESCHEDULED" | string;
  completed_at?: string | null;
  understanding_level?: "YES" | "PARTIAL" | "NO" | null;
  difficulty_rating?: "Easy" | "Medium" | "Hard" | null;
  confidence_rating?: number | null;
  feedback_notes?: string | null;
  checklist_items?: ChecklistItem[];
  quiz_questions?: QuizQuestion[];
  recommended_resource_ids?: string[];
  source_material_ids?: string[];
  lesson_sections_json?: LessonSection[];
  lesson_plan_json?: LessonPlanOutput | null;
  lesson_status?: "NOT_GENERATED" | "IN_PROGRESS" | "COMPLETED" | string;
  current_section_index?: number;
  lesson_generated_at?: string | null;
  knowledge_check_answers?: Record<string, any> | null;
  knowledge_check_score?: number | null;
  knowledge_check_report?: KnowledgeCheckReport | null;
  session_summary_text?: string | null;
  student_notes?: string | null;
  tutor_chat_history?: Array<{
    role: string;
    content: string;
    citations?: SourceCitation[];
    timestamp?: string;
  }> | null;
}

export interface ReadinessTimelinePoint {
  label: string;
  score: number;
}

export interface MaterialCoverageItem {
  course_code: string;
  course_title: string;
  covered_count: number;
  total_count: number;
  percentage: number;
}

export interface ScheduleConflictWarning {
  session_a_id: string;
  session_a_title: string;
  session_b_id: string;
  session_b_title: string;
  overlap_time: string;
}

export interface StudyPlan {
  id: string;
  student_id: string;
  title: string;
  study_type: string;
  course_id?: string | null;
  teaching_workspace_id?: string | null;
  assessment_id?: string | null;
  target_mode?: "full_assessment_coverage" | "up_to_learning_unit" | string;
  target_learning_unit_id?: string | null;
  start_date: string;
  end_date: string;
  available_days: string[];
  blackout_dates: string[];
  preferred_time_start: string;
  preferred_time_end: string;
  session_duration_minutes: number;
  daily_goal: string;
  preferred_difficulty: string;
  reminder_preference_minutes: number;
  reminder_channels: string[];
  priority: "High" | "Medium" | "Low" | string;
  status: "DRAFT" | "SCHEDULED" | "ACTIVE" | "PAUSED" | "COMPLETED" | "CANCELLED" | "EXPIRED" | "ARCHIVED" | string;
  auto_generated: boolean;
  streak_count: number;
  readiness_score: number;
  readiness_history?: ReadinessTimelinePoint[];
  covered_material_ids?: string[];
  created_at: string;
  sessions?: StudySession[];
  creation_warnings?: string[];
}

export interface CreateStudyPlanPayload {
  title: string;
  study_type?: string;
  course_id?: string;
  teaching_workspace_id?: string;
  assessment_id?: string;
  target_mode?: "full_assessment_coverage" | "up_to_learning_unit";
  target_learning_unit_id?: string;
  start_date: string;
  end_date: string;
  available_days?: string[];
  blackout_dates?: string[];
  preferred_time_start?: string;
  preferred_time_end?: string;
  session_duration_minutes?: number;
  daily_goal?: string;
  preferred_difficulty?: string;
  reminder_preference_minutes?: number;
  reminder_channels?: string[];
  priority?: string;
  auto_generate_sessions?: boolean;
}

export interface GeneratePlanFromAssessmentPayload {
  assessment_id: string;
  start_date?: string;         // ISO string — user-selected plan start date
  end_date?: string;           // ISO string — user-selected plan end date (falls back to assessment window)
  target_mode?: "full_assessment_coverage" | "up_to_learning_unit";
  target_learning_unit_id?: string;
  available_days?: string[];
  blackout_dates?: string[];
  preferred_time_start?: string;
  preferred_time_end?: string;
  session_duration_minutes?: number;
  daily_goal?: string;
  preferred_difficulty?: string;
  reminder_preference_minutes?: number;
  reminder_channels?: string[];
  priority?: string;
}

export interface ProactiveSuggestion {
  id: string;
  title: string;
  type: string;
  course_code: string;
  window_start?: string | null;
}

export interface StudyPlannerSummary {
  active_plan?: StudyPlan | null;
  total_plans: number;
  completed_sessions_count: number;
  total_sessions_count: number;
  streak_days: number;
  hours_studied_this_week: number;
  weekly_study_activity?: boolean[];
  today_session?: StudySession | null;
  next_upcoming_session?: StudySession | null;
  assessment_readiness_score: number;
  weak_topics: string[];
  proactive_suggestion?: ProactiveSuggestion | null;
  unplanned_assessments: ProactiveSuggestion[];
  readiness_timeline: ReadinessTimelinePoint[];
  material_coverage: MaterialCoverageItem[];
  schedule_conflicts: ScheduleConflictWarning[];
}

export const studyPlannerApi = {
  getSummary: async (): Promise<StudyPlannerSummary> => {
    return apiClient("/students/study-plans/summary");
  },
  getConflicts: async (): Promise<ScheduleConflictWarning[]> => {
    return apiClient("/students/study-plans/conflicts");
  },
  listPlans: async (): Promise<StudyPlan[]> => {
    return apiClient("/students/study-plans");
  },
  getPlanDetail: async (planId: string): Promise<StudyPlan> => {
    return apiClient(`/students/study-plans/${planId}`);
  },
  createManualPlan: async (payload: CreateStudyPlanPayload): Promise<StudyPlan> => {
    return apiClient("/students/study-plans", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  generateFromAssessment: async (
    payload: GeneratePlanFromAssessmentPayload
  ): Promise<StudyPlan> => {
    return apiClient("/students/study-plans/generate-from-assessment", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  completeSession: async (
    planId: string,
    sessionId: string,
    understanding_level: "YES" | "PARTIAL" | "NO",
    difficulty_rating?: "Easy" | "Medium" | "Hard",
    confidence_rating?: number,
    feedback_notes?: string,
    checklist_items?: ChecklistItem[]
  ): Promise<StudySession> => {
    return apiClient(`/students/study-plans/${planId}/sessions/${sessionId}/complete`, {
      method: "POST",
      body: JSON.stringify({
        understanding_level,
        difficulty_rating,
        confidence_rating,
        feedback_notes,
        checklist_items,
      }),
    });
  },

  rescheduleSession: async (
    planId: string,
    sessionId: string,
    new_start: string,
    new_duration_minutes?: number,
    force: boolean = false
  ): Promise<StudySession> => {
    return apiClient(`/students/study-plans/${planId}/sessions/${sessionId}/reschedule`, {
      method: "POST",
      body: JSON.stringify({ new_start, new_duration_minutes, force }),
    });
  },
  adjustPlan: async (
    planId: string,
    action: "reduce_duration" | "shift_weekends" | "rebalance_topics"
  ): Promise<StudyPlan> => {
    return apiClient(`/students/study-plans/${planId}/adjust`, {
      method: "POST",
      body: JSON.stringify({ action }),
    });
  },
  startGuidedSession: async (sessionId: string): Promise<StudySession> => {
    return apiClient(`/students/study-plans/sessions/${sessionId}/guided/start`, {
      method: "POST",
    });
  },
  getGuidedSession: async (sessionId: string): Promise<StudySession> => {
    return apiClient(`/students/study-plans/sessions/${sessionId}/guided`);
  },
  saveSessionNotes: async (
    sessionId: string,
    studentNotes: string
  ): Promise<StudySession> => {
    return apiClient(`/students/study-plans/sessions/${sessionId}/notes`, {
      method: "PATCH",
      body: JSON.stringify({ student_notes: studentNotes }),
    });
  },
  askInSession: async (
    sessionId: string,
    question: string,
    sectionContext?: string
  ): Promise<{ answer: string; citations: SourceCitation[] }> => {
    return apiClient(`/students/study-plans/sessions/${sessionId}/guided/ask`, {
      method: "POST",
      body: JSON.stringify({ question, section_context: sectionContext || "" }),
    });
  },
  generateGuidedExercise: async (
    sessionId: string,
    sectionIndex: number = 0
  ): Promise<{
    id: string;
    section_index: number;
    section_title: string;
    question_text: string;
    question_type: string;
    options: string[];
    correct_option_index: number;
    explanation: string;
  }> => {
    return apiClient(`/students/study-plans/sessions/${sessionId}/guided/exercise`, {
      method: "POST",
      body: JSON.stringify({ section_index: sectionIndex }),
    });
  },
  generateKnowledgeCheck: async (
    sessionId: string,
    questionCount: number = 5
  ): Promise<QuizQuestion[]> => {
    return apiClient(
      `/students/study-plans/sessions/${sessionId}/guided/knowledge-check/generate`,
      {
        method: "POST",
        body: JSON.stringify({ question_count: questionCount }),
      }
    );
  },
  generateQuiz: async (
    planId: string,
    sessionId: string,
    questionCount: number = 5
  ): Promise<QuizQuestion[]> => {
    return apiClient(
      `/students/study-plans/sessions/${sessionId}/guided/knowledge-check/generate`,
      {
        method: "POST",
        body: JSON.stringify({ question_count: questionCount }),
      }
    );
  },
  submitKnowledgeCheck: async (
    sessionId: string,
    answers: Record<string, any>
  ): Promise<KnowledgeCheckReport> => {
    return apiClient(
      `/students/study-plans/sessions/${sessionId}/guided/knowledge-check/submit`,
      {
        method: "POST",
        body: JSON.stringify({ answers }),
      }
    );
  },
  completeGuidedSession: async (sessionId: string): Promise<StudySession> => {
    return apiClient(`/students/study-plans/sessions/${sessionId}/guided/complete`, {
      method: "POST",
    });
  },
  getLearningUnits: async (workspaceId: string): Promise<LearningUnit[]> => {
    return apiClient(`/students/study-plans/workspaces/${workspaceId}/learning-units`);
  },
};
