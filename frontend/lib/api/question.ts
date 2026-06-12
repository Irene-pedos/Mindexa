// frontend/lib/api/question.ts
import { apiClient } from "./client";

export interface QuestionOption {
  id?: string;
  option_text: string;
  option_text_right?: string;
  is_correct: boolean;
  order_index: number;
  explanation?: string;
}

export interface QuestionBankItem {
  id: string;
  content: string;
  image_url?: string;
  explanation?: string;
  hint?: string;
  question_type: string;
  difficulty: string;
  suggested_marks: number;
  marks: number; // Keep for backward compatibility in UI
  subject?: string;
  course_id?: string;
  topic?: string;
  bloom_level?: string;
  estimated_time_minutes?: number;
  options: QuestionOption[];
  tags?: { id: string; name: string }[];
  created_at: string;
  updated_at?: string;
}

export interface QuestionBankResponse {
  items: QuestionBankItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface QuestionCreateRequest {
  content: string;
  image_url?: string;
  explanation?: string;
  hint?: string;
  question_type: string;
  difficulty: string;
  subject?: string;
  course_id?: string;
  topic?: string;
  bloom_level?: string;
  suggested_marks: number;
  estimated_time_minutes?: number;
  options: Omit<QuestionOption, "id">[];
  tag_names?: string[];
}

export const questionApi = {
  getQuestions: async (params: any = {}): Promise<QuestionBankResponse> => {
    const query = new URLSearchParams();
    if (params.q) query.append("q", params.q);
    if (params.type) query.append("question_type", params.type);
    if (params.difficulty) query.append("difficulty", params.difficulty);
    if (params.page) query.append("page", params.page.toString());
    if (params.page_size) query.append("page_size", params.page_size.toString());
    
    const res = await apiClient(`/questions?${query.toString()}`);
    // Map suggested_marks to marks for UI
    if (res.items) {
      res.items = res.items.map((item: any) => ({
        ...item,
        marks: item.suggested_marks || 1
      }));
    }
    return res;
  },
  
  getQuestion: async (id: string): Promise<QuestionBankItem> => {
    const res = await apiClient(`/questions/${id}`);
    res.marks = res.suggested_marks || 1;
    return res;
  },


  createQuestion: async (data: QuestionCreateRequest): Promise<QuestionBankItem> => {
    return apiClient("/questions", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  updateQuestion: async (id: string, data: Partial<QuestionCreateRequest>): Promise<QuestionBankItem> => {
    return apiClient(`/questions/${id}`, {
      method: "PUT",
      body: JSON.stringify({ ...data, create_new_version: true }),
    });
  },
  
  deleteQuestion: async (id: string): Promise<void> => {
    return apiClient(`/questions/${id}`, { method: "DELETE" });
  }
};
