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

export interface AdminDashboardResponse {
  summary: AdminDashboardSummary;
  recent_activity: AdminRecentActivity[];
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

export const adminApi = {
  getDashboard: async (): Promise<AdminDashboardResponse> => {
    return apiClient("/admin/dashboard");
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
