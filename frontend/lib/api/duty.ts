// frontend/lib/api/duty.ts
import { apiClient } from "./client";
import type { AdminUserListResponse } from "./admin";

export type DutyType = "MODERATOR" | "EXAM_OFFICER" | "DEPARTMENT_HEAD";

export interface DutyAssignment {
  id: string;
  user_id: string;
  duty: DutyType;
  institution_id: string;
  campus_id?: string | null;
  department_id?: string | null;
  is_active: boolean;
  valid_from: string;
  valid_to?: string | null;
  assigned_by_id: string;
  created_at: string;
  updated_at?: string | null;
  user_email?: string | null;
  user_name?: string | null;
  institution_name?: string | null;
  campus_name?: string | null;
  department_name?: string | null;
}

export interface DutyAssignmentCreate {
  user_id: string;
  duty: DutyType;
  institution_id: string;
  campus_id?: string | null;
  department_id?: string | null;
  valid_from?: string | null;
  valid_to?: string | null;
}

export interface DutyListFilters {
  user_id?: string;
  duty?: DutyType;
  institution_id?: string;
  department_id?: string;
  is_active?: boolean;
}

export const dutyApi = {
  list: async (filters: DutyListFilters = {}): Promise<DutyAssignment[]> => {
    const query = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== "") query.append(key, String(value));
    });
    const qs = query.toString();
    return apiClient(`/admin/duties${qs ? `?${qs}` : ""}`);
  },
  assign: async (data: DutyAssignmentCreate): Promise<DutyAssignment> => {
    return apiClient("/admin/duties", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  deactivate: async (id: string): Promise<DutyAssignment> => {
    return apiClient(`/admin/duties/${id}`, { method: "DELETE" });
  },
  // Staff eligible for duties: LECTURER (all duties) and ADMIN (exam officer only).
  // Server-side search on email/name; results are capped, so callers search rather than scroll.
  searchStaff: async (role: "LECTURER" | "ADMIN", search: string, pageSize = 20): Promise<AdminUserListResponse> => {
    const query = new URLSearchParams({ role, page_size: String(pageSize) });
    if (search.trim()) query.append("search", search.trim());
    return apiClient(`/admin/users?${query.toString()}`);
  },
};

export const DUTY_LABELS: Record<DutyType, string> = {
  MODERATOR: "Moderator",
  EXAM_OFFICER: "Exam Officer",
  DEPARTMENT_HEAD: "Head of Department",
};

/** Spec §5.1: department-scoped duties require LECTURER; exam officer is institution/campus-scoped. */
export function dutyNeedsDepartment(duty: DutyType): boolean {
  return duty === "MODERATOR" || duty === "DEPARTMENT_HEAD";
}
