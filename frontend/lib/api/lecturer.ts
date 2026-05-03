// frontend/lib/api/lecturer.ts
import { apiClient } from "./client";

export interface LecturerDashboardSummary {
  active_classes_count: number;
  upcoming_assessments_count: number;
  pending_grading_count: number;
  flagged_events_count: number;
}

export interface LecturerPendingItem {
  id: string;
  assessment_id: string;
  assessment_title: string;
  type: string;
  count: number;
  urgency: "high" | "medium" | "low";
}

export interface LecturerRecentSubmission {
  student_name: string;
  assessment_title: string;
  submitted_at: string;
  status: string;
}

export interface LecturerChartDataPoint {
  date: string;
  manual: number;
  ai: number;
}

export interface LecturerDashboardResponse {
  summary: LecturerDashboardSummary;
  pending_queue: LecturerPendingItem[];
  recent_submissions: LecturerRecentSubmission[];
  chart_data: LecturerChartDataPoint[];
}

export interface AdminCourseListItem {
  id: string;
  code: string;
  title: string;
  lecturer_name: string;
  student_count: number;
  status: string;
}

export interface AdminCourseListResponse {
  items: AdminCourseListItem[];
  total: number;
}

export interface LecturerCourseRosterItem {
  id: string;
  student_id: string;
  name: string;
  email: string;
  progress: number;
  last_submission: string | null;
}

export interface LecturerCourseDetail {
  id: string;
  code: string;
  title: string;
  student_count: number;
  performance_avg: number;
  roster: LecturerCourseRosterItem[];
}

export interface InstitutionResponse {
  id: string;
  name: string;
  code: string;
}

export interface AcademicPeriodResponse {
  id: string;
  name: string;
  period_type: string;
}

export interface CourseCreateRequest {
  institution_id: string;
  department_id?: string;
  academic_period_id: string;
  code: string;
  title: string;
  description?: string;
  credit_hours?: number;
}

export interface StudentRecordAttempt {
  id: string;
  assessment_title: string;
  status: string;
  submitted_at: string | null;
  score: number | null;
  max_score: number | null;
  percentage: number | null;
}

export interface StudentCourseRecordResponse {
  student_name: string;
  student_id: string;
  email: string;
  enrolled_at: string;
  overall_progress: number;
  attempts: StudentRecordAttempt[];
}

export const lecturerApi = {
  getDashboard: async (): Promise<LecturerDashboardResponse> => {
    return apiClient("/lecturers/me/dashboard");
  },
  getCourses: async (
    page = 1,
    pageSize = 20,
  ): Promise<AdminCourseListResponse> => {
    return apiClient(`/lecturers/me/courses?page=${page}&page_size=${pageSize}`);
  },
  getCourseDetail: async (courseId: string): Promise<LecturerCourseDetail> => {
    return apiClient(`/lecturers/me/courses/${courseId}`);
  },
  createCourse: async (data: CourseCreateRequest): Promise<any> => {
    return apiClient("/lecturers/me/courses", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  enrollStudent: async (courseId: string, email: string): Promise<any> => {
    return apiClient(`/lecturers/me/courses/${courseId}/students`, {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  },
  getStudentRecord: async (
    courseId: string,
    studentId: string,
  ): Promise<StudentCourseRecordResponse> => {
    return apiClient(
      `/lecturers/me/courses/${courseId}/students/${studentId}/record`,
    );
  },
  getInstitutions: async (): Promise<InstitutionResponse[]> => {
    return apiClient("/lecturers/institutions");
  },
  getPeriods: async (): Promise<AcademicPeriodResponse[]> => {
    return apiClient("/lecturers/academic-periods");
  },
};
