// frontend/lib/api/integrity.ts
import { apiClient } from "./client";

export interface IntegrityFlag {
  id: string;
  student_id: string;
  student_name: string;
  assessment_name: string;
  description: string;
  risk_level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "OPEN" | "REVIEWED" | "DISMISSED" | "ESCALATED" | "CONFIRMED";
  created_at: string;
  resolved_at?: string;
}

export const integrityApi = {
  getFlags: (params: { assessment_id?: string; status?: string; page?: number } = {}): Promise<{ flags: IntegrityFlag[] }> => {
    const query = new URLSearchParams();
    if (params.status) query.append("status", params.status);
    if (params.page) query.append("page", params.page.toString());
    
    const endpoint = params.assessment_id 
      ? `/integrity/flags/assessment/${params.assessment_id}?${query.toString()}`
      : `/integrity/flags?${query.toString()}`;
      
    return apiClient(endpoint);
  },
  
  resolveFlag: (flagId: string, data: { status: string; resolution_notes: string }) => 
    apiClient(`/integrity/flag/${flagId}/resolve`, {
      method: "PATCH",
      body: JSON.stringify(data)
    }),

  recordEvent: (data: {
    attempt_id: string;
    access_token: string;
    event_type: string;
    metadata_json?: any;
  }) => apiClient("/integrity/event", {
    method: "POST",
    body: JSON.stringify(data)
  }),

  acknowledgeWarning: (data: {
    warning_id: string;
    access_token: string;
  }) => apiClient("/integrity/acknowledge-warning", {
    method: "POST",
    body: JSON.stringify(data)
  }),
};
