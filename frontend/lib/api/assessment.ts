// frontend/lib/api/assessment.ts
import { apiClient } from "./client";

export const assessmentApi = {
  getAssessments: () => apiClient("/assessments"),
  getAssessmentById: (id: string) => apiClient(`/assessments/${id}`),
  createAssessment: (data: Record<string, unknown>) => apiClient("/assessments", { method: "POST", body: JSON.stringify(data) }),
  updateAssessment: (id: string, data: Record<string, unknown>) => apiClient(`/assessments/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteAssessment: (id: string) => apiClient(`/assessments/${id}`, { method: "DELETE" }),
  publishAssessment: (id: string) => apiClient(`/assessments/${id}/publish`, { method: "POST" }),
};
