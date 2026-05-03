// frontend/components/providers/auth-provider.tsx
"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { authApi } from "@/lib/api/auth";
import { useRouter } from "next/navigation";
import { setAccessToken } from "@/lib/api/client";

type AuthUser = {
  id: string;
  email: string;
  role: string;
  profile?: {
    first_name?: string | null;
    last_name?: string | null;
    display_name?: string | null;
    profile_picture_url?: string | null;
    student_id?: string | null;
    staff_id?: string | null;
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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(false);
  // isInitializing stays true until the first localStorage read is done
  const [isInitializing, setIsInitializing] = useState(true);
  const router = useRouter();

  const clearSession = useCallback(() => {
    setUser(null);
    setAccessToken(null);
    if (typeof window !== "undefined") {
      localStorage.removeItem("user");
      localStorage.removeItem("accessToken");
      localStorage.removeItem("refreshToken");
    }
  }, []);

  const checkAuth = useCallback(async () => {
    if (typeof window === "undefined") return;

    const storedUser = localStorage.getItem("user");
    const storedToken = localStorage.getItem("accessToken");
    const storedRefreshToken = localStorage.getItem("refreshToken");

    if (
      storedToken &&
      storedToken !== "null" &&
      storedToken !== "undefined" &&
      storedRefreshToken &&
      storedRefreshToken !== "null" &&
      storedRefreshToken !== "undefined"
    ) {
      try {
        setAccessToken(storedToken);

        // Validate the current session before treating the user as authenticated.
        const currentUser = await authApi.getCurrentUser();
        const serializedCurrentUser = JSON.stringify(currentUser);
        const serializedStoredUser = storedUser ?? "";

        setUser((prevUser) => {
          if (JSON.stringify(prevUser) === serializedCurrentUser) {
            return prevUser;
          }
          console.log("[AuthProvider] Auth verified for:", currentUser.email);
          return currentUser;
        });

        if (serializedStoredUser !== serializedCurrentUser) {
          localStorage.setItem("user", serializedCurrentUser);
        }
      } catch (err) {
        console.error("[AuthProvider] Failed to validate stored session!", err);
        clearSession();
      }
    } else {
      clearSession();
    }
    setIsInitializing(false);
  }, [clearSession]);

  useEffect(() => {
    // Initial check on mount
    checkAuth();

    // Add event listener for cross-tab logout/login
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "accessToken" || e.key === "user") {
        if (!e.newValue) {
          // Token or user removed in another tab -> logout
          clearSession();
          router.push("/login");
        } else {
          // Sync from other tab
          void checkAuth();
        }
      }
    };

    window.addEventListener("storage", handleStorageChange);

    // Listen for internal session invalidation from apiClient
    const handleSessionInvalidated = () => {
      console.warn("[AuthProvider] Session invalidated event received.");
      clearSession();
      setIsInitializing(false);
      setLoading(false);
      // No automatic redirect here, let the layout guards handle it
    };

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
  }, [checkAuth, clearSession, router]);

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
      clearSession();
      router.replace("/login");
      setLoading(false);
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
