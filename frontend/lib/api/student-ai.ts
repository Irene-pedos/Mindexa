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
  source_surface?: "study_tutor" | "study_reader" | "assessment_inline";
  conversation_id?: string;
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
  current_page?: number;
  selected_text?: string;
}

export interface StudentSupportResponse {
  explanation: string;
  conversation_id?: string;
  citations: SourceCitation[];
  fallback_used: boolean;
  model?: string | null;
  provider?: string | null;
}

export interface RevisionGuideOutput {
  title?: string;
  summary: string;
  checklist: string[];
  readings: string[];
  markdown?: string;
}

export interface StudentChatHistoryItem {
  id: string;
  conversation_id?: string;
  question: string;
  answer: string;
  citations: SourceCitation[];
  created_at: string;
}

export interface StudentConversationSummary {
  conversation_id: string;
  preview: string;
  created_at: string;
  last_activity_at: string;
  turn_count: number;
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
   * Load student AI conversations summary list for sidebar history.
   */
  async getConversations(limit: number = 50, offset: number = 0): Promise<StudentConversationSummary[]> {
    return apiClient(`/student/ai/conversations?limit=${limit}&offset=${offset}`);
  },

  /**
   * Load all turns for a specific conversation thread.
   */
  async getConversation(conversationId: string): Promise<StudentChatHistoryItem[]> {
    return apiClient(`/student/ai/conversations/${conversationId}`);
  },

  /**
   * Delete a student AI conversation thread.
   */
  async deleteConversation(conversationId: string): Promise<{ success: boolean; conversation_id: string }> {
    return apiClient(`/student/ai/conversations/${conversationId}`, {
      method: "DELETE",
    });
  },

  /**
   * Load recent student AI chat history for conversation persistence (legacy).
   */
  async getHistory(): Promise<StudentChatHistoryItem[]> {
    return apiClient("/student/ai/history");
  },

  /**
   * Generate structured revision guide note and downloadable markdown sheet.
   */
  async getRevisionGuide(
    paramsOrTopic: string | { topic: string; teachingWorkspaceId?: string; learningUnitId?: string },
    teachingWorkspaceId?: string
  ): Promise<RevisionGuideOutput> {
    const payload = typeof paramsOrTopic === "string"
      ? { topic: paramsOrTopic, teaching_workspace_id: teachingWorkspaceId }
      : {
          topic: paramsOrTopic.topic,
          teaching_workspace_id: paramsOrTopic.teachingWorkspaceId,
          learning_unit_id: paramsOrTopic.learningUnitId,
        };
    return apiClient("/student/ai/revision", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
};
