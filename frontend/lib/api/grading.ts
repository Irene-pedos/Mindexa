// frontend/lib/api/grading.ts
import { apiClient } from "./client";

export const gradingApi = {
  getGradingQueue: () => apiClient("/grading/queue"),
  saveGrade: (submissionId: string, data: Record<string, unknown>) => apiClient(`/grading/submissions/${submissionId}`, { method: "POST", body: JSON.stringify(data) }),
};
