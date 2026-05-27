// app/(lecturer)/courses/[id]/page.tsx
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Award,
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
import { Skeleton } from "@/components/ui/interfaces-skeleton";

export default function LecturerWorkspaceDetail() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [workspace, setWorkspace] = useState<WorkspaceDetail | null>(null);
  const [materials, setMaterials] = useState<LecturerMaterialResponse[]>([]);
  const [loading, setLoading] = useState(true);

  const [uploading, setUploading] = useState(false);

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
      const msg =
        err instanceof Error ? err.message : "Failed to load workspace details";
      toast.error(msg);
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
    const file = e.target.files[0];

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("teaching_workspace_id", id);
      formData.append("material_category", "LECTURE_NOTES");
      formData.append("is_student_visible", "true");

      await lecturerApi.uploadMaterial(formData);
      toast.success("Material uploaded successfully");

      const materialsData = await lecturerApi.getWorkspaceMaterials(id);
      setMaterials(materialsData);
    } catch (err: any) {
      toast.error(err.message || "Failed to upload material");
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
      const msg =
        err instanceof Error ? err.message : "Failed to load student record";
      toast.error(msg);
      setRecordDialogOpen(false);
    } finally {
      setLoadingRecord(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Skeleton className="size-12 rounded-xl" />
            <div className="space-y-1.5">
              <Skeleton className="h-7 w-64 rounded-md" />
              <Skeleton className="h-3.5 w-48 rounded-md opacity-60" />
            </div>
          </div>
          <div className="flex gap-3">
            <Skeleton className="h-9 w-24 rounded-lg" />
            <Skeleton className="h-9 w-32 rounded-lg" />
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-9 space-y-4">
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-[350px] w-full rounded-xl" />
          </div>
          <div className="lg:col-span-3 space-y-4">
            <Skeleton className="h-44 w-full rounded-xl" />
            <Skeleton className="h-56 w-full rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="py-24 text-center max-w-xl mx-auto">
        <h2 className="text-xl font-semibold tracking-tight text-foreground/80 uppercase">
          Workspace not found
        </h2>
        <Button
          asChild
          variant="outline"
          className="mt-6 rounded-lg h-9 px-8 font-semibold text-xs"
        >
          <Link href="/lecturer/courses">Back to My Workspaces</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-5 p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground/90 truncate">
            {workspace.title}
          </h1>
          <p className="text-muted-foreground text-[15px] font-medium uppercase tracking-tight opacity-70">
            {workspace.code} • {workspace.academic_year} •{" "}
            {workspace.student_count} registered nodes
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Badge
              variant="outline"
              className="bg-primary/5 uppercase font-semibold text-[10px] h-5 px-2.5 border-primary/10 text-primary/80"
            >
              {workspace.institution_name}
            </Badge>
            {workspace.department_name && (
              <Badge
                variant="outline"
                className="bg-muted/50 font-semibold text-[10px] h-5 px-2.5 uppercase tracking-tighter"
              >
                {workspace.department_name}
              </Badge>
            )}
            <Badge
              variant="secondary"
              className="rounded-full h-5 px-3 text-[10px] font-bold uppercase tracking-tight bg-muted/60 border-none"
            >
              {workspace.class_name}
            </Badge>
          </div>
        </div>
        <div className="flex gap-3 shrink-0">
          <Button
            variant="ghost"
            onClick={() => setArchiveDialogOpen(true)}
            className="text-destructive hover:bg-destructive/5 h-10 px-4 font-semibold text-xs uppercase rounded-xl border border-destructive/10"
          >
            <Trash2 className="mr-2 size-4" /> Archive
          </Button>
          <Button
            asChild
            className="h-10 px-6 font-bold text-xs uppercase rounded-xl shadow-none"
          >
            <Link href="/lecturer/assessments/new">
              <Plus className="mr-2 size-4" /> New Assessment
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Main Content Area */}
        <div className="lg:col-span-9 space-y-5">
          {/* Performance Overview */}
          <Card className="shadow-none border rounded-xl overflow-hidden bg-background hover:border-primary/20 transition-all">
            <CardHeader className="bg-muted/5 border-b py-3 px-5">
              <CardTitle className="text-xs font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-2.5">
                <Award className="size-4 text-primary" /> Performance Index
              </CardTitle>
            </CardHeader>
            <CardContent className="py-6 px-6">
              <div className="mb-3 flex justify-between text-sm font-semibold uppercase tracking-tight">
                <span className="text-muted-foreground/70">
                  Class Weighted Average
                </span>
                <span className="text-primary font-bold">
                  {workspace.performance_avg.toFixed(1)}%
                </span>
              </div>
              <Progress value={workspace.performance_avg} className="h-2" />
            </CardContent>
          </Card>

          {/* Student Roster */}
          <Card className="shadow-none border rounded-xl overflow-hidden bg-background hover:border-primary/20 transition-all">
            <CardHeader className="bg-muted/5 border-b py-3 px-5 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Student Roster
                </CardTitle>
              </div>
              <Badge
                variant="outline"
                className="font-bold bg-background text-[10px] h-5 px-2 border-muted/20 uppercase text-muted-foreground/60"
              >
                {workspace.student_count} Nodes
              </Badge>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-muted/5">
                  <TableRow className="h-12 hover:bg-transparent border-none">
                    <TableHead className="text-[11px] font-bold uppercase tracking-wider pl-6">
                      Reg ID
                    </TableHead>
                    <TableHead className="text-[11px] font-bold uppercase tracking-wider">
                      Account Holder
                    </TableHead>
                    <TableHead className="text-[11px] font-bold uppercase tracking-wider">
                      Syllabus Progress
                    </TableHead>
                    <TableHead className="text-right text-[11px] font-bold uppercase tracking-wider pr-6">
                      Control
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {workspace.roster.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="text-center py-20 text-muted-foreground text-sm font-medium italic opacity-50"
                      >
                        No nodes identified in this workspace.
                      </TableCell>
                    </TableRow>
                  ) : (
                    workspace.roster.map((student) => (
                      <TableRow
                        key={student.id}
                        className="h-14 hover:bg-muted/5 transition-colors border-muted/10"
                      >
                        <TableCell className="font-mono text-xs font-semibold pl-6 opacity-60">
                          {student.student_id}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-semibold text-[15px] uppercase tracking-tight text-foreground/80 leading-none">
                              {student.name}
                            </span>
                            <span className="text-xs text-muted-foreground font-medium mt-1">
                              {student.email}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-4">
                            <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden shrink-0">
                              <div
                                className="h-full bg-primary/70 transition-all"
                                style={{ width: `${student.progress}%` }}
                              />
                            </div>
                            <span className="text-xs font-bold tabular-nums opacity-80">
                              {student.progress}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right pr-6">
                          <Button
                            variant="dim"
                            size="sm"
                            className="rounded-lg h-8 px-4 text-[10px] font-bold uppercase tracking-tight border-none"
                            onClick={() => openRecord(student.id, student.name)}
                          >
                            Audit
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

        {/* Sidebar Info Area */}
        <div className="lg:col-span-3 space-y-5">
          {/* Quick Actions Card */}
          <Card className="shadow-none border rounded-xl overflow-hidden bg-background hover:border-primary/20 transition-all">
            <CardHeader className="bg-muted/5 border-b py-3 px-5">
              <CardTitle className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Workflow Core
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-2">
              <Button
                asChild
                variant="dim"
                className="w-full justify-between h-10 px-4 text-xs font-semibold uppercase rounded-xl border border-primary/5 shadow-none"
                size="sm"
              >
                <Link href="/lecturer/assessments/new">
                  <div className="flex items-center gap-2.5">
                    <Plus className="size-4 text-primary" />
                    Create Evaluation
                  </div>
                  <ExternalLink className="size-3 opacity-20" />
                </Link>
              </Button>
              <Button
                asChild
                variant="dim"
                className="w-full justify-between h-10 px-4 text-xs font-semibold uppercase rounded-xl border border-primary/5 shadow-none"
                size="sm"
              >
                <Link href="/lecturer/question-bank">
                  <div className="flex items-center gap-2.5">
                    <Database className="size-4 text-primary" />
                    Registry Bank
                  </div>
                  <ExternalLink className="size-3 opacity-20" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          {/* Learning Materials Card */}
          <Card className="shadow-none border rounded-xl overflow-hidden bg-background hover:border-primary/20 transition-all">
            <CardHeader className="flex flex-row items-center justify-between py-2.5 bg-muted/5 border-b px-5">
              <CardTitle className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Library Vault
              </CardTitle>
              <Button
                variant="dim"
                size="sm"
                className="size-8 rounded-full border border-primary/10 shadow-sm"
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
            <CardContent className="p-4">
              {materials.length === 0 ? (
                <div className="text-center py-16 border border-dashed rounded-xl bg-muted/5">
                  <FileText className="size-10 mx-auto text-muted-foreground/10 mb-2" />
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/30">
                    Registry Empty
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {materials.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between p-3 rounded-xl hover:bg-muted/5 transition-all group"
                    >
                      <div className="flex items-center gap-3 truncate">
                        <div className="bg-background border p-1.5 rounded-lg text-primary/60 group-hover:bg-primary group-hover:text-white group-hover:border-primary transition-all">
                          <FileText className="size-4.5" />
                        </div>
                        <div className="truncate">
                          <p className="text-sm font-semibold truncate uppercase tracking-tight text-foreground/70">
                            {m.display_name || m.original_filename}
                          </p>
                          <p className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-tighter leading-none mt-1.5">
                            {(m.file_size_bytes / 1024).toFixed(0)} KB •{" "}
                            {m.file_extension.toUpperCase()}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-primary/5"
                      >
                        <ExternalLink className="size-3 text-primary/40" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Student Record Dialog */}
      <Dialog open={recordDialogOpen} onOpenChange={setRecordDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto rounded-3xl shadow-2xl border-none p-0">
          <DialogHeader className="p-8 border-b bg-muted/5">
            <div className="flex flex-col gap-1">
              <DialogTitle className="text-xl font-bold tracking-tight">
                Audit Node: {selectedStudent?.name}
              </DialogTitle>
              <DialogDescription className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40">
                Institutional Performance Trace
              </DialogDescription>
            </div>
          </DialogHeader>

          <div className="p-10 text-sm">
            {loadingRecord ? (
              <div className="py-12 space-y-8">
                <div className="grid grid-cols-4 gap-4">
                  {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-12 w-full rounded-xl" />
                  ))}
                </div>
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-16 w-full rounded-xl" />
                  ))}
                </div>
              </div>
            ) : record ? (
              <div className="space-y-8">
                {/* Header Info */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6 p-6 rounded-2xl border bg-muted/5">
                  <div className="space-y-1">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">
                      Node ID
                    </p>
                    <p className="text-xs font-mono font-bold text-primary/70 uppercase">
                      {record.student_id}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">
                      Registry Email
                    </p>
                    <p className="text-xs font-semibold truncate text-foreground/70">
                      {record.email}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">
                      Entry Vector
                    </p>
                    <p className="text-xs font-semibold text-foreground/70">
                      {format(new Date(record.enrolled_at), "MMM d, yyyy")}
                    </p>
                  </div>
                  <div className="space-y-1 text-right">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">
                      Global Progress
                    </p>
                    <p className="text-sm font-bold text-emerald-600">
                      {record.overall_progress}%
                    </p>
                  </div>
                </div>

                {/* Attempts List */}
                <div className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-widest flex items-center gap-2.5 text-muted-foreground/60">
                    <Database className="size-4" /> Evaluation Registry History
                  </h3>
                  <div className="rounded-2xl border divide-y divide-muted/10 overflow-hidden shadow-sm">
                    {record.attempts.length === 0 ? (
                      <div className="p-20 text-center text-xs font-bold text-muted-foreground/30 uppercase italic bg-muted/5">
                        No evaluation traces identified.
                      </div>
                    ) : (
                      record.attempts.map((att) => (
                        <div
                          key={att.id}
                          className="p-5 flex items-center justify-between hover:bg-muted/5 transition-colors"
                        >
                          <div className="space-y-1">
                            <p className="text-sm font-bold uppercase tracking-tight text-foreground/80 leading-none">
                              {att.assessment_title}
                            </p>
                            <div className="flex items-center gap-4 text-[9px] text-muted-foreground/50 font-bold uppercase tracking-tighter mt-1.5">
                              <span className="flex items-center gap-1.5">
                                <Calendar className="size-3 opacity-40" />
                                {att.submitted_at
                                  ? format(
                                      new Date(att.submitted_at),
                                      "MMM d, HH:mm",
                                    )
                                  : "IN_PROGRESS"}
                              </span>
                              <Badge
                                variant={
                                  att.status === "SUBMITTED" ||
                                  att.status === "GRADED"
                                    ? "secondary"
                                    : "outline"
                                }
                                className="h-4 px-2 text-[8px] rounded-full font-bold uppercase border-none bg-muted/50"
                              >
                                {att.status}
                              </Badge>
                            </div>
                          </div>
                          <div className="text-right">
                            {att.percentage !== null ? (
                              <div className="space-y-0.5">
                                <p className="text-base font-bold tabular-nums tracking-tighter text-primary">
                                  {att.percentage}%
                                </p>
                                <p className="text-[9px] font-bold text-muted-foreground/30 uppercase tracking-widest">
                                  {att.score} / {att.max_score}
                                </p>
                              </div>
                            ) : (
                              <span className="text-[10px] font-bold text-muted-foreground/20 uppercase italic">
                                PENDING_GRADE
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

          <DialogFooter className="p-8 border-t bg-muted/5 gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setRecordDialogOpen(false)}
              className="rounded-xl h-10 px-6 font-bold text-xs uppercase tracking-wider"
            >
              Close Audit
            </Button>
            <Button className="rounded-xl h-10 px-8 font-bold text-xs uppercase tracking-wider gap-2 shadow-none">
              <ExternalLink className="size-4" /> Export Ledger
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Archive Workspace Dialog */}
      <Dialog open={archiveDialogOpen} onOpenChange={setArchiveDialogOpen}>
        <DialogContent className="rounded-3xl border-none shadow-2xl p-0 overflow-hidden">
          <DialogHeader className="p-8 border-b bg-muted/5">
            <DialogTitle className="text-xl font-bold tracking-tight">
              Archive Workspace
            </DialogTitle>
            <DialogDescription className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40 mt-1">
              Structural Preservation Protocol
            </DialogDescription>
          </DialogHeader>
          <div className="p-10">
            <p className="text-sm text-muted-foreground leading-relaxed font-medium">
              Initiating archival for{" "}
              <span className="font-bold text-foreground">
                {workspace.title}
              </span>{" "}
              will de-prioritize this node in your active index. All registry
              data remains preserved for institutional audit.
            </p>
          </div>
          <DialogFooter className="p-8 bg-muted/5 gap-3">
            <Button
              variant="ghost"
              size="sm"
              className="rounded-xl h-10 px-6 font-bold text-xs uppercase tracking-wider"
              onClick={() => setArchiveDialogOpen(false)}
              disabled={archiving}
            >
              Abort
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="rounded-xl h-10 px-8 font-bold text-xs uppercase tracking-wider shadow-none"
              onClick={handleArchiveWorkspace}
              disabled={archiving}
            >
              {archiving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "Confirm Archival"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
