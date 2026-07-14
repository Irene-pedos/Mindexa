// app/lecturer/courses/[id]/page.tsx
"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus,
  Loader2,
  Calendar,
  Upload,
  FileText,
  Database,
  Users,
  ArrowRight,
  ChevronLeft,
  Search,
  Building2,
  Layers,
  CheckCircle2,
  TrendingUp,
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
import { FileCodeIcon, XIcon } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from "@/components/ui/attachment";

export default function LecturerWorkspaceDetail() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [workspace, setWorkspace] = useState<WorkspaceDetail | null>(null);
  const [materials, setMaterials] = useState<LecturerMaterialResponse[]>([]);
  const [loading, setLoading] = useState(true);

  const [uploading, setUploading] = useState(false);
  const [isMaterialVisible, setIsMaterialVisible] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [deleteMaterialId, setDeleteMaterialId] = useState<string | null>(null);

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
      formData.append("is_student_visible", String(isMaterialVisible));
      await lecturerApi.uploadMaterial(formData);
      toast.success("Material uploaded successfully");
      const materialsData = await lecturerApi.getWorkspaceMaterials(id);
      setMaterials(materialsData);
    } catch (err: any) {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const confirmDeleteMaterial = async () => {
    if (!deleteMaterialId) return;
    try {
      await lecturerApi.deleteMaterial(deleteMaterialId);
      toast.success("Material deleted successfully");
      setMaterials((prev) => prev.filter((m) => m.id !== deleteMaterialId));
    } catch (err: any) {
      toast.error(err.message || "Failed to delete material");
    } finally {
      setDeleteMaterialId(null);
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
      <div className="w-full space-y-3.5 p-1 md:p-2 animate-pulse">
        <div className="flex items-center gap-3 pb-2 border-b">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <div className="space-y-1">
            <Skeleton className="h-6 w-48 rounded" />
            <Skeleton className="h-3.5 w-32 rounded" />
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-9 space-y-4">
            <div className="grid grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 rounded-xl" />
              ))}
            </div>
            <Skeleton className="h-[250px] bg-zinc-50 rounded-xl border border-zinc-150" />
          </div>
          <div className="lg:col-span-3 h-[300px] bg-zinc-50 rounded-xl border border-zinc-150" />
        </div>
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="py-16 text-center text-zinc-500 flex flex-col items-center justify-center gap-2">
        <Database className="size-8 opacity-30" />
        <p className="text-xs font-semibold">Workspace not found.</p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-3.5 p-1 md:p-2 animate-in fade-in duration-200">
      {/* Header Container */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-2">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="outline"
            size="icon"
            asChild
            className="h-8 w-8 rounded-lg shrink-0 border-zinc-200 bg-white hover:bg-zinc-50"
          >
            <Link href="/lecturer/courses">
              <ChevronLeft className="size-4 text-zinc-600" />
            </Link>
          </Button>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 truncate">
              {workspace.title}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge
                variant="outline"
                className="text-[9px] font-bold uppercase px-1.5 h-4.5 bg-primary/5 text-primary border-primary/20"
              >
                {workspace.code}
              </Badge>
              <span className="text-sm text-muted-foreground font-medium">
                Academic Year: {workspace.academic_year}
              </span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setArchiveDialogOpen(true)}
            className="text-red-600 hover:bg-red-50 hover:text-red-700 border-red-200 h-8 px-3 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-white"
          >
            Archive
          </Button>
          <Button
            asChild
            size="sm"
            className="rounded-lg text-[10px] font-bold uppercase tracking-wider h-8 px-3 shadow-none text-white bg-primary hover:bg-primary/95"
          >
            <Link href="/lecturer/assessments/new">
              <Plus className="mr-1.5 size-3.5" /> New Assessment
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Main Area */}
        <div className="lg:col-span-9 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-white shadow-sm border border-zinc-150 rounded-xl overflow-hidden">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="space-y-0.5">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">
                    Class Performance
                  </p>
                  <p className="text-xl font-bold tracking-tight text-primary">
                    {workspace.performance_avg.toFixed(1)}%
                  </p>
                </div>
                <TrendingUp className="size-6 text-primary/30" />
              </CardContent>
            </Card>

            <Card className="bg-white shadow-sm border border-zinc-150 rounded-xl overflow-hidden">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="space-y-0.5">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">
                    Enrolled Students
                  </p>
                  <p className="text-xl font-bold tracking-tight text-zinc-950">
                    {workspace.student_count}
                  </p>
                </div>
                <Users className="size-6 text-zinc-300" />
              </CardContent>
            </Card>

            <Card className="bg-white shadow-sm border border-zinc-150 rounded-xl overflow-hidden">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="space-y-0.5 min-w-0">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">
                    Target Cohort
                  </p>
                  <p className="text-sm font-bold truncate text-zinc-950 mt-0.5">
                    {workspace.class_name}
                  </p>
                </div>
                <Building2 className="size-6 text-zinc-300" />
              </CardContent>
            </Card>
          </div>

          {/* Progress bar */}
          <Card className="bg-white shadow-sm border border-zinc-150 rounded-xl overflow-hidden">
            <CardContent className="p-4">
              <div className="mb-2 flex justify-between items-center text-xs">
                <div className="space-y-0.5">
                  <h3 className="font-bold text-zinc-700">
                    Syllabus Completion
                  </h3>
                  <p className="text-[10px] text-muted-foreground font-medium">
                    Evaluations logged via assignments registry
                  </p>
                </div>
                <span className="text-lg font-bold text-primary">
                  {workspace.performance_avg.toFixed(1)}%
                </span>
              </div>
              <Progress
                value={workspace.performance_avg}
                className="h-1.5 bg-zinc-100"
              />
            </CardContent>
          </Card>

          {/* Student Roster Table */}
          <Card className="bg-white shadow-sm border border-zinc-150 rounded-xl overflow-hidden">
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 pt-3.5 px-4 border-b border-zinc-100 bg-zinc-50/50">
              <div className="space-y-0.5">
                <CardTitle className="text-xs font-bold flex items-center gap-1.5 uppercase text-zinc-700 tracking-wider">
                  <Layers className="size-4 text-primary shrink-0" /> Student Cohort
                </CardTitle>
                <CardDescription className="text-[10px] font-medium text-muted-foreground">
                  Directory of students synchronized with this workspace.
                </CardDescription>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/60" />
                <Input
                  placeholder="Filter student names or IDs..."
                  className="pl-9 h-8.5 text-xs rounded-lg border-zinc-200 bg-white"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-zinc-50/50 border-b border-zinc-100">
                  <TableRow className="h-8.5 hover:bg-transparent border-none">
                    <TableHead className="text-[9px] font-bold uppercase tracking-wider pl-4 text-zinc-400">
                      ID
                    </TableHead>
                    <TableHead className="text-[9px] font-bold uppercase tracking-wider text-zinc-400">
                      Student Details
                    </TableHead>
                    <TableHead className="text-[9px] font-bold uppercase tracking-wider text-zinc-400">
                      Progression
                    </TableHead>
                    <TableHead className="text-right text-[9px] font-bold uppercase tracking-wider pr-4 text-zinc-400">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRoster.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="text-center py-10 text-xs text-muted-foreground font-medium"
                      >
                        No students found matching your search.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRoster.map((student) => (
                      <TableRow
                        key={student.id}
                        className="hover:bg-primary/[0.02] h-12 border-zinc-100 transition-all cursor-pointer group"
                        onClick={() => openRecord(student.id, student.name)}
                      >
                        <TableCell className="font-mono text-[9px] font-bold text-zinc-500 pl-4">
                          {student.student_id}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-bold text-xs text-zinc-900 group-hover:text-primary transition-colors">
                              {student.name}
                            </span>
                            <span className="text-[9px] font-medium text-zinc-400">
                              {student.email}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1 w-28">
                            <span className="text-[9px] text-zinc-500 font-bold">
                              {student.progress}%
                            </span>
                            <div className="w-full h-1 bg-zinc-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-emerald-500 animate-in slide-in-from-left duration-500"
                                style={{ width: `${student.progress}%` }}
                              />
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right pr-4">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2.5 text-[9px] font-bold uppercase tracking-wider rounded-lg border-zinc-200 group-hover:bg-primary group-hover:text-white group-hover:border-primary transition-all opacity-0 group-hover:opacity-100"
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
        <div className="lg:col-span-3 space-y-4">
          <Card className="bg-primary/[0.01] border-primary/10 rounded-xl shadow-none">
            <CardHeader className="py-2.5 px-4 border-b border-primary/5 bg-primary/[0.02]">
              <CardTitle className="text-[10px] font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                Quick Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-3.5 px-4 pb-3.5">
              <Button
                asChild
                className="w-full justify-between h-8 text-[10px] font-bold uppercase tracking-wider rounded-lg shadow-none text-white bg-primary hover:bg-primary/95"
              >
                <Link href="/lecturer/assessments/new">
                  New Assessment <ArrowRight className="size-3" />
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="w-full h-8 text-[10px] font-bold uppercase tracking-wider rounded-lg border-zinc-200 bg-white hover:bg-zinc-50"
              >
                <Link
                  href="/lecturer/question-bank"
                  className="flex items-center gap-1.5 justify-center"
                >
                  <Database className="size-3.5 text-zinc-500" /> Question Bank
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="bg-white shadow-sm border border-zinc-150 rounded-xl overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between py-2.5 px-4 border-b border-zinc-100 bg-zinc-50/50">
              <CardTitle className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 text-zinc-700">
                <BookOpen className="size-4 text-primary shrink-0" /> Handouts
                <Badge
                  variant="outline"
                  className="ml-1 text-[8px] font-bold py-0 h-4 px-1 bg-zinc-100 border text-zinc-500"
                >
                  {materials.length}
                </Badge>
              </CardTitle>
              <div className="flex items-center gap-2">
                <label className="text-[9px] flex items-center gap-1 cursor-pointer text-zinc-400 hover:text-zinc-600 transition-colors font-medium">
                  <input
                    type="checkbox"
                    checked={isMaterialVisible}
                    onChange={(e) => setIsMaterialVisible(e.target.checked)}
                    className="size-3 accent-primary rounded-sm"
                  />
                  Public
                </label>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 rounded-md hover:bg-zinc-100 text-zinc-400"
                  disabled={uploading}
                  onClick={() =>
                    document.getElementById("material-upload")?.click()
                  }
                >
                  {uploading ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Upload className="size-3.5" />
                  )}
                </Button>
                <input
                  id="material-upload"
                  type="file"
                  className="hidden"
                  onChange={handleUploadMaterial}
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-60">
                {materials.length === 0 && !uploading ? (
                  <div className="flex flex-col items-center justify-center py-10 px-4 space-y-1.5 text-zinc-400">
                    <FileText className="size-5 opacity-30" />
                    <p className="text-[10px] font-semibold uppercase tracking-wider">
                      No handouts uploaded
                    </p>
                  </div>
                ) : (
                  <AttachmentGroup className="flex-col gap-1.5 p-3">
                    {uploading && (
                      <Attachment state="uploading" className="w-full">
                        <AttachmentMedia>
                          <Spinner />
                        </AttachmentMedia>
                        <AttachmentContent>
                          <AttachmentTitle className="text-xs">
                            Uploading material...
                          </AttachmentTitle>
                          <AttachmentDescription className="text-[10px]">
                            Processing handouts upload
                          </AttachmentDescription>
                        </AttachmentContent>
                      </Attachment>
                    )}
                    {materials.map((m) => (
                      <Attachment
                        key={m.id}
                        className="w-full justify-between hover:bg-zinc-50 border border-zinc-100 transition-all cursor-pointer rounded-lg p-2 bg-white"
                        onClick={async () => {
                          try {
                            await lecturerApi.downloadMaterial(
                              m.id,
                              m.original_filename,
                            );
                            toast.success("Download started");
                          } catch (err: any) {
                            toast.error("Failed to download material");
                          }
                        }}
                      >
                        <AttachmentMedia>
                          <FileCodeIcon className="size-4.5 text-primary" />
                        </AttachmentMedia>
                        <AttachmentContent>
                          <AttachmentTitle className="text-xs truncate max-w-[130px]">
                            {m.display_name || m.original_filename}
                          </AttachmentTitle>
                          <AttachmentDescription className="text-[9px]">
                            {m.file_extension
                              ? m.file_extension.replace(".", "").toUpperCase()
                              : "FILE"}{" "}
                            · {(m.file_size_bytes / (1024 * 1024)).toFixed(2)}{" "}
                            MB
                            {!m.is_student_visible && " · Hidden"}
                          </AttachmentDescription>
                        </AttachmentContent>
                        <AttachmentActions onClick={(e) => e.stopPropagation()}>
                          <AttachmentAction
                            aria-label="Remove material"
                            className="size-6 hover:bg-red-50"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteMaterialId(m.id);
                            }}
                          >
                            <XIcon className="size-3.5 text-red-500" />
                          </AttachmentAction>
                        </AttachmentActions>
                      </Attachment>
                    ))}
                  </AttachmentGroup>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Trace Audit Modal */}
      <Dialog open={recordDialogOpen} onOpenChange={setRecordDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] p-0 overflow-hidden rounded-xl border border-zinc-200 shadow-xl bg-white">
          <DialogHeader className="p-4 border-b bg-zinc-50/50">
            <DialogTitle className="text-sm font-bold text-zinc-800">
              Academic Record: {selectedStudent?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="p-4">
            {loadingRecord ? (
              <div className="space-y-3">
                <Skeleton className="h-12 w-full rounded-lg" />
                <Skeleton className="h-24 w-full rounded-lg" />
              </div>
            ) : record ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-xl border border-zinc-150 bg-zinc-50/50 text-xs">
                  <div>
                    <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 block">Student ID</span>
                    <span className="font-semibold text-zinc-700">{record.student_id}</span>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 block">Email Address</span>
                    <span className="font-semibold text-zinc-700 truncate block">{record.email}</span>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 block">Enrolled Date</span>
                    <span className="font-semibold text-zinc-700">{format(new Date(record.enrolled_at), "MMM d, yyyy")}</span>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 block">Overall Progress</span>
                    <span className="text-sm font-bold text-emerald-600 tabular-nums">{record.overall_progress}%</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
                    <Activity className="size-4 text-zinc-400" /> Assessment History
                  </h3>
                  <div className="rounded-xl border divide-y overflow-hidden max-h-60 overflow-y-auto">
                    {record.attempts.length === 0 ? (
                      <div className="p-8 text-center text-xs text-muted-foreground italic">
                        No assessments attempted yet.
                      </div>
                    ) : (
                      record.attempts.map((att) => (
                        <div
                          key={att.id}
                          className="p-3 flex items-center justify-between hover:bg-zinc-50 transition-colors"
                        >
                          <div className="space-y-0.5 min-w-0 pr-4">
                            <p className="text-xs font-bold text-zinc-700 truncate">
                              {att.assessment_title}
                            </p>
                            <div className="flex items-center gap-2 text-[10px] text-zinc-400">
                              <span>
                                {att.submitted_at
                                  ? format(
                                      new Date(att.submitted_at),
                                      "MMM d, HH:mm",
                                    )
                                  : "Pending Submission"}
                              </span>
                              <span>•</span>
                              <span className="font-semibold">{att.status}</span>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            {att.percentage !== null ? (
                              <p className="text-sm font-bold text-primary tabular-nums">
                                {att.percentage}%
                              </p>
                            ) : (
                              <span className="text-[9px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 uppercase">
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
          <div className="p-4 border-t bg-zinc-50/50 flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-[10px] font-bold uppercase"
              onClick={() => setRecordDialogOpen(false)}
            >
              Close
            </Button>
            <Button size="sm" className="h-8 text-[10px] font-bold uppercase text-white bg-primary hover:bg-primary/95">Export Report</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Archive Dialog */}
      <Dialog open={archiveDialogOpen} onOpenChange={setArchiveDialogOpen}>
        <DialogContent className="max-w-md p-0 overflow-hidden rounded-xl bg-white border">
          <DialogHeader className="p-4 border-b bg-zinc-50/50">
            <DialogTitle className="text-xs font-bold text-red-600 uppercase tracking-wider">
              Archive Workspace
            </DialogTitle>
          </DialogHeader>
          <div className="p-5">
            <p className="text-xs text-zinc-600 leading-relaxed font-medium">
              Are you sure you want to archive this teaching workspace?
              Archiving will hide the workspace from active dashboards, but all
              student grades and attempts data will be preserved.
            </p>
          </div>
          <div className="p-4 border-t bg-zinc-50/50 flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-[10px] font-bold uppercase"
              onClick={() => setArchiveDialogOpen(false)}
              disabled={archiving}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="h-8 text-[10px] font-bold uppercase"
              onClick={handleArchiveWorkspace}
              disabled={archiving}
            >
              {archiving ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                "Confirm Archive"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Material Alert Dialog */}
      <AlertDialog
        open={!!deleteMaterialId}
        onOpenChange={(o) => !o && setDeleteMaterialId(null)}
      >
        <AlertDialogContent className="rounded-xl bg-white border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm font-bold text-zinc-800">Delete Material</AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-zinc-500 leading-normal font-medium">
              Are you sure you want to delete this course handout? This action cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-8 text-[10px] font-bold uppercase rounded-lg">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700 h-8 text-[10px] font-bold uppercase rounded-lg"
              onClick={confirmDeleteMaterial}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
