// frontend/lib/api/appeals.ts
// Student requests to have a released mark reviewed (backend: /student/appeals).
import { apiClient } from "./client";

export interface AppealCreatePayload {
  attempt_id: string;
  assessment_id: string;
  course_id: string;
  /** The server requires at least 20 characters. */
  reason: string;
  items?: Array<Record<string, unknown>>;
}

export interface Appeal {
  id: string;
  attempt_id: string;
  assessment_id: string;
  course_id: string;
  reason: string;
  status: string;
  original_total: number;
  final_total?: number | null;
  outcome?: string | null;
  decision_note?: string | null;
  submitted_at: string;
  decided_at?: string | null;
}

export const APPEAL_REASON_MIN_LENGTH = 20;

export const appealApi = {
  create: (data: AppealCreatePayload): Promise<Appeal> =>
    apiClient("/student/appeals", { method: "POST", body: JSON.stringify(data) }),

  listMine: async (): Promise<Appeal[]> => {
    const res = await apiClient("/student/appeals");
    // The backend wraps the page: { items, total, limit, offset }.
    return Array.isArray(res) ? res : ((res as { items?: Appeal[] }).items ?? []);
  },

  withdraw: (appealId: string): Promise<Appeal> =>
    apiClient(`/student/appeals/${appealId}/withdraw`, { method: "POST" }),
};

/** Appeals the student can still withdraw. */
export const WITHDRAWABLE_APPEAL_STATUSES = ["SUBMITTED", "PAYMENT_PENDING", "PAID"];
