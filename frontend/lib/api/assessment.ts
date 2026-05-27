// frontend/lib/api/assessment.ts
import { apiClient } from "./client";

export interface AssessmentConfig {
  title: string;
  description?: string;
  instructions?: string;
  assessment_type: string;
  total_marks: number;
  duration_minutes?: number;
  window_start?: string;
  window_end?: string;
  grading_mode: string;
  result_release_mode: string;
  is_password_protected?: boolean;
  access_password?: string;
  
  // Group Work Fields
  is_group_assessment?: boolean;
  max_group_size?: number;
  group_assignment_mode?: "MANUAL" | "AUTOMATIC";
  question_distribution_mode?: "SHARED" | "PER_GROUP";
  require_all_member_approval?: boolean;
  require_all_member_participation?: boolean;
  appeal_window_days?: number;
}

export const assessmentApi = {
  getAssessments: (params?: Record<string, any>) => {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          query.append(key, value.toString());
        }
      });
    }
    const queryString = query.toString();
    return apiClient(queryString ? `/assessments?${queryString}` : "/assessments");
  },
  
  getAssessmentById: (id: string) => apiClient(`/assessments/${id}`),
  
  createAssessment: (data: AssessmentConfig) => 
    apiClient("/assessments", { 
      method: "POST", 
      body: JSON.stringify(data) 
    }),
    
  updateAssessment: (id: string, data: Partial<AssessmentConfig> & { draft_step?: number }) => 
    apiClient(`/assessments/${id}`, { 
      method: "PUT", 
      body: JSON.stringify(data) 
    }),
    
  deleteAssessment: (id: string) => 
    apiClient(`/assessments/${id}`, { method: "DELETE" }),
    
  finalizeAssessment: (id: string) => 
    apiClient(`/assessments/${id}/finalize`, { method: "POST" }),
    
  // Legacy alias for compatibility if needed
  publishAssessment: (id: string) => 
    apiClient(`/assessments/${id}/finalize`, { method: "POST" }),
};
