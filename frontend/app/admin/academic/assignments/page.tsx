"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  academicApi,
  adminAcademicApi,
  AcademicInstitution,
  AcademicCampus,
  AcademicCollege,
  AcademicDepartment,
  AcademicOption,
  AcademicClassGroup,
  AcademicClassSection,
  AcademicCourse,
  getAcademicPeriods
} from "@/lib/api/academic";
import { adminApi } from "@/lib/api/admin";
import { apiClient } from "@/lib/api/client";
import { toast } from "sonner";
import {
    UserPlus,
    CheckCircle2,
    Users,
    Search,
    BookOpen,
    Loader2,
    Shield,
    ArrowRight,
    MapPin,
    School,
    Library,
    Building2,
    UserCircle,
    Check,
    Calendar,
    ChevronRight,
    Layers,
    LayoutGrid,
    Info,
    AlertCircle,
    Plus,
    Trash2,
    ChevronLeft
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSearchParams } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const STEPS = [
  { id: "staff", label: "Staff & Period", icon: UserCircle, description: "Identify lecturer" },
  { id: "scope", label: "Academic Scope", icon: Library, description: "Define faculty context" },
  { id: "refine", label: "Refine Context", icon: Layers, description: "Programs & Levels" },
  { id: "assign", label: "Deploy Modules", icon: BookOpen, description: "Select & finalize" },
];

