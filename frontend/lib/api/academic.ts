import { apiClient } from "./client";
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
  role: "MAIN_LECTURER" | "ASSISTANT_LECTURER" | "SUPERVISOR" | "REVIEWER";
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

export const adminAcademicApi = {
  // Teaching Assignments
  assignLecturer: async (data: any) => {
    return apiClient("/admin/academic/assignments", {
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
  getAcademicPeriods: async (institutionId?: string): Promise<AcademicPeriod[]> => {
    const url = institutionId 
      ? `/admin/academic/academic-periods?institution_id=${institutionId}`
      : "/admin/academic/academic-periods";
    return apiClient(url);
  },
  createAcademicPeriod: async (data: any) => {
    return apiClient("/admin/academic/academic-periods", {
      method: "POST",
      body: JSON.stringify(data),
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
};
