// frontend/lib/api/attempt.ts
import { apiClient } from "./client";

export const attemptApi = {
  startAttempt: (data: Record<string, unknown>) => apiClient(`/attempts/start`, { method: "POST", body: JSON.stringify(data) }),
  getAttempt: (attemptId: string) => apiClient(`/attempts/${attemptId}`),
  resumeAttempt: (attemptId: string) => apiClient(`/attempts/${attemptId}/resume`, { method: "POST" }),
  submitAttempt: (attemptId: string, accessToken: string) => apiClient(`/attempts/${attemptId}/submit`, { method: "POST", body: JSON.stringify({ access_token: accessToken, confirm: true }) }),
};
