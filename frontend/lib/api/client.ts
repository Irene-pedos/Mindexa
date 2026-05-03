// frontend/lib/api/client.ts

function resolveApiUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (configuredUrl) {
    const normalizedUrl = configuredUrl.replace(/\/$/, "");

    // In browser-based local development, prefer the Next.js same-origin proxy
    // instead of calling the backend directly. This avoids CORS errors from
    // bubbling through the whole app when the API returns non-2xx responses.
    if (
      typeof window !== "undefined" &&
      /^https?:\/\/(localhost|127\.0\.0\.1):8000(\/api\/v1)?$/i.test(normalizedUrl)
    ) {
      return "/api/v1";
    }

    return normalizedUrl;
  }

  // In browser-based local development, default to the same-origin proxy.
  if (typeof window !== "undefined") {
    return "/api/v1";
  }

  return "http://localhost:8000/api/v1";
}

// Simple token storage.
export let accessToken: string | null = null;

/**
 * Syncs the access token with memory and localStorage.
 */
export function setAccessToken(token: string | null) {
  // Normalize token values
  const validToken =
    token && token !== "null" && token !== "undefined" ? token : null;

  console.log(
    "[apiClient] setAccessToken:",
    validToken ? "(token present)" : "null",
  );
  accessToken = validToken;

  if (typeof window !== "undefined") {
    if (validToken) {
      localStorage.setItem("accessToken", validToken);
    } else {
      localStorage.removeItem("accessToken");
    }
  }
}

/**
 * Notifies the AuthProvider and other listeners that the session has been invalidated.
 */
function notifySessionInvalidated() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("mindexa-session-invalidated"));
  }
}

// Track active refresh promise to prevent multiple concurrent refreshes
let refreshPromise: Promise<string | null> | null = null;

