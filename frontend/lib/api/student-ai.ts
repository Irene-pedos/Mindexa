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
  selected_resource_ids?: string[];
  teaching_workspace_id?: string;
  thinking_mode?: boolean;
  deep_search_mode?: boolean;
  attempt_id?: string;
  question_id?: string;
  assessment_id?: string;
  is_in_assessment?: boolean;
}

export interface StudentSupportResponse {
  explanation: string;
  citations: SourceCitation[];
  fallback_used: boolean;
  model?: string | null;
  provider?: string | null;
}

export interface RevisionGuideOutput {
  summary: string;
  checklist: string[];
  readings: string[];
}

export interface StudentChatHistoryItem {
  id: string;
  question: string;
  answer: string;
  citations: SourceCitation[];
  created_at: string;
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

  /**
   * Load recent student AI chat history for conversation persistence.
   */
  async getHistory(): Promise<StudentChatHistoryItem[]> {
    return apiClient("/student/ai/history");
  },

  /**
   * Generate structured revision guide note.
   */
  async getRevisionGuide(topic: string, teachingWorkspaceId?: string): Promise<RevisionGuideOutput> {
    return apiClient("/student/ai/revision", {
      method: "POST",
      body: JSON.stringify({ topic, teaching_workspace_id: teachingWorkspaceId }),
    });
  },
};
