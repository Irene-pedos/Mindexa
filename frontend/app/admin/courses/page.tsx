"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BookOpen,
  Search,
  Users,
  MoreVertical,
  ChevronLeft,
  ChevronRight,
  Ban,
  Loader2,
  FileEdit,
  UserCheck,
  Plus,
  CheckCircle,
  Building2,
  Calendar,
  Globe,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { adminApi, AdminCourseListItem } from "@/lib/api/admin";
import { academicApi, getAcademicPeriods } from "@/lib/api/academic";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function AdminCoursesPage() {
  const [courses, setCourses] = useState<AdminCourseListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "Active" | "Suspended">("all");
  const [languageFilter, setLanguageFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCourses, setTotalCourses] = useState(0);
  const pageSize = 10;

  // Dialog & Form State
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isProcessingRow, setIsProcessingRow] = useState<string | null>(null);

  const [institutions, setInstitutions] = useState<any[]>([]);
  const [academicPeriods, setAcademicPeriods] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);

  const [formData, setFormData] = useState<any>({
    title: "",
    code: "",
    credit_hours: 3,
    description: "",
    language: "EN",
    institution_id: "",
    academic_period_id: "",
    academic_year: "",
    department_ids: [],
  });

  const [editData, setEditData] = useState<any>(null);

  const loadCourses = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminApi.getCourses(currentPage, pageSize);
      setCourses(data.items);
      setTotalCourses(data.total);
    } catch (err) {
      console.error("Failed to load courses", err);
      toast.error("Failed to load courses registry");
    } finally {
      setLoading(false);
    }
  }, [currentPage, pageSize]);

  useEffect(() => {
    loadCourses();
  }, [loadCourses]);

  const loadMetadata = useCallback(async () => {
    try {
      const [insts, periods] = await Promise.all([
        adminApi.getInstitutions(),
        getAcademicPeriods(),
      ]);
      setInstitutions(insts);
      setAcademicPeriods(periods);
    } catch (err) {
      console.error("Failed to load metadata", err);
    }
  }, []);

  useEffect(() => {
    if (isCreateDialogOpen || isEditDialogOpen) {
      loadMetadata();
    }
  }, [isCreateDialogOpen, isEditDialogOpen, loadMetadata]);

  const handleInstitutionChange = async (id: string) => {
    setFormData((prev: any) => ({ ...prev, institution_id: id, department_ids: [] }));
    try {
      const depts = await academicApi.getDepartments({ institution_id: id });
      setDepartments(depts);
    } catch {
      toast.error("Failed to load departments for institution");
    }
  };

  const handlePeriodChange = (periodId: string) => {
    const period = academicPeriods.find((p) => p.id === periodId);
    if (period) {
      setFormData((prev: any) => ({
        ...prev,
        academic_period_id: periodId,
        academic_year: period.name,
      }));
    }
  };

  const toggleDepartment = (id: string) => {
    const current = new Set(formData.department_ids || []);
    if (current.has(id)) current.delete(id);
    else current.add(id);
    setFormData((prev: any) => ({ ...prev, department_ids: Array.from(current) }));
  };

  const resetForm = () => {
    setFormData({
      title: "",
      code: "",
      credit_hours: 3,
      description: "",
      language: "EN",
      institution_id: "",
      academic_period_id: "",
      academic_year: "",
      department_ids: [],
    });
    setEditData(null);
  };

  const handleCreateCourse = async () => {
    if (
      !formData.title.trim() ||
      !formData.code.trim() ||
      !formData.institution_id ||
      !formData.academic_year
    ) {
      toast.error("Please fill in module title, code, institution, and academic period");
      return;
    }

    setIsProcessing(true);
    try {
      await adminApi.createCourse(formData);
      toast.success("Academic module created successfully");
      setIsCreateDialogOpen(false);
      loadCourses();
      resetForm();
    } catch {
      toast.error("Failed to create academic module");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUpdateCourse = async () => {
    if (!editData) return;
    setIsProcessing(true);
    try {
      await adminApi.updateCourse(editData.id, formData);
      toast.success("Module metadata updated successfully");
      setIsEditDialogOpen(false);
      loadCourses();
      resetForm();
    } catch {
      toast.error("Failed to update course");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEditClick = async (course: AdminCourseListItem) => {
    setIsProcessingRow(course.id);
    try {
      const fullCourse = await adminApi.getCourse(course.id);
      setEditData(fullCourse);
      setFormData({
        title: fullCourse.name || fullCourse.title,
        code: fullCourse.code,
        credit_hours: fullCourse.credit_hours,
        description: fullCourse.description || "",
        language: fullCourse.language || course.language || "EN",
        institution_id: fullCourse.institution_id,
        academic_period_id: fullCourse.academic_period_id,
        academic_year: fullCourse.academic_year,
        department_ids: fullCourse.department_ids || [],
      });
      if (fullCourse.institution_id) {
        academicApi
          .getDepartments({ institution_id: fullCourse.institution_id })
          .then(setDepartments)
          .catch(() => {});
      }
      setIsEditDialogOpen(true);
    } catch {
      toast.error("Failed to load course details");
    } finally {
      setIsProcessingRow(null);
    }
  };

  const handleSyncLanguage = async (courseId: string) => {
    setIsProcessingRow(courseId);
    try {
      const res = await adminApi.syncCourseWorkspaceLanguage(courseId);
      toast.success(
        `Language '${res.language}' cascaded to ${res.updated_workspaces} workspaces & ${res.updated_draft_assessments} draft assessments.`
      );
    } catch (err: any) {
      toast.error(err?.message || "Failed to synchronize workspace language");
    } finally {
      setIsProcessingRow(null);
    }
  };

  const handleToggleCourseStatus = async (course: AdminCourseListItem) => {
    const isSuspended = course.status === "Suspended";
    if (
      !confirm(
        `Are you sure you want to ${isSuspended ? "reactivate" : "suspend"} module ${course.code}?`
      )
    )
      return;

    setIsProcessingRow(course.id);
    try {
      await adminApi.updateCourse(course.id, { is_active: isSuspended });
      toast.success(`Module ${isSuspended ? "reactivated" : "suspended"} successfully`);
      loadCourses();
    } catch {
      toast.error(`Failed to ${isSuspended ? "reactivate" : "suspend"} module`);
    } finally {
      setIsProcessingRow(null);
    }
  };

  const filteredCourses = useMemo(() => {
    return courses.filter((course) => {
      const matchesSearch =
        course.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        course.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        course.lecturer_name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus =
        statusFilter === "all" ? true : course.status === statusFilter;
      const matchesLang =
        languageFilter === "all"
          ? true
          : (course.language || "EN") === languageFilter;

      return matchesSearch && matchesStatus && matchesLang;
    });
  }, [courses, searchTerm, statusFilter, languageFilter]);

  const totalPages = Math.ceil(totalCourses / pageSize);

  return (
    <div className="w-full min-w-0 space-y-6 transition-all duration-300 ease-in-out">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-5 border-b border-border/40">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <BookOpen className="size-4.5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-foreground">
                Courses & Academic Modules
              </h1>
              <p className="text-xs text-muted-foreground">
                Official curriculum registry, credit weighting, AI language constraints, and instructional cohorts.
              </p>
            </div>
          </div>
        </div>

        <Button
          size="sm"
          onClick={() => {
            resetForm();
            setIsCreateDialogOpen(true);
          }}
          className="h-8.5 rounded-xl gap-2 px-4 text-xs font-semibold shadow-xs cursor-pointer self-start sm:self-auto"
        >
          <Plus className="size-3.5" />
          Create Module
        </Button>
      </div>

      {/* KPI Overview Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[
          {
            label: "Total Modules",
            value: totalCourses,
            detail: "Catalog entries",
            icon: BookOpen,
          },
          {
            label: "Active Registry",
            value: courses.filter((c) => c.status === "Active").length,
            detail: "In-progress instruction",
            icon: CheckCircle,
          },
          {
            label: "Accredited Scope",
            value: institutions.length || "Global",
            detail: "Partner institutions",
            icon: Building2,
          },
          {
            label: "Suspended",
            value: courses.filter((c) => c.status === "Suspended").length,
            detail: "Archived modules",
            icon: Ban,
          },
        ].map((stat, i) => (
          <div
            key={i}
            className="p-4 rounded-2xl bg-card border border-border shadow-2xs flex items-center justify-between"
          >
            <div className="space-y-1">
              <p className="text-[11px] font-medium text-muted-foreground">{stat.label}</p>
              <div className="text-2xl font-bold tracking-tight text-foreground">
                {loading ? <Skeleton className="h-7 w-12" /> : stat.value}
              </div>
              <p className="text-[10px] text-muted-foreground">{stat.detail}</p>
            </div>
            <div className="size-9 rounded-xl bg-muted/50 border border-border/50 flex items-center justify-center text-muted-foreground shrink-0">
              <stat.icon className="size-4" />
            </div>
          </div>
        ))}
      </div>

      {/* Unified Table Container */}
      <div className="rounded-2xl border border-border bg-card shadow-2xs overflow-hidden">
        {/* Toolbar */}
        <div className="p-3 sm:p-4 border-b border-border/60 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-muted/10">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              placeholder="Search by code, title, or instructor..."
              className="pl-9 h-8.5 text-xs rounded-xl bg-background border-border/80 focus-visible:ring-1"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Status Segmented Controls */}
            <div className="flex items-center bg-muted/60 p-0.5 rounded-xl border border-border/60 text-xs">
              {(["all", "Active", "Suspended"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatusFilter(s)}
                  className={cn(
                    "px-3 py-1 rounded-lg font-medium text-[11px] capitalize transition-all cursor-pointer",
                    statusFilter === s
                      ? "bg-background text-foreground shadow-2xs font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {s === "all" ? "All" : s}
                </button>
              ))}
            </div>

            {/* Language Filter */}
            <Select value={languageFilter} onValueChange={setLanguageFilter}>
              <SelectTrigger className="w-28 h-8 text-xs rounded-xl border-border/80 bg-background">
                <SelectValue placeholder="Language" />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="all" className="text-xs">
                  All Langs
                </SelectItem>
                <SelectItem value="EN" className="text-xs">
                  English (EN)
                </SelectItem>
                <SelectItem value="RW" className="text-xs text-amber-600 font-semibold">
                  RW (No AI)
                </SelectItem>
                <SelectItem value="FR" className="text-xs">
                  French (FR)
                </SelectItem>
                <SelectItem value="SW" className="text-xs">
                  Swahili (SW)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Data Table */}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/20">
              <TableRow className="border-b border-border/60 hover:bg-transparent">
                <TableHead className="text-[11px] font-semibold tracking-tight h-10 pl-5">
                  Module Code
                </TableHead>
                <TableHead className="text-[11px] font-semibold tracking-tight h-10">
                  Course Title
                </TableHead>
                <TableHead className="text-[11px] font-semibold tracking-tight h-10">
                  Language & Policy
                </TableHead>
                <TableHead className="text-[11px] font-semibold tracking-tight h-10">
                  Primary Instructor
                </TableHead>
                <TableHead className="text-[11px] font-semibold tracking-tight h-10 text-center">
                  Students
                </TableHead>
                <TableHead className="text-[11px] font-semibold tracking-tight h-10">
                  Status
                </TableHead>
                <TableHead className="text-right text-[11px] font-semibold tracking-tight h-10 pr-5">
                  Operations
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                [1, 2, 3, 4, 5].map((i) => (
                  <TableRow key={i} className="border-b border-border/40 h-14">
                    <TableCell colSpan={7} className="px-5">
                      <Skeleton className="h-6 w-full rounded-lg" />
                    </TableCell>
                  </TableRow>
                ))
              ) : filteredCourses.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-40 text-center text-muted-foreground text-xs">
                    No academic modules match your search filters.
                  </TableCell>
                </TableRow>
              ) : (
                filteredCourses.map((course) => (
                  <TableRow
                    key={course.id}
                    className="border-b border-border/40 hover:bg-muted/15 transition-colors h-14"
                  >
                    <TableCell className="pl-5">
                      <Badge variant="outline" className="font-mono text-xs font-semibold px-2 py-0.5 rounded-md border-border">
                        {course.code}
                      </Badge>
                    </TableCell>

                    <TableCell>
                      <div>
                        <p className="font-semibold text-xs text-foreground leading-tight">{course.title}</p>
                        <p className="text-[10px] text-muted-foreground">Term: {course.academic_year || "Current"}</p>
                      </div>
                    </TableCell>

                    <TableCell>
                      {course.language === "RW" ? (
                        <Badge
                          variant="outline"
                          className="rounded-md px-2 py-0.5 text-[10px] font-bold border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400 gap-1"
                        >
                          RW
                          <span className="text-[9px] font-normal opacity-80">(AI Restricted)</span>
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="rounded-md px-2 py-0.5 text-[10px] font-medium text-muted-foreground border-border"
                        >
                          {course.language || "EN"}
                        </Badge>
                      )}
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="size-6 rounded-full bg-muted border border-border/70 flex items-center justify-center text-[10px] font-semibold text-muted-foreground">
                          {course.lecturer_name?.[0] || "L"}
                        </div>
                        <span className="text-xs text-foreground font-medium">
                          {course.lecturer_name || "Unassigned"}
                        </span>
                      </div>
                    </TableCell>

                    <TableCell className="text-center">
                      <div className="inline-flex items-center gap-1 text-xs text-muted-foreground font-medium">
                        <Users className="size-3" />
                        <span>{course.student_count || 0}</span>
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            "size-2 rounded-full",
                            course.status === "Active"
                              ? "bg-emerald-500 ring-2 ring-emerald-500/20"
                              : "bg-amber-500 ring-2 ring-amber-500/20"
                          )}
                        />
                        <span className="text-xs font-medium text-foreground">
                          {course.status}
                        </span>
                      </div>
                    </TableCell>

                    <TableCell className="text-right pr-5">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-lg hover:bg-muted cursor-pointer"
                            disabled={isProcessingRow === course.id}
                          >
                            {isProcessingRow === course.id ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <MoreVertical className="size-3.5 text-muted-foreground" />
                            )}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52 rounded-xl p-1 shadow-lg">
                          <DropdownMenuLabel className="text-[10px] font-medium text-muted-foreground px-2 py-1">
                            Module Controls
                          </DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-xs cursor-pointer py-1.5 rounded-lg"
                            onClick={() => handleEditClick(course)}
                          >
                            <FileEdit className="mr-2 size-3.5 text-muted-foreground" />
                            Edit Metadata
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-xs cursor-pointer py-1.5 rounded-lg text-primary focus:text-primary"
                            onClick={() => handleSyncLanguage(course.id)}
                          >
                            <RefreshCw className="mr-2 size-3.5 text-primary" />
                            Cascade Language Sync
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-xs cursor-pointer py-1.5 rounded-lg"
                            onClick={() => toast.info(`Viewing roster for ${course.code}`)}
                          >
                            <UserCheck className="mr-2 size-3.5 text-muted-foreground" />
                            Class Roster
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-xs cursor-pointer py-1.5 rounded-lg"
                            onClick={() => toast.info(`Viewing schedule for ${course.code}`)}
                          >
                            <Calendar className="mr-2 size-3.5 text-muted-foreground" />
                            Exam Schedule
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className={cn(
                              "text-xs font-medium cursor-pointer py-1.5 rounded-lg",
                              course.status === "Active"
                                ? "text-destructive focus:text-destructive focus:bg-destructive/10"
                                : "text-emerald-600 focus:text-emerald-600 focus:bg-emerald-500/10"
                            )}
                            onClick={() => handleToggleCourseStatus(course)}
                          >
                            {course.status === "Active" ? (
                              <>
                                <Ban className="mr-2 size-3.5" /> Suspend Module
                              </>
                            ) : (
                              <>
                                <CheckCircle className="mr-2 size-3.5" /> Reactivate Module
                              </>
                            )}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Integrated Pagination Footer */}
        <div className="p-3 sm:px-5 bg-muted/10 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Page <strong>{currentPage}</strong> of <strong>{totalPages || 1}</strong> ({totalCourses} total modules)
          </span>

          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="icon"
              className="size-7.5 rounded-lg cursor-pointer"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-7.5 rounded-lg cursor-pointer"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Create Module Dialog */}
      <Dialog
        open={isCreateDialogOpen}
        onOpenChange={(o) => {
          setIsCreateDialogOpen(o);
          if (!o) resetForm();
        }}
      >
        <DialogContent className="max-w-xl w-full rounded-2xl p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold tracking-tight">Create Academic Module</DialogTitle>
            <DialogDescription className="text-xs">
              Define a new course entity in the official institutional catalog.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="create-title" className="text-xs font-semibold">
                  Module Title
                </Label>
                <Input
                  id="create-title"
                  placeholder="e.g. Distributed Operating Systems"
                  className="h-9 text-xs"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="create-code" className="text-xs font-semibold">
                  Module Code
                </Label>
                <Input
                  id="create-code"
                  placeholder="e.g. CS401"
                  className="h-9 text-xs font-mono uppercase"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="create-credits" className="text-xs font-semibold">
                  Credit Weighting
                </Label>
                <Input
                  id="create-credits"
                  type="number"
                  min={1}
                  max={30}
                  className="h-9 text-xs font-semibold"
                  value={formData.credit_hours}
                  onChange={(e) =>
                    setFormData({ ...formData, credit_hours: parseInt(e.target.value) || 3 })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Academic Period</Label>
                <Select value={formData.academic_period_id} onValueChange={handlePeriodChange}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Select Period" />
                  </SelectTrigger>
                  <SelectContent>
                    {academicPeriods.map((p) => (
                      <SelectItem key={p.id} value={p.id} className="text-xs">
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Host Institution</Label>
              <Select value={formData.institution_id} onValueChange={handleInstitutionChange}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Select Host Institution" />
                </SelectTrigger>
                <SelectContent>
                  {institutions.map((i) => (
                    <SelectItem key={i.id} value={i.id} className="text-xs font-medium">
                      {i.name} ({i.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Language & Policy Selection */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <Globe className="size-3.5 text-primary" />
                Instruction Language & AI Policy
              </Label>
              <Select
                value={formData.language || "EN"}
                onValueChange={(val) => setFormData({ ...formData, language: val })}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Select Language" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EN" className="text-xs font-medium">
                    English (EN) — Full AI Tutoring & Grading
                  </SelectItem>
                  <SelectItem value="RW" className="text-xs font-semibold text-amber-600">
                    Kinyarwanda (RW) — AI Strictly Restricted (Spec §13.1)
                  </SelectItem>
                  <SelectItem value="FR" className="text-xs font-medium">
                    French (FR) — Full AI Support
                  </SelectItem>
                  <SelectItem value="SW" className="text-xs font-medium">
                    Swahili (SW) — Full AI Support
                  </SelectItem>
                </SelectContent>
              </Select>
              {formData.language === "RW" && (
                <div className="flex items-start gap-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 text-[11px] mt-1">
                  <AlertTriangle className="size-3.5 shrink-0 mt-0.5 text-amber-600" />
                  <span>
                    <strong>Institutional Governance:</strong> AI question generation, automated grading, and LLM explanation are strictly barred for Kinyarwanda curricula.
                  </span>
                </div>
              )}
            </div>

            {/* Departments */}
            {departments.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Affiliated Departments</Label>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-2 rounded-xl bg-muted/20 border border-border">
                  {departments.map((d) => {
                    const isSelected = formData.department_ids?.includes(d.id);
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => toggleDepartment(d.id)}
                        className={cn(
                          "px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all cursor-pointer border",
                          isSelected
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background text-muted-foreground border-border hover:text-foreground"
                        )}
                      >
                        {d.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="create-desc" className="text-xs font-semibold">
                Syllabus & Scope
              </Label>
              <Textarea
                id="create-desc"
                placeholder="Academic description and learning outcomes..."
                className="text-xs min-h-[64px] rounded-xl"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => setIsCreateDialogOpen(false)} className="h-8.5 text-xs">
              Cancel
            </Button>
            <Button size="sm" onClick={handleCreateCourse} disabled={isProcessing} className="h-8.5 px-4 text-xs font-semibold">
              {isProcessing && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Publish Module
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Module Dialog */}
      <Dialog
        open={isEditDialogOpen}
        onOpenChange={(o) => {
          setIsEditDialogOpen(o);
          if (!o) resetForm();
        }}
      >
        <DialogContent className="max-w-xl w-full rounded-2xl p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold tracking-tight">
              Edit Module: {editData?.code}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Update institutional metadata, credits, or instructional language.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-title" className="text-xs font-semibold">
                  Module Title
                </Label>
                <Input
                  id="edit-title"
                  className="h-9 text-xs"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-code" className="text-xs font-semibold">
                  Module Code
                </Label>
                <Input
                  id="edit-code"
                  className="h-9 text-xs font-mono uppercase"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-credits" className="text-xs font-semibold">
                  Credit Weighting
                </Label>
                <Input
                  id="edit-credits"
                  type="number"
                  min={1}
                  max={30}
                  className="h-9 text-xs font-semibold"
                  value={formData.credit_hours}
                  onChange={(e) =>
                    setFormData({ ...formData, credit_hours: parseInt(e.target.value) || 3 })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Academic Period</Label>
                <Select value={formData.academic_period_id} onValueChange={handlePeriodChange}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Select Period" />
                  </SelectTrigger>
                  <SelectContent>
                    {academicPeriods.map((p) => (
                      <SelectItem key={p.id} value={p.id} className="text-xs">
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <Globe className="size-3.5 text-primary" />
                Instruction Language
              </Label>
              <Select
                value={formData.language || "EN"}
                onValueChange={(val) => setFormData({ ...formData, language: val })}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Select Language" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EN" className="text-xs">
                    English (EN) — Full AI Support
                  </SelectItem>
                  <SelectItem value="RW" className="text-xs font-semibold text-amber-600">
                    Kinyarwanda (RW) — AI Blocked
                  </SelectItem>
                  <SelectItem value="FR" className="text-xs">
                    French (FR) — Full AI Support
                  </SelectItem>
                  <SelectItem value="SW" className="text-xs">
                    Swahili (SW) — Full AI Support
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-desc" className="text-xs font-semibold">
                Description
              </Label>
              <Textarea
                id="edit-desc"
                className="text-xs min-h-[72px] rounded-xl"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => setIsEditDialogOpen(false)} className="h-8.5 text-xs">
              Cancel
            </Button>
            <Button size="sm" onClick={handleUpdateCourse} disabled={isProcessing} className="h-8.5 px-4 text-xs font-semibold">
              {isProcessing && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
