import { apiClient } from "./client";
import type { AcademicStructure } from "../academic-structure";
import {
  InstitutionResponse, 
  CampusResponse, 
  CollegeResponse, 
  DepartmentResponse, 
  OptionResponse, 
  ClassGroupResponse, 
  ClassSectionResponse,
  CourseResponse,
  AcademicPeriodResponse
} from "./academic-types";

export type AcademicInstitution = InstitutionResponse
export type AcademicCampus = CampusResponse
export type AcademicCollege = CollegeResponse
export type AcademicDepartment = DepartmentResponse
export type AcademicOption = OptionResponse
export type AcademicClassGroup = ClassGroupResponse
export type AcademicClassSection = ClassSectionResponse
export type AcademicCourse = CourseResponse
export type AcademicPeriod = AcademicPeriodResponse

/** A period as the admin list returns it: with the number of courses and assignments using it. */
export interface AcademicPeriodItem extends AcademicPeriodResponse {
  course_count: number
  assignment_count: number
  /** Dated items (registration, holidays, exams, results…) recorded on this period. */
  event_count: number
}

export interface AcademicPeriodPayload {
  institution_id: string
  name: string
  period_type: string
  start_date: string
  end_date: string
  is_active: boolean
  parent_id?: string | null
}

export type CalendarEventKind =
  | "REGISTRATION"
  | "HOLIDAY"
  | "EXAM_PERIOD"
  | "MARKS_DEADLINE"
  | "DELIBERATION"
  | "RESULTS_PUBLICATION"
  | "APPEAL_WINDOW"
  | "REASSESSMENT_WINDOW"
  | "PLACEMENT"
  | "DEFENSE"
  | "OTHER"

/** A dated item of a period, in whole days. A single day has the same start and end. */
export interface CalendarEvent {
  id: string
  period_id: string
  kind: CalendarEventKind
  title: string
  start_date: string
  end_date: string
  audience: string | null
}

export interface CalendarEventInput {
  kind: CalendarEventKind
  title: string
  start_date: string
  end_date?: string | null
  audience?: string | null
}

export interface CalendarDraftSemester {
  name: string
  period_type: string
  start_date: string
  end_date: string
}

export interface CalendarDraftEvent {
  semester: string | null
  kind: CalendarEventKind
  title: string
  start_date: string
  end_date: string | null
  audience: string | null
  /** Why a person should look at this row again (set by the server's checks). */
  warning?: string | null
}

/** What the AI read from a calendar file. Nothing is saved until the admin applies it. */
export interface CalendarDraft {
  year_name: string
  year_start: string
  year_end: string
  semesters: CalendarDraftSemester[]
  events: CalendarDraftEvent[]
  warnings: string[]
  source?: string | null
}

export interface CalendarPreview {
  pages: number
  has_text_layer: boolean
  image_base64: string
}

export type TeachingAssignmentRole =
  | "MAIN_LECTURER"
  | "ASSISTANT_LECTURER"
  | "CO_LECTURER"
  | "SUPERVISOR"
  | "REVIEWER"
  | "GUEST_LECTURER";

export interface TeachingAssignment {
  id: string;
  lecturer_id: string;
  institution_id: string;
  campus_id?: string;
  college_id?: string;
  department_id: string;
  option_id?: string;
  course_id: string;
  class_section_id?: string;
  academic_period_id: string;
  role: TeachingAssignmentRole;
  is_active: boolean;
  academic_year?: string;
  institution_name?: string;
  campus_name?: string;
  college_name?: string;
  department_name?: string;
  option_name?: string;
  course_name?: string;
  course_code?: string;
  class_section_name?: string;
  class_group_name?: string;
  class_group_level?: number;
  academic_period_name?: string | null;
  /** Set once the lecturer has set up the course space for this assignment. */
  workspace_id?: string | null;
  workspace_title?: string | null;
}

