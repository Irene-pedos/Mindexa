// frontend/lib/api/supervision.ts
import { apiClient } from "./client";

export interface SupervisionStats {
  online_count: number;
  warning_count: number;
  high_risk_count: number;
}

export interface SupervisionEvent {
  id: string;
  attempt_id: string;
  student_id: string;
  student_name: string;
  event_type: string;
  severity: "low" | "medium" | "high" | "critical";
  risk_score: number;
  created_at: string;
  metadata_json?: Record<string, any>;
}

export interface IntegrityFlag {
  id: string;
  attempt_id: string;
  assessment_id: string;
  student_id: string;
  student_name?: string;
  assessment_name?: string;
  status: "OPEN" | "UNDER_REVIEW" | "CONFIRMED" | "DISMISSED" | "ESCALATED";
  risk_level: "NONE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  description: string;
  created_at: string;
  updated_at: string;
}

export const supervisionApi = {
  getStats: (assessmentId: string): Promise<SupervisionStats> => 
    apiClient(`/integrity/supervision/stats/${assessmentId}`),
  
  getEvents: (assessmentId: string): Promise<{ events: SupervisionEvent[] }> => 
    apiClient(`/integrity/events/assessment/${assessmentId}`),

  getFlags: (assessmentId: string): Promise<{ flags: IntegrityFlag[] }> =>
    apiClient(`/integrity/flags/assessment/${assessmentId}`),
  
  startSession: (assessmentId: string) => 
    apiClient(`/integrity/supervision/start`, { 
      method: "POST", 
      body: JSON.stringify({ assessment_id: assessmentId }) 
    }),
  
  endSession: (assessmentId: string) => 
    apiClient(`/integrity/supervision/end`, { 
      method: "POST", 
      body: JSON.stringify({ assessment_id: assessmentId }) 
    }),
};

