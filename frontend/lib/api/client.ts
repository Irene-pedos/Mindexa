// frontend/lib/api/client.ts

/**
 * Builds a clean query string from an object, skipping undefined, null, and empty string values.
 * Returns the query string prefixed with '?' or an empty string if there are no params.
 */
export function buildQueryString(params?: Record<string, unknown> | null): string {
  if (!params) return "";
  const searchParams = new URLSearchParams();
  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined && val !== null && val !== "") {
      searchParams.append(key, String(val));
    }
  }
  const qs = searchParams.toString();
  return qs ? `?${qs}` : "";
}

export function resolveApiUrl() {
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
 * Syncs the access token in memory.
 */
export function setAccessToken(token: string | null) {
  // Normalize token values
  const validToken =
    token && token !== "null" && token !== "undefined" ? token : null;

  accessToken = validToken;

  if (typeof window !== "undefined") {
    // Clean up any legacy tokens stored in localStorage
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
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

interface RefreshOptions {
  silent?: boolean;
}

export async function refreshToken(options: RefreshOptions = {}) {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      if (typeof window === "undefined") {
        throw new Error("Cannot refresh token on server-side");
      }

      const apiUrl = resolveApiUrl();
      const res = await fetch(`${apiUrl}/auth/refresh`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        if (!options.silent) {
          console.error(
            "[apiClient] Refresh failed with status:",
            res.status,
            errorData,
          );
        }
        throw new Error(errorData.message || "Refresh failed");
      }

      const data = await res.json();
      setAccessToken(data.access_token);
      return data.access_token;
    } catch (error) {
      setAccessToken(null);
      if (typeof window !== "undefined") {
        localStorage.removeItem("user");
        localStorage.removeItem("accessToken");
        localStorage.removeItem("refreshToken");
        if (!options.silent) {
          notifySessionInvalidated();
        }
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
  /** How to read a successful response. Defaults to JSON; use "blob" for file downloads. */
  responseType?: "json" | "blob";
}

/**
 * Helper to get current token from memory or storage.
 */
export const getToken = () => {
  return accessToken;
};

export async function apiClient(endpoint: string, options: FetchOptions = {}) {
  const { requireAuth = true, responseType = "json", headers, ...customConfig } = options;
  const readBody = (res: Response) => (responseType === "blob" ? res.blob() : res.json());

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

  const currentToken = getToken();

  if (requireAuth && currentToken) {
    config.headers = {
      ...config.headers,
      Authorization: `Bearer ${currentToken}`,
    };
  }

  const apiUrl = resolveApiUrl();
  let response;
  try {
    response = await fetch(`${apiUrl}${endpoint}`, config);
  } catch (fetchError) {
    console.error(`[apiClient] Network error at ${endpoint} via ${apiUrl}:`, fetchError);
    const err = new Error(
      `Could not reach the API at ${apiUrl}. Make sure the backend is running and NEXT_PUBLIC_API_URL is correct.`,
    );
    (err as any).status = 503;
    throw err;
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
        return readBody(response);
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
        if (response.ok) return readBody(response);
      }

      // Notify about session expiration
      notifySessionInvalidated();
      throw new Error("Session expired. Please log in again.");
    }
  }

  if (!response.ok) {
    // If we still have a 401 and it's a required auth request, 
    // it means the refresh flow failed or didn't happen correctly.
    if (response.status === 401 && requireAuth) {
      notifySessionInvalidated();
    }

    let errorData;
    try {
      errorData = await response.json();
    } catch {
      errorData = { message: response.statusText };
    }

    const errorCode: string | undefined = errorData?.error?.code || errorData?.code;

    // Rate limiting carries `details: { limit, tier, retry_after_seconds }`, which are not field errors.
    // The daily AI budget is a 429 too, but "slow down" would be wrong: its message says when it resets.
    if (response.status === 429 && errorCode !== "ai_daily_budget_exceeded") {
      const retryAfter = Number(
        errorData?.error?.details?.retry_after_seconds ??
          errorData?.details?.retry_after_seconds ??
          response.headers.get("Retry-After"),
      );
      const wait =
        Number.isFinite(retryAfter) && retryAfter > 0
          ? ` Try again in ${retryAfter >= 90 ? `${Math.ceil(retryAfter / 60)} minutes` : `${Math.ceil(retryAfter)} seconds`}.`
          : " Please wait a moment and try again.";
      const err = new Error(`You're sending requests too quickly.${wait}`);
      (err as any).status = 429;
      (err as any).code = errorCode;
      throw err;
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
      const err = new Error(`Validation failed: ${fieldErrors}`);
      (err as any).status = response.status;
      throw err;
    }

    const errorMessage =
      errorData?.error?.message ||
      errorData?.message ||
      errorData?.detail ||
      "An error occurred";

    let msgStr =
      typeof errorMessage === "string"
        ? errorMessage
        : JSON.stringify(errorMessage);

    const lowerMsg = msgStr.toLowerCase();
    if (
      lowerMsg.includes("getaddrinfo failed") ||
      lowerMsg.includes("errno 11001") ||
      lowerMsg.includes("connecterror") ||
      lowerMsg.includes("enotfound") ||
      lowerMsg.includes("econnrefused") ||
      lowerMsg.includes("nameorpolicynotknown") ||
      lowerMsg.includes("socket.gaierror")
    ) {
      msgStr =
        "Network problem: Unable to connect to AI services. Please check your internet connection and try again.";
    }

    const err = new Error(msgStr);
    (err as any).status = response.status;
    (err as any).code = errorCode;
    throw err;
  }

  if (response.status === 204) return null;
  return readBody(response);
}
