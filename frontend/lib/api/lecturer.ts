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

export interface LecturerDashboardResponse {
  summary: LecturerDashboardSummary;
  pending_queue: LecturerPendingItem[];
  recent_submissions: LecturerRecentSubmission[];
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

export const lecturerApi = {
  getDashboard: async (): Promise<LecturerDashboardResponse> => {
    return apiClient("/lecturers/me/dashboard");
  },
  getCourses: async (page = 1, pageSize = 20): Promise<AdminCourseListResponse> => {
    return apiClient(`/lecturers/me/courses?page=${page}&page_size=${pageSize}`);
  },
};
