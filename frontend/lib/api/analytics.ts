import { apiClient } from "./client";

export interface AIAssessmentInsightsResponse {
  summary: string;
  weak_topics: string[];
  insights: string[];
  recommended_interventions: string[];
}

export const analyticsApi = {
  /**
   * Fetch AI narrative insights for an assessment.
   */
  async getAssessmentInsights(assessmentId: string): Promise<AIAssessmentInsightsResponse> {
    return apiClient(`/analytics/assessment/${assessmentId}/ai-insights`);
  },
};
