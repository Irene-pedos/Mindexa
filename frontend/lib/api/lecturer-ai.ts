import { apiClient, getToken, resolveApiUrl } from "./client";

export interface LearningUnitItem {
  id: string;
  order_index: number;
  title: string;
  summary?: string | null;
  learning_outcomes?: string[];
  start_page?: number | null;
  end_page?: number | null;
  source_material_id?: string | null;
  estimated_study_minutes: number;
  chunk_count: number;
}

export interface SlideItem {
  title: string;
  bullet_points: string[];
  visual_idea?: string | null;
  speaker_notes?: string | null;
}

export interface SlideDeckOutput {
  title: string;
  target_audience: string;
  estimated_minutes: number;
  slides: SlideItem[];
}

export interface SlideDeckGenerateResponse {
  learning_unit_id: string;
  unit_title: string;
  deck: SlideDeckOutput;
}

export interface RubricCriterionLevel {
  label: string;
  description: string;
  marks: number;
}

export interface RubricCriterion {
  title: string;
  description?: string | null;
  max_marks: number;
  order_index?: number;
  levels: RubricCriterionLevel[];
}

export interface RubricDraftOutput {
  title: string;
  description?: string | null;
  criteria: RubricCriterion[];
}

export interface RubricDraftResponse {
  question_id: string;
  rubric: RubricDraftOutput;
}

export interface RubricSaveResponse {
  question_id: string;
  rubric_id: string;
  title: string;
  criteria_count: number;
  message: string;
}

export const lecturerAiApi = {
  /**
   * Fetch ordered Learning Units for a workspace (with automatic segmentation fallback)
   */
  async getWorkspaceLearningUnits(workspaceId: string): Promise<LearningUnitItem[]> {
    return apiClient(`/lecturers/ai/workspaces/${workspaceId}/learning-units`);
  },

  /**
   * Generate an 8-15 slide deck outline from a Learning Unit
   */
  async generateSlideDeck(
    learningUnitId: string,
    estimatedMinutes: number = 45,
    selectedOutcomes?: string[]
  ): Promise<SlideDeckGenerateResponse> {
    return apiClient(`/lecturers/ai/slides/${learningUnitId}/generate`, {
      method: "POST",
      body: JSON.stringify({
        estimated_minutes: estimatedMinutes,
        selected_outcomes: selectedOutcomes,
      }),
    });
  },

  /**
   * Export a SlideDeckOutput schema to a downloadable .pptx presentation file
   */
  async exportSlideDeckPptx(deck: SlideDeckOutput): Promise<Blob> {
    const apiUrl = resolveApiUrl();
    const token = getToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(`${apiUrl}/lecturers/ai/slides/export`, {
      method: "POST",
      headers,
      body: JSON.stringify({ deck }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || err.detail || "Failed to export PowerPoint presentation");
    }

    return res.blob();
  },

  /**
   * Draft rubric criteria grounded to a Question entity
   */
  async draftRubric(
    questionId: string,
    totalMarks?: number,
    existingRubric?: string
  ): Promise<RubricDraftResponse> {
    return apiClient("/lecturers/ai/rubrics/draft", {
      method: "POST",
      body: JSON.stringify({
        question_id: questionId,
        total_marks: totalMarks,
        existing_rubric: existingRubric,
      }),
    });
  },

  /**
   * Save rubric directly to the database and attach to target Question
   */
  async saveRubric(
    questionId: string,
    title: string,
    criteria: RubricCriterion[],
    description?: string
  ): Promise<RubricSaveResponse> {
    return apiClient("/lecturers/ai/rubrics/save", {
      method: "POST",
      body: JSON.stringify({
        question_id: questionId,
        title,
        description,
        criteria,
      }),
    });
  },
};
