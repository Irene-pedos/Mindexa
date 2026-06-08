"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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
  Activity
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
  const [selectedStudent, setSelectedStudent] = useState<{ id: string; name: string; } | null>(null);
  const [record, setRecord] = useState<StudentCourseRecordResponse | null>(null);
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

  useEffect(() => { loadWorkspace(); }, [loadWorkspace]);

  const handleArchiveWorkspace = async () => {
    setArchiving(true);
    try {
      await lecturerApi.archiveWorkspace(id);
      toast.success("Workspace archived");
      router.push("/lecturer/courses");
    } catch (err: any) {
      toast.error(err.message || "Failed to archive");
      setArchiveDialogOpen(false);
    } finally {
      setArchiving(false);
    }
  };

  const handleUploadMaterial = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", e.target.files[0]);
      formData.append("teaching_workspace_id", id);
      formData.append("material_category", "LECTURE_NOTES");
      formData.append("is_student_visible", "true");
      await lecturerApi.uploadMaterial(formData);
      toast.success("Uploaded");
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
      toast.error("Failed to load record");
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
      <div className="max-w-7xl mx-auto space-y-3 p-4 animate-pulse">
        <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded-md" />
            <div className="space-y-1">
                <Skeleton className="h-5 w-64 rounded-sm" />
                <Skeleton className="h-3 w-40 rounded-sm opacity-50" />
            </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-9 space-y-4">
                <div className="grid grid-cols-3 gap-3">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 rounded-lg" />)}
                </div>
                <div className="h-20 bg-muted/20 rounded-lg border" />
                <div className="h-[400px] bg-muted/20 rounded-lg border" />
            </div>
            <div className="lg:col-span-3 h-[500px] bg-muted/20 rounded-lg border" />
        </div>
      </div>
    );
  }

  if (!workspace) return <div className="py-20 text-center uppercase font-bold text-muted-foreground">Node NULL</div>;

  return (
    <div className="max-w-7xl mx-auto space-y-4 p-4 pb-12">
      {/* Dense Navigation Header */}
      <div className="flex items-center justify-between border-b border-border/40 pb-4">
        <div className="flex items-center gap-3 min-w-0">
            <Button variant="ghost" size="icon" asChild className="h-7 w-7 rounded-md border border-border/60 hover:bg-muted/50 shrink-0">
                <Link href="/lecturer/courses"><ChevronLeft className="size-3.5 text-muted-foreground" /></Link>
            </Button>
            <div className="min-w-0">
                <h1 className="text-base font-bold tracking-tight text-foreground/90 truncate uppercase">{workspace.title}</h1>
                <div className="flex items-center gap-2 mt-0.5">
                    <Badge variant="outline" className="font-bold text-[8px] text-primary/70 border-primary/20 bg-primary/5 uppercase h-3.5 px-1.5 rounded-sm">{workspace.code}</Badge>
                    <span className="text-[9px] text-muted-foreground/60 font-bold uppercase">{workspace.academic_year}</span>
                </div>
            </div>
        </div>
        <div className="flex gap-1.5">
            <Button variant="ghost" size="sm" onClick={() => setArchiveDialogOpen(true)} className="text-destructive h-7 px-3 font-bold text-[9px] uppercase rounded-md border border-destructive/10">Archive Node</Button>
            <Button asChild size="sm" className="h-7 px-3 bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-[9px] uppercase rounded-md shadow-none">
                <Link href="/lecturer/assessments/new"><Plus className="mr-1 size-3" /> New Assessment</Link>
            </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Main Operational Area */}
        <div className="lg:col-span-9 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <div className="p-3 px-4 rounded-lg border border-border/50 bg-card/30 flex items-center justify-between">
                  <div className="space-y-0">
                      <p className="text-[8px] font-bold text-muted-foreground/60 uppercase">Cohort Index</p>
                      <p className="text-base font-bold text-primary tabular-nums">{workspace.performance_avg.toFixed(1)}%</p>
                  </div>
                  <TrendingUp className="size-3.5 text-primary/20" />
              </div>
              <div className="p-3 px-4 rounded-lg border border-border/50 bg-card/30 flex items-center justify-between">
                  <div className="space-y-0">
                      <p className="text-[8px] font-bold text-muted-foreground/60 uppercase">Active Nodes</p>
                      <p className="text-base font-bold text-foreground/80 tabular-nums">{workspace.student_count}</p>
                  </div>
                  <Users className="size-3.5 text-muted-foreground/20" />
              </div>
              <div className="p-3 px-4 rounded-lg border border-border/50 bg-card/30 flex items-center justify-between">
                  <div className="space-y-0 min-w-0">
                      <p className="text-[8px] font-bold text-muted-foreground/60 uppercase">Target</p>
                      <p className="text-[10px] font-bold text-foreground/70 uppercase truncate">{workspace.class_name}</p>
                  </div>
                  <Building2 className="size-3.5 text-muted-foreground/20" />
              </div>
          </div>

          {/* Saturation Ledger */}
          <div className="p-5 rounded-lg border border-border/60 bg-white/50">
              <div className="mb-3 flex justify-between items-end">
                <div className="space-y-0">
                    <p className="text-[10px] font-bold text-foreground/70 uppercase">Syllabus Execution</p>
                    <p className="text-[8px] text-muted-foreground/40 font-bold uppercase">Integrated node data</p>
                </div>
                <span className="text-xl font-bold text-primary tabular-nums">{workspace.performance_avg.toFixed(1)}%</span>
              </div>
              <Progress value={workspace.performance_avg} className="h-1 bg-muted/40" />
          </div>

          {/* Node Audit Table */}
          <Card className="shadow-none border border-border/60 rounded-lg overflow-hidden bg-white flex flex-col">
            <CardHeader className="bg-muted/5 border-b border-border/40 py-2.5 px-4 flex flex-row items-center justify-between">
              <CardTitle className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Layers className="size-3" /> Registry Matrix
              </CardTitle>
              <div className="relative w-48">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground/40" />
                <Input placeholder="Search registry..." className="h-7 pl-6 text-[10px] font-medium rounded-md border-border/60 bg-white focus:ring-0 uppercase placeholder:text-muted-foreground/30" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
              </div>
            </CardHeader>
            <div className="flex-1 overflow-auto">
              <Table>
                <TableHeader className="bg-muted/[0.02]">
                  <TableRow className="h-8 hover:bg-transparent border-b border-border/40">
                    <TableHead className="text-[8px] font-bold uppercase pl-4 text-muted-foreground/50">Vector ID</TableHead>
                    <TableHead className="text-[8px] font-bold uppercase text-muted-foreground/50">Registry metadata</TableHead>
                    <TableHead className="text-[8px] font-bold uppercase text-muted-foreground/50">Progression</TableHead>
                    <TableHead className="text-right text-[8px] font-bold uppercase pr-4 text-muted-foreground/50">Instruction</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRoster.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center py-12 text-[9px] font-bold uppercase opacity-20 tracking-widest text-muted-foreground">Zero nodes detected.</TableCell></TableRow>
                  ) : (
                    filteredRoster.map((student) => (
                      <TableRow key={student.id} className="h-10 hover:bg-primary/[0.01] transition-colors border-border/10">
                        <TableCell className="font-mono text-[9px] font-bold pl-4 text-primary/40">{student.student_id}</TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-bold text-[11px] uppercase tracking-tight text-foreground/70">{student.name}</span>
                            <span className="text-[9px] text-muted-foreground/40 font-bold truncate max-w-[150px]">{student.email}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="w-12 h-0.5 bg-muted rounded-full overflow-hidden shrink-0">
                              <div className="h-full bg-primary/40 transition-all duration-700" style={{ width: `${student.progress}%` }} />
                            </div>
                            <span className="text-[9px] font-bold tabular-nums text-foreground/40">{student.progress}%</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right pr-4">
                          <Button variant="ghost" size="sm" className="h-6 px-2 text-[8px] font-bold uppercase rounded-md border border-border/40 hover:bg-primary/5 hover:text-primary transition-all group" onClick={() => openRecord(student.id, student.name)}>Trace Audit</Button>
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
        <div className="lg:col-span-3 space-y-4">
          <div className="p-3.5 rounded-lg border border-primary/20 bg-primary/5 space-y-1.5">
              <p className="text-[9px] font-bold text-primary uppercase tracking-[0.2em] mb-2 text-center">Node Operations</p>
              <Button asChild className="w-full h-8 px-3 text-[9px] font-bold uppercase rounded bg-primary hover:bg-primary/90 text-primary-foreground shadow-none" size="sm">
                <Link href="/lecturer/assessments/new" className="flex items-center justify-between">New Assessment <ArrowRight className="size-2.5 opacity-40" /></Link>
              </Button>
              <Button asChild variant="outline" className="w-full h-8 px-3 text-[9px] font-bold uppercase rounded border-primary/10 hover:bg-primary/[0.02] shadow-none" size="sm">
                <Link href="/lecturer/question-bank" className="flex items-center gap-2 text-primary/70"><Database className="size-3" /> Registry Bank</Link>
              </Button>
          </div>

          <Card className="shadow-none border border-border/60 rounded-lg overflow-hidden bg-white">
            <CardHeader className="flex flex-row items-center justify-between py-2 bg-muted/5 border-b border-border/40 px-4">
              <CardTitle className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Library Vault</CardTitle>
              <Button variant="ghost" size="icon" className="h-6 w-6 rounded-md border border-border/60 hover:bg-primary/5 transition-all shrink-0" disabled={uploading} onClick={() => document.getElementById("material-upload")?.click()}>
                {uploading ? <Loader2 className="size-2.5 animate-spin" /> : <Upload className="size-3" />}
              </Button>
              <input id="material-upload" type="file" className="hidden" onChange={handleUploadMaterial} />
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className={cn(materials.length > 0 ? "h-64" : "h-fit")}>
                {materials.length === 0 ? (
                    <div className="text-center py-12 px-4 uppercase font-bold text-[8px] text-muted-foreground/20 italic tracking-widest leading-relaxed">Registry Empty.</div>
                ) : (
                    <div className="divide-y divide-border/10">
                    {materials.map((m) => (
                        <div key={m.id} className="flex items-center justify-between p-3 px-4 hover:bg-muted/[0.02] transition-all group">
                            <div className="flex items-center gap-2 truncate">
                                <div className="bg-primary/5 border border-primary/5 p-1 rounded text-primary/40"><FileText className="size-3" /></div>
                                <div className="truncate">
                                    <p className="text-[10px] font-bold truncate uppercase tracking-tight text-foreground/70">{m.display_name || m.original_filename}</p>
                                    <p className="text-[8px] font-bold text-muted-foreground/30 uppercase mt-0.5">{m.file_extension.toUpperCase()} • {(m.file_size_bytes / 1024).toFixed(0)} KB</p>
                                </div>
                            </div>
                            <Download className="size-2.5 text-primary/20 group-hover:text-primary/60 transition-colors cursor-pointer" />
                        </div>
                    ))}
                    </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Node Trace Audit Modal */}
      <Dialog open={recordDialogOpen} onOpenChange={setRecordDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] p-0 overflow-hidden rounded-xl border border-border/40 shadow-2xl">
          <div className="bg-primary p-4 text-primary-foreground border-b border-primary/10">
            <DialogTitle className="text-sm font-bold tracking-tight uppercase">Trace Audit: {selectedStudent?.name}</DialogTitle>
          </div>
          <div className="p-5">
            {loadingRecord ? <div className="space-y-3 animate-pulse"><div className="h-14 bg-muted/20 rounded-lg border border-border/40" /></div> : record ? (
              <div className="space-y-4">
                <div className="grid grid-cols-4 gap-2 p-3 rounded-lg border border-border/40 bg-muted/[0.01]">
                  <div className="space-y-0"><p className="text-[7px] font-bold uppercase text-muted-foreground/50">Vector ID</p><p className="text-[10px] font-mono font-bold text-primary/60 uppercase">{record.student_id}</p></div>
                  <div className="space-y-0"><p className="text-[7px] font-bold uppercase text-muted-foreground/50">Node</p><p className="text-[10px] font-bold truncate text-foreground/60">{record.email}</p></div>
                  <div className="space-y-0"><p className="text-[7px] font-bold uppercase text-muted-foreground/50">Entry</p><p className="text-[10px] font-bold text-foreground/60">{format(new Date(record.enrolled_at), "MMM d, yyyy")}</p></div>
                  <div className="space-y-0 text-right"><p className="text-[7px] font-bold uppercase text-muted-foreground/50">Index</p><p className="text-base font-bold text-emerald-600 tabular-nums">{record.overall_progress}%</p></div>
                </div>
                <div className="space-y-2">
                  <h3 className="text-[8px] font-bold uppercase tracking-[0.2em] text-muted-foreground/40 flex items-center gap-1.5"><Activity className="size-2.5" /> Execution History</h3>
                  <div className="rounded-lg border border-border/40 divide-y divide-border/10 overflow-hidden bg-card/10">
                    {record.attempts.length === 0 ? <div className="p-8 text-center text-[9px] font-bold text-muted-foreground/20 uppercase italic">Zero node data.</div> : record.attempts.map((att) => (
                        <div key={att.id} className="p-2.5 px-4 flex items-center justify-between hover:bg-muted/[0.01] transition-colors">
                          <div className="space-y-0.5 min-w-0 pr-4">
                            <p className="text-[10px] font-bold uppercase tracking-tight text-foreground/70 truncate">{att.assessment_title}</p>
                            <div className="flex items-center gap-2 text-[7px] text-muted-foreground/40 font-bold uppercase">
                              <span>{att.submitted_at ? format(new Date(att.submitted_at), "MMM d, HH:mm") : "PENDING"}</span>
                              <span className="size-0.5 rounded-full bg-border" />
                              <span className="text-muted-foreground/60">{att.status}</span>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            {att.percentage !== null ? <div className="space-y-0"><p className="text-[13px] font-bold tabular-nums text-primary">{att.percentage}%</p></div> : <span className="text-[8px] font-bold text-muted-foreground/10 uppercase">EVALUATING</span>}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
          <div className="p-3 bg-muted/5 border-t border-border/40 flex justify-end gap-2 px-5 pb-5">
            <Button variant="ghost" size="sm" onClick={() => setRecordDialogOpen(false)} className="h-8 px-4 font-bold text-[9px] uppercase">Close Audit</Button>
            <Button className="h-8 px-4 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-[9px] uppercase shadow-none">Export Ledger</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Preservation Modal */}
      <Dialog open={archiveDialogOpen} onOpenChange={setArchiveDialogOpen}>
        <DialogContent className="max-w-sm p-0 overflow-hidden rounded-xl border border-border/40 shadow-2xl">
          <div className="bg-destructive/90 p-4 text-white"><DialogTitle className="text-xs font-bold uppercase">Archive Node</DialogTitle></div>
          <div className="p-6">
            <p className="text-[11px] text-muted-foreground font-bold leading-relaxed uppercase tracking-tight">Preserve node registry and de-prioritize in active operational index.</p>
          </div>
          <div className="p-3 bg-muted/5 border-t border-border/40 flex justify-end gap-2 px-6 pb-6">
            <Button variant="ghost" size="sm" className="h-8 px-4 font-bold text-[9px] uppercase" onClick={() => setArchiveDialogOpen(false)} disabled={archiving}>Abort</Button>
            <Button variant="destructive" size="sm" className="h-8 px-6 font-bold text-[9px] uppercase rounded-md shadow-none" onClick={handleArchiveWorkspace} disabled={archiving}>
              {archiving ? <Loader2 className="size-3 animate-spin" /> : "Confirm Archival"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
