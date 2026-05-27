"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle, 
  CardDescription,
  CardFooter
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
import { GraduationCap, UserPlus, CheckCircle2, UserCircle, Users, ArrowUp, ArrowDown, Search, BookOpen, Check, Loader2, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { useSearchParams } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function AdminAssignmentPanel() {
  const searchParams = useSearchParams();
  const preSelectedLecturerId = searchParams.get("lecturer_id");
  
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

  // Fetch tracking
  const [isFetchingCampuses, setIsFetchingCampuses] = useState(false);
  const [isFetchingColleges, setIsFetchingColleges] = useState(false);
  const [isFetchingOptions, setIsFetchingOptions] = useState(false);
  const [isFetchingGroups, setIsFetchingGroups] = useState(false);
  const [isFetchingSections, setIsFetchingSections] = useState(false);
  const [isFetchingCourses, setIsFetchingCourses] = useState(false);

  // Selections
  const [selectedLecturer, setSelectedLecturer] = useState<string>("");
  const [selectedInst, setSelectedInst] = useState<string>("");
  const [selectedCampus, setSelectedCampus] = useState<string>("");
  const [selectedCollege, setSelectedCollege] = useState<string>("");
  const [selectedDept, setSelectedDept] = useState<string>("");
  const [selectedOpt, setSelectedOpt] = useState<string>("");
  const [selectedGroup, setSelectedGroup] = useState<string>("");
  const [selectedSection, setSelectedSection] = useState<string>("");
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>("");
  const [selectedCourses, setSelectedCourses] = useState<Set<string>>(new Set());
  const [selectedRole, setSelectedRole] = useState<string>("MAIN_LECTURER");

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
  }, [preSelectedLecturerId]);

  useEffect(() => {
    if (selectedLecturer) {
      adminAcademicApi.getLecturerAssignments(selectedLecturer)
        .then(assignments => {
          setAssignedCourseIds(new Set(assignments.map(a => a.course_id)));
        })
        .catch(() => setAssignedCourseIds(new Set()));
    } else {
      setAssignedCourseIds(new Set());
    }
  }, [selectedLecturer]);

  // Cascading Effects
  useEffect(() => {
    if (selectedInst) {
      setIsFetchingCampuses(true);
      academicApi.getCampuses(selectedInst)
        .then(setCampuses)
        .finally(() => setIsFetchingCampuses(false));
        
      setSelectedCampus("");
      setSelectedCollege("");
      setSelectedDept("");
    } else {
      setCampuses([]);
    }
  }, [selectedInst]);

  useEffect(() => {
    if (selectedCampus) {
      setIsFetchingColleges(true);
      academicApi.getColleges(selectedCampus)
        .then(setColleges)
        .finally(() => setIsFetchingColleges(false));
      
      setSelectedCollege("");
      setSelectedDept("");
    } else {
      setColleges([]);
      if (selectedInst) {
        academicApi.getDepartments({ institution_id: selectedInst }).then(setDepartments).catch(() => setDepartments([]));
      }
    }
  }, [selectedCampus, selectedInst]);

  useEffect(() => {
    if (selectedCollege) {
      academicApi.getDepartments({ college_id: selectedCollege }).then(setDepartments).catch(() => setDepartments([]));
      setSelectedDept("");
    } else if (selectedCampus) {
      academicApi.getDepartments({ campus_id: selectedCampus }).then(setDepartments).catch(() => setDepartments([]));
    }
  }, [selectedCollege, selectedCampus]);

  useEffect(() => {
    if (selectedDept) {
      setIsFetchingOptions(true);
      academicApi.getOptions(selectedDept)
        .then(setOptions)
        .finally(() => setIsFetchingOptions(false));
        
      setIsFetchingCourses(true);
      academicApi.getCourses(selectedDept)
        .then(setAvailableCourses)
        .finally(() => setIsFetchingCourses(false));

      setSelectedOpt("");
      setSelectedCourses(new Set());
    } else {
      setOptions([]);
      setAvailableCourses([]);
      setSelectedCourses(new Set());
    }
  }, [selectedDept]);

  useEffect(() => {
    if (selectedOpt) {
      setIsFetchingGroups(true);
      academicApi.getClassGroups(selectedOpt)
        .then(setClassGroups)
        .finally(() => setIsFetchingGroups(false));
      setSelectedGroup("");
    } else {
      setClassGroups([]);
    }
  }, [selectedOpt]);

  useEffect(() => {
    if (selectedGroup) {
      setIsFetchingSections(true);
      academicApi.getSections(selectedGroup)
        .then(setSections)
        .finally(() => setIsFetchingSections(false));
      setSelectedSection("");
    } else {
      setSections([]);
    }
  }, [selectedGroup]);

  const toggleCourse = (id: string) => {
    const next = new Set(selectedCourses);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedCourses(next);
  };

  const handleAssign = async () => {
    if (!selectedLecturer || !selectedInst || !selectedDept || !selectedPeriodId || selectedCourses.size === 0) {
      toast.error("Please complete all required fields (Lecturer, Institution, Department, Period, and at least one Course).");
      return;
    }

    const period = academicPeriods.find(p => p.id === selectedPeriodId);
    if (!period) return;

    setSubmitting(true);
    try {
      const courseIds = Array.from(selectedCourses);
      const assignments = courseIds.map(cId => ({
        lecturer_id: selectedLecturer,
        institution_id: selectedInst,
        campus_id: selectedCampus || undefined,
        college_id: selectedCollege || undefined,
        department_id: selectedDept,
        option_id: selectedOpt || undefined,
        course_id: cId,
        class_section_id: selectedSection || undefined,
        academic_period_id: selectedPeriodId,
        academic_year: period.name,
        role: selectedRole as any
      }));

      await apiClient("/admin/academic/assignments/bulk", {
        method: "POST",
        body: JSON.stringify(assignments)
      });

      toast.success(`Successfully assigned ${courseIds.length} course(s) to the lecturer!`);
      setSelectedCourses(new Set());
      setSelectedSection("");
    } catch (err: any) {
      toast.error(err.message || "Failed to create assignment");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto space-y-6 p-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64 rounded" />
          <Skeleton className="h-4 w-96 rounded opacity-60" />
        </div>

        <Card className="shadow-none border rounded-2xl overflow-hidden">
          <CardHeader className="border-b bg-muted/5 py-4 px-6">
            <div className="flex items-center gap-3">
              <Skeleton className="size-9 rounded-full" />
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-40 rounded" />
                <Skeleton className="h-3 w-60 rounded" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-6 space-y-8">
            <div className="space-y-4">
              <Skeleton className="h-6 w-32 rounded-full" />
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Skeleton className="h-3 w-20 ml-1" />
                  <Skeleton className="h-10 w-full rounded-xl" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-3 w-20 ml-1" />
                  <Skeleton className="h-10 w-full rounded-xl" />
                </div>
              </div>
            </div>
            <Separator className="opacity-40 border-dashed" />
            <div className="space-y-4">
              <Skeleton className="h-6 w-32 rounded-full" />
              <div className="grid grid-cols-3 gap-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-3 w-20 ml-1" />
                    <Skeleton className="h-10 w-full rounded-xl" />
                  </div>
                ))}
              </div>
            </div>
            <Separator className="opacity-40 border-dashed" />
            <div className="space-y-4">
              <Skeleton className="h-6 w-32 rounded-full" />
              <div className="grid grid-cols-12 gap-6">
                <div className="col-span-4 space-y-4">
                   {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="space-y-2">
                      <Skeleton className="h-3 w-24 ml-1" />
                      <Skeleton className="h-10 w-full rounded-xl" />
                    </div>
                   ))}
                </div>
                <div className="col-span-8 space-y-2">
                  <Skeleton className="h-3 w-32 ml-1" />
                  <Skeleton className="h-60 w-full rounded-2xl" />
                </div>
              </div>
            </div>
          </CardContent>
          <CardFooter className="p-6 border-t bg-muted/5 flex justify-end gap-3">
             <Skeleton className="h-10 w-32 rounded-xl" />
             <Skeleton className="h-10 w-48 rounded-xl" />
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground/90">Academic Assignments</h1>
        <p className="text-muted-foreground text-sm font-medium">Provision lecturers to institutional departments and programs.</p>
      </div>

      <Card className="shadow-none border rounded-2xl bg-background overflow-hidden">
        <CardHeader className="border-b bg-muted/5 py-4 px-6">
            <div className="flex items-center gap-4">
                <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    <UserPlus className="size-5" />
                </div>
                <div>
                    <CardTitle className="text-base font-semibold tracking-tight">Staff Deployment</CardTitle>
                    <CardDescription className="text-xs font-medium text-muted-foreground/70">Configure contextual teaching responsibilities across registry entities</CardDescription>
                </div>
            </div>
        </CardHeader>

        <CardContent className="p-6 space-y-8">
            {/* Step 1: Lecturer & Institution */}
            <div className="space-y-4">
                <div className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-wider text-primary/80 bg-primary/5 w-fit px-3 py-1 rounded-full border border-primary/10">
                    1. Identity & Host
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-muted-foreground ml-1">Select Lecturer</Label>
                        <Select value={selectedLecturer} onValueChange={setSelectedLecturer}>
                            <SelectTrigger className="h-10 rounded-xl text-sm bg-background border-muted-foreground/20">
                                <SelectValue placeholder="Search staff database..." />
                            </SelectTrigger>
                            <SelectContent>
                                {lecturers.map(l => (
                                    <SelectItem key={l.id} value={l.id} className="text-sm">
                                        {l.profile?.first_name} {l.profile?.last_name} ({l.profile?.staff_id || "No ID"})
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-muted-foreground ml-1">Host Institution</Label>
                        <Select value={selectedInst} onValueChange={setSelectedInst}>
                            <SelectTrigger className="h-10 rounded-xl text-sm bg-background border-muted-foreground/20">
                                <SelectValue placeholder="Target University..." />
                            </SelectTrigger>
                            <SelectContent>
                                {institutions.map(inst => (
                                    <SelectItem key={inst.id} value={inst.id} className="text-sm">{inst.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </div>

            <Separator className="opacity-40 border-dashed" />

            {/* Step 2: Academic Hierarchy */}
            <div className="space-y-4">
                <div className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-wider text-primary/80 bg-primary/5 w-fit px-3 py-1 rounded-full border border-primary/10">
                    2. Hierarchical Context
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-muted-foreground ml-1">Campus</Label>
                        <Select value={selectedCampus} onValueChange={setSelectedCampus} disabled={!selectedInst || (campuses.length === 0 && !isFetchingCampuses)}>
                            <SelectTrigger className={cn("h-10 rounded-xl text-sm bg-background border-muted-foreground/20", (!selectedInst || (campuses.length === 0 && !isFetchingCampuses)) && "opacity-60")}>
                                <SelectValue placeholder={isFetchingCampuses ? "Loading..." : campuses.length === 0 && selectedInst ? "Not applicable" : "Select campus..."} />
                            </SelectTrigger>
                            <SelectContent>
                                {campuses.map(c => (
                                    <SelectItem key={c.id} value={c.id} className="text-sm">{c.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-muted-foreground ml-1">College / Faculty</Label>
                        <Select value={selectedCollege} onValueChange={setSelectedCollege} disabled={!selectedCampus || (colleges.length === 0 && !isFetchingColleges)}>
                            <SelectTrigger className={cn("h-10 rounded-xl text-sm bg-background border-muted-foreground/20", (!selectedCampus || (colleges.length === 0 && !isFetchingColleges)) && "opacity-60")}>
                                <SelectValue placeholder={isFetchingColleges ? "Loading..." : colleges.length === 0 && selectedCampus ? "Not applicable" : "Select faculty..."} />
                            </SelectTrigger>
                            <SelectContent>
                                {colleges.map(c => (
                                    <SelectItem key={c.id} value={c.id} className="text-sm">{c.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-muted-foreground ml-1">Department / School</Label>
                        <Select value={selectedDept} onValueChange={setSelectedDept} disabled={!selectedInst}>
                            <SelectTrigger className="h-10 rounded-xl text-sm bg-background border-muted-foreground/20">
                                <SelectValue placeholder="Target department..." />
                            </SelectTrigger>
                            <SelectContent>
                                {departments.map(d => (
                                    <SelectItem key={d.id} value={d.id} className="text-sm">{d.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </div>

            <Separator className="opacity-40 border-dashed" />

            {/* Step 3: Program & Course Assignment */}
            <div className="space-y-4">
                <div className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-wider text-primary/80 bg-primary/5 w-fit px-3 py-1 rounded-full border border-primary/10">
                    3. Registry Assignment Details
                </div>
                
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    <div className="lg:col-span-4 space-y-4">
                        <div className="space-y-1.5">
                            <Label className="text-xs font-medium text-muted-foreground ml-1">Academic Period</Label>
                            <Select value={selectedPeriodId} onValueChange={setSelectedPeriodId}>
                                <SelectTrigger className="h-10 rounded-xl text-sm bg-background border-muted-foreground/20">
                                    <SelectValue placeholder="Select Semester..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {academicPeriods.map(p => (
                                        <SelectItem key={p.id} value={p.id} className="text-sm">{p.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        
                        <div className="space-y-1.5">
                            <Label className="text-xs font-medium text-muted-foreground ml-1">Assignment Role</Label>
                            <Select value={selectedRole} onValueChange={setSelectedRole}>
                                <SelectTrigger className="h-10 rounded-xl text-sm bg-background border-muted-foreground/20">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="MAIN_LECTURER" className="text-sm">Main Lecturer</SelectItem>
                                    <SelectItem value="ASSISTANT_LECTURER" className="text-sm">Assistant Lecturer</SelectItem>
                                    <SelectItem value="SUPERVISOR" className="text-sm">Supervisor</SelectItem>
                                    <SelectItem value="REVIEWER" className="text-sm">Reviewer</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-medium text-muted-foreground ml-1">Academic Program</Label>
                            <Select value={selectedOpt} onValueChange={setSelectedOpt} disabled={!selectedDept || (options.length === 0 && !isFetchingOptions)}>
                                <SelectTrigger className={cn("h-10 rounded-xl text-sm bg-background border-muted-foreground/20", (!selectedDept || (options.length === 0 && !isFetchingOptions)) && "opacity-60")}>
                                    <SelectValue placeholder={isFetchingOptions ? "Loading..." : options.length === 0 && selectedDept ? "Not applicable" : "Select program..."} />
                                </SelectTrigger>
                                <SelectContent>
                                    {options.map(o => (
                                        <SelectItem key={o.id} value={o.id} className="text-sm">{o.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-medium text-muted-foreground ml-1">Level Selector</Label>
                            <Select value={selectedGroup} onValueChange={setSelectedGroup} disabled={!selectedOpt || (classGroups.length === 0 && !isFetchingGroups)}>
                                <SelectTrigger className={cn("h-10 rounded-xl text-sm bg-background border-muted-foreground/20", (!selectedOpt || (classGroups.length === 0 && !isFetchingGroups)) && "opacity-60")}>
                                    <SelectValue placeholder={isFetchingGroups ? "Loading..." : classGroups.length === 0 && selectedOpt ? "Not applicable" : "Select level..."} />
                                </SelectTrigger>
                                <SelectContent>
                                    {classGroups.map(cg => (
                                        <SelectItem key={cg.id} value={cg.id} className="text-sm">{cg.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-medium text-muted-foreground ml-1">Class / Section (Optional)</Label>
                            <Select value={selectedSection} onValueChange={setSelectedSection} disabled={!selectedGroup || (sections.length === 0 && !isFetchingSections)}>
                                <SelectTrigger className={cn("h-10 rounded-xl text-sm bg-background border-muted-foreground/20", (!selectedGroup || (sections.length === 0 && !isFetchingSections)) && "opacity-60")}>
                                    <SelectValue placeholder={isFetchingSections ? "Loading..." : sections.length === 0 && selectedGroup ? "Not applicable" : "Specific section..."} />
                                </SelectTrigger>
                                <SelectContent>
                                    {sections.map(s => (
                                        <SelectItem key={s.id} value={s.id} className="text-sm">{s.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="lg:col-span-8">
                        <Label className="text-xs font-medium text-muted-foreground ml-1 mb-2 block">
                            Assign Official Modules (Multi-select)
                        </Label>
                        <Card className="rounded-2xl bg-muted/5 border shadow-none overflow-hidden">
                            <ScrollArea className="h-[280px]">
                                <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {isFetchingCourses ? (
                                        [1,2,3,4].map(i => <Skeleton key={i} className="h-12 w-full rounded-xl" />)
                                    ) : availableCourses.length === 0 ? (
                                        <div className="col-span-full py-20 text-center">
                                            <BookOpen className="size-10 mx-auto text-muted-foreground/20 mb-3" />
                                            <p className="text-sm font-medium text-muted-foreground">Select a department to view official courses.</p>
                                        </div>
                                    ) : (
                                        availableCourses.map(course => {
                                            const isAssigned = assignedCourseIds.has(course.id);
                                            return (
                                                <div 
                                                    key={course.id} 
                                                    className={cn(
                                                        "flex items-center gap-4 p-4 rounded-xl border transition-all cursor-pointer group",
                                                        selectedCourses.has(course.id) 
                                                            ? "bg-primary/5 border-primary/30 ring-1 ring-primary/20" 
                                                            : isAssigned 
                                                                ? "bg-muted/40 border-muted-foreground/10 cursor-not-allowed opacity-60"
                                                                : "bg-background hover:bg-muted/30 border-muted-foreground/10"
                                                    )}
                                                    onClick={() => !isAssigned && toggleCourse(course.id)}
                                                >
                                                    <Checkbox 
                                                        checked={selectedCourses.has(course.id) || isAssigned} 
                                                        disabled={isAssigned}
                                                        className="rounded-md" 
                                                    />
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-semibold truncate text-foreground/80 leading-none">
                                                            {(course as any).title || course.name}
                                                            {isAssigned && <span className="ml-2 text-[10px] text-muted-foreground italic">(Assigned)</span>}
                                                        </p>
                                                        <p className="text-[11px] font-mono font-medium text-primary/60 mt-1.5 uppercase">{course.code}</p>
                                                    </div>
                                                    {selectedCourses.has(course.id) && <Check className="size-4 text-primary shrink-0" />}
                                                    {isAssigned && <CheckCircle2 className="size-4 text-muted-foreground shrink-0" />}
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </ScrollArea>
                            {selectedCourses.size > 0 && (
                                <div className="p-3 border-t bg-primary/5 px-4 flex justify-between items-center">
                                    <span className="text-xs font-bold text-primary uppercase">{selectedCourses.size} Modules Selected</span>
                                    <Button variant="ghost" size="sm" className="h-7 text-[10px] font-bold text-muted-foreground uppercase" onClick={() => setSelectedCourses(new Set())}>Clear Selection</Button>
                                </div>
                            )}
                        </Card>
                    </div>
                </div>
            </div>
        </CardContent>

        <CardFooter className="p-6 border-t bg-muted/5 flex justify-end gap-3">
            <Button variant="ghost" size="sm" className="h-10 px-6 rounded-xl font-bold text-[11px] uppercase tracking-wider" onClick={() => {
                setSelectedInst("");
                setSelectedLecturer("");
                setSelectedPeriodId("");
                setSelectedCourses(new Set());
            }}>
                Reset Gateway
            </Button>
            <Button 
                onClick={handleAssign} 
                disabled={submitting}
                className="h-10 px-10 rounded-xl font-bold text-[11px] uppercase tracking-wider gap-2 shadow-none min-w-[200px]"
            >
                {submitting ? <Loader2 className="size-4 animate-spin" /> : <Shield className="size-4" />}
                {submitting ? "Deploying..." : "Finalize Assignment"}
            </Button>
        </CardFooter>
      </Card>

      <div className="p-5 rounded-2xl border bg-blue-50/20 border-blue-100 flex items-start gap-4">
          <div className="space-y-1">
              <p className="text-[11px] font-bold text-blue-900 uppercase tracking-tight flex items-center gap-2"><CheckCircle2 className="size-3.5" /> Assignment Policy</p>
              <p className="text-sm text-blue-800/70 leading-relaxed font-medium">
                  Assigned lecturers gain instantaneous access to pedagogical tools for the selected official modules. Institutional governance rules apply to all cross-unit roles.
              </p>
          </div>
      </div>
    </div>
  );
}
