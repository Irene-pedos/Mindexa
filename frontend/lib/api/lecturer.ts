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

export interface LecturerIntegrityAlert {
  id: string;
  student_name: string;
  student_id: string;
  assessment_title: string;
  event_type: string;
  created_at: string;
  risk_score: number;
  severity: "low" | "medium" | "high";
}

export interface LecturerDashboardResponse {
  summary: LecturerDashboardSummary;
  pending_queue: LecturerPendingItem[];
  recent_submissions: LecturerRecentSubmission[];
  chart_data: LecturerChartDataPoint[];
  recent_alerts: LecturerIntegrityAlert[];
}

export interface AdminCourseListItem {
  id: string;
  code: string;
  title: string;
  lecturer_name: string;
  student_count: number;
  status: string;
  performance_avg: number;
  academic_year: string;
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
  description?: string;
  student_count: number;
  performance_avg: number;
  institution_id: string;
  academic_year: string;
  roster: LecturerCourseRosterItem[];
  department_name?: string;
  option_name?: string;
  sections?: string[];
}

export interface LecturerMaterialResponse {
  id: string;
  lecturer_id: string;
  course_id: string | null;
  assessment_id: string | null;
  original_filename: string;
  display_name: string | null;
  description: string | null;
  file_size_bytes: number;
  file_extension: string;
  mime_type: string;
  material_category: string;
  is_student_visible: boolean;
  version: number;
  is_current: boolean;
  created_at: string;
}

export interface InstitutionResponse {
  id: string;
  name: string;
  code: string;
}

export interface DepartmentResponse {
  id: string;
  name: string;
  code: string;
}

export interface OptionResponse {
  id: string;
  name: string;
  code: string;
}

export interface ClassGroupResponse {
  id: string;
  name: string;
  code: string;
  level?: number;
}

export interface AcademicPeriodResponse {
  id: string;
  name: string;
  period_type: string;
}

export interface UserResponse {
  id: string;
  email: string;
  role: string;
  profile?: {
    first_name: string;
    last_name: string;
    display_name?: string;
    staff_id?: string;
  };
}

export interface CourseCreateRequest {
  institution_id: string;
  department_ids?: string[];
  option_ids?: string[];
  class_group_ids?: string[];
  academic_period_id?: string;
  academic_year: string;
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

export interface WorkspaceListItem {
  id: string;
  title: string;
  code: string;
  academic_year: string;
  student_count: number;
  status: string;
  performance_avg: number;
  lecturer_name: string;
  institution_name: string;
  class_name: string;
}

export interface WorkspaceDetail extends WorkspaceListItem {
  description?: string;
  department_name?: string;
  option_name?: string;
  sections?: string[];
  roster: LecturerCourseRosterItem[];
}

export interface WorkspaceCreateRequest {
  teaching_assignment_id: string;
  title?: string;
  description?: string;
}

export const lecturerApi = {
  getDashboard: async (): Promise<LecturerDashboardResponse> => {
    return apiClient("/lecturers/me/dashboard");
  },
  getWorkspaces: async (
    page = 1,
    pageSize = 20,
  ): Promise<WorkspaceListItem[]> => {
    return apiClient(`/lecturers/me/workspaces?page=${page}&page_size=${pageSize}`);
  },
  getWorkspaceDetail: async (workspaceId: string): Promise<WorkspaceDetail> => {
    return apiClient(`/lecturers/me/workspaces/${workspaceId}`);
  },
  initializeWorkspace: async (data: WorkspaceCreateRequest): Promise<WorkspaceDetail> => {
    return apiClient("/lecturers/me/workspaces/initialize", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  archiveWorkspace: async (workspaceId: string): Promise<any> => {
    return apiClient(`/lecturers/me/workspaces/${workspaceId}`, {
      method: "DELETE",
    });
  },
  enrollStudent: async (workspaceId: string, email: string): Promise<any> => {
    return apiClient(`/lecturers/me/workspaces/${workspaceId}/students`, {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  },
  getStudentRecord: async (
    workspaceId: string,
    studentId: string,
  ): Promise<StudentCourseRecordResponse> => {
    return apiClient(
      `/lecturers/me/workspaces/${workspaceId}/students/${studentId}/record`,
    );
  },
  getInstitutions: async (): Promise<InstitutionResponse[]> => {
    return apiClient("/lecturers/institutions");
  },
  getMyInstitutions: async (): Promise<InstitutionResponse[]> => {
    return apiClient("/lecturers/me/institutions");
  },
  getDepartments: async (institutionId: string): Promise<DepartmentResponse[]> => {
    return apiClient(`/lecturers/departments?institution_id=${institutionId}`);
  },
  getMyDepartments: async (institutionId: string): Promise<DepartmentResponse[]> => {
    return apiClient(`/lecturers/me/departments?institution_id=${institutionId}`);
  },
  getOptions: async (departmentId: string): Promise<OptionResponse[]> => {
    return apiClient(`/lecturers/options?department_id=${departmentId}`);
  },
  getMyOptions: async (departmentId: string): Promise<OptionResponse[]> => {
    return apiClient(`/lecturers/me/options?department_id=${departmentId}`);
  },
  getClasses: async (optionId: string): Promise<ClassGroupResponse[]> => {
    return apiClient(`/lecturers/classes?option_id=${optionId}`);
  },
  getMyClasses: async (optionId: string): Promise<ClassGroupResponse[]> => {
    return apiClient(`/lecturers/me/classes?option_id=${optionId}`);
  },
  getPeriods: async (): Promise<AcademicPeriodResponse[]> => {
    return apiClient("/lecturers/academic-periods");
  },
  getLecturers: async (): Promise<UserResponse[]> => {
    return apiClient("/lecturers");
  },

  // Resource / Materials
  uploadMaterial: async (formData: FormData): Promise<LecturerMaterialResponse> => {
    return apiClient("/resources/lecturer-materials", {
      method: "POST",
      body: formData,
    });
  },
  getWorkspaceMaterials: async (workspaceId: string): Promise<LecturerMaterialResponse[]> => {
    return apiClient(`/resources/workspaces/${workspaceId}/materials`);
  },
};
