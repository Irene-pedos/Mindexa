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
      // Reset input so the same file can be uploaded again if needed
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
      <div className="py-20 text-center text-muted-foreground flex flex-col items-center justify-center gap-3">
        <Database className="size-10 opacity-20" />
        <p className="text-sm font-medium">Workspace not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/40 pb-4">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="outline"
            size="icon"
            asChild
            className="h-9 w-9 rounded-xl shrink-0 border-border/60 hover:bg-muted/50 transition-colors"
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
                className="text-[10px] font-bold uppercase tracking-widest px-1.5 h-5 bg-primary/5 text-primary border-primary/20"
              >
                {workspace.code}
              </Badge>
              <span className="text-xs text-muted-foreground font-medium">
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
            className="text-destructive hover:bg-destructive/10 border-destructive/20 rounded-lg text-xs font-semibold"
          >
            Archive Workspace
          </Button>
          <Button
            asChild
            size="sm"
            className="rounded-lg text-xs font-semibold shadow-sm"
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
            <Card className="bg-card/30 backdrop-blur-sm shadow-none border border-border/50 rounded-xl">
              <CardContent className="p-5 flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Class Average</p>
                  <p className="text-2xl font-bold tracking-tight text-primary">
                    {workspace.performance_avg.toFixed(1)}%
                  </p>
                </div>
                <TrendingUp className="size-6 text-primary/30" />
              </CardContent>
            </Card>

            <Card className="bg-card/30 backdrop-blur-sm shadow-none border border-border/50 rounded-xl">
              <CardContent className="p-5 flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Active Students</p>
                  <p className="text-2xl font-bold tracking-tight text-foreground">
                    {workspace.student_count}
                  </p>
                </div>
                <Users className="size-6 text-muted-foreground/30" />
              </CardContent>
            </Card>

            <Card className="bg-card/30 backdrop-blur-sm shadow-none border border-border/50 rounded-xl">
              <CardContent className="p-5 flex items-center justify-between">
                <div className="space-y-1 min-w-0">
                  <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Target Class</p>
                  <p className="text-lg font-bold truncate text-foreground mt-1">
                    {workspace.class_name}
                  </p>
                </div>
                <Building2 className="size-6 text-muted-foreground/30" />
              </CardContent>
            </Card>
          </div>

          {/* Progress */}
          <Card className="bg-card/30 backdrop-blur-sm shadow-none border border-border/50 rounded-xl overflow-hidden">
            <CardContent className="p-5">
              <div className="mb-3 flex justify-between items-center">
                <div className="space-y-1">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">Syllabus Execution</h3>
                  <p className="text-xs text-muted-foreground font-medium">Integrated workspace data</p>
                </div>
                <span className="text-2xl font-bold tracking-tight text-primary">
                  {workspace.performance_avg.toFixed(1)}%
                </span>
              </div>
              <Progress
                value={workspace.performance_avg}
                className="h-2 bg-muted/50"
              />
            </CardContent>
          </Card>

          {/* Student Roster Table */}
          <Card className="bg-card/30 backdrop-blur-sm shadow-none border border-border/50 rounded-xl overflow-hidden">
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-border/40 bg-muted/10">
              <div className="space-y-1">
                <CardTitle className="text-sm font-bold flex items-center gap-2 uppercase tracking-wider">
                  <Layers className="size-4 text-primary" /> Student Registry
                </CardTitle>
                <CardDescription className="text-[11px] font-medium text-muted-foreground">Directory of all students enrolled in this course.</CardDescription>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/60" />
                <Input
                  placeholder="Search students..."
                  className="pl-9 h-9 text-xs rounded-lg border-border/60 bg-background/50 focus-visible:ring-1"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-muted/5 border-b border-border/40">
                  <TableRow className="h-10 hover:bg-transparent border-none">
                    <TableHead className="text-[10px] font-bold uppercase tracking-wider pl-6 text-muted-foreground">Student ID</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Student Details</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Course Progression</TableHead>
                    <TableHead className="text-right text-[10px] font-bold uppercase tracking-wider pr-6 text-muted-foreground">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRoster.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="text-center py-12 text-sm text-muted-foreground font-medium"
                      >
                        No students found matching your search.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRoster.map((student) => (
                      <TableRow
                        key={student.id}
                        className="hover:bg-primary/[0.03] h-14 border-border/10 transition-all cursor-pointer group"
                        onClick={() => openRecord(student.id, student.name)}
                      >
                        <TableCell className="font-mono text-[10px] font-medium text-muted-foreground/80 pl-6">
                          {student.student_id}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-bold text-sm text-foreground group-hover:text-primary transition-colors">
                              {student.name}
                            </span>
                            <span className="text-[10px] font-medium text-muted-foreground/80">
                              {student.email}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1 w-32">
                            <span className="text-[10px] text-muted-foreground font-bold tabular-nums">
                              {student.progress}%
                            </span>
                            <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
                              <div className="h-full bg-emerald-500" style={{ width: `${student.progress}%` }} />
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right pr-6">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-3 text-[10px] font-bold uppercase tracking-widest rounded-lg border-border/60 group-hover:bg-primary group-hover:text-primary-foreground group-hover:border-primary transition-all opacity-0 group-hover:opacity-100"
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
          <Card className="bg-primary/[0.02] border-primary/10 rounded-xl shadow-none">
            <CardHeader className="pb-3 border-b border-primary/10 bg-primary/[0.03]">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-2">
                 Quick Navigation
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-4">
              <Button
                asChild
                className="w-full justify-between h-9 text-xs font-bold rounded-lg shadow-sm"
              >
                <Link
                  href="/lecturer/assessments/new"
                >
                  New Assessment <ArrowRight className="size-3.5" />
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="w-full h-9 text-xs font-bold rounded-lg border-primary/20 text-primary hover:bg-primary/10"
              >
                <Link
                  href="/lecturer/question-bank"
                  className="flex items-center gap-2 justify-center"
                >
                  <Database className="size-3.5" /> Question Bank
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="bg-card/30 backdrop-blur-sm shadow-none border border-border/50 rounded-xl overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between py-3 px-4 border-b border-border/40 bg-muted/10">
              <CardTitle className="text-xs font-bold uppercase tracking-wider flex items-center gap-2 text-foreground">
                <BookOpen className="size-4 text-primary" /> Course Materials
                <Badge variant="outline" className="ml-1 text-[9px] font-bold py-0 h-4 border-border/60 text-muted-foreground">{materials.length}</Badge>
              </CardTitle>
              <div className="flex items-center gap-3">
                <label className="text-[10px] flex items-center gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground transition-colors">
                  <input
                    type="checkbox"
                    checked={isMaterialVisible}
                    onChange={(e) => setIsMaterialVisible(e.target.checked)}
                    className="size-3 accent-primary rounded-sm"
                  />
                  Visible to students
                </label>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-lg hover:bg-primary/10 hover:text-primary transition-colors"
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
              <ScrollArea className="h-64">
                {materials.length === 0 && !uploading ? (
                  <div className="flex flex-col items-center justify-center py-12 px-4 space-y-2 text-muted-foreground">
                    <FileText className="size-6 opacity-20" />
                    <p className="text-xs font-medium italic">No files uploaded.</p>
                  </div>
                ) : (
                  <AttachmentGroup className="flex-col gap-2 p-4">
                    {uploading && (
                      <Attachment state="uploading" className="w-full">
                        <AttachmentMedia>
                          <Spinner />
                        </AttachmentMedia>
                        <AttachmentContent>
                          <AttachmentTitle>Uploading material...</AttachmentTitle>
                          <AttachmentDescription>Please wait · Processing file</AttachmentDescription>
                        </AttachmentContent>
                      </Attachment>
                    )}
                    {materials.map((m) => (
                      <Attachment
                        key={m.id}
                        className="w-full justify-between hover:bg-accent/10 transition-all cursor-pointer"
                        onClick={async () => {
                          try {
                            await lecturerApi.downloadMaterial(m.id, m.original_filename);
                            toast.success("Download started");
                          } catch (err: any) {
                            toast.error("Failed to download material");
                          }
                        }}
                      >
                        <AttachmentMedia>
                          <FileCodeIcon className="size-4 text-primary" />
                        </AttachmentMedia>
                        <AttachmentContent>
                          <AttachmentTitle>{m.display_name || m.original_filename}</AttachmentTitle>
                          <AttachmentDescription>
                            {m.file_extension.replace(".", "").toUpperCase()} · {(m.file_size_bytes / (1024 * 1024)).toFixed(2)} MB
                            {!m.is_student_visible && " · Hidden"}
                          </AttachmentDescription>
                        </AttachmentContent>
                        <AttachmentActions onClick={(e) => e.stopPropagation()}>
                          <AttachmentAction
                            aria-label="Remove material"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteMaterialId(m.id);
                            }}
                          >
                            <XIcon className="size-4 text-destructive" />
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

      {/* Delete Material Alert Dialog */}
      <AlertDialog open={!!deleteMaterialId} onOpenChange={(o) => !o && setDeleteMaterialId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Material</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this material? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
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
