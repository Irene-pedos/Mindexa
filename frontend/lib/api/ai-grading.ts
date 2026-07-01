import { apiClient } from "./client";

export interface AIReviewSuggestionRequest {
  response_id: string;
}

export interface RubricAlignmentNote {
  criterion: string;
  notes: string;
  marks_awarded: number;
}

export interface AIReviewSuggestionResponse {
  status: string;
  item_id: string;
  response_id: string;
  suggested_score: number;
}

// Full suggestion details retrieved from the grade model
export interface GradeReviewDetails {
  id: string;
  response_id: string;
  score: number | null;
  ai_suggested_score: number | null;
  ai_rationale: string | null;
  ai_confidence: number | null;
  rubric_scores: RubricAlignmentNote[] | null;
  is_final: boolean;
  ai_grading_basis?: string | null;
  ai_feedback_draft?: string | null;
  ai_feedback_strengths?: string[] | null;
  ai_feedback_improvements?: string[] | null;
  ai_feedback_suggestions?: string[] | null;
}

export const aiGradingApi = {
  /**
   * Triggers the AI to process a queue item and generate a grading suggestion.
   */
  async requestAISuggestion(itemId: string): Promise<AIReviewSuggestionResponse> {
    return apiClient(`/grading/queue/${itemId}/process-ai`, {
        method: "POST",
    });
  },

  /**
   * Retrieves the grade details including AI suggestions.
   */
  async getGradeDetails(responseId: string): Promise<GradeReviewDetails> {
    return apiClient(`/grading/response/${responseId}/grade`);
  },

  /**
   * Triggers the AI to draft feedback for a specific response.
   */
  async requestAIFeedbackDraft(responseId: string): Promise<any> {
    return apiClient(`/grading/response/${responseId}/draft-feedback`, {
        method: "POST",
    });
  },
  async submitAIFeedback(gradeId: string, isAccurate: boolean, comments?: string): Promise<any> {
    return apiClient(`/grading/feedback-ai`, {
      method: "POST",
      body: JSON.stringify({ submission_grade_id: gradeId, is_accurate: isAccurate, comments }),
    });
  },
};
