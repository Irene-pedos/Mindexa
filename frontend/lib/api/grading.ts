// frontend/lib/api/grading.ts
import { apiClient } from "./client";

export const gradingApi = {
  getGradingQueue: (params: Record<string, any> = {}) => {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        searchParams.append(key, value.toString());
      }
    });
    const queryString = searchParams.toString();
    return apiClient(`/grading/queue${queryString ? `?${queryString}` : ""}`);
  },
  getGroupGradingQueue: (params: Record<string, any> = {}) => {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        searchParams.append(key, value.toString());
      }
    });
    const queryString = searchParams.toString();
    return apiClient(`/grading/group-queue${queryString ? `?${queryString}` : ""}`);
  },
  getGradeDetail: (responseId: string) => apiClient(`/grading/response/${responseId}`),
  saveGrade: (responseId: string, data: Record<string, unknown>) => apiClient(`/grading/confirm-ai`, { 
    method: "POST", 
    body: JSON.stringify({ response_id: responseId, ...data }) 
  }),
  getModerationStats: (questionId: string) => apiClient(`/grading/moderation/${questionId}`),
  moderateGrade: (data: Record<string, unknown>) => apiClient(`/grading/moderate`, {
    method: "POST",
    body: JSON.stringify(data)
  }),
  getAssessmentClassStats: (assessmentId: string) => 
    apiClient(`/grading/assessment/${assessmentId}/stats/classes`),
  getClassAiSummary: (assessmentId: string, classId: string) => 
    apiClient(`/grading/assessment/${assessmentId}/class/${classId}/ai-summary`),
  getAssessmentAnalytics: (assessmentId: string) =>
    apiClient(`/analytics/assessment/${assessmentId}/ai-insights`),
  verifyAttemptGrades: (attemptId: string) => 
    apiClient(`/grading/attempt/${attemptId}/verify`),
  suggestChanges: (responseId: string, feedback: string) => 
    apiClient(`/grading/response/${responseId}/suggest-changes`, {
      method: "POST",
      body: JSON.stringify({ feedback }),
    }),
};
