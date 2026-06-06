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
  ChevronLeft,
  Search,
  Building2,
  Layers,
  BookOpen,
  CheckCircle2,
  TrendingUp,
  LayoutDashboard
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

  const filteredRoster = workspace?.roster.filter(s => 
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    s.student_id.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto space-y-6 p-6 animate-pulse">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Skeleton className="size-12 rounded-xl" />
            <div className="space-y-1.5">
              <Skeleton className="h-7 w-64 rounded-md" />
              <Skeleton className="h-3.5 w-48 rounded-md opacity-60" />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-9 space-y-5">
                <div className="h-28 bg-muted/20 rounded-2xl border" />
                <div className="h-[400px] bg-muted/20 rounded-2xl border" />
            </div>
            <div className="lg:col-span-3 h-[500px] bg-muted/20 rounded-2xl border" />
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
          className="mt-6 rounded-lg h-9 px-8 font-semibold text-xs border-primary/20 text-primary"
        >
          <Link href="/lecturer/courses">Back to My Workspaces</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 p-6">
      {/* Dynamic Breadcrumb / Navigation */}
      <div className="flex items-center justify-between border-b border-muted/20 pb-5">
        <div className="flex items-center gap-4 min-w-0">
            <Button
                variant="ghost"
                size="icon"
                asChild
                className="h-9 w-9 rounded-lg border border-muted/30 hover:bg-muted/10 transition-colors shrink-0"
            >
                <Link href="/lecturer/courses">
                    <ChevronLeft className="size-4 text-muted-foreground" />
                </Link>
            </Button>
            <div className="min-w-0">
                <h1 className="text-xl font-semibold tracking-tight text-foreground/90 truncate uppercase tracking-tighter">
                    {workspace.title}
                </h1>
                <div className="flex items-center gap-2 mt-0.5">
                    <Badge variant="outline" className="font-mono text-[9px] font-bold text-primary/60 border-primary/20 bg-primary/5 uppercase h-4 px-1.5">
                        {workspace.code}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-widest">{workspace.academic_year}</span>
                </div>
            </div>
        </div>
        <div className="flex gap-2 shrink-0">
            <Button
                variant="ghost"
                onClick={() => setArchiveDialogOpen(true)}
                className="text-destructive hover:bg-destructive/5 h-9 px-4 font-semibold text-[10px] uppercase tracking-widest rounded-lg border border-destructive/10"
            >
                <Trash2 className="mr-2 size-3.5" /> Archive Node
            </Button>
            <Button
                asChild
                className="h-9 px-5 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-[10px] uppercase tracking-widest rounded-lg shadow-none"
            >
                <Link href="/lecturer/assessments/new">
                    <Plus className="mr-1.5 size-3.5" /> New Assessment
                </Link>
            </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Main Workspace Area */}
        <div className="lg:col-span-9 space-y-6">
          {/* Bento Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="shadow-none border border-muted/20 rounded-2xl overflow-hidden bg-white">
                  <CardContent className="p-5 flex items-center justify-between">
                      <div className="space-y-1">
                          <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest">Global Index</p>
                          <p className="text-2xl font-bold text-primary tracking-tighter">{workspace.performance_avg.toFixed(1)}%</p>
                      </div>
                      <div className="size-10 rounded-xl bg-primary/5 flex items-center justify-center text-primary border border-primary/10">
                          <TrendingUp className="size-5" />
                      </div>
                  </CardContent>
              </Card>
              <Card className="shadow-none border border-muted/20 rounded-2xl overflow-hidden bg-white">
                  <CardContent className="p-5 flex items-center justify-between">
                      <div className="space-y-1">
                          <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest">Active Nodes</p>
                          <p className="text-2xl font-bold text-foreground/80 tracking-tighter">{workspace.student_count}</p>
                      </div>
                      <div className="size-10 rounded-xl bg-muted/30 flex items-center justify-center text-muted-foreground border border-muted/40">
                          <Users className="size-5" />
                      </div>
                  </CardContent>
              </Card>
              <Card className="shadow-none border border-muted/20 rounded-2xl overflow-hidden bg-white">
                  <CardContent className="p-5 flex items-center justify-between">
                      <div className="space-y-1">
                          <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest">Target Context</p>
                          <p className="text-sm font-bold text-foreground/80 uppercase tracking-tight truncate max-w-[140px]">{workspace.class_name}</p>
                      </div>
                      <div className="size-10 rounded-xl bg-muted/30 flex items-center justify-center text-muted-foreground border border-muted/40">
                          <Building2 className="size-5" />
                      </div>
                  </CardContent>
              </Card>
          </div>

          {/* Performance Index Visual */}
          <Card className="shadow-none border border-muted/20 rounded-2xl overflow-hidden bg-white">
            <CardHeader className="bg-muted/5 border-b border-muted/10 py-3 px-6">
              <CardTitle className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <CheckCircle2 className="size-3.5 text-emerald-500" /> Syllabus Execution & Coverage
              </CardTitle>
            </CardHeader>
            <CardContent className="p-8">
              <div className="mb-4 flex justify-between items-end">
                <div className="space-y-0.5">
                    <p className="text-xs font-semibold text-foreground/70 uppercase">Workspace Saturation</p>
                    <p className="text-[10px] text-muted-foreground font-medium uppercase opacity-60 italic">Based on assessment data and materials</p>
                </div>
                <span className="text-2xl font-bold text-primary tracking-tighter">
                  {workspace.performance_avg.toFixed(1)}%
                </span>
              </div>
              <Progress value={workspace.performance_avg} className="h-1.5 bg-muted/40" />
            </CardContent>
          </Card>

          {/* Student Registry Table */}
          <Card className="shadow-none border border-muted/20 rounded-2xl overflow-hidden bg-white flex flex-col">
            <CardHeader className="bg-muted/5 border-b border-muted/10 py-4 px-6 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Node Audit Matrix
                </CardTitle>
              </div>
              <div className="relative w-64">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
                <Input 
                    placeholder="Search registry ID or name..." 
                    className="h-8 pl-8 text-[11px] rounded-lg border-muted/30 bg-white focus:border-primary/40 focus:ring-0"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </CardHeader>
            <div className="flex-1 overflow-auto">
              <Table>
                <TableHeader className="bg-muted/5">
                  <TableRow className="h-10 hover:bg-transparent border-b border-muted/10">
                    <TableHead className="text-[9px] font-bold uppercase tracking-widest pl-6">Identifier</TableHead>
                    <TableHead className="text-[9px] font-bold uppercase tracking-widest">Account Registry</TableHead>
                    <TableHead className="text-[9px] font-bold uppercase tracking-widest">Progression</TableHead>
                    <TableHead className="text-right text-[9px] font-bold uppercase tracking-widest pr-6">Command</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRoster.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-24">
                        <div className="flex flex-col items-center justify-center opacity-30">
                            <Search className="size-8 mb-2" />
                            <p className="text-[10px] font-semibold uppercase tracking-widest">No nodes identified.</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRoster.map((student) => (
                      <TableRow
                        key={student.id}
                        className="h-12 hover:bg-primary/[0.01] transition-colors border-muted/5"
                      >
                        <TableCell className="font-mono text-[10px] font-semibold pl-6 text-primary/60">
                          {student.student_id}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-semibold text-xs uppercase tracking-tight text-foreground/80">
                              {student.name}
                            </span>
                            <span className="text-[10px] text-muted-foreground font-medium mt-0.5">
                              {student.email}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="w-20 h-1 bg-muted rounded-full overflow-hidden shrink-0">
                              <div
                                className="h-full bg-primary/40"
                                style={{ width: `${student.progress}%` }}
                              />
                            </div>
                            <span className="text-[10px] font-bold tabular-nums text-foreground/60">
                              {student.progress}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right pr-6">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-4 text-[9px] font-bold uppercase tracking-widest rounded-lg border border-muted/20 hover:bg-primary/5 hover:text-primary transition-all"
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
            </div>
          </Card>
        </div>

        {/* Sidebar Context */}
        <div className="lg:col-span-3 space-y-6">
          {/* Quick Actions */}
          <Card className="shadow-none border border-muted/20 rounded-2xl overflow-hidden bg-white">
            <CardHeader className="bg-primary p-4 text-primary-foreground border-b border-primary/10">
              <CardTitle className="text-[10px] font-semibold uppercase tracking-widest">
                Workspace Commands
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 space-y-2">
              <Button
                asChild
                className="w-full justify-between h-9 px-4 text-[10px] font-semibold uppercase tracking-widest rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground shadow-none transition-all"
                size="sm"
              >
                <Link href="/lecturer/assessments/new">
                  <div className="flex items-center gap-2.5">
                    <Plus className="size-3.5" />
                    New Evaluation
                  </div>
                  <ArrowRight className="size-3 opacity-40" />
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="w-full justify-between h-9 px-4 text-[10px] font-semibold uppercase tracking-widest rounded-lg border-muted/30 hover:bg-muted/5 shadow-none transition-all"
                size="sm"
              >
                <Link href="/lecturer/question-bank">
                  <div className="flex items-center gap-2.5 text-foreground/70">
                    <Database className="size-3.5" />
                    Registry Bank
                  </div>
                </Link>
              </Button>
            </CardContent>
          </Card>

          {/* Library Vault */}
          <Card className="shadow-none border border-muted/20 rounded-2xl overflow-hidden bg-white">
            <CardHeader className="flex flex-row items-center justify-between py-3 bg-muted/5 border-b border-muted/10 px-5">
              <CardTitle className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Library Vault
              </CardTitle>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-lg border border-muted/30 hover:bg-primary/5 hover:text-primary transition-all"
                disabled={uploading}
                onClick={() => document.getElementById("material-upload")?.click()}
              >
                {uploading ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Upload className="size-3.5" />
                )}
              </Button>
              <input id="material-upload" type="file" className="hidden" onChange={handleUploadMaterial} />
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className={cn(materials.length > 0 ? "h-64" : "h-fit")}>
                {materials.length === 0 ? (
                    <div className="text-center py-16 px-6">
                        <FileText className="size-8 mx-auto text-muted-foreground/10 mb-2" />
                        <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/30 leading-relaxed">
                            Pedagogical registry empty. Upload SYLLABUS or NOTES.
                        </p>
                    </div>
                ) : (
                    <div className="divide-y divide-muted/10">
                    {materials.map((m) => (
                        <div key={m.id} className="flex items-center justify-between p-4 hover:bg-muted/5 transition-all group">
                            <div className="flex items-center gap-3 truncate">
                                <div className="bg-primary/5 border border-primary/10 p-2 rounded-lg text-primary transition-all">
                                    <FileText className="size-4" />
                                </div>
                                <div className="truncate">
                                    <p className="text-[11px] font-semibold truncate uppercase tracking-tight text-foreground/80">
                                        {m.display_name || m.original_filename}
                                    </p>
                                    <p className="text-[9px] font-bold text-muted-foreground/40 uppercase tracking-tighter mt-1">
                                        {m.file_extension.toUpperCase()} • {(m.file_size_bytes / 1024).toFixed(0)} KB
                                    </p>
                                </div>
                            </div>
                            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-primary/5">
                                <ExternalLink className="size-3 text-primary/40" />
                            </Button>
                        </div>
                    ))}
                    </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Audit Modal */}
      <Dialog open={recordDialogOpen} onOpenChange={setRecordDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] p-0 overflow-hidden rounded-3xl border border-muted/20 shadow-none">
          <div className="bg-primary p-6 text-primary-foreground">
            <DialogTitle className="text-lg font-semibold tracking-tight uppercase tracking-tighter">
                Trace Audit: {selectedStudent?.name}
            </DialogTitle>
            <DialogDescription className="text-primary-foreground/60 text-[9px] font-bold uppercase tracking-[0.2em] mt-1">
                Institutional Performance Ledger
            </DialogDescription>
          </div>

          <div className="p-8">
            {loadingRecord ? (
                <div className="space-y-6 animate-pulse">
                    <div className="h-20 bg-muted/20 rounded-2xl border" />
                    <div className="space-y-2">
                        {[1, 2, 3].map(i => <div key={i} className="h-14 bg-muted/10 rounded-xl" />)}
                    </div>
                </div>
            ) : record ? (
              <div className="space-y-8">
                {/* Header Bento */}
                <div className="grid grid-cols-4 gap-4 p-5 rounded-2xl border border-muted/10 bg-muted/5">
                  <div className="space-y-1">
                    <p className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground">Registry ID</p>
                    <p className="text-[11px] font-mono font-bold text-primary uppercase">{record.student_id}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground">Email Node</p>
                    <p className="text-[11px] font-semibold truncate text-foreground/70">{record.email}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground">Entry Vector</p>
                    <p className="text-[11px] font-semibold text-foreground/70">{format(new Date(record.enrolled_at), "MMM d, yyyy")}</p>
                  </div>
                  <div className="space-y-1 text-right">
                    <p className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground">Global Saturation</p>
                    <p className="text-lg font-bold text-emerald-600">{record.overall_progress}%</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] flex items-center gap-2.5 text-muted-foreground/60">
                    <LayoutDashboard className="size-3.5" /> Assessment Trace History
                  </h3>
                  <div className="rounded-2xl border border-muted/10 divide-y divide-muted/5 overflow-hidden bg-white">
                    {record.attempts.length === 0 ? (
                      <div className="p-16 text-center text-[10px] font-bold text-muted-foreground/30 uppercase italic">
                        No evaluation nodes identified.
                      </div>
                    ) : (
                      record.attempts.map((att) => (
                        <div key={att.id} className="p-4 flex items-center justify-between hover:bg-muted/[0.02] transition-colors">
                          <div className="space-y-1">
                            <p className="text-xs font-semibold uppercase tracking-tight text-foreground/80 leading-none">
                              {att.assessment_title}
                            </p>
                            <div className="flex items-center gap-3 text-[8px] text-muted-foreground/50 font-bold uppercase mt-1.5">
                              <span className="flex items-center gap-1">
                                <Calendar className="size-2.5" />
                                {att.submitted_at ? format(new Date(att.submitted_at), "MMM d, HH:mm") : "PENDING"}
                              </span>
                              <Badge variant="outline" className="h-4 px-1.5 text-[7px] border-none bg-muted/40 font-bold">{att.status}</Badge>
                            </div>
                          </div>
                          <div className="text-right">
                            {att.percentage !== null ? (
                                <div className="space-y-0.5">
                                    <p className="text-base font-bold tabular-nums tracking-tighter text-primary">{att.percentage}%</p>
                                    <p className="text-[8px] font-bold text-muted-foreground/30 uppercase tracking-widest">{att.score}/{att.max_score} PTS</p>
                                </div>
                            ) : (
                                <span className="text-[9px] font-bold text-muted-foreground/20 uppercase">IN_VALUATION</span>
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

          <div className="p-6 bg-muted/5 border-t border-muted/10 flex justify-end gap-3 px-8">
            <Button variant="ghost" size="sm" onClick={() => setRecordDialogOpen(false)} className="h-9 px-6 font-semibold text-[10px] uppercase tracking-widest">
              Close Audit
            </Button>
            <Button className="h-9 px-6 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-[10px] uppercase tracking-widest shadow-none gap-2">
              <ExternalLink className="size-3.5" /> Export Vector
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Archival Modal */}
      <Dialog open={archiveDialogOpen} onOpenChange={setArchiveDialogOpen}>
        <DialogContent className="max-w-md p-0 overflow-hidden rounded-3xl border border-muted/20 shadow-none">
          <div className="bg-red-600 p-6 text-white">
            <DialogTitle className="text-lg font-semibold tracking-tight uppercase">Archive Workspace</DialogTitle>
            <DialogDescription className="text-white/60 text-[9px] font-bold uppercase tracking-[0.2em] mt-1">Structural Preservation Protocol</DialogDescription>
          </div>
          <div className="p-8">
            <p className="text-sm text-muted-foreground leading-relaxed font-medium">
              Initiating archival for <span className="font-bold text-foreground">{workspace.title}</span> will de-prioritize this node in your active index. All registry data remains preserved for institutional audit.
            </p>
          </div>
          <div className="p-6 bg-muted/5 border-t border-muted/10 flex justify-end gap-3 px-8">
            <Button variant="ghost" size="sm" className="h-9 px-6 font-semibold text-[10px] uppercase tracking-widest" onClick={() => setArchiveDialogOpen(false)} disabled={archiving}>
              Abort
            </Button>
            <Button variant="destructive" size="sm" className="h-9 px-8 font-semibold text-[10px] uppercase tracking-widest shadow-none rounded-lg" onClick={handleArchiveWorkspace} disabled={archiving}>
              {archiving ? <Loader2 className="size-3.5 animate-spin" /> : "Confirm Archival"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
