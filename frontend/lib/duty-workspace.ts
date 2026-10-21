// lib/duty-workspace.ts
//
// Office-based moderators and exam officers are LECTURER accounts holding a
// duty but no teaching assignments. They get a duty-only workspace: no
// teaching navigation, and they land on their queue instead of the dashboard.

type DutyAwareUser = {
  role: string;
  duties?: string[];
  has_teaching_assignments?: boolean | null;
} | null | undefined;

export const MODERATION_PATH = "/lecturer/moderation";
export const EXAM_OFFICE_PATH = "/lecturer/exam-office";

// Lecturer pages that stay reachable in the duty-only workspace.
const DUTY_WORKSPACE_PATHS = [
  MODERATION_PATH,
  EXAM_OFFICE_PATH,
  "/lecturer/profile",
  "/lecturer/notifications",
  "/lecturer/notification",
];

export function hasDuty(user: DutyAwareUser, duty: "MODERATOR" | "EXAM_OFFICER"): boolean {
  return user?.duties?.includes(duty) ?? false;
}

export function isDutyOnlyStaff(user: DutyAwareUser): boolean {
  return (
    user?.role?.toLowerCase() === "lecturer" &&
    (user.duties?.length ?? 0) > 0 &&
    user.has_teaching_assignments === false
  );
}

export function dutyHomePath(user: DutyAwareUser): string {
  return hasDuty(user, "MODERATOR") ? MODERATION_PATH : EXAM_OFFICE_PATH;
}

export function isAllowedInDutyWorkspace(pathname: string): boolean {
  return DUTY_WORKSPACE_PATHS.some(
    (path) => pathname === path || pathname.startsWith(path + "/"),
  );
}
