// frontend/lib/api/client.ts

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

// Simple token storage. In a real production app, you might want to use cookies or an HttpOnly approach
// However, the backend sets the refresh token as an HttpOnly cookie and also returns it in JSON.
// We'll store access token in memory or localStorage.
export let accessToken: string | null = null;

if (typeof window !== "undefined") {
  accessToken = localStorage.getItem("accessToken");
}

export function setAccessToken(token: string | null) {
  accessToken = token;
  if (token) {
    if (typeof window !== "undefined") localStorage.setItem("accessToken", token);
  } else {
    if (typeof window !== "undefined") localStorage.removeItem("accessToken");
  }
}

export async function refreshToken() {
  try {
    const storedRefreshToken = localStorage.getItem("refreshToken") || "";
    
    // The backend uses the HttpOnly cookie OR body refresh token.
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include", // Send HttpOnly cookie
      body: JSON.stringify({ refresh_token: storedRefreshToken }),
    });

    if (!res.ok) throw new Error("Refresh failed");
    
    const data = await res.json();
    setAccessToken(data.access_token);
    if (data.refresh_token) {
       localStorage.setItem("refreshToken", data.refresh_token);
    }
    return data.access_token;
  } catch (error) {
    setAccessToken(null);
    localStorage.removeItem("refreshToken");
    throw error;
  }
}

interface FetchOptions extends RequestInit {
  requireAuth?: boolean;
}

export async function apiClient(endpoint: string, options: FetchOptions = {}) {
  const { requireAuth = true, headers, ...customConfig } = options;

  const config: RequestInit = {
    ...customConfig,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    credentials: "include", // Always include cookies for refresh
  };

  if (requireAuth && accessToken) {
    config.headers = {
      ...config.headers,
      Authorization: `Bearer ${accessToken}`,
    };
  }

  let response = await fetch(`${API_URL}${endpoint}`, config);

  // If 401 Unauthorized, attempt to refresh token
  if (response.status === 401 && requireAuth) {
    try {
      const newToken = await refreshToken();
      if (newToken) {
        // Retry original request with new token
        config.headers = {
          ...config.headers,
          Authorization: `Bearer ${newToken}`,
        };
        response = await fetch(`${API_URL}${endpoint}`, config);
      }
    } catch (refreshError) {
      // Refresh failed, logout user
      setAccessToken(null);
      if (typeof window !== "undefined") {
         localStorage.removeItem("user");
         localStorage.removeItem("accessToken");
         localStorage.removeItem("refreshToken");
      }
      throw new Error("Session expired. Please log in again.");
    }
  }

  // Parse JSON or throw error
  if (!response.ok) {
    let errorData;
    try {
      errorData = await response.json();
    } catch {
      errorData = { message: response.statusText };
    }
    const errorMessage = 
      errorData?.error?.message || 
      errorData?.message || 
      errorData?.detail || 
      "An error occurred";
    throw new Error(typeof errorMessage === 'string' ? errorMessage : JSON.stringify(errorMessage));
  }

  // If response is 204 No Content
  if (response.status === 204) return null;

  return response.json();
}