export const academicApi = {
  getLevels: async (institutionId?: string): Promise<number[]> => {
    const url = institutionId 
      ? `/academic-hierarchy/levels?institution_id=${institutionId}` 
      : "/academic-hierarchy/levels";
    return apiClient(url);
  },
  getInstitutions: async (): Promise<AcademicInstitution[]> => {
    return apiClient("/academic-hierarchy/institutions");
  },
  getCampuses: async (institutionId: string): Promise<AcademicCampus[]> => {
    return apiClient(`/academic-hierarchy/campuses?institution_id=${institutionId}`);
  },
  getColleges: async (params: { institution_id?: string; campus_id?: string }): Promise<AcademicCollege[]> => {
    const query = new URLSearchParams();
    if (params.institution_id) query.append("institution_id", params.institution_id);
    if (params.campus_id) query.append("campus_id", params.campus_id);
    return apiClient(`/academic-hierarchy/colleges?${query.toString()}`);
  },
  getDepartments: async (params: { institution_id?: string; campus_id?: string; college_id?: string }): Promise<AcademicDepartment[]> => {
    const query = new URLSearchParams();
    if (params.institution_id) query.append("institution_id", params.institution_id);
    if (params.campus_id) query.append("campus_id", params.campus_id);
    if (params.college_id) query.append("college_id", params.college_id);
    return apiClient(`/academic-hierarchy/departments?${query.toString()}`);
  },
  getOptions: async (departmentId: string): Promise<AcademicOption[]> => {
    return apiClient(`/academic-hierarchy/options?department_id=${departmentId}`);
  },
  getClassGroups: async (optionId: string): Promise<AcademicClassGroup[]> => {
    return apiClient(`/academic-hierarchy/class-groups?option_id=${optionId}`);
  },
  getSections: async (params: { class_group_id?: string; department_id?: string } | string): Promise<AcademicClassSection[]> => {
    if (typeof params === "string") {
      return apiClient(`/academic-hierarchy/sections?class_group_id=${params}`);
    }
    const query = new URLSearchParams();
    if (params.class_group_id) query.append("class_group_id", params.class_group_id);
    if (params.department_id) query.append("department_id", params.department_id);
    return apiClient(`/academic-hierarchy/sections?${query.toString()}`);
  },
  getCourses: async (departmentId: string): Promise<AcademicCourse[]> => {
    return apiClient(`/academic-hierarchy/courses?department_id=${departmentId}`);
  },
  getPeriods: async (institutionId?: string): Promise<AcademicPeriod[]> => {
    const url = institutionId 
      ? `/academic-hierarchy/academic-periods?institution_id=${institutionId}`
      : "/academic-hierarchy/academic-periods";
    return apiClient(url);
  },
  getMyAssignments: async (): Promise<TeachingAssignment[]> => {
    return apiClient("/lecturers/me/assignments");
  },
};

// Also export as individual functions for robustness
export const getAcademicPeriods = academicApi.getPeriods;

export interface TeachingAssignmentPayload {
  lecturer_id: string;
  institution_id: string;
  campus_id?: string | null;
  college_id?: string | null;
  department_id: string;
  option_id?: string | null;
  course_id: string;
  class_section_id?: string | null;
  academic_period_id: string;
  academic_year: string;
  role: TeachingAssignmentRole;
}

/**
 * Academic year label for a period, e.g. "2026" or "2026/2027" when it spans two calendar years.
 * A semester takes its academic year's label when `all` (the periods it may belong to) is given.
 */
export function academicYearOf(
  period: { start_date: string; end_date: string; parent_id?: string | null },
  all: { id: string; start_date: string; end_date: string }[] = [],
): string {
  const owner = (period.parent_id && all.find((p) => p.id === period.parent_id)) || period;
  const start = new Date(owner.start_date).getUTCFullYear();
  const end = new Date(owner.end_date).getUTCFullYear();
  return start === end ? String(start) : `${start}/${end}`;
}

