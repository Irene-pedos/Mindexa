// frontend/lib/api/result.ts
import { apiClient } from "./client";

export const resultApi = {
  getResultByAttempt: (attemptId: string) => apiClient(`/results/attempt/${attemptId}`),
  getStudentResults: () => apiClient("/results/me"),
};
