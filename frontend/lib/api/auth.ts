// frontend/lib/api/auth.ts
import { apiClient, setAccessToken } from "./client";

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface SignupData {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  role?: string;
  phone_number?: string;
  reg_number?: string;
  staff_id?: string;
  college?: string;
  department?: string;
  option?: string;
  level?: string;
  year?: string;
  institution_ids?: string[];
  department_ids?: string[];
  option_ids?: string[];
}

export interface ForgotPasswordData {
  email: string;
}

export interface ResetPasswordData {
  token: string;
  new_password: string;
  confirm_password: string;
}

export const authApi = {
  login: async (credentials: LoginCredentials) => {
    const data = await apiClient("/auth/login", {
      method: "POST",
      body: JSON.stringify(credentials),
      requireAuth: false,
    });
    
    if (data.access_token) {
      // Sync memory and localStorage via client.ts helper
      setAccessToken(data.access_token);
      
      if (typeof window !== "undefined") {
        localStorage.setItem("user", JSON.stringify(data.user));
        localStorage.setItem("refreshToken", data.refresh_token);
      }
    }
    return data;
  },

  signup: async (data: SignupData) => {
    const response = await apiClient("/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
      requireAuth: false,
    });
    return response;
  },

  logout: async () => {
    try {
      await apiClient("/auth/logout", { method: "POST" });
    } catch (error) {
      // Ignore logout errors
    } finally {
      setAccessToken(null);
      if (typeof window !== "undefined") {
        localStorage.removeItem("user");
        localStorage.removeItem("refreshToken");
      }
    }
  },

  getCurrentUser: async () => {
    return apiClient("/auth/me");
  },

  getUsers: async (params?: { role?: string; status?: string; page?: number; page_size?: number }) => {
    const query = new URLSearchParams();
    if (params?.role) query.append("role", params.role);
    if (params?.status) query.append("status", params.status);
    if (params?.page) query.append("page", params.page.toString());
    if (params?.page_size) query.append("page_size", params.page_size.toString());
    return apiClient(`/admin/users?${query.toString()}`);
  },

  forgotPassword: async (data: ForgotPasswordData) => {
    return apiClient("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify(data),
      requireAuth: false,
    });
  },

  resetPassword: async (data: ResetPasswordData) => {
    return apiClient("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify(data),
      requireAuth: false,
    });
  },

  verifyEmail: async (token: string) => {
    return apiClient(`/auth/verify-email?token=${token}`, {
      method: "GET",
      requireAuth: false,
    });
  },

  resendVerification: async (email: string) => {
    return apiClient("/auth/resend-verification", {
      method: "POST",
      body: JSON.stringify({ email }),
      requireAuth: false,
    });
  },

  updateProfile: async (data: any) => {
    return apiClient("/auth/me", {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  completeStudentOnboarding: async (data: {
    institution_id: string;
    campus_id?: string;
    college_id?: string;
    department_id: string;
    option_id: string;
    level: string;
    year: string;
    class_section_id?: string;
  }) => {
    return apiClient("/auth/me/onboarding/student", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  completeLecturerOnboarding: async (data: {
    bio?: string;
    profile_picture_url?: string;
    phone_number?: string;
  }) => {
    return apiClient("/auth/me/onboarding/lecturer", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  uploadAvatar: async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);

    // apiClient handles JSON by default, for FormData we need to be careful
    // If apiClient is a wrapper around fetch, we might need to adjust it
    return apiClient("/auth/me/avatar", {
      method: "POST",
      body: formData,
      // Do not set Content-Type header, browser will set it with boundary
    });
  },
};
