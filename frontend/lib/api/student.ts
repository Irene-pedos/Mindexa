// frontend/lib/api/student.ts
import { AdminCourseListItem } from "./admin";
import { apiClient, getToken, resolveApiUrl } from "./client";
import { LecturerMaterialResponse } from "./lecturer";

export interface DashboardMetric {
  value: number;
  delta: number;
  last_month: number;
  positive: boolean;
}

export interface StudentDashboardSummary {
  cgpa: DashboardMetric;
  active_assessments_count: DashboardMetric;
  completed_assessments_count: DashboardMetric;
  avg_performance_percent: DashboardMetric;
}

export interface StudentActiveAttempt {
  id: string;
  assessment_id: string;
  assessment_title: string;
  assessment_type?: string;
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
  academic_year?: string;
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
  academic_year: string;
  workspace_id: string;
}

export interface StudentDashboardResponse {
  summary: StudentDashboardSummary;
  active_attempts: StudentActiveAttempt[];
  recent_results: StudentRecentResult[];
  upcoming_assessments: StudentUpcomingAssessment[];
  performance_trend: PerformanceTrendItem[];
  workspaces: StudentCourseListItem[];
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
  academic_year: string;
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
  getWorkspaces: async (): Promise<StudentCourseListItem[]> => {
    return apiClient("/students/me/workspaces");
  },
  getWorkspaceDetail: async (workspaceId: string): Promise<StudentCourseDetail> => {
    return apiClient("/students/me/workspaces/" + workspaceId);
  },
  getWorkspaceMaterials: async (workspaceId: string): Promise<LecturerMaterialResponse[]> => {
    return apiClient(`/resources/workspaces/${workspaceId}/materials`);
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
  downloadPersonalResource: async (resourceId: string, filename: string): Promise<void> => {
    const apiUrl = resolveApiUrl();
    const token = getToken();
    if (!token) throw new Error("Authentication required");
    
    const response = await fetch(`${apiUrl}/resources/student-resources/download/${resourceId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error("Failed to download resource");
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
  getResourceBlob: async (resourceId: string, isPersonal: boolean = true): Promise<Blob> => {
    const apiUrl = resolveApiUrl();
    const token = getToken();
    if (!token) throw new Error("Authentication required");

    const endpoint = isPersonal 
      ? `/resources/student-resources/download/${resourceId}`
      : `/resources/download/${resourceId}`;
    
    const response = await fetch(`${apiUrl}${endpoint}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error("Failed to fetch resource content");
    }

    return response.blob();
  },
  downloadMaterial: async (materialId: string, filename: string): Promise<void> => {
    const apiUrl = resolveApiUrl();
    const token = getToken();
    if (!token) throw new Error("Authentication required");
    
    const response = await fetch(`${apiUrl}/resources/download/${materialId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      credentials: "include",
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
