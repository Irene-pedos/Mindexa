import { apiClient } from "./client";

export const gradingApi = {
  getGradingQueue: (params: Record<string, string | number | boolean>) => {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => {
      if (val !== undefined && val !== null) {
        searchParams.append(key, String(val));
      }
    });
    const queryString = searchParams.toString();
    return apiClient(`/grading/queue${queryString ? `?${queryString}` : ""}`);
  },
  getGroupGradingQueue: (params: Record<string, string | number | boolean>) => {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => {
      if (val !== undefined && val !== null) {
        searchParams.append(key, String(val));
      }
    });
    const queryString = searchParams.toString();
    return apiClient(`/grading/group-queue${queryString ? `?${queryString}` : ""}`);
  },
  getGroupSubmissionWorkspace: (submissionId: string) => apiClient(`/grading/group-submission/${submissionId}`),
  gradeGroupQuestion: (submissionId: string, questionId: string, data: Record<string, any>) =>
    apiClient(`/grading/group-submission/${submissionId}/questions/${questionId}/grade`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  triggerGroupQuestionAiReview: (submissionId: string, questionId: string) =>
    apiClient(`/grading/group-submission/${submissionId}/questions/${questionId}/ai-review`, {
      method: "POST",
    }),
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
    const params = new URLSearchParams();
    if (classSectionId && classSectionId !== "all") {
      params.append("class_section_id", classSectionId);
    }
    if (regenerate) {
      params.append("regenerate", "true");
    }
    const queryStr = params.toString();
    return apiClient(`/analytics/assessment/${assessmentId}/ai-insights${queryStr ? `?${queryStr}` : ""}`);
  },
  verifyAttemptGrades: (attemptId: string) => 
    apiClient(`/grading/attempt/${attemptId}/verify`),
  suggestChanges: (responseId: string, feedback: string) => 
    apiClient(`/grading/response/${responseId}/suggest-changes`, {
      method: "POST",
      body: JSON.stringify({ feedback }),
    }),
};
