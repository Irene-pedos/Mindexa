import { apiClient } from "./client";

export interface StudentSupportContext {
  title: string;
  content: string;
  assessment_id?: string | null;
}

export interface StudentSupportRequest {
  question: string;
  contexts?: StudentSupportContext[];
}

export interface StudentSupportResponse {
  explanation: string;
  revision_plan: string[];
  follow_up_questions: string[];
  safety_notice: string | null;
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
