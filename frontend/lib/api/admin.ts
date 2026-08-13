// frontend/lib/api/admin.ts
import { apiClient } from "./client";

export interface AdminDashboardSummary {
  total_students: number;
  total_lecturers: number;
  active_courses: number;
  flagged_events_today: number;
  system_status: string;
}

export interface AdminRecentActivity {
  action: string;
  details: string;
  time: string;
}

export interface AdminChartDataPoint {
  date: string;
  submissions: number;
  alerts: number;
}

export interface AdminDashboardResponse {
  summary: AdminDashboardSummary;
  recent_activity: AdminRecentActivity[];
  chart_data: AdminChartDataPoint[];
}

export interface UserProfileResponse {
  user_id: string;
  first_name: string;
  last_name: string;
  display_name?: string;
  bio?: string;
  phone_number?: string;
  avatar_url?: string;
  student_id?: string;
  staff_id?: string;
  college?: string;
  department?: string;
  option?: string;
  level?: string;
  year?: string;
  assigned_courses?: string[];
  simple_mode_enabled?: boolean;
  extra_time_percent?: number;
  requires_screen_reader_mode?: boolean;
  large_text_default?: boolean;
  reduced_motion_default?: boolean;
  accommodations_note?: string;
  updated_at?: string;
}

export interface AdminAccommodationsUpdate {
  extra_time_percent?: number;
  requires_screen_reader_mode?: boolean;
  large_text_default?: boolean;
  simple_mode_enabled?: boolean;
  reduced_motion_default?: boolean;
  reason: string;
}

export interface UserResponse {
  id: string;
  email: string;
  role: string;
  status: string;
  email_verified: boolean;
  email_verified_at?: string;
  last_login_at?: string;
  profile?: UserProfileResponse;
  created_at: string;
  updated_at: string;
}

export interface AdminUserListResponse {
  items: UserResponse[];
  total: number;
}

export interface AdminCourseListItem {
  id: string;
  code: string;
  title: string;
  lecturer_name: string;
  student_count: number;
  status: string;
  academic_year?: string;
}

export interface AdminCourseListResponse {
  items: AdminCourseListItem[];
  total: number;
}

export interface AdminAnalyticsMetric {
  label: string;
  value: string | number;
  trend?: string;
  trend_direction?: "up" | "down";
}

export interface AdminAnalyticsResponse {
  summary: AdminAnalyticsMetric[];
  user_distribution: { name: string; value: number }[];
  activity_data: any[];
  assessment_trends: { date: string; count: number }[];
  integrity_hotspots: { course: string; flags: number }[];
  ai_grading_stats?: any[];
  key_insights: string[];
}

export interface AdminIntegrityOverview {
  total_flagged_today: number;
  high_severity_today: number;
  active_sessions: number;
  recent_flags: any[];
}

export interface SystemSettings {
  platform_name: string;
  timezone: string;
  maintenance_mode: boolean;
  enforce_fullscreen: boolean;
  ai_assistance_default: boolean;
  auto_flag_threshold: string;
  default_duration: number;
}

export interface AdminUserStatusUpdate {
  status: string;
}

export interface AdminUserCreate {
  email: string;
  password?: string;
  first_name: string;
  last_name: string;
  role: string;
  status?: string;
  email_verified?: boolean;
  staff_id?: string;
  student_id?: string;
  college?: string;
  department?: string;
}

export interface AdminCourseCreate {
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
  primary_lecturer_id?: string;
}

export interface AdminInstitutionSummary {
  active_partners: number;
  total_capacity: number;
  integrations_count: number;
  suspended_partners: number;
}

export const adminApi = {
  getDashboard: async (): Promise<AdminDashboardResponse> => {
    return apiClient("/admin/dashboard");
  },
  getAnalytics: async (): Promise<AdminAnalyticsResponse> => {
    return apiClient("/admin/analytics");
  },
  getInstitutionSummary: async (): Promise<AdminInstitutionSummary> => {
    return apiClient("/admin/institutions/summary");
  },
  getIntegrityOverview: async (): Promise<AdminIntegrityOverview> => {
    return apiClient("/admin/integrity-overview");
  },
  getSystemSettings: async (): Promise<SystemSettings> => {
    return apiClient("/admin/settings");
  },
  updateSystemSettings: async (data: SystemSettings): Promise<SystemSettings> => {
    return apiClient("/admin/settings", {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  getUsers: async (page = 1, pageSize = 20): Promise<AdminUserListResponse> => {
    return apiClient(`/admin/users?page=${page}&page_size=${pageSize}`);
  },
  createUser: async (data: AdminUserCreate): Promise<UserResponse> => {
    return apiClient("/admin/users", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  getLecturers: async (): Promise<UserResponse[]> => {
    return apiClient("/admin/lecturers");
  },
  getCourses: async (page = 1, pageSize = 20): Promise<AdminCourseListResponse> => {
    return apiClient(`/admin/courses?page=${page}&page_size=${pageSize}`);
  },
  getCourse: async (id: string): Promise<any> => {
    return apiClient(`/admin/courses/${id}`);
  },
  createCourse: async (data: AdminCourseCreate): Promise<any> => {
    return apiClient("/admin/courses", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  updateCourse: async (id: string, data: any): Promise<any> => {
    return apiClient(`/admin/courses/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  deleteCourse: async (courseId: string): Promise<any> => {
    return apiClient(`/admin/courses/${courseId}`, {
      method: "DELETE",
    });
  },
  approveUser: async (user_id: string, status: string): Promise<UserResponse> => {
    return apiClient(`/admin/users/${user_id}/approve`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
  },
  updateUserStatus: async (user_id: string, status: string): Promise<UserResponse> => {
    return apiClient(`/admin/users/${user_id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
  },
  assignLecturerCourses: async (user_id: string, course_ids: string[]): Promise<UserResponse> => {
    return apiClient(`/admin/users/${user_id}/courses`, {
      method: "POST",
      body: JSON.stringify({ course_ids }),
    });
  },
  bulkApproveUsers: async (user_ids: string[], status = "ACTIVE"): Promise<{ message: string; count: number }> => {
    return apiClient("/admin/users/bulk-approve", {
      method: "PATCH",
      body: JSON.stringify({ user_ids, status }),
    });
  },
  bulkUpdateUserStatus: async (user_ids: string[], status: string): Promise<{ message: string; count: number }> => {
    return apiClient("/admin/users/bulk-status", {
      method: "PATCH",
      body: JSON.stringify({ user_ids, status }),
    });
  },

  // Institution Management
  getInstitutions: async (): Promise<any[]> => {
    return apiClient("/admin/institutions");
  },
  createInstitution: async (data: any): Promise<any> => {
    return apiClient("/admin/institutions", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  updateInstitution: async (id: string, data: any): Promise<any> => {
    return apiClient(`/admin/institutions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  updateAccommodations: async (
    userId: string,
    data: AdminAccommodationsUpdate
  ): Promise<UserResponse> => {
    return apiClient(`/admin/users/${userId}/accommodations`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
};
