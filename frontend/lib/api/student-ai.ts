import { apiClient } from "./client";

export interface SourceCitation {
  resource_name: string;
  resource_id: string;
  page_number: number | null;
  chunk_index: number;
  excerpt: string;
}

export interface StudentSupportRequest {
  question: string;
  conversation_history?: Array<{ role: string; content: string }>;
  selected_resource_id?: string;
}

export interface StudentSupportResponse {
  explanation: string;
  citations: SourceCitation[];
  fallback_used: boolean;
  model?: string | null;
  provider?: string | null;
}

export const studentAiApi = {
  /**
   * Request study support from the AI agent.
   */
  async getSupport(data: StudentSupportRequest): Promise<StudentSupportResponse> {
    return apiClient("/student/ai/support", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
};
