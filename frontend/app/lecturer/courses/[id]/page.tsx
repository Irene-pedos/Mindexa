// app/lecturer/courses/[id]/page.tsx
"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Plus,
  Loader2,
  Calendar,
  ExternalLink,
  Upload,
  FileText,
  Trash2,
  Database,
  Users,
  ArrowRight,
  ChevronLeft,
  Search,
  Building2,
  Layers,
  CheckCircle2,
  TrendingUp,
  Clock,
  Eye,
  Download,
  ShieldCheck,
  Activity,
  BookOpen,
} from "lucide-react";
import {
  lecturerApi,
  StudentCourseRecordResponse,
  LecturerMaterialResponse,
  WorkspaceDetail,
} from "@/lib/api/lecturer";
import { toast } from "sonner";
import { format } from "date-fns";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function LecturerWorkspaceDetail() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [workspace, setWorkspace] = useState<WorkspaceDetail | null>(null);
  const [materials, setMaterials] = useState<LecturerMaterialResponse[]>([]);
  const [loading, setLoading] = useState(true);

  const [uploading, setUploading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const [recordDialogOpen, setRecordDialogOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [record, setRecord] = useState<StudentCourseRecordResponse | null>(
    null,
  );
  const [loadingRecord, setLoadingRecord] = useState(false);

  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const loadWorkspace = useCallback(async () => {
    try {
      setLoading(true);
      const [workspaceData, materialsData] = await Promise.all([
        lecturerApi.getWorkspaceDetail(id),
        lecturerApi.getWorkspaceMaterials(id),
      ]);
      setWorkspace(workspaceData);
      setMaterials(materialsData);
    } catch (err: unknown) {
      toast.error("Failed to load workspace details");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadWorkspace();
  }, [loadWorkspace]);

  const handleArchiveWorkspace = async () => {
    setArchiving(true);
    try {
      await lecturerApi.archiveWorkspace(id);
      toast.success("Workspace archived successfully");
      router.push("/lecturer/courses");
    } catch (err: any) {
      toast.error(err.message || "Failed to archive workspace");
      setArchiveDialogOpen(false);
    } finally {
      setArchiving(false);
    }
  };

  const handleUploadMaterial = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    if (!e.target.files?.[0]) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", e.target.files[0]);
      formData.append("teaching_workspace_id", id);
      formData.append("material_category", "LECTURE_NOTES");
      formData.append("is_student_visible", "true");
      await lecturerApi.uploadMaterial(formData);
      toast.success("Material uploaded successfully");
      const materialsData = await lecturerApi.getWorkspaceMaterials(id);
      setMaterials(materialsData);
    } catch (err: any) {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const openRecord = async (studentId: string, name: string) => {
    setSelectedStudent({ id: studentId, name });
    setRecordDialogOpen(true);
    setLoadingRecord(true);
    setRecord(null);
    try {
      const data = await lecturerApi.getStudentRecord(id, studentId);
      setRecord(data);
    } catch (err: unknown) {
      toast.error("Failed to load student record");
      setRecordDialogOpen(false);
    } finally {
      setLoadingRecord(false);
    }
  };

  const filteredRoster =
    workspace?.roster.filter(
      (s) =>
        s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.student_id.toLowerCase().includes(searchTerm.toLowerCase()),
    ) || [];

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-64 rounded-sm" />
            <Skeleton className="h-4 w-40 rounded-sm opacity-50" />
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-9 space-y-6">
            <div className="grid grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 rounded-xl" />
              ))}
            </div>
            <Skeleton className="h-24 bg-muted/20 rounded-xl" />
            <Skeleton className="h-[400px] bg-muted/20 rounded-xl" />
          </div>
          <div className="lg:col-span-3 h-[500px] bg-muted/20 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="py-20 text-center text-muted-foreground">
        Workspace not found.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="outline"
            size="icon"
            asChild
            className="h-9 w-9 rounded-lg shrink-0"
          >
            <Link href="/lecturer/courses">
              <ChevronLeft className="size-5 text-muted-foreground" />
            </Link>
          </Button>
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground truncate">
              {workspace.title}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge
                variant="outline"
                className="text-[10px] font-medium px-1.5 h-5"
              >
                {workspace.code}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {workspace.academic_year}
              </span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setArchiveDialogOpen(true)}
            className="text-destructive hover:bg-destructive/10"
          >
            Archive Workspace
          </Button>
          <Button
            asChild
            size="sm"
          >
            <Link href="/lecturer/assessments/new">
              <Plus className="mr-2 size-4" /> New Assessment
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Main Area */}
        <div className="lg:col-span-9 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-5 flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Class Average</p>
                  <p className="text-2xl font-semibold tracking-tight text-primary">
                    {workspace.performance_avg.toFixed(1)}%
                  </p>
                </div>
                <TrendingUp className="size-5 text-muted-foreground opacity-70" />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Active Students</p>
                  <p className="text-2xl font-semibold tracking-tight text-foreground">
                    {workspace.student_count}
                  </p>
                </div>
                <Users className="size-5 text-muted-foreground opacity-70" />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 flex items-center justify-between">
                <div className="space-y-1 min-w-0">
                  <p className="text-xs font-medium text-muted-foreground">Target Class</p>
                  <p className="text-lg font-semibold truncate text-foreground/80 mt-1">
                    {workspace.class_name}
                  </p>
                </div>
                <Building2 className="size-5 text-muted-foreground opacity-70" />
              </CardContent>
            </Card>
          </div>

          {/* Progress */}
          <Card>
            <CardContent className="p-5">
              <div className="mb-3 flex justify-between items-center">
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold">Syllabus Execution</h3>
                  <p className="text-xs text-muted-foreground">Integrated workspace data</p>
                </div>
                <span className="text-2xl font-semibold tracking-tight text-primary">
                  {workspace.performance_avg.toFixed(1)}%
                </span>
              </div>
              <Progress
                value={workspace.performance_avg}
                className="h-2 bg-muted"
              />
            </CardContent>
          </Card>

          {/* Student Roster Table */}
          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3">
              <div className="space-y-1">
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  <Layers className="size-5 text-muted-foreground" /> Student Registry
                </CardTitle>
                <CardDescription>Directory of all students enrolled in this course.</CardDescription>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  placeholder="Search students..."
                  className="pl-9 text-sm rounded-lg"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Student ID</TableHead>
                    <TableHead>Student Details</TableHead>
                    <TableHead>Course Progression</TableHead>
                    <TableHead className="text-right pr-4">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRoster.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="text-center py-12 text-sm text-muted-foreground"
                      >
                        No students found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRoster.map((student) => (
                      <TableRow
                        key={student.id}
                        className="hover:bg-muted/50 transition-colors"
                      >
                        <TableCell className="font-mono text-xs text-muted-foreground pl-4">
                          {student.student_id}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium text-sm text-foreground">
                              {student.name}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {student.email}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={student.progress} className="w-16 h-1.5" />
                            <span className="text-xs text-muted-foreground font-semibold tabular-nums">
                              {student.progress}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right pr-4">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openRecord(student.id, student.name)}
                          >
                            Trace Audit
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-3 space-y-6">
          <Card className="bg-primary/5 border-primary/10">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-primary">
                Quick Navigation
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                asChild
                className="w-full justify-between"
                size="sm"
              >
                <Link
                  href="/lecturer/assessments/new"
                >
                  New Assessment <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="w-full"
                size="sm"
              >
                <Link
                  href="/lecturer/question-bank"
                  className="flex items-center gap-2 justify-center"
                >
                  <Database className="size-4" /> Question Bank
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between py-4 border-b">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <BookOpen className="size-4 text-muted-foreground" /> Course Materials ({materials.length})
              </CardTitle>
              <Button
                variant="ghost"
                size="icon"
                disabled={uploading}
                onClick={() =>
                  document.getElementById("material-upload")?.click()
                }
              >
                {uploading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Upload className="size-4" />
                )}
              </Button>
              <input
                id="material-upload"
                type="file"
                className="hidden"
                onChange={handleUploadMaterial}
              />
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-64">
                {materials.length === 0 ? (
                  <div className="text-center py-12 px-4 text-xs text-muted-foreground italic">
                    No files uploaded.
                  </div>
                ) : (
                  <div className="divide-y">
                    {materials.map((m) => (
                      <div
                        key={m.id}
                        className="flex items-center justify-between p-3 px-4 hover:bg-muted/50 transition-colors group"
                      >
                        <div className="flex items-center gap-2 truncate">
                          <div className="bg-primary/5 p-1.5 rounded-lg text-primary">
                            <FileText className="size-4" />
                          </div>
                          <div className="truncate">
                            <p className="text-xs font-medium truncate text-foreground">
                              {m.display_name || m.original_filename}
                            </p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {m.file_extension.replace(".", "").toUpperCase()} •{" "}
                              {(m.file_size_bytes / (1024 * 1024)).toFixed(2)} MB
                            </p>
                          </div>
                        </div>
                        <Download className="size-3.5 text-muted-foreground opacity-50 group-hover:opacity-100 transition-opacity" />
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Trace Audit Modal */}
      <Dialog open={recordDialogOpen} onOpenChange={setRecordDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] p-0 overflow-hidden">
          <DialogHeader className="p-4 border-b">
            <DialogTitle className="text-base font-semibold">
              Trace Audit: {selectedStudent?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="p-5">
            {loadingRecord ? (
              <div className="space-y-4">
                <Skeleton className="h-16 w-full rounded-lg" />
                <Skeleton className="h-32 w-full rounded-lg" />
              </div>
            ) : record ? (
              <div className="space-y-6">
                <div className="grid grid-cols-4 gap-4 p-4 rounded-lg border bg-muted/30">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Student ID</p>
                    <p className="text-sm font-semibold text-foreground">{record.student_id}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Email</p>
                    <p className="text-sm font-semibold text-foreground truncate">{record.email}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Enrolled At</p>
                    <p className="text-sm font-semibold text-foreground">
                      {format(new Date(record.enrolled_at), "MMM d, yyyy")}
                    </p>
                  </div>
                  <div className="space-y-1 text-right">
                    <p className="text-xs text-muted-foreground">Progress</p>
                    <p className="text-base font-bold text-emerald-600 tabular-nums">
                      {record.overall_progress}%
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Activity className="size-4 text-muted-foreground" /> Assessment History
                  </h3>
                  <div className="rounded-lg border divide-y overflow-hidden">
                    {record.attempts.length === 0 ? (
                      <div className="p-8 text-center text-sm text-muted-foreground italic">
                        No assessments attempted yet.
                      </div>
                    ) : (
                      record.attempts.map((att) => (
                        <div
                          key={att.id}
                          className="p-3 px-4 flex items-center justify-between hover:bg-muted/50 transition-colors"
                        >
                          <div className="space-y-1 min-w-0 pr-4">
                            <p className="text-sm font-medium text-foreground truncate">
                              {att.assessment_title}
                            </p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>
                                {att.submitted_at
                                  ? format(
                                      new Date(att.submitted_at),
                                      "MMM d, HH:mm",
                                    )
                                  : "Pending Submission"}
                              </span>
                              <span>•</span>
                              <span>{att.status}</span>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            {att.percentage !== null ? (
                              <p className="text-base font-semibold text-primary tabular-nums">
                                {att.percentage}%
                              </p>
                            ) : (
                              <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                                Evaluating
                              </span>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
          <div className="p-4 border-t flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setRecordDialogOpen(false)}
            >
              Close
            </Button>
            <Button>
              Export Report
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Archive Dialog */}
      <Dialog open={archiveDialogOpen} onOpenChange={setArchiveDialogOpen}>
        <DialogContent className="max-w-md p-0 overflow-hidden">
          <DialogHeader className="p-4 border-b">
            <DialogTitle className="text-base font-semibold text-destructive">
              Archive Workspace
            </DialogTitle>
          </DialogHeader>
          <div className="p-5">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Are you sure you want to archive this teaching workspace? Archiving will hide the workspace from active dashboards, but all student grades and attempts data will be preserved.
            </p>
          </div>
          <div className="p-4 border-t flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setArchiveDialogOpen(false)}
              disabled={archiving}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleArchiveWorkspace}
              disabled={archiving}
            >
              {archiving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "Confirm Archive"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
