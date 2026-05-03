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
  profile_picture_url?: string;
  student_id?: string;
  staff_id?: string;
  college?: string;
  department?: string;
  option?: string;
  level?: string;
  year?: string;
  assigned_courses?: string[];
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
  assessment_trends: { date: string; count: number }[];
  integrity_hotspots: { course: string; flags: number }[];
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

export const adminApi = {
  getDashboard: async (): Promise<AdminDashboardResponse> => {
    return apiClient("/admin/dashboard");
  },
  getAnalytics: async (): Promise<AdminAnalyticsResponse> => {
    return apiClient("/admin/analytics");
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
  getCourses: async (page = 1, pageSize = 20): Promise<AdminCourseListResponse> => {
    return apiClient(`/admin/courses?page=${page}&page_size=${pageSize}`);
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
};
