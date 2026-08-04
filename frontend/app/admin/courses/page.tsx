"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
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
  GraduationCap,
  MoreVertical,
  ChevronLeft,
  ChevronRight,
  Filter,
  Layers,
  Calendar,
  Ban,
  Loader2,
  FileEdit,
  UserCheck,
  Plus,
  ArrowUpDown,
  Archive,
  CheckCircle,
  Building2,
  Library,
  Eye,
  Settings,
} from "lucide-react";
import { adminApi, AdminCourseListItem } from "@/lib/api/admin";
import {
  academicApi,
  adminAcademicApi,
  getAcademicPeriods,
} from "@/lib/api/academic";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function AdminCoursesPage() {
  const [courses, setCourses] = useState<AdminCourseListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCourses, setTotalCourses] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const pageSize = 10;

  // Creation/Edit State
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
      toast.error("Failed to load courses");
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
    setFormData({ ...formData, institution_id: id, department_ids: [] });
    try {
      const depts = await academicApi.getDepartments({ institution_id: id });
      setDepartments(depts);
    } catch (err) {
      toast.error("Failed to load departments");
    }
  };

  const handlePeriodChange = (periodId: string) => {
    const period = academicPeriods.find((p) => p.id === periodId);
    if (period) {
      setFormData({
        ...formData,
        academic_period_id: periodId,
        academic_year: period.name,
      });
    }
  };

  const toggleDepartment = (id: string) => {
    const current = new Set(formData.department_ids);
    if (current.has(id)) current.delete(id);
    else current.add(id);
    setFormData({ ...formData, department_ids: Array.from(current) });
  };

  const handleCreateCourse = async () => {
    if (
      !formData.title ||
      !formData.code ||
      !formData.institution_id ||
      !formData.academic_year
    ) {
      toast.error("Please fill in all required fields");
      return;
    }

    setIsProcessing(true);
    try {
      await adminApi.createCourse(formData);
      toast.success("Official course created successfully");
      setIsCreateDialogOpen(false);
      loadCourses();
      resetForm();
    } catch (err) {
      toast.error("Failed to create course");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUpdateCourse = async () => {
    if (!editData) return;
    setIsProcessing(true);
    try {
      await adminApi.updateCourse(editData.id, formData);
      toast.success("Course metadata updated successfully");
      setIsEditDialogOpen(false);
      loadCourses();
      resetForm();
    } catch (err) {
      toast.error("Failed to update course");
    } finally {
      setIsProcessing(false);
    }
  };

  const resetForm = () => {
    setFormData({
      title: "",
      code: "",
      credit_hours: 3,
      description: "",
      institution_id: "",
      academic_period_id: "",
      academic_year: "",
      department_ids: [],
    });
    setEditData(null);
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
        institution_id: fullCourse.institution_id,
        academic_period_id: fullCourse.academic_period_id,
        academic_year: fullCourse.academic_year,
        department_ids: fullCourse.department_ids || [],
      });
      setIsEditDialogOpen(true);
    } catch (err) {
      toast.error("Failed to load course details");
    } finally {
      setIsProcessingRow(null);
    }
  };

  const handleToggleCourseStatus = async (course: AdminCourseListItem) => {
    const isSuspended = course.status === "Suspended";
    if (
      !confirm(
        `Are you sure you want to ${isSuspended ? "reactivate" : "suspend"} this academic module?`,
      )
    )
      return;

    setIsProcessingRow(course.id);
    try {
      await adminApi.updateCourse(course.id, { is_active: isSuspended });
      toast.success(
        `Module ${isSuspended ? "reactivated" : "suspended"} successfully`,
      );
      loadCourses();
    } catch (err) {
      toast.error(`Failed to ${isSuspended ? "reactivate" : "suspend"} module`);
    } finally {
      setIsProcessingRow(null);
    }
  };

  const handleViewSchedule = (course: AdminCourseListItem) => {
    toast.info(`Retrieving schedule for ${course.code}...`);
  };

  const handleViewRoster = (course: AdminCourseListItem) => {
    toast.info(`Fetching student roster for ${course.title}...`);
  };

  const filteredCourses = useMemo(() => {
    return courses.filter((course) => {
      const matchesSearch =
        course.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        course.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        course.lecturer_name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus =
        statusFilter === "all" || course.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [courses, searchTerm, statusFilter]);

  const toggleSelectAll = () => {
    if (
      selectedIds.size === filteredCourses.length &&
      filteredCourses.length > 0
    ) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredCourses.map((c) => c.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const totalPages = Math.ceil(totalCourses / pageSize);

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-border/25">
        <div className="space-y-0.5">
          <h1 className="text-xl font-semibold tracking-tight text-foreground flex items-center gap-2">
            <BookOpen className="size-4.5 text-primary" /> Courses & Academic Modules
          </h1>
          <p className="text-xs text-muted-foreground font-medium">
            Registry of official academic modules, credit allocations, and active course offerings.
          </p>
        </div>

        <Dialog
          open={isCreateDialogOpen}
          onOpenChange={(o) => {
            setIsCreateDialogOpen(o);
            if (!o) resetForm();
          }}
        >
          <DialogTrigger asChild>
            <Button
              size="sm"
              className="h-8.5 rounded-lg gap-2 shadow-xs px-4 font-semibold text-xs tracking-tight"
            >
              <Plus className="size-3.5" />
              Create Official Module
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl w-full max-h-[85vh] overflow-y-auto rounded-2xl p-6 border border-border bg-card">
            <DialogHeader>
              <DialogTitle className="text-lg font-semibold tracking-tight">
                New Institutional Module
              </DialogTitle>
              <DialogDescription className="text-xs font-medium tracking-tight">
                Define a core academic entity within the platform registry.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-5 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-1.5">
                  <Label
                    htmlFor="title"
                    className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    Module Title
                  </Label>
                  <Input
                    id="title"
                    placeholder="e.g. Web Development"
                    className="text-xs h-10 rounded-xl"
                    value={formData.title}
                    onChange={(e) =>
                      setFormData({ ...formData, title: e.target.value })
                    }
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label
                    htmlFor="code"
                    className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    Module Code
                  </Label>
                  <Input
                    id="code"
                    placeholder="e.g. CSC401"
                    className="text-xs font-mono h-10 rounded-xl"
                    value={formData.code}
                    onChange={(e) =>
                      setFormData({ ...formData, code: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-1.5">
                  <Label
                    htmlFor="credits"
                    className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    Credit Load
                  </Label>
                  <Input
                    id="credits"
                    type="number"
                    className="text-xs h-10 rounded-xl font-bold"
                    value={formData.credit_hours}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        credit_hours: parseInt(e.target.value),
                      })
                    }
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label
                    htmlFor="year"
                    className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    Academic Period
                  </Label>
                  <Select
                    value={formData.academic_period_id}
                    onValueChange={handlePeriodChange}
                  >
                    <SelectTrigger className="text-xs h-10 rounded-xl">
                      <SelectValue placeholder="Select Period" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      {academicPeriods.map((p) => (
                        <SelectItem
                          key={p.id}
                          value={p.id}
                          className="text-xs font-medium"
                        >
                          {p.name}{" "}
                          {p.institution_name ? `(${p.institution_name})` : ""}
                        </SelectItem>
                      ))}
                      {academicPeriods.length === 0 && (
                        <SelectItem value="none" disabled>
                          No active periods found
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label
                  htmlFor="inst"
                  className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  Owning Institution
                </Label>
                <Select
                  value={formData.institution_id}
                  onValueChange={handleInstitutionChange}
                >
                  <SelectTrigger className="text-xs h-10 rounded-xl">
                    <SelectValue placeholder="Select Host Institution" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {institutions.map((i) => (
                      <SelectItem
                        key={i.id}
                        value={i.id}
                        className="text-xs font-semibold"
                      >
                        {i.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-1.5">
                <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Department Ownership
                </Label>
                <ScrollArea className="h-32 border rounded-2xl p-2.5 bg-muted/5">
                  <div className="grid grid-cols-2 gap-2">
                    {departments.map((d) => (
                      <div
                        key={d.id}
                        className="flex items-center gap-2.5 p-2 hover:bg-background rounded-xl transition-all cursor-pointer border border-transparent hover:border-muted/50"
                        onClick={() => toggleDepartment(d.id)}
                      >
                        <Checkbox
                          checked={formData.department_ids.includes(d.id)}
                          className="rounded-md"
                        />
                        <span className="text-[10px] font-semibold truncate leading-none text-foreground/70 uppercase tracking-tight">
                          {d.name}
                        </span>
                      </div>
                    ))}
                    {departments.length === 0 && (
                      <p className="text-[10px] text-muted-foreground font-medium text-center py-10 col-span-2 italic">
                        Select an institution to populate departments
                      </p>
                    )}
                  </div>
                </ScrollArea>
              </div>

              <div className="grid gap-1.5">
                <Label
                  htmlFor="desc"
                  className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  Brief Description
                </Label>
                <Textarea
                  id="desc"
                  placeholder="Primary objectives and academic scope..."
                  className="text-xs min-h-[80px] rounded-2xl p-4 bg-muted/5 focus-visible:ring-1"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsCreateDialogOpen(false)}
                className="text-[10px] font-bold uppercase"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleCreateCourse}
                disabled={isProcessing}
                className="px-8 rounded-xl font-bold text-[10px] uppercase"
              >
                {isProcessing ? (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                ) : null}
                Finalize Module
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {[
          {
            label: "Total Modules",
            value: totalCourses,
            icon: BookOpen,
            color: "text-primary",
          },
          {
            label: "Active Registry",
            value: courses.filter((c) => c.status === "Active").length,
            icon: CheckCircle,
          },
          {
            label: "Institutional Scope",
            value: institutions.length,
            icon: Building2,
          },
          {
            label: "Suspended",
            value: courses.filter((c) => c.status === "Suspended").length,
            icon: Ban,
          },
        ].map((stat, i) => (
          <Card
            key={i}
            className="border shadow-none rounded-xl bg-background/50 overflow-hidden"
          >
            <CardContent className="px-4 py-3 flex flex-col gap-0.5">
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                {stat.label}
              </p>
              <h3
                className={cn(
                  "text-xl font-semibold leading-tight",
                  stat.color,
                )}
              >
                {stat.value}
              </h3>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border shadow-none overflow-hidden rounded-2xl">
        <div className="p-3 border-b bg-muted/5 flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              placeholder="Search by code, title, or lecturer..."
              className="pl-9 h-8 text-[11px] rounded-lg border-muted/50 bg-background focus-visible:ring-1"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[130px] h-8 text-[10px] rounded-full bg-background">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-[10px]">
                  All Status
                </SelectItem>
                <SelectItem value="Active" className="text-[10px]">
                  Active
                </SelectItem>
                <SelectItem value="Suspended" className="text-[10px]">
                  Suspended
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow className="hover:bg-transparent border-none">
                <TableHead className="w-10 pl-4">
                  <Checkbox
                    checked={
                      selectedIds.size === filteredCourses.length &&
                      filteredCourses.length > 0
                    }
                    onCheckedChange={toggleSelectAll}
                  />
                </TableHead>
                <TableHead className="text-[10px] uppercase font-bold tracking-wider h-10">
                  Code
                </TableHead>
                <TableHead className="text-[10px] uppercase font-bold tracking-wider h-10">
                  Course Title
                </TableHead>
                <TableHead className="text-[10px] uppercase font-bold tracking-wider h-10">
                  Lecturer
                </TableHead>
                <TableHead className="text-[10px] uppercase font-bold tracking-wider h-10 text-center">
                  Students
                </TableHead>
                <TableHead className="text-[10px] uppercase font-bold tracking-wider h-10">
                  Status
                </TableHead>
                <TableHead className="text-right text-[10px] uppercase font-bold tracking-wider h-10 pr-4">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                [1, 2, 3, 4, 5].map((i) => (
                  <TableRow key={i} className="h-14 border-muted/10">
                    <TableCell colSpan={7}>
                      <Skeleton className="h-6 w-full rounded-lg" />
                    </TableCell>
                  </TableRow>
                ))
              ) : filteredCourses.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="h-32 text-center text-muted-foreground text-xs italic"
                  >
                    No modules found matching your search.
                  </TableCell>
                </TableRow>
              ) : (
                filteredCourses.map((course) => (
                  <TableRow
                    key={course.id}
                    className="group transition-colors h-14 border-muted/10"
                  >
                    <TableCell className="pl-4">
                      <Checkbox
                        checked={selectedIds.has(course.id)}
                        onCheckedChange={() => toggleSelect(course.id)}
                      />
                    </TableCell>
                    <TableCell className="font-mono font-medium text-primary/80 text-[10px]">
                      {course.code}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-semibold text-xs leading-tight text-foreground/90">
                          {course.title}
                        </span>
                        <span className="text-[9px] text-muted-foreground flex items-center gap-1 uppercase font-medium tracking-tighter">
                          <Layers className="size-2.5 text-primary/50" />{" "}
                          Academic Core
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="size-6 rounded-full bg-muted flex items-center justify-center text-[9px] font-medium text-muted-foreground border uppercase">
                          {course.lecturer_name[0]}
                        </div>
                        <span className="text-xs font-medium">
                          {course.lecturer_name}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1 text-[10px] font-medium">
                        <Users className="size-3 text-muted-foreground" />
                        {course.student_count}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={cn(
                          "rounded-full px-2 py-0 text-[9px] font-medium border uppercase",
                          course.status === "Active"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-amber-50 text-amber-700 border-amber-200",
                        )}
                      >
                        {course.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right pr-4">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="rounded-full h-8 w-8 hover:bg-muted/80"
                            disabled={isProcessingRow === course.id}
                          >
                            {isProcessingRow === course.id ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <MoreVertical className="size-3.5" />
                            )}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          className="w-48 rounded-xl shadow-xl border-muted/20 p-1"
                        >
                          <DropdownMenuLabel className="text-[9px] font-semibold uppercase text-muted-foreground px-2 py-1.5 tracking-tighter">
                            Module Operations
                          </DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-[11px] font-medium py-2 rounded-lg cursor-pointer"
                            onClick={() => handleViewSchedule(course)}
                          >
                            <Calendar className="mr-2 size-3.5 text-muted-foreground" />{" "}
                            View Schedule
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-[11px] font-medium py-2 rounded-lg cursor-pointer"
                            onClick={() => handleViewRoster(course)}
                          >
                            <UserCheck className="mr-2 size-3.5 text-muted-foreground" />{" "}
                            Student Roster
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-[11px] font-medium py-2 rounded-lg cursor-pointer"
                            onClick={() => handleEditClick(course)}
                          >
                            <FileEdit className="mr-2 size-3.5 text-muted-foreground" />{" "}
                            Edit Metadata
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className={cn(
                              "text-[11px] font-semibold py-2 rounded-lg cursor-pointer",
                              course.status === "Active"
                                ? "text-destructive"
                                : "text-emerald-600",
                            )}
                            onClick={() => handleToggleCourseStatus(course)}
                          >
                            {course.status === "Active" ? (
                              <Ban className="mr-2 size-3.5" />
                            ) : (
                              <CheckCircle className="mr-2 size-3.5" />
                            )}
                            {course.status === "Active"
                              ? "Suspend Module"
                              : "Reactivate Module"}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
        <div className="p-2.5 bg-muted/5 border-t flex items-center justify-between">
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-tighter">
            PAGE {currentPage} OF {totalPages || 1}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="size-7 rounded-lg"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((p) => p - 1)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 rounded-lg"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => p + 1)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </Card>

      {/* Edit Metadata Dialog */}
      <Dialog
        open={isEditDialogOpen}
        onOpenChange={(o) => {
          setIsEditDialogOpen(o);
          if (!o) resetForm();
        }}
      >
        <DialogContent className="sm:max-w-[500px] rounded-3xl">
          <DialogHeader>
            <DialogTitle>Edit Course Metadata</DialogTitle>
            <DialogDescription className="text-xs">
              Update registry information for {editData?.code}.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-5 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label
                  htmlFor="edit-title"
                  className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  Title
                </Label>
                <Input
                  id="edit-title"
                  value={formData.title}
                  onChange={(e) =>
                    setFormData({ ...formData, title: e.target.value })
                  }
                  className="rounded-xl h-10 text-xs"
                />
              </div>
              <div className="grid gap-1.5">
                <Label
                  htmlFor="edit-code"
                  className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  Module Code
                </Label>
                <Input
                  id="edit-code"
                  value={formData.code}
                  onChange={(e) =>
                    setFormData({ ...formData, code: e.target.value })
                  }
                  className="rounded-xl h-10 text-xs font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label
                  htmlFor="edit-credits"
                  className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  Credit Load
                </Label>
                <Input
                  id="edit-credits"
                  type="number"
                  value={formData.credit_hours}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      credit_hours: parseInt(e.target.value),
                    })
                  }
                  className="rounded-xl h-10 text-xs font-bold"
                />
              </div>
              <div className="grid gap-1.5">
                <Label
                  htmlFor="edit-period"
                  className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  Academic Period
                </Label>
                <Select
                  value={formData.academic_period_id}
                  onValueChange={handlePeriodChange}
                >
                  <SelectTrigger className="text-xs h-10 rounded-xl">
                    <SelectValue placeholder="Select Period" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {academicPeriods.map((p) => (
                      <SelectItem
                        key={p.id}
                        value={p.id}
                        className="text-xs font-medium"
                      >
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label
                htmlFor="edit-desc"
                className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
              >
                Description
              </Label>
              <Textarea
                id="edit-desc"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                className="rounded-2xl text-xs min-h-[100px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsEditDialogOpen(false)}
              className="text-[10px] font-bold uppercase"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleUpdateCourse}
              disabled={isProcessing}
              className="px-8 rounded-xl font-bold text-[10px] uppercase"
            >
              {isProcessing ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : null}
              Save Metadata
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
