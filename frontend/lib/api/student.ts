// frontend/lib/api/student.ts
import { AdminCourseListItem } from "./admin";
import { apiClient } from "./client";

export interface StudentDashboardSummary {
  cgpa: number;
  total_credits: number;
  attendance_rate: number;
  semesters_completed: number;
  active_assessments_count: number;
  pending_results_count: number;
}

export interface StudentActiveAttempt {
  id: string;
  assessment_id: string;
  assessment_title: string;
  status: string;
  started_at: string;
  expires_at?: string;
}

export interface StudentRecentResult {
  id: string;
  assessment_title: string;
  assessment_type: string;
  score: number;
  total_marks: number;
  percentage: number;
  letter_grade?: string;
  released_at: string;
}

export interface StudentUpcomingAssessment {
  id: string;
  title: string;
  type: string;
  window_start?: string;
  duration_minutes?: number;
  total_marks?: number;
}

export interface PerformanceTrendItem {
  month: string;
  score: number;
  average: number;
}

export interface StudentDashboardResponse {
  summary: StudentDashboardSummary;
  active_attempts: StudentActiveAttempt[];
  recent_results: StudentRecentResult[];
  upcoming_assessments: StudentUpcomingAssessment[];
  performance_trend: PerformanceTrendItem[];
}

export interface StudentCourseDetail {
  id: string;
  code: string;
  title: string;
  lecturer: string;
  description: string;
  progress: number;
  enrolled: number;
  nextAssessment: string;
  materials: number;
  assessments: number;
}

export interface StudentScheduleEvent {
  id: string;
  title: string;
  type: string;
  start_at: string;
  end_at?: string;
  description?: string;
  location?: string;
  color_hint?: string;
  course_code?: string;
  course_name?: string;
  duration_minutes?: number;
}

export interface StudentScheduleResponse {
  events: StudentScheduleEvent[];
}

export const studentApi = {
  getDashboard: async (): Promise<StudentDashboardResponse> => {
    return apiClient("/students/me/dashboard");
  },
  getSchedule: async (): Promise<StudentScheduleResponse> => {
    return apiClient("/students/me/schedule");
  },
  getCourses: async (): Promise<AdminCourseListItem[]> => {
    return apiClient("/students/me/courses");
  },
  getCourseDetail: async (courseId: string): Promise<StudentCourseDetail> => {
    return apiClient("/students/me/courses/" + courseId);
  },
};
