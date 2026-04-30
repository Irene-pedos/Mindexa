// frontend/lib/api/question.ts
import { apiClient } from "./client";

export interface QuestionBankItem {
  id: string;
  content: string;
  question_type: string;
  difficulty: string;
  marks: number;
  subject?: string;
  topic?: string;
  options?: any[];
}

export interface QuestionBankResponse {
  items: QuestionBankItem[];
  total: number;
  page: number;
  page_size: number;
}

export const questionApi = {
  getQuestions: async (params: any = {}): Promise<QuestionBankResponse> => {
    const query = new URLSearchParams();
    if (params.q) query.append("q", params.q);
    if (params.type) query.append("question_type", params.type);
    if (params.difficulty) query.append("difficulty", params.difficulty);
    if (params.page) query.append("page", params.page.toString());
    if (params.page_size) query.append("page_size", params.page_size.toString());
    
    return apiClient(`/questions?${query.toString()}`);
  },
  
  getQuestion: async (id: string): Promise<QuestionBankItem> => {
    return apiClient(`/questions/${id}`);
  }
};
