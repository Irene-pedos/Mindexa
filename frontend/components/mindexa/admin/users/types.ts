// frontend/components/mindexa/admin/users/types.ts
import { UserResponse } from "@/lib/api/admin";

export type RoleFilter =
  | "all"
  | "ADMIN"
  | "COORDINATOR"
  | "LECTURER"
  | "REVIEWER"
  | "SUPERVISOR"
  | "STUDENT";

export type StatusFilter = "all" | "ACTIVE" | "PENDING_APPROVAL" | "SUSPENDED";

export type ViewMode = "table" | "grid";

export interface UserStats {
  total: number;
  pending: number;
  active: number;
  suspended: number;
  students: number;
  faculty: number;
}
