// frontend/lib/api/submission.ts
import { apiClient } from "./client";

export const submissionApi = {
  saveAnswer: (data: Record<string, unknown>) => apiClient(`/submissions`, { method: "POST", body: JSON.stringify(data) }),
  getSubmissionsForAttempt: (attemptId: string) => apiClient(`/submissions/attempt/${attemptId}`),
  getGroupSubmissions: (groupId: string) => apiClient(`/submissions/group/${groupId}`),
  getSubmissionLogs: (submissionId: string) => apiClient(`/submissions/logs/${submissionId}`),
  uploadSubmissionFile: (formData: FormData) => apiClient(`/submissions/upload`, { method: "POST", body: formData }),
};