export const adminAcademicApi = {
  // Teaching Assignments
  assignLecturer: async (data: TeachingAssignmentPayload) => {
    return apiClient("/admin/academic/assignments", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  /** Creates all assignments in one transaction: all succeed or none do. */
  assignLecturerBulk: async (data: TeachingAssignmentPayload[]): Promise<TeachingAssignment[]> => {
    return apiClient("/admin/academic/assignments/bulk", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  getLecturerAssignments: async (lecturerId?: string): Promise<TeachingAssignment[]> => {
    const url = lecturerId 
      ? `/admin/academic/assignments?lecturer_id=${lecturerId}`
      : "/admin/academic/assignments";
    return apiClient(url);
  },
  removeAssignment: async (assignmentId: string) => {
    return apiClient(`/admin/academic/assignments/${assignmentId}`, {
      method: "DELETE",
    });
  },

  // Academic Structure Creation
  createCampus: async (data: any) => {
    return apiClient("/admin/academic/campuses", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  createCollege: async (data: any) => {
    return apiClient("/admin/academic/colleges", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  createDepartment: async (data: any) => {
    return apiClient("/admin/academic/departments", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  createOption: async (data: any) => {
    return apiClient("/admin/academic/options", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  createClassGroup: async (data: any) => {
    return apiClient("/admin/academic/class-groups", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  createSection: async (data: any) => {
    return apiClient("/admin/academic/sections", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  /** Every period (active or not), newest first, with how many courses and assignments use it. */
  getAcademicPeriods: async (institutionId?: string): Promise<AcademicPeriodItem[]> => {
    const url = institutionId
      ? `/admin/academic/academic-periods?institution_id=${institutionId}`
      : "/admin/academic/academic-periods";
    return apiClient(url);
  },
  createAcademicPeriod: async (data: AcademicPeriodPayload): Promise<AcademicPeriod> => {
    return apiClient("/admin/academic/academic-periods", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  updateAcademicPeriod: async (id: string, data: Partial<Omit<AcademicPeriodPayload, "institution_id">>): Promise<AcademicPeriod> => {
    return apiClient(`/admin/academic/academic-periods/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  getPeriodEvents: async (periodId: string): Promise<CalendarEvent[]> => {
    return apiClient(`/admin/academic/academic-periods/${periodId}/calendar-events`);
  },
  createPeriodEvent: async (periodId: string, data: CalendarEventInput): Promise<CalendarEvent> => {
    return apiClient(`/admin/academic/academic-periods/${periodId}/calendar-events`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  updatePeriodEvent: async (eventId: string, data: Partial<CalendarEventInput>): Promise<CalendarEvent> => {
    return apiClient(`/admin/academic/calendar-events/${eventId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  deletePeriodEvent: async (eventId: string): Promise<void> => {
    await apiClient(`/admin/academic/calendar-events/${eventId}`, { method: "DELETE" });
  },
  /** First page of an uploaded calendar as an image (no AI), so a sideways scan can be rotated. */
  previewCalendarFile: async (file: File, rotation: number): Promise<CalendarPreview> => {
    const form = new FormData();
    form.append("file", file);
    form.append("rotation", String(rotation));
    return apiClient("/admin/academic/calendar/preview", { method: "POST", body: form });
  },
  /** The AI reads the calendar into a draft for review. Saves nothing. */
  extractCalendarFile: async (file: File, rotation: number): Promise<CalendarDraft> => {
    const form = new FormData();
    form.append("file", file);
    form.append("rotation", String(rotation));
    return apiClient("/admin/academic/calendar/extract", { method: "POST", body: form });
  },
  applyCalendarDraft: async (
    institutionId: string,
    draft: CalendarDraft,
  ): Promise<{ year_id: string; semester_ids: string[]; event_count: number }> => {
    return apiClient("/admin/academic/calendar/apply", {
      method: "POST",
      body: JSON.stringify({ institution_id: institutionId, draft }),
    });
  },
  createCourse: async (data: any) => {
    return apiClient("/admin/academic/courses", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  updateEntity: async (entityType: string, id: string, data: any) => {
    return apiClient(`/admin/academic/${entityType}/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  /** The whole structure of one institution in one request, inactive records included. */
  getStructure: async (institutionId: string): Promise<AcademicStructure> => {
    return apiClient(`/admin/academic/structure?institution_id=${institutionId}`);
  },
  /** Per-institution counts (campuses, departments, classes, students, courses). */
  getStructureOverview: async (): Promise<InstitutionOverview[]> => {
    return apiClient("/admin/academic/overview");
  },
};

export interface InstitutionOverview {
  institution_id: string;
  campuses: number;
  colleges: number;
  departments: number;
  programs: number;
  classes: number;
  students: number;
  courses: number;
}