export default function AdminAssignmentPanel() {
  const searchParams = useSearchParams();
  const preSelectedLecturerId = searchParams.get("lecturer_id");

  const [viewMode, setViewMode] = useState<"registry" | "create">(preSelectedLecturerId ? "create" : "registry");

  const [activeStep, setActiveStep] = useState("staff");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Data lists
  const [lecturers, setLecturers] = useState<any[]>([]);
  const [institutions, setInstitutions] = useState<AcademicInstitution[]>([]);
  const [campuses, setCampuses] = useState<AcademicCampus[]>([]);
  const [colleges, setColleges] = useState<AcademicCollege[]>([]);
  const [departments, setDepartments] = useState<AcademicDepartment[]>([]);
  const [options, setOptions] = useState<AcademicOption[]>([]);
  const [classGroups, setClassGroups] = useState<AcademicClassGroup[]>([]);
  const [sections, setSections] = useState<AcademicClassSection[]>([]);
  const [availableCourses, setAvailableCourses] = useState<AcademicCourse[]>([]);
  const [academicPeriods, setAcademicPeriods] = useState<any[]>([]);
  const [assignedCourseIds, setAssignedCourseIds] = useState<Set<string>>(new Set());
  
  // Master List
  const [allAssignments, setAllAssignments] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;
  const [isProcessingRow, setIsProcessingRow] = useState<string | null>(null);

  // Fetch tracking
  const [isFetching, setIsFetching] = useState<Record<string, boolean>>({});

  // Selections
  const [selectedLecturer, setSelectedLecturer] = useState<string>("");
  const [selectedInst, setSelectedInst] = useState<string>("");
  const [selectedCampus, setSelectedCampus] = useState<string>("none");
  const [selectedCollege, setSelectedCollege] = useState<string>("none");
  const [selectedDept, setSelectedDept] = useState<string>("");
  const [selectedOpt, setSelectedOpt] = useState<string>("none");
  const [selectedGroup, setSelectedGroup] = useState<string>("none");
  const [selectedSection, setSelectedSection] = useState<string>("none");
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>("");
  const [selectedCourses, setSelectedCourses] = useState<Set<string>>(new Set());
  const [selectedRole, setSelectedRole] = useState<string>("MAIN_LECTURER");

  const [courseSearch, setCourseSearch] = useState("");

  const loadAssignments = useCallback(async () => {
    try {
      const data = await adminAcademicApi.getLecturerAssignments();
      setAllAssignments(data);
    } catch (err) {
      toast.error("Failed to load assignments");
    }
  }, []);

  useEffect(() => {
    async function init() {
      try {
        const [usersRes, instRes, periodsRes] = await Promise.all([
          adminApi.getLecturers(),
          academicApi.getInstitutions(),
          getAcademicPeriods()
        ]);
        setLecturers(usersRes);
        setInstitutions(instRes);
        setAcademicPeriods(periodsRes);
        await loadAssignments();

        if (preSelectedLecturerId && usersRes.some((l: any) => l.id === preSelectedLecturerId)) {
          setSelectedLecturer(preSelectedLecturerId);
        }
      } catch (err) {
        toast.error("Failed to initialize assignment data");
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [preSelectedLecturerId, loadAssignments]);

  useEffect(() => {
    if (selectedLecturer && viewMode === "create") {
      adminAcademicApi.getLecturerAssignments(selectedLecturer)
        .then(assignments => {
          setAssignedCourseIds(new Set(assignments.map(a => a.course_id)));
        })
        .catch(() => setAssignedCourseIds(new Set()));
    } else if (viewMode === "create") {
      setAssignedCourseIds(new Set());
    }
  }, [selectedLecturer, viewMode]);

  // Cascading Logic
  useEffect(() => {
    if (selectedInst && viewMode === "create") {
      setIsFetching(prev => ({ ...prev, campuses: true, colleges: true }));
      academicApi.getCampuses(selectedInst)
        .then(setCampuses)
        .finally(() => setIsFetching(prev => ({ ...prev, campuses: false })));

      academicApi.getColleges({ institution_id: selectedInst })
        .then(setColleges)
        .finally(() => setIsFetching(prev => ({ ...prev, colleges: false })));

      setSelectedCampus("none");
      setSelectedCollege("none");
      setSelectedDept("");
    } else if (viewMode === "create") {
      setCampuses([]);
      setColleges([]);
    }
  }, [selectedInst, viewMode]);

  useEffect(() => {
    if (selectedCampus && selectedCampus !== "none" && viewMode === "create") {
      setIsFetching(prev => ({ ...prev, colleges: true }));
      academicApi.getColleges({ campus_id: selectedCampus })
        .then(setColleges)
        .finally(() => setIsFetching(prev => ({ ...prev, colleges: false })));

      setSelectedCollege("none");
      setSelectedDept("");
    } else if (selectedInst && viewMode === "create") {
      setIsFetching(prev => ({ ...prev, colleges: true }));
      academicApi.getColleges({ institution_id: selectedInst })
        .then(setColleges)
        .finally(() => setIsFetching(prev => ({ ...prev, colleges: false })));
    }
  }, [selectedCampus, selectedInst, viewMode]);

  useEffect(() => {
    if (selectedInst && viewMode === "create") {
        setIsFetching(prev => ({ ...prev, depts: true }));
        const params: any = { institution_id: selectedInst };
        if (selectedCampus !== "none") params.campus_id = selectedCampus;
        if (selectedCollege !== "none") params.college_id = selectedCollege;

        academicApi.getDepartments(params)
            .then(setDepartments)
            .finally(() => setIsFetching(prev => ({ ...prev, depts: false })));
        setSelectedDept("");
    }
  }, [selectedCollege, selectedCampus, selectedInst, viewMode]);

  useEffect(() => {
    if (selectedDept && viewMode === "create") {
      setIsFetching(prev => ({ ...prev, options: true, courses: true, sections: true }));
      
      // 1. Fetch Programs
      academicApi.getOptions(selectedDept)
        .then(setOptions)
        .finally(() => setIsFetching(prev => ({ ...prev, options: false })));

      // 2. Fetch Courses
      academicApi.getCourses(selectedDept)
        .then(setAvailableCourses)
        .finally(() => setIsFetching(prev => ({ ...prev, courses: false })));

      // 3. Fetch Sections directly under Dept (for institutions without levels)
      academicApi.getSections({ department_id: selectedDept })
        .then(setSections)
        .finally(() => setIsFetching(prev => ({ ...prev, sections: false })));

      setSelectedOpt("none");
      setSelectedCourses(new Set());
    }
  }, [selectedDept, viewMode]);

  useEffect(() => {
    if (selectedOpt && selectedOpt !== "none" && viewMode === "create") {
      setIsFetching(prev => ({ ...prev, groups: true }));
      academicApi.getClassGroups(selectedOpt)
        .then(setClassGroups)
        .finally(() => setIsFetching(prev => ({ ...prev, groups: false })));
      setSelectedGroup("none");
    }
  }, [selectedOpt, viewMode]);

  useEffect(() => {
    if (selectedGroup && selectedGroup !== "none" && viewMode === "create") {
      setIsFetching(prev => ({ ...prev, sections: true }));
      academicApi.getSections(selectedGroup)
        .then(setSections)
        .finally(() => setIsFetching(prev => ({ ...prev, sections: false })));
      setSelectedSection("none");
    }
  }, [selectedGroup, viewMode]);

  const toggleCourse = (courseId: string) => {
    const next = new Set(selectedCourses);
    if (next.has(courseId)) next.delete(courseId);
    else next.add(courseId);
    setSelectedCourses(next);
  };

  const handleAssign = async () => {
    if (!selectedLecturer || selectedCourses.size === 0 || !selectedPeriodId) {
      toast.error("Please select lecturer, courses, and academic period.");
      return;
    }

    const selectedPeriod = academicPeriods.find(p => p.id === selectedPeriodId);
    if (!selectedPeriod) {
        toast.error("Invalid academic period selected.");
        return;
    }

    setSubmitting(true);
    try {
      const promises = Array.from(selectedCourses).map(courseId =>
        adminAcademicApi.assignLecturer({
          lecturer_id: selectedLecturer,
          institution_id: selectedInst,
          campus_id: selectedCampus !== "none" ? selectedCampus : null,
          college_id: selectedCollege !== "none" ? selectedCollege : null,
          department_id: selectedDept,
          option_id: selectedOpt !== "none" ? selectedOpt : null,
          course_id: courseId,
          class_section_id: selectedSection !== "none" ? selectedSection : null,
          academic_period_id: selectedPeriodId,
          academic_year: selectedPeriod.name,
          role: selectedRole
        })
      );

      await Promise.all(promises);
      toast.success("Courses assigned successfully");
      setSelectedCourses(new Set());
      await loadAssignments();
      setViewMode("registry");
      setActiveStep("staff");
      setSelectedInst("");
      setSelectedDept("");
      setSelectedPeriodId("");
      setSelectedLecturer("");

    } catch (err) {
      toast.error("Failed to assign courses");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemoveAssignment = async (id: string) => {
    if (!confirm("Are you sure you want to remove this assignment?")) return;
    setIsProcessingRow(id);
    try {
      await adminAcademicApi.removeAssignment(id);
      toast.success("Assignment removed");
      await loadAssignments();
    } catch (err) {
      toast.error("Failed to remove assignment");
    } finally {
      setIsProcessingRow(null);
    }
  };

  const filteredCourses = useMemo(() => {
      return availableCourses.filter(c =>
          (c.code || "").toLowerCase().includes(courseSearch.toLowerCase()) ||
          (c.name || (c as any).title || "").toLowerCase().includes(courseSearch.toLowerCase())
      );
  }, [availableCourses, courseSearch]);

  const validateStep = (stepId: string) => {
      if (stepId === "scope") return !!selectedLecturer && !!selectedPeriodId;
      if (stepId === "refine") return !!selectedDept;
      if (stepId === "assign") return !!selectedDept;
      return true;
  };

  const filteredAssignments = useMemo(() => {
    return allAssignments.filter(a => {
        const lect = lecturers.find(l => l.id === a.lecturer_id);
        const name = lect ? `${lect.profile?.first_name || ''} ${lect.profile?.last_name || ''}`.toLowerCase() : '';
        const course = (a.course_name || '').toLowerCase();
        const search = searchTerm.toLowerCase();
        return name.includes(search) || course.includes(search);
    });
  }, [allAssignments, searchTerm, lecturers]);

  const paginatedAssignments = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAssignments.slice(start, start + pageSize);
  }, [filteredAssignments, currentPage]);

  const totalPages = Math.ceil(filteredAssignments.length / pageSize) || 1;

  if (loading) {
    return (
        <div className="flex flex-col gap-6 h-full p-6 animate-pulse">
            <div className="h-20 bg-muted/20 rounded-2xl border" />
            <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-muted/10 rounded-2xl border" />
                <div className="md:col-span-3 bg-muted/10 rounded-2xl border" />
            </div>
        </div>
    );
  }

  if (viewMode === "registry") {
    return (
      <div className="flex flex-col h-[calc(100vh-120px)] overflow-hidden">
        <div className="flex items-center justify-between mb-4 border-b border-muted/20 pb-4">
          <div>
            <h1 className="text-xl font-semibold text-primary tracking-tight flex items-center gap-2">
              <Users className="size-5" />
              Teaching Assignments
            </h1>
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest mt-0.5">Faculty Deployment Registry</p>
          </div>
          
          <Button 
            size="sm" 
            className="h-8 rounded-lg gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-[10px] uppercase tracking-wider px-4 shadow-none"
            onClick={() => setViewMode("create")}
          >
            <Plus className="size-3.5" />
            New Assignment
          </Button>
        </div>

        <Card className="flex-1 flex flex-col border shadow-none overflow-hidden rounded-xl bg-white">
            <div className="p-3 border-b border-muted/10 bg-muted/5 flex items-center gap-3">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                    <Input 
                        placeholder="Search by lecturer or module..." 
                        className="pl-9 h-8 text-[11px] rounded-lg border-muted/30 bg-white focus:border-primary/40 focus:ring-0 transition-all"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>
            
            <div className="flex-1 overflow-auto">
                <Table>
                    <TableHeader className="bg-muted/5 border-b border-muted/10 sticky top-0 z-10 backdrop-blur-sm">
                        <TableRow className="hover:bg-transparent">
                            <TableHead className="text-[9px] uppercase font-semibold tracking-widest h-8 pl-5">Lecturer</TableHead>
                            <TableHead className="text-[9px] uppercase font-semibold tracking-widest h-8">Assigned Module</TableHead>
                            <TableHead className="text-[9px] uppercase font-semibold tracking-widest h-8">Role</TableHead>
                            <TableHead className="text-[9px] uppercase font-semibold tracking-widest h-8">Period</TableHead>
                            <TableHead className="text-right text-[9px] uppercase font-semibold tracking-widest h-8 pr-5">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {paginatedAssignments.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="h-48 text-center">
                                    <div className="flex flex-col items-center justify-center opacity-40">
                                        <BookOpen className="size-6 text-muted-foreground mb-2" />
                                        <p className="text-[10px] font-semibold uppercase tracking-widest">No assignments found</p>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : (
                            paginatedAssignments.map((assignment) => {
                                const lect = lecturers.find(l => l.id === assignment.lecturer_id);
                                const lectName = lect ? `${lect.profile?.first_name || ''} ${lect.profile?.last_name || ''}` : "Unknown Lecturer";
                                return (
                                    <TableRow key={assignment.id} className="group transition-colors h-11 border-muted/5 hover:bg-muted/5">
                                        <TableCell className="pl-5">
                                            <div className="flex items-center gap-3">
                                                <div className="size-6 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-[9px] uppercase">
                                                    {lectName[0]}
                                                </div>
                                                <div>
                                                    <p className="text-[11px] font-semibold text-foreground uppercase tracking-tight">{lectName}</p>
                                                    <p className="text-[9px] text-muted-foreground font-medium">{lect?.profile?.staff_id || lect?.email}</p>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col gap-0.5">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[11px] font-semibold text-foreground/90 uppercase tracking-tight">{assignment.course_name}</span>
                                                    {assignment.course_code && (
                                                        <Badge variant="outline" className="text-[8px] h-3 px-1 font-mono font-bold text-primary border-primary/20 bg-primary/5">{assignment.course_code}</Badge>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-[9px] font-medium text-muted-foreground uppercase">{assignment.department_name}</span>
                                                    {assignment.class_group_level && (
                                                        <Badge variant="secondary" className="text-[8px] h-3.5 px-1 bg-muted/50 border-none uppercase font-bold text-muted-foreground">LVL {assignment.class_group_level}</Badge>
                                                    )}
                                                    {assignment.class_section_name && (
                                                        <Badge variant="outline" className="text-[8px] h-3.5 px-1 border-muted/20 uppercase font-bold text-primary/70">SEC {assignment.class_section_name}</Badge>
                                                    )}
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className="text-[8px] h-4 uppercase font-bold border-muted/30">
                                                {assignment.role.replace("_", " ")}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-[10px] font-medium text-muted-foreground">
                                            {assignment.academic_year}
                                        </TableCell>
                                        <TableCell className="text-right pr-5">
                                            <Button 
                                                variant="ghost" 
                                                size="icon" 
                                                className="size-6 rounded-md hover:bg-red-50 hover:text-red-600 transition-colors"
                                                onClick={() => handleRemoveAssignment(assignment.id)}
                                                disabled={isProcessingRow === assignment.id}
                                            >
                                                {isProcessingRow === assignment.id ? <Loader2 className="size-3 animate-spin text-red-600" /> : <Trash2 className="size-3" />}
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                );
                            })
                        )}
                    </TableBody>
                </Table>
            </div>
            <div className="p-2 border-t border-muted/10 flex items-center justify-between px-5 bg-muted/5">
                <p className="text-[9px] text-muted-foreground font-semibold uppercase tracking-widest">
                    PG {currentPage} / {totalPages}
                </p>
                <div className="flex items-center gap-1">
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        className="size-6 rounded-md" 
                        disabled={currentPage === 1}
                        onClick={() => setCurrentPage(p => p - 1)}
                    >
                        <ChevronLeft className="size-3" />
                    </Button>
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        className="size-6 rounded-md"
                        disabled={currentPage >= totalPages}
                        onClick={() => setCurrentPage(p => p + 1)}
                    >
                        <ChevronRight className="size-3" />
                    </Button>
                </div>
            </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] overflow-hidden">
      <div className="flex items-center justify-between mb-4 border-b border-muted/20 pb-4">
        <div>
          <h1 className="text-xl font-semibold text-primary tracking-tight flex items-center gap-2">
            <Users className="size-5" />
            New Assignment
          </h1>
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest mt-0.5">Faculty Deployment Console</p>
        </div>
        
        <div className="flex items-center gap-3">
            <Button 
                variant="ghost" 
                size="sm" 
                className="h-8 rounded-lg gap-2 text-muted-foreground font-semibold text-[10px] uppercase tracking-wider px-4"
                onClick={() => setViewMode("registry")}
            >
                <ChevronLeft className="size-3.5" /> Back to Registry
            </Button>

            <div className="flex items-center gap-2 bg-muted/10 px-3 py-1.5 rounded-lg border border-muted/30">
                <Calendar className="size-3 text-primary/60" />
                <span className="text-[9px] font-semibold text-muted-foreground uppercase">Registry Instance</span>
                <Select value={selectedPeriodId} onValueChange={setSelectedPeriodId}>
                    <SelectTrigger className="w-[180px] h-6 border-none shadow-none bg-transparent text-xs font-semibold p-0 focus:ring-0 text-primary">
                        <SelectValue placeholder="Select Period" />
                    </SelectTrigger>
                    <SelectContent>
                        {academicPeriods.map(p => (
                            <SelectItem key={p.id} value={p.id} className="text-xs font-medium">{p.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
        </div>
      </div>

      <div className="flex flex-1 gap-6 overflow-hidden">
        {/* Step Navigation Sidebar */}
        <div className="w-64 flex flex-col gap-1 pr-1 border-r border-muted/10 overflow-y-auto">
            {STEPS.map((step, idx) => {
                const Icon = step.icon;
                const isActive = activeStep === step.id;
                const isValid = validateStep(step.id);
                const isCompleted = idx < STEPS.findIndex(s => s.id === activeStep) && validateStep(STEPS[idx+1].id);

                return (
                    <button
                        key={step.id}
                        onClick={() => isValid && setActiveStep(step.id)}
                        className={cn(
                            "flex items-center gap-3 p-3 rounded-xl transition-all text-left group relative border w-full",
                            isActive 
                                ? "bg-primary/5 text-primary border-primary/20" 
                                : !isValid ? "opacity-40 cursor-not-allowed border-transparent" : "hover:bg-muted/10 text-muted-foreground border-transparent"
                        )}
                    >
                        <div className={cn(
                            "size-8 rounded-lg flex items-center justify-center border transition-colors",
                            isActive ? "bg-primary text-primary-foreground border-primary" : 
                            isCompleted ? "bg-emerald-50 text-emerald-600 border-emerald-200" :
                            "bg-muted/10 border-muted/40 group-hover:bg-white"
                        )}>
                            {isCompleted ? <CheckCircle2 className="size-4" /> : <Icon className="size-4" />}
                        </div>
                        <div className="flex-1">
                            <p className="text-[11px] font-semibold uppercase tracking-tight leading-none mb-1">{step.label}</p>
                            <p className="text-[9px] opacity-70 leading-none font-medium">{step.description}</p>
                        </div>
                        {isActive && <ArrowRight className="size-3 absolute right-2" />}
                        {!isValid && <AlertCircle className="size-3 absolute right-2 text-amber-500 opacity-60" />}
                    </button>
                );
            })}

            <div className="mt-auto p-4 bg-muted/5 rounded-xl border border-muted/10">
                <div className="flex justify-between items-center mb-3 px-1">
                    <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest">Workflow State</p>
                    <span className="text-[9px] font-bold text-primary">
                        {Math.round(((STEPS.findIndex(s => s.id === activeStep) + 1) / STEPS.length) * 100)}%
                    </span>
                </div>
                <div className="flex gap-1 h-1">
                    {STEPS.map((_, i) => (
                        <div 
                            key={i} 
                            className={cn(
                                "flex-1 rounded-full transition-all duration-300", 
                                i <= STEPS.findIndex(s => s.id === activeStep) ? "bg-primary" : "bg-muted/30"
                            )} 
                        />
                    ))}
                </div>
            </div>
        </div>

        {/* Content Area - Scrollable */}
        <div className="flex-1 flex flex-col overflow-hidden bg-white border border-muted/10 rounded-xl">
            <ScrollArea className="flex-1">
                <div className="p-8">
                    {activeStep === "staff" && (
                        <div className="max-w-2xl space-y-8 animate-in fade-in duration-300">
                            <div className="grid grid-cols-1 gap-6">
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground ml-1">Primary Lecturer / Associate</Label>
                                    <Select value={selectedLecturer} onValueChange={setSelectedLecturer}>
                                        <SelectTrigger className="h-10 rounded-xl border-muted/30 font-medium text-sm bg-muted/5 focus:ring-1 focus:ring-primary/40">
                                            <div className="flex items-center gap-2">
                                                <UserCircle className="size-4 text-primary/60" />
                                                <SelectValue placeholder="Search registry for staff name..." />
                                            </div>
                                        </SelectTrigger>
                                        <SelectContent>
                                            {lecturers.map(l => (
                                                <SelectItem key={l.id} value={l.id} className="text-xs font-medium">
                                                    {l.profile?.first_name} {l.profile?.last_name} ({l.profile?.staff_id || l.email})
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="grid grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground ml-1">Institutional Role</Label>
                                        <Select value={selectedRole} onValueChange={setSelectedRole}>
                                            <SelectTrigger className="h-10 rounded-xl border-muted/30 text-sm font-semibold text-primary">
                                                <div className="flex items-center gap-2">
                                                    <Shield className="size-4" />
                                                    <SelectValue />
                                                </div>
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="MAIN_LECTURER" className="text-xs font-medium">Main Lecturer</SelectItem>
                                                <SelectItem value="ASSISTANT_LECTURER" className="text-xs font-medium">Assistant</SelectItem>
                                                <SelectItem value="SUPERVISOR" className="text-xs font-medium">Supervisor</SelectItem>
                                                <SelectItem value="REVIEWER" className="text-xs font-medium">Reviewer</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="flex flex-col justify-end">
                                        <div className="h-10 px-4 rounded-xl border border-dashed border-emerald-200 bg-emerald-50/50 flex items-center gap-2.5 text-emerald-700">
                                            <CheckCircle2 className="size-4" />
                                            <span className="text-[10px] font-bold uppercase tracking-tight">Identity Validated</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="p-5 rounded-2xl border border-primary/10 bg-primary/5 flex items-start gap-4">
                                <Info className="size-5 text-primary shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-xs font-semibold text-primary uppercase tracking-tight">Step 1 Requirements</p>
                                    <p className="text-[11px] text-muted-foreground font-medium leading-relaxed mt-1">
                                        Selecting a lecturer and a valid academic period is mandatory to proceed with module deployment.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeStep === "scope" && (
                        <div className="max-w-2xl space-y-8 animate-in fade-in duration-300">
                            <div className="grid grid-cols-1 gap-6">
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground ml-1">University / Institution</Label>
                                    <Select value={selectedInst} onValueChange={setSelectedInst}>
                                        <SelectTrigger className="h-10 rounded-xl border-muted/30 text-sm font-medium bg-muted/5">
                                            <div className="flex items-center gap-2">
                                                <Building2 className="size-4 text-primary/60" />
                                                <SelectValue placeholder="Select Institutional Node" />
                                            </div>
                                        </SelectTrigger>
                                        <SelectContent>
                                            {institutions.map(i => (
                                                <SelectItem key={i.id} value={i.id} className="text-xs font-medium">{i.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="grid grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground ml-1">Campus (If applicable)</Label>
                                        <Select value={selectedCampus} onValueChange={setSelectedCampus} disabled={!selectedInst || isFetching.campuses}>
                                            <SelectTrigger className="h-10 rounded-xl border-muted/30 text-sm font-medium bg-white">
                                                <div className="flex items-center gap-2">
                                                    <MapPin className="size-4 text-muted-foreground/50" />
                                                    <SelectValue placeholder="No Campus" />
                                                </div>
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="none" className="text-xs font-medium">No Specific Campus</SelectItem>
                                                {campuses.map(c => (
                                                    <SelectItem key={c.id} value={c.id} className="text-xs font-medium">{c.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground ml-1">College / School</Label>
                                        <Select value={selectedCollege} onValueChange={setSelectedCollege} disabled={!selectedInst || isFetching.colleges}>
                                            <SelectTrigger className="h-10 rounded-xl border-muted/30 text-sm font-medium bg-white">
                                                <div className="flex items-center gap-2">
                                                    <School className="size-4 text-muted-foreground/50" />
                                                    <SelectValue placeholder="No College" />
                                                </div>
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="none" className="text-xs font-medium">No Specific College</SelectItem>
                                                {colleges.map(c => (
                                                    <SelectItem key={c.id} value={c.id} className="text-xs font-medium">{c.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground ml-1">Deployment Department</Label>
                                    <Select value={selectedDept} onValueChange={setSelectedDept} disabled={!selectedInst || isFetching.depts}>
                                        <SelectTrigger className={cn("h-11 rounded-xl border-muted/30 text-sm font-semibold bg-muted/5 transition-all", !!selectedDept && "text-primary border-primary/20 bg-primary/[0.02]")}>
                                            <div className="flex items-center gap-2">
                                                <Library className="size-4" />
                                                <SelectValue placeholder="Assign to Department..." />
                                            </div>
                                        </SelectTrigger>
                                        <SelectContent>
                                            {departments.map(d => (
                                                <SelectItem key={d.id} value={d.id} className="text-xs font-medium">{d.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeStep === "refine" && (
                        <div className="max-w-2xl space-y-8 animate-in fade-in duration-300">
                             <div className="grid grid-cols-1 gap-6">
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground ml-1">Degree Program / Specialization</Label>
                                    <Select value={selectedOpt} onValueChange={setSelectedOpt} disabled={!selectedDept || isFetching.options}>
                                        <SelectTrigger className="h-10 rounded-xl border-muted/30 text-sm font-medium bg-muted/5">
                                            <div className="flex items-center gap-2">
                                                <Layers className="size-4 text-muted-foreground/50" />
                                                <SelectValue placeholder="Global Departmental (All Programs)" />
                                            </div>
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none" className="text-xs font-medium">Global (No Specific Program)</SelectItem>
                                            {options.map(o => (
                                                <SelectItem key={o.id} value={o.id} className="text-xs font-medium">{o.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="grid grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground ml-1">Academic Level</Label>
                                        <Select value={selectedGroup} onValueChange={setSelectedGroup} disabled={selectedOpt === "none" || isFetching.groups}>
                                            <SelectTrigger className="h-10 rounded-xl border-muted/30 text-sm font-medium bg-white">
                                                <div className="flex items-center gap-2">
                                                    <LayoutGrid className="size-4 text-muted-foreground/50" />
                                                    <SelectValue placeholder="All Levels" />
                                                </div>
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="none" className="text-xs font-medium">All Levels</SelectItem>
                                                {classGroups.map(g => (
                                                    <SelectItem key={g.id} value={g.id} className="text-xs font-medium">
                                                        {g.level ? `Level ${g.level} - ${g.name}` : g.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground ml-1">Specific Class Section</Label>
                                        <Select value={selectedSection} onValueChange={setSelectedSection} disabled={selectedGroup === "none" || isFetching.sections}>
                                            <SelectTrigger className="h-10 rounded-xl border-muted/30 text-sm font-medium bg-white">
                                                <div className="flex items-center gap-2">
                                                    <Users className="size-4 text-muted-foreground/50" />
                                                    <SelectValue placeholder="Entire Class Cohort" />
                                                </div>
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="none" className="text-xs font-medium">Entire Class Cohort (Global)</SelectItem>
                                                {sections.map(s => (
                                                    <SelectItem key={s.id} value={s.id} className="text-xs font-medium">Section {s.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                             </div>
                             
                             <p className="text-[10px] text-muted-foreground font-medium italic border-l-2 border-primary/20 pl-4 py-1">
                                Note: These filters are optional. If not selected, the lecturer will be assigned to all courses within the department scope.
                             </p>
                        </div>
                    )}

                    {activeStep === "assign" && (
                        <div className="space-y-6 animate-in fade-in duration-300">
                             <div className="flex flex-col gap-4">
                                <div className="flex items-center justify-between px-1">
                                    <div className="space-y-0.5">
                                        <h3 className="text-sm font-semibold uppercase tracking-widest text-foreground/80">Available Modules</h3>
                                        <p className="text-[10px] font-medium text-muted-foreground">Select one or more courses for deployment</p>
                                    </div>
                                    <Badge variant="outline" className="h-6 px-3 rounded-full bg-primary/5 text-primary border-primary/20 font-bold tabular-nums">
                                        {selectedCourses.size} SELECTED
                                    </Badge>
                                </div>

                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                                    <Input 
                                        placeholder="Filter available modules by name or code..." 
                                        className="pl-9 h-9 text-xs rounded-xl border-muted/30 bg-muted/5 focus:bg-white transition-all"
                                        value={courseSearch}
                                        onChange={(e) => setCourseSearch(e.target.value)}
                                    />
                                </div>

                                <Card className="border border-muted/10 rounded-xl overflow-hidden shadow-none">
                                    <div className="max-h-[350px] overflow-y-auto divide-y divide-muted/10">
                                        {isFetching.courses ? (
                                            [1, 2, 3].map(i => (
                                                <div key={i} className="p-4 flex items-center gap-4">
                                                    <Skeleton className="size-4 rounded" />
                                                    <div className="space-y-2 flex-1">
                                                        <Skeleton className="h-3 w-1/3" />
                                                        <Skeleton className="h-2 w-2/3" />
                                                    </div>
                                                </div>
                                            ))
                                        ) : filteredCourses.length === 0 ? (
                                            <div className="py-20 text-center opacity-30">
                                                <BookOpen className="size-10 mx-auto mb-3" />
                                                <p className="text-[10px] font-bold uppercase tracking-widest">No matching modules found</p>
                                            </div>
                                        ) : (
                                            filteredCourses.map(course => {
                                                const isAssigned = assignedCourseIds.has(course.id);
                                                const isSelected = selectedCourses.has(course.id);
                                                return (
                                                    <div
                                                        key={course.id}
                                                        className={cn(
                                                            "p-4 flex items-center gap-4 transition-colors border-l-4 border-transparent",
                                                            isAssigned ? "bg-emerald-50/20 opacity-70 border-l-emerald-500" : "hover:bg-muted/5 cursor-pointer",
                                                            isSelected && "bg-primary/[0.03] border-l-primary"
                                                        )}
                                                        onClick={() => !isAssigned && toggleCourse(course.id)}
                                                    >
                                                        <div className={cn(
                                                            "size-5 rounded border transition-all flex items-center justify-center",
                                                            isSelected ? "bg-primary border-primary" : 
                                                            isAssigned ? "bg-emerald-500 border-emerald-500" : "bg-white border-muted-foreground/30"
                                                        )}>
                                                            {(isSelected || isAssigned) && <Check className="size-3 text-white stroke-[3px]" />}
                                                        </div>
                                                        <div className="flex-1 flex flex-col gap-0.5">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-xs font-semibold text-foreground uppercase tracking-tight">{course.name || (course as any).title}</span>
                                                                <Badge variant="outline" className="text-[9px] h-4 font-mono font-bold text-primary border-primary/20 bg-primary/5">{course.code}</Badge>
                                                            </div>
                                                            <p className="text-[9px] text-muted-foreground font-medium uppercase tracking-tight flex items-center gap-1.5 mt-0.5">
                                                                {isAssigned ? (
                                                                    <><CheckCircle2 className="size-3 text-emerald-500" /> Already in Staff Portfolio</>
                                                                ) : (
                                                                    <><Layers className="size-3" /> Eligible for Registry Assignment</>
                                                                )}
                                                            </p>
                                                        </div>
                                                        {isAssigned && <span className="text-[8px] font-bold text-emerald-700 uppercase px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-100">Assigned</span>}
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                </Card>
                             </div>
                        </div>
                    )}
                </div>
            </ScrollArea>

            {/* Stepper Controls */}
            <div className="p-4 border-t border-muted/10 bg-muted/5 flex items-center justify-between px-8">
                <Button
                    variant="ghost"
                    disabled={activeStep === "staff" || submitting}
                    onClick={() => {
                        const idx = STEPS.findIndex(s => s.id === activeStep);
                        setActiveStep(STEPS[idx-1].id);
                    }}
                    className="h-9 px-6 rounded-lg font-semibold text-[10px] uppercase tracking-widest gap-2"
                >
                    <ChevronRight className="size-3.5 rotate-180" /> Previous Step
                </Button>

                <div className="flex items-center gap-3">
                    {activeStep !== "assign" ? (
                        <Button
                            disabled={!validateStep(STEPS[STEPS.findIndex(s => s.id === activeStep) + 1]?.id)}
                            onClick={() => {
                                const idx = STEPS.findIndex(s => s.id === activeStep);
                                setActiveStep(STEPS[idx+1].id);
                            }}
                            className="h-9 px-8 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-[10px] uppercase tracking-widest gap-2 shadow-none"
                        >
                            Continue Deployment <ArrowRight className="size-3.5" />
                        </Button>
                    ) : (
                        <Button
                            disabled={selectedCourses.size === 0 || submitting}
                            onClick={handleAssign}
                            className="h-9 px-10 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-[10px] uppercase tracking-widest gap-2 shadow-none transition-all"
                        >
                            {submitting ? <Loader2 className="size-3.5 animate-spin" /> : <UserPlus className="size-3.5" />}
                            {submitting ? "Transmitting..." : `Finalize ${selectedCourses.size} Assignments`}
                        </Button>
                    )}
                </div>
            </div>
        </div>
      </div>
    </div>
  );
}