export async function refreshToken() {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      if (typeof window === "undefined") {
        throw new Error("Cannot refresh token on server-side");
      }

      const storedRefreshToken = localStorage.getItem("refreshToken");
      console.log("[apiClient] refreshToken: retrieved from localStorage:", storedRefreshToken ? "(present)" : "null");

      if (
        !storedRefreshToken ||
        storedRefreshToken === "null" ||
        storedRefreshToken === "undefined"
      ) {
      console.warn(
          "[apiClient] No valid refresh token found in storage",
        );
        throw new Error("No refresh token available");
      }

      const apiUrl = resolveApiUrl();
      console.log("[apiClient] Attempting token refresh with:", storedRefreshToken.substring(0, 10) + "...");
      const res = await fetch(`${apiUrl}/auth/refresh`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ refresh_token: storedRefreshToken }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        console.error(
          "[apiClient] Refresh failed with status:",
          res.status,
          errorData,
        );
        throw new Error(errorData.message || "Refresh failed");
      }

      const data = await res.json();
      console.log("[apiClient] Refresh successful. New access token received.");

      setAccessToken(data.access_token);
      if (data.refresh_token && typeof window !== "undefined") {
        localStorage.setItem("refreshToken", data.refresh_token);
      }
      return data.access_token;
    } catch (error) {
      console.error("[apiClient] Refresh process encountered an error:", error);
      setAccessToken(null);
      if (typeof window !== "undefined") {
        localStorage.removeItem("user");
        localStorage.removeItem("accessToken");
        localStorage.removeItem("refreshToken");
        notifySessionInvalidated();
      }
      throw error;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

interface FetchOptions extends RequestInit {
  requireAuth?: boolean;
}

export async function apiClient(endpoint: string, options: FetchOptions = {}) {
  const { requireAuth = true, headers, ...customConfig } = options;

  const config: RequestInit = {
    ...customConfig,
    headers: {
      ...headers,
    },
    credentials: "include",
  };

  // Only set application/json if body is not FormData
  if (!(customConfig.body instanceof FormData)) {
    config.headers = {
      "Content-Type": "application/json",
      ...config.headers,
    };
  }

  // Helper to get current token from memory or storage
  const getToken = () => {
    // 1. Check memory first (fastest and most up-to-date in current session)
    if (accessToken) return accessToken;

    // 2. Fallback to localStorage if in browser
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("accessToken");
      if (token && token !== "null" && token !== "undefined") {
        return token;
      }
    }
    return null;
  };

  const currentToken = getToken();

  if (requireAuth && currentToken) {
    config.headers = {
      ...config.headers,
      Authorization: `Bearer ${currentToken}`,
    };
  }

  console.log(`[apiClient] ${config.method || "GET"} ${endpoint}`, {
    auth: !!(config.headers as any)?.["Authorization"],
    window: typeof window !== "undefined",
  });

  const apiUrl = resolveApiUrl();
  let response;
  try {
    response = await fetch(`${apiUrl}${endpoint}`, config);
  } catch (fetchError) {
    console.error(`[apiClient] Network error at ${endpoint} via ${apiUrl}:`, fetchError);
    throw new Error(
      `Could not reach the API at ${apiUrl}. Make sure the backend is running and NEXT_PUBLIC_API_URL is correct.`,
    );
  }

  if (response.status === 401) {
    const errorClone = response.clone();
    const errorText = await errorClone.text().catch(() => "no-body");
    console.warn(
      `[apiClient] 401 Unauthorized for ${endpoint}. Response:`,
      errorText,
    );
  }

  // If 401 Unauthorized, attempt to refresh token
  if (response.status === 401 && requireAuth) {
    console.warn(`[apiClient] Initiating refresh flow for ${endpoint}...`);

    // Check if another tab/process refreshed the token in the meantime
    const latestToken = getToken();
    if (
      latestToken &&
      latestToken !== currentToken &&
      latestToken !== "null" &&
      latestToken !== "undefined"
    ) {
      console.log(
          `[apiClient] Found newer token in storage, retrying ${endpoint}...`,
      );
      config.headers = {
        ...config.headers,
        Authorization: `Bearer ${latestToken}`,
      };
      response = await fetch(`${apiUrl}${endpoint}`, config);
      if (response.ok || response.status !== 401) {
        return response.json();
      }
    }

    try {
      // Small random delay to stagger concurrent refreshes across tabs
      await new Promise((r) => setTimeout(r, Math.random() * 200));

      const newToken = await refreshToken();
      if (newToken) {
        console.log(`[apiClient] Refresh successful, retrying ${endpoint}...`);
        // Retry original request with new token
        config.headers = {
          ...config.headers,
          Authorization: `Bearer ${newToken}`,
        };
        response = await fetch(`${apiUrl}${endpoint}`, config);
      }
    } catch (refreshError) {
      console.error(
        `[apiClient] Final refresh failure for ${endpoint}:`,
        refreshError,
      );
      const finalToken = getToken();
      if (
        finalToken &&
        finalToken !== latestToken &&
        finalToken !== "null" &&
        finalToken !== "undefined"
      ) {
        console.log(
          `[apiClient] Someone else refreshed during our failure, retrying ${endpoint}...`,
        );
        config.headers = {
          ...config.headers,
          Authorization: `Bearer ${finalToken}`,
        };
        response = await fetch(`${apiUrl}${endpoint}`, config);
        if (response.ok) return response.json();
      }

      // Notify about session expiration
      notifySessionInvalidated();
      throw new Error("Session expired. Please log in again.");
    }
  }

  if (!response.ok) {
    let errorData;
    try {
      errorData = await response.json();
    } catch {
      errorData = { message: response.statusText };
    }

    // Format Pydantic validation errors nicely
    const validationDetails = errorData?.error?.details || errorData?.details;
    if (
      validationDetails &&
      typeof validationDetails === "object" &&
      !Array.isArray(validationDetails)
    ) {
      const fieldErrors = Object.entries(validationDetails)
        .map(([field, msg]) => {
          return `${field}: ${msg}`;
        })
        .join(" | ");
      throw new Error(`Validation failed: ${fieldErrors}`);
    }

    const errorMessage =
      errorData?.error?.message ||
      errorData?.message ||
      errorData?.detail ||
      "An error occurred";
    throw new Error(
      typeof errorMessage === "string"
        ? errorMessage
        : JSON.stringify(errorMessage),
    );
  }

  if (response.status === 204) return null;
  return response.json();
}
