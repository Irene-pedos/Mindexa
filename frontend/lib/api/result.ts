// frontend/lib/api/result.ts
import { apiClient } from "./client";

export const resultApi = {
  getResultByAttempt: (attemptId: string) => apiClient(`/results/attempt/${attemptId}`),
  getStudentResults: () => apiClient("/results/me"),
  getAssessmentResults: (assessmentId: string, params: Record<string, any> = {}) => {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) searchParams.append(key, value.toString());
    });
    return apiClient(`/results/assessment/${assessmentId}?${searchParams.toString()}`);
  },
  releaseResults: (assessmentId: string, attemptIds?: string[]) => apiClient(`/results/release`, {
    method: "POST",
    body: JSON.stringify({ assessment_id: assessmentId, attempt_ids: attemptIds })
  }),
  clearHold: (resultId: string, reason: string) => apiClient(`/results/${resultId}/clear-hold`, {
    method: "POST",
    body: JSON.stringify({ justification: reason })
  }),
};
