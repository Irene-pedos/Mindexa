// frontend/lib/api/result.ts
import { apiClient } from "./client";

export const resultApi = {
  getResultByAttempt: (attemptId: string) => apiClient(`/results/attempt/${attemptId}`),
  getReleaseQueue: (assessmentId: string, classSectionId: string) => 
    apiClient(`/results/assessment/${assessmentId}/release-queue?class_section_id=${classSectionId}`),
  getStudentResults: () => apiClient("/results/me"),
  getMyResults: (params: { page?: number; page_size?: number } = {}) => {
    const searchParams = new URLSearchParams();
    if (params.page !== undefined) searchParams.append("page", params.page.toString());
    if (params.page_size !== undefined) searchParams.append("page_size", params.page_size.toString());
    const qs = searchParams.toString();
    return apiClient(`/results/me${qs ? `?${qs}` : ""}`);
  },
  getAssessmentResults: (assessmentId: string, params: Record<string, any> = {}) => {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) searchParams.append(key, value.toString());
    });
    return apiClient(`/results/assessment/${assessmentId}?${searchParams.toString()}`);
  },
  releaseResults: (assessmentId: string, attemptIds?: string[], classSectionId?: string) => apiClient(`/results/release`, {
    method: "POST",
    body: JSON.stringify({ assessment_id: assessmentId, attempt_ids: attemptIds, class_section_id: classSectionId })
  }),
  clearHold: (resultId: string, reason: string) => apiClient(`/results/${resultId}/clear-hold`, {
    method: "POST",
    body: JSON.stringify({ justification: reason })
  }),
  updateReleasePolicy: (assessmentId: string, data: Record<string, unknown>) => 
    apiClient(`/results/assessment/${assessmentId}/release-policy`, {
      method: "PATCH",
      body: JSON.stringify(data)
    }),
  triggerImmediateRelease: (assessmentId: string) => 
    apiClient(`/results/assessment/${assessmentId}/trigger-release`, {
      method: "POST"
    }),
};
