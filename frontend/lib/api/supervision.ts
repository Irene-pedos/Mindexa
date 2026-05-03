// frontend/lib/api/supervision.ts
import { apiClient } from "./client";

export interface SupervisionStats {
  online_count: number;
  warning_count: number;
  high_risk_count: number;
}

export interface SupervisionEvent {
  id: string;
  student_id: string;
  student_name: string;
  assessment_id: string;
  event_type: string;
  created_at: string;
  severity: "low" | "medium" | "high";
  risk_score: number;
}

export const supervisionApi = {
  getStats: (assessmentId: string): Promise<SupervisionStats> => 
    apiClient(`/integrity/supervision/stats/${assessmentId}`),
  
  getEvents: (assessmentId: string): Promise<{ events: SupervisionEvent[] }> => 
    apiClient(`/integrity/events/assessment/${assessmentId}`),
  
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
