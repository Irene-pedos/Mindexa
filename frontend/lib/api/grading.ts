import { apiClient, buildQueryString } from "./client";

export const gradingApi = {
  getGradingQueue: (params: Record<string, string | number | boolean>) =>
    apiClient(`/grading/queue${buildQueryString(params)}`),
  getGroupGradingQueue: (params: Record<string, string | number | boolean>) =>
    apiClient(`/grading/group-queue${buildQueryString(params)}`),
  getGroupSubmissionWorkspace: (submissionId: string) => apiClient(`/grading/group-submission/${submissionId}`),
  getGradeDetail: (responseId: string) => apiClient(`/grading/response/${responseId}`),
  saveGrade: (responseId: string, data: Record<string, unknown>) => {
    const payload: Record<string, any> = { ...data };
    if ("accept_ai_suggestion" in payload) {
      // AI suggestion flow (either accept or override)
      if ("score" in payload && !("override_score" in payload)) {
        payload.override_score = payload.score;
        delete payload.score;
      }
      return apiClient(`/grading/confirm-ai`, { 
        method: "POST", 
        body: JSON.stringify({ response_id: responseId, ...payload }) 
      });
    } else {
      // Manual grading flow
      if ("override_score" in payload && !("score" in payload)) {
        payload.score = payload.override_score;
        delete payload.override_score;
      }
      return apiClient(`/grading/manual`, { 
        method: "POST", 
        body: JSON.stringify({ response_id: responseId, ...payload }) 
      });
    }
  },
  getModerationStats: (questionId: string) => apiClient(`/grading/moderation/${questionId}`),
  moderateGrade: (data: Record<string, unknown>) => apiClient(`/grading/moderate`, {
    method: "POST",
    body: JSON.stringify(data)
  }),
  getAssessmentClassStats: (assessmentId: string) => 
    apiClient(`/grading/assessment/${assessmentId}/stats/classes`),
  getClassAiSummary: (assessmentId: string, classId: string) => 
    apiClient(`/grading/assessment/${assessmentId}/class/${classId}/ai-summary`),
  getAssessmentAnalytics: (assessmentId: string, classSectionId?: string, regenerate?: boolean) => {
    const params: Record<string, unknown> = {};
    if (classSectionId && classSectionId !== "all") {
      params.class_section_id = classSectionId;
    }
    if (regenerate) {
      params.regenerate = "true";
    }
    return apiClient(`/analytics/assessment/${assessmentId}/ai-insights${buildQueryString(params)}`);
  },
  verifyAttemptGrades: (attemptId: string) => 
    apiClient(`/grading/attempt/${attemptId}/verify`),
  suggestChanges: (responseId: string, feedback: string) => 
    apiClient(`/grading/response/${responseId}/suggest-changes`, {
      method: "POST",
      body: JSON.stringify({ feedback }),
    }),
};
