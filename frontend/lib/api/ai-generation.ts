import { apiClient } from "@/lib/api/client";

export interface GenerateQuestionsSectionRequest {
  section_id: string;
  topic?: string;
  question_type?: "mcq" | "true_false" | "short_answer" | "essay" | "matching" | "fill_blank" | "case_study" | "computational" | "ordering" | "practical";
  type?: string;
  difficulty?: "easy" | "medium" | "hard";
  bloom_level?: string;
  count?: number;
}

export interface GenerateQuestionsRequest {
  subject?: string;
  topic: string;
  question_type: "mcq" | "true_false" | "short_answer" | "essay" | "matching" | "fill_blank" | "case_study" | "computational" | "ordering" | "practical";
  difficulty: "easy" | "medium" | "hard";
  count: number;
  bloom_level?: string;
  additional_context?: string;
  target_assessment_id?: string;
  target_section_id?: string;
  sections?: GenerateQuestionsSectionRequest[];
  // RAG grounding: which workspace's materials to retrieve context from
  workspace_id?: string;
  // Blueprint alignment
  blueprint_constraints?: string;
  learning_outcomes?: string;
  marks_per_question?: number;
}

export interface GeneratedQuestionOptionResponse {
  id?: string;
  text: string;
  is_correct: boolean;
  explanation?: string | null;
}

export interface AIGeneratedQuestionResponse {
  id: string;
  batch_id: string;
  target_section_id: string | null;
  question_type: string;
  difficulty: string;
  review_status: string;
  parsed_successfully: boolean;
  parsed_question_text: string | null;
  parsed_options_json: string | null;
  parsed_explanation: string | null;
  parse_error: string | null;
  bloom_level: string | null;
  options?: GeneratedQuestionOptionResponse[];
  // Computed options here for UI convenience
  _options: GeneratedQuestionOptionResponse[];
}

export interface AIGenerationBatchDetailResponse {
  id: string;
  question_type: string;
  subject: string;
  topic: string;
  difficulty: string;
  bloom_level: string | null;
  status: string;
  total_requested: number;
  total_generated: number;
  total_failed: number;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
  // Backend sends `generated_questions`; we normalise it to `questions` for the UI
  generated_questions?: AIGeneratedQuestionResponse[];
  questions: AIGeneratedQuestionResponse[];
}

export interface AIGenerationBatchListResponse {
  total: number;
  page: number;
  page_size: number;
  has_next: boolean;
  items: AIGenerationBatchDetailResponse[];
}

export interface ReviewAIQuestionRequest {
  decision: "approved" | "edited" | "rejected" | "needs_revision";
  modified_question_text?: string;
  modified_options_json?: string;
  modified_explanation?: string;
  reviewer_notes?: string;
  add_to_assessment_id?: string;
  add_to_section_id?: string;
  marks_if_added?: number;
  save_to_bank?: boolean;
}


export const aiGenerationApi = {
  async generateQuestions(data: GenerateQuestionsRequest): Promise<AIGenerationBatchDetailResponse> {
    const {
      target_assessment_id,
      target_section_id,
      workspace_id,
      blueprint_constraints,
      learning_outcomes,
      marks_per_question,
      ...rest
    } = data;
    const payload = {
      ...rest,
      assessment_id: target_assessment_id ?? undefined,
      target_section_id: target_section_id ?? undefined,
      teaching_workspace_id: workspace_id ?? undefined,
      blueprint_constraints: blueprint_constraints ?? undefined,
      learning_outcomes: learning_outcomes ?? undefined,
      marks_per_question: marks_per_question ?? undefined,
    };
    const res = await apiClient("/ai/generate", {
        method: "POST",
        body: JSON.stringify(payload),
    });
    return _parseBatchQuestions(res);
  },

  async listBatches(page = 1, pageSize = 20): Promise<AIGenerationBatchListResponse> {
    const res = await apiClient(`/ai/batches?page=${page}&page_size=${pageSize}`);
    return res;
  },

  async getBatch(batchId: string): Promise<AIGenerationBatchDetailResponse> {
    const res = await apiClient(`/ai/batches/${batchId}`);
    return _parseBatchQuestions(res);
  },

  async reviewQuestion(aiQuestionId: string, data: ReviewAIQuestionRequest): Promise<any> {
    const decisionMap: Record<string, string> = {
      approved: "ACCEPTED",
      edited: "MODIFIED",
      rejected: "REJECTED",
      needs_revision: "NEEDS_REVISION",
    };
    const payload = {
      ...data,
      decision: decisionMap[data.decision] || data.decision,
    };
    return apiClient(`/ai/review/${aiQuestionId}`, {
        method: "POST",
        body: JSON.stringify(payload),
    });
  },
};

function _parseBatchQuestions(batch: any): AIGenerationBatchDetailResponse {
  // Backend sends the relationship as `generated_questions`; normalise to `questions`
  const rawQuestions: AIGeneratedQuestionResponse[] =
    batch.generated_questions ?? batch.questions ?? [];

  const parsedQuestions = rawQuestions.map((q) => {
    let _options: GeneratedQuestionOptionResponse[] = [];
    if (q.options && q.options.length > 0) {
      _options = q.options;
    } else if (q.parsed_options_json) {
      try {
        _options = JSON.parse(q.parsed_options_json);
      } catch (e) {
        console.error("Failed to parse options JSON for generated question", q.id);
      }
    }
    return { ...q, _options };
  });

  return { ...batch, questions: parsedQuestions };
}
