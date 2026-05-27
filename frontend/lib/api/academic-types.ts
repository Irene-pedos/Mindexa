export interface InstitutionResponse {
  id: string;
  name: string;
  code: string;
  logo_url?: string | null;
}

export interface CampusResponse {
  id: string;
  institution_id: string;
  name: string;
  code: string;
}

export interface CollegeResponse {
  id: string;
  campus_id: string;
  name: string;
  code: string;
}

export interface DepartmentResponse {
  id: string;
  institution_id: string;
  campus_id?: string | null;
  college_id?: string | null;
  name: string;
  code: string;
}

export interface OptionResponse {
  id: string;
  department_id: string;
  name: string;
  code: string;
}

export interface ClassGroupResponse {
  id: string;
  option_id: string;
  name: string;
  code: string;
  level?: number | null;
}

export interface ClassSectionResponse {
  id: string;
  class_group_id?: string | null;
  name: string;
  room?: string | null;
}

export interface CourseResponse {
  id: string;
  department_id: string;
  name: string;
  code: string;
}

export interface AcademicPeriodResponse {
  id: string;
  institution_id: string;
  name: string;
  is_active: boolean;
}
