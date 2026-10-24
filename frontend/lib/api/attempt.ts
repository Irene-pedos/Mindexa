// frontend/lib/api/attempt.ts
import { apiClient } from "./client";

export const attemptApi = {
  startAttempt: (data: Record<string, unknown>) => apiClient(`/attempts/start`, { method: "POST", body: JSON.stringify(data) }),
  getAttempt: (attemptId: string) => apiClient(`/attempts/${attemptId}`),
  getAttemptDetail: (attemptId: string, accessToken: string) => apiClient(`/attempts/${attemptId}?access_token=${accessToken}`),
  pauseAttempt: (attemptId: string, accessToken: string) => 
    apiClient(`/attempts/${attemptId}/pause`, { 
      method: "POST", 
      body: JSON.stringify({ access_token: accessToken }) 
    }),
  resumeAttempt: (attemptId: string, accessToken: string) => 
    apiClient(`/attempts/${attemptId}/resume`, { 
      method: "POST", 
      body: JSON.stringify({ access_token: accessToken }) 
    }),
  /** Choose a question in an "answer N of M" section. Fails with CHOICE_LIMIT_EXCEEDED beyond N. */
  selectQuestion: (attemptId: string, sectionId: string, questionId: string) =>
    apiClient(`/attempts/${attemptId}/sections/${sectionId}/select`, {
      method: "POST",
      body: JSON.stringify({ question_id: questionId }),
    }),
  /** Remove a choice made with selectQuestion. */
  deselectQuestion: (attemptId: string, questionId: string) =>
    apiClient(`/attempts/${attemptId}/questions/${questionId}/select`, {
      method: "DELETE",
    }),
  /** Re-issue the session token when this browser lost it (new device / cleared storage). */
  reclaimAttempt: (attemptId: string) =>
    apiClient(`/attempts/${attemptId}/reclaim`, { method: "POST" }),
  submitAttempt: (attemptId: string, accessToken: string, confirm: boolean = true) =>
    apiClient(`/attempts/${attemptId}/submit`, { 
      method: "POST", 
      body: JSON.stringify({ access_token: accessToken, confirm }) 
    }),
  recordIntegrityEvent: (attemptId: string, accessToken: string, eventType: string, metadata?: any) =>
    apiClient(`/integrity/event`, {
      method: "POST",
      body: JSON.stringify({
        attempt_id: attemptId,
        access_token: accessToken,
        event_type: eventType,
        metadata_json: metadata
      })
    }),
  getAttemptsForAssessment: (assessmentId: string) => apiClient(`/attempts/assessment/${assessmentId}`),
};
