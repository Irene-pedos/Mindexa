// frontend/lib/api/student.ts
import { AdminCourseListItem } from "./admin";
import { apiClient, getToken } from "./client";
import { LecturerMaterialResponse } from "./lecturer";

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
  course_code?: string;
  course_name?: string;
  status: string;
  started_at: string;
  expires_at?: string;
}

export interface StudentRecentResult {
  id: string;
  assessment_title: string;
  assessment_type: string;
  course_code?: string;
  course_name?: string;
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
  course_code?: string;
  course_name?: string;
  window_start?: string;
  duration_minutes?: number;
  total_marks?: number;
}

export interface PerformanceTrendItem {
  month: string;
  score: number;
  average: number;
}

export interface StudentCourseListItem {
  id: string;
  code: string;
  title: string;
  lecturer_name: string;
  status: string;
  progress: number;
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

export interface StudentResourceResponse {
  id: string;
  original_filename: string;
  display_name: string | null;
  file_size_bytes: number;
  file_extension: string;
  mime_type: string;
  resource_category: string;
  subject_tag: string | null;
  processing_status: string;
  created_at: string;
}

export const studentApi = {
  getDashboard: async (): Promise<StudentDashboardResponse> => {
    return apiClient("/students/me/dashboard");
  },
  getSchedule: async (): Promise<StudentScheduleResponse> => {
    return apiClient("/students/me/schedule");
  },
  getCourses: async (): Promise<StudentCourseListItem[]> => {
    return apiClient("/students/me/courses");
  },
  getCourseDetail: async (courseId: string): Promise<StudentCourseDetail> => {
    return apiClient("/students/me/courses/" + courseId);
  },
  getCourseMaterials: async (courseId: string): Promise<LecturerMaterialResponse[]> => {
    return apiClient(`/resources/courses/${courseId}/materials`);
  },
  getResults: async (): Promise<StudentRecentResult[]> => {
    const data: StudentDashboardResponse = await apiClient("/students/me/dashboard");
    return data.recent_results;
  },
  getPersonalResources: async (): Promise<StudentResourceResponse[]> => {
    return apiClient("/resources/student-resources");
  },
  uploadPersonalResource: async (formData: FormData): Promise<StudentResourceResponse> => {
    return apiClient("/resources/student-resources", {
      method: "POST",
      body: formData,
    });
  },
  deletePersonalResource: async (resourceId: string): Promise<void> => {
    return apiClient(`/resources/student-resources/${resourceId}`, {
      method: "DELETE",
    });
  },
  downloadMaterial: async (materialId: string, filename: string): Promise<void> => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
    // We can't use apiClient easily for blobs because it expects JSON by default
    // Let's use fetch directly with the token
    const token = getToken();
    
    const response = await fetch(`${apiUrl}/resources/download/${materialId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error("Failed to download material");
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  },
};
