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
  reg_number?: string;
  college?: string;
  department?: string;
  option?: string;
  level?: string;
  year?: string;
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
      setAccessToken(data.access_token);
      if (typeof window !== "undefined") {
        localStorage.setItem("user", JSON.stringify(data.user));
        localStorage.setItem("accessToken", data.access_token);
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
        localStorage.removeItem("accessToken");
        localStorage.removeItem("refreshToken");
      }
    }
  },

  getCurrentUser: async () => {
    return apiClient("/auth/me");
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
};
