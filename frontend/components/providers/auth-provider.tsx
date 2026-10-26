// frontend/components/providers/auth-provider.tsx
"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { useRouter } from "next/navigation";
import { authApi } from "@/lib/api/auth";
import { getToken, refreshToken, setAccessToken } from "@/lib/api/client";
import { toast } from "sonner";

import { clearAiLocalData } from "@/lib/ai-local-data";
import { clearResumePoint, scopedStorage } from "@/lib/grading-session";
export type AuthUser = {
  id: string;
  email: string;
  role: string;
  duties?: string[];
  has_teaching_assignments?: boolean | null;
  onboarding_completed: boolean;
  onboarding_tour_completed?: boolean;
  onboarding_tour_step?: number;
  onboarding_tour_variant?: string | null;
  profile?: {
    first_name?: string | null;
    last_name?: string | null;
    display_name?: string | null;
    avatar_url?: string | null;
    student_id?: string | null;
    staff_id?: string | null;
    phone_number?: string | null;
    institution_id?: string | null;
    department_id?: string | null;
    option_id?: string | null;
    class_section_id?: string | null;
    college?: string | null;
    department?: string | null;
    option?: string | null;
    level?: string | null;
    year?: string | null;
    simple_mode_enabled?: boolean;
    extra_time_percent?: number;
    requires_screen_reader_mode?: boolean;
    large_text_default?: boolean;
    reduced_motion_default?: boolean;
  } | null;
};

type LoginCredentials = {
  email: string;
  password: string;
};

interface AuthContextType {
  user: AuthUser | null;
  isAuthenticated: boolean;
  loading: boolean;
  isInitializing: boolean;
  login: (credentials: LoginCredentials) => Promise<{
    user: AuthUser;
    access_token: string;
    refresh_token: string;
  }>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  updateTourProgress: (step: number, completed?: boolean, variant?: string) => Promise<void>;
  setUser: React.Dispatch<React.SetStateAction<AuthUser | null>>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(false);
  // isInitializing stays true until the first localStorage read is done
  const [isInitializing, setIsInitializing] = useState(true);
  const router = useRouter();
  const [sessionExpiredToastShown, setSessionExpiredToastShown] = useState(false);

  const clearSession = useCallback(() => {
    setUser(null);
    setAccessToken(null);
    if (typeof window !== "undefined") {
      localStorage.removeItem("user");
      localStorage.removeItem("accessToken");
      localStorage.removeItem("refreshToken");
      try {
        clearAiLocalData(localStorage);
      } catch {
        // storage unavailable
      }
    }
  }, []);

  const checkAuth = useCallback(async () => {
    if (typeof window === "undefined") return;

    try {
      let token = getToken();
      if (!token) {
        // Silently attempt token refresh using HttpOnly cookie
        token = await refreshToken({ silent: true }).catch(() => null);
      }

      if (token) {
        // Validate the current session before treating the user as authenticated.
        const currentUser = await authApi.getCurrentUser();
        const serializedCurrentUser = JSON.stringify(currentUser);
        const storedUser = localStorage.getItem("user");

        setUser((prevUser) => {
          if (JSON.stringify(prevUser) === serializedCurrentUser) {
            return prevUser;
          }
          return currentUser;
        });

        if (storedUser !== serializedCurrentUser) {
          localStorage.setItem("user", serializedCurrentUser);
        }
      } else {
        clearSession();
      }
    } catch (err) {
      console.error("[AuthProvider] Failed to validate session:", err);
      const status = (err as { status?: number } | null)?.status;
      if (status === 401 || status === 403) {
        clearSession();
      } else {
        // A rate limit (429), a server hiccup or a dropped connection says nothing about whether
        // the session is valid. Keep the user signed in with the last known profile; the next
        // request that really gets a 401 will end the session.
        try {
          const cached = localStorage.getItem("user");
          if (cached) setUser((prev) => prev ?? (JSON.parse(cached) as AuthUser));
          else clearSession();
        } catch {
          clearSession();
        }
      }
    } finally {
      setIsInitializing(false);
    }
  }, [clearSession]);

  const handleSessionInvalidated = useCallback(() => {
    console.warn("[AuthProvider] Session invalidated event received.");
    clearSession();
    setIsInitializing(false);
    setLoading(false);

    if (!sessionExpiredToastShown) {
      toast.error("Your session has expired", {
        description: "Please log in again to continue.",
        id: "session-expired",
      });
      setSessionExpiredToastShown(true);
      // Reset after 5 seconds to allow showing it again if it happens later
      setTimeout(() => setSessionExpiredToastShown(false), 5000);
    }
    
    // Proactively redirect to login if we are on a protected route.
    // RoleGuard also handles this, but a direct redirect here is more robust
    // especially when multiple API calls fail simultaneously.
    if (typeof window !== "undefined") {
      const publicRoutes = ["/", "/login", "/signup", "/forgot-password", "/reset-password"];
      const isPublic = publicRoutes.some(route => 
        window.location.pathname === route || window.location.pathname.startsWith(route + "/")
      );
      
      if (!isPublic) {
        router.replace("/login");
      }
    }
  }, [clearSession, router, sessionExpiredToastShown]);

  useEffect(() => {
    // Initial check on mount
    checkAuth();

    // Add event listener for cross-tab logout/login
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "user") {
        if (!e.newValue) {
          // User removed in another tab -> logout
          clearSession();
          router.push("/login");
        } else {
          // Sync from other tab
          void checkAuth();
        }
      }
    };

    window.addEventListener("storage", handleStorageChange);

    window.addEventListener(
      "mindexa-session-invalidated",
      handleSessionInvalidated,
    );

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener(
        "mindexa-session-invalidated",
        handleSessionInvalidated,
      );
    };
  }, [checkAuth, clearSession, router, handleSessionInvalidated]);

  const login = async (credentials: LoginCredentials) => {
    setLoading(true);
    try {
      const data = await authApi.login(credentials);
      // authApi.login already saved tokens to localStorage.
      // Set user in state so layouts see it immediately on redirect.
      setUser(data.user);
      return data;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    setLoading(true);
    try {
      await authApi.logout();
    } finally {
      // The "continue where you left off" hint is personal; don't leave it behind on a
      // shared machine. Unsynced grading drafts are kept (scoped to this user) so a
      // lecturer who signs back in can still recover them.
      if (user?.id && typeof window !== "undefined") {
        try {
          clearResumePoint(scopedStorage(window.localStorage, user.id));
        } catch {
          // storage unavailable
        }
      }
      clearSession();
      router.replace("/login");
      setLoading(false);
    }
  };

  const updateTourProgress = async (step: number, completed: boolean = false, variant?: string) => {
    try {
      const updatedUser = await authApi.updateTourProgress({
        step,
        completed,
        variant: variant || user?.role?.toLowerCase(),
      });
      setUser((prev) => {
        const next = { ...prev, ...updatedUser };
        if (typeof window !== "undefined") {
          localStorage.setItem("user", JSON.stringify(next));
        }
        return next;
      });
    } catch (err) {
      console.error("[AuthProvider] Failed to update tour progress", err);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        loading,
        isInitializing,
        login,
        logout,
        checkAuth,
        updateTourProgress,
        setUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuthContext must be used within an AuthProvider");
  }
  return context;
}
