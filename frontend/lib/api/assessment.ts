// frontend/lib/api/assessment.ts
import { apiClient } from "./client";

export const assessmentApi = {
  getAssessments: (params?: Record<string, any>) => {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          query.append(key, value.toString());
        }
      });
    }
    const queryString = query.toString();
    return apiClient(queryString ? `/assessments?${queryString}` : "/assessments");
  },
  getAssessmentById: (id: string) => apiClient(`/assessments/${id}`),
  createAssessment: (data: Record<string, unknown>) => apiClient("/assessments", { method: "POST", body: JSON.stringify(data) }),
  updateAssessment: (id: string, data: Record<string, unknown>) => apiClient(`/assessments/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteAssessment: (id: string) => apiClient(`/assessments/${id}`, { method: "DELETE" }),
  publishAssessment: (id: string) => apiClient(`/assessments/${id}/publish`, { method: "POST" }),
};
