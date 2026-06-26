// frontend/lib/api/attempt.ts
import { apiClient } from "./client";

export const attemptApi = {
  startAttempt: (data: Record<string, unknown>) => apiClient(`/attempts/start`, { method: "POST", body: JSON.stringify(data) }),
  getAttempt: (attemptId: string) => apiClient(`/attempts/${attemptId}`),
  getAttemptDetail: (attemptId: string, accessToken: string) => apiClient(`/attempts/${attemptId}?access_token=${accessToken}`),
  resumeAttempt: (attemptId: string, accessToken: string) => 
    apiClient(`/attempts/${attemptId}/resume`, { 
      method: "POST", 
      body: JSON.stringify({ access_token: accessToken }) 
    }),
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
  grantReassessment: (attemptId: string, data: Record<string, unknown>) => 
    apiClient(`/attempts/${attemptId}/reassessment`, { 
      method: "POST", 
      body: JSON.stringify(data) 
    }),
};
