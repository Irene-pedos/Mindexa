// frontend/lib/api/grading.ts
import { apiClient } from "./client";

export const gradingApi = {
  getGradingQueue: () => apiClient("/grading/queue"),
  getGradeDetail: (responseId: string) => apiClient(`/grading/response/${responseId}`),
  saveGrade: (responseId: string, data: Record<string, unknown>) => apiClient(`/grading/confirm-ai`, { 
    method: "POST", 
    body: JSON.stringify({ response_id: responseId, ...data }) 
  }),
};
