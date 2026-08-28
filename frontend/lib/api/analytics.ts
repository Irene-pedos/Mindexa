import { apiClient } from "./client";

export interface QuestionDifficultyItem {
  question_title: string;
  question_type: string;
  average_score: number;
  max_score: number;
  difficulty: string;
}

export interface AIAssessmentInsightsResponse {
  class_average?: number;
  highest_score?: number;
  lowest_score?: number;
  pass_rate?: number;
  total_submissions?: number;
  pending_submissions?: number;
  released_submissions?: number;
  integrity_issues_count?: number;
  grade_distribution?: Record<string, number>;
  question_difficulty?: QuestionDifficultyItem[];
  ai_narrative?: string | null;
  summary?: string;
  weak_topics?: string[];
  insights?: string[];
  recommended_interventions?: string[];
}

export const analyticsApi = {
  /**
   * Fetch AI narrative insights and aggregates for an assessment.
   */
  async getAssessmentInsights(
    assessmentId: string,
    regenerate: boolean = false
  ): Promise<AIAssessmentInsightsResponse> {
    return apiClient(
      `/analytics/assessment/${assessmentId}/ai-insights?regenerate=${regenerate}`
    );
  },
};
