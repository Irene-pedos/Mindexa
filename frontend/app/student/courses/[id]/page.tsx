// app/(student)/courses/[id]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  BookOpen,
  Users,
  Award,
  FileText,
  Loader2,
  Eye,
  Download,
  ArrowRight,
  BrainCircuit,
  ChevronLeft,
  Clock,
  LayoutDashboard,
  CheckCircle2
} from "lucide-react";
import Link from "next/link";
import { studentApi, StudentCourseDetail } from "@/lib/api/student";
import { LecturerMaterialResponse } from "@/lib/api/lecturer";
import { Skeleton } from "@/components/ui/interfaces-skeleton";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function StudentWorkspaceDetailPage() {
  const params = useParams();
  const workspaceId = params.id as string;
  const [workspace, setWorkspace] = useState<StudentCourseDetail | null>(null);
  const [materials, setMaterials] = useState<LecturerMaterialResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const [viewingMaterial, setViewingMaterial] =
    useState<LecturerMaterialResponse | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  useEffect(() => {
    async function loadWorkspace() {
      try {
        setLoading(true);
        const [wsData, materialsData] = await Promise.all([
          studentApi.getWorkspaceDetail(workspaceId),
          studentApi.getWorkspaceMaterials(workspaceId),
        ]);
        setWorkspace(wsData);
        setMaterials(materialsData);
      } catch (err) {
        console.error("Failed to load workspace details", err);
        toast.error("Failed to load workspace details");
      } finally {
        setLoading(false);
      }
    }
    loadWorkspace();
  }, [workspaceId]);

  // Cleanup preview URL
  useEffect(() => {
    return () => {
      if (previewUrl) window.URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleDownload = async (m: LecturerMaterialResponse) => {
    try {
      setDownloadingId(m.id);
      await studentApi.downloadMaterial(
        m.id,
        m.display_name || m.original_filename,
      );
      toast.success("Download started");
    } catch (err) {
      console.error("Download failed", err);
      toast.error("Failed to download material");
    } finally {
      setDownloadingId(null);
    }
  };

  const handleView = async (m: LecturerMaterialResponse) => {
    setViewingMaterial(m);
    setLoadingPreview(true);
    if (previewUrl) window.URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);

    try {
      const blob = await studentApi.getResourceBlob(m.id, false);
      const url = window.URL.createObjectURL(blob);
      setPreviewUrl(url);
    } catch (err) {
      toast.error("Failed to load preview");
    } finally {
      setLoadingPreview(false);
    }
  };

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
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
          <div className="lg:col-span-9 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Skeleton className="h-16 w-full rounded-lg" />
              <Skeleton className="h-16 w-full rounded-lg" />
            </div>
            <Skeleton className="h-24 w-full rounded-lg" />
            <Skeleton className="h-64 w-full rounded-lg" />
          </div>
          <div className="lg:col-span-3 space-y-3">
            <Skeleton className="h-40 w-full rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="py-20 text-center max-w-xl mx-auto px-4">
        <h2 className="text-lg font-bold text-foreground/80 uppercase tracking-tight">Registry Node Null</h2>
        <p className="text-[11px] text-muted-foreground mt-2 mb-6 uppercase tracking-wider">Node not identified in active index.</p>
        <Button asChild variant="outline" className="h-8 px-6 rounded-md font-bold text-[10px] uppercase border-border/60">
          <Link href="/student/courses">Back to Registry</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-4 p-4 pb-12">
      {/* Precision Navigation Header */}
      <div className="flex items-center justify-between gap-4 border-b border-border/40 pb-4">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="icon" asChild className="h-7 w-7 rounded-md border border-border/60 hover:bg-muted/50 shrink-0">
            <Link href="/student/courses"><ChevronLeft className="size-3.5 text-muted-foreground" /></Link>
          </Button>
          <div className="min-w-0">
            <h1 className="text-base font-bold tracking-tight text-foreground/90 truncate uppercase">{workspace.title}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <Badge variant="outline" className="text-[8px] font-bold h-3.5 px-1.5 rounded-sm bg-primary/5 border-primary/20 text-primary/70 uppercase">{workspace.code}</Badge>
              <span className="text-[9px] text-muted-foreground/60 font-bold uppercase tracking-wider">{workspace.academic_year || "GLOBAL"}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[8px] font-bold h-4.5 px-2 rounded-full border-emerald-200/50 text-emerald-700 bg-emerald-50/30 uppercase tracking-tighter">Operational</Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Core Assets */}
        <div className="lg:col-span-9 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="p-3.5 rounded-lg border border-border/60 bg-card/30">
                <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5 mb-2">
                  <CheckCircle2 className="size-2.5 text-emerald-500/70" /> progression saturation
                </p>
                <div className="flex justify-between items-end mb-1.5">
                  <span className="text-[10px] font-bold text-foreground/60 uppercase">Syllabus Index</span>
                  <span className="text-base font-bold text-primary tabular-nums">{workspace.progress}%</span>
                </div>
                <Progress value={workspace.progress} className="h-1 bg-muted/40" />
            </div>

            <div className="p-3.5 rounded-lg border border-border/60 bg-card/30 grid grid-cols-2 divide-x divide-border/20">
                <div className="space-y-0.5">
                  <span className="text-[8px] font-bold text-muted-foreground/60 block uppercase tracking-widest">Cohort Size</span>
                  <span className="text-lg font-bold tabular-nums text-foreground/80 tracking-tighter">{workspace.enrolled}</span>
                </div>
                <div className="space-y-0.5 pl-3">
                  <span className="text-[8px] font-bold text-muted-foreground/60 block uppercase tracking-widest">Evaluations</span>
                  <span className="text-lg font-bold tabular-nums text-foreground/80 tracking-tighter">{workspace.assessments}</span>
                </div>
            </div>
          </div>

          <Card className="shadow-none border border-border/60 rounded-lg overflow-hidden bg-white/50">
            <CardHeader className="bg-muted/5 border-b border-border/40 py-2 px-4">
              <CardTitle className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Pedagogical context</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <p className="text-[12px] text-muted-foreground/80 leading-relaxed font-medium">
                {workspace.description || "No operational description identified."}
              </p>
            </CardContent>
          </Card>

          {/* Library Vault */}
          <Card className="shadow-none border border-border/60 rounded-lg overflow-hidden bg-white">
            <CardHeader className="bg-muted/5 border-b border-border/40 py-2 px-4 flex flex-row items-center justify-between">
              <CardTitle className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <BookOpen className="size-3" /> Library Vault ({materials.length})
              </CardTitle>
              <div className="flex items-center gap-1">
                <div className="size-1 rounded-full bg-primary animate-pulse" />
                <span className="text-[8px] font-bold text-primary/60 uppercase">secured</span>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {materials.length > 0 ? (
                <div className="divide-y divide-border/10">
                  {materials.map((m) => (
                    <div key={m.id} className="flex items-center justify-between p-3 px-4 hover:bg-muted/[0.02] transition-colors group">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="bg-primary/5 border border-primary/10 p-1.5 rounded text-primary">
                          <FileText className="size-3.5" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-[12px] font-bold text-foreground/80 truncate uppercase tracking-tight">{m.display_name || m.original_filename}</div>
                          <div className="flex items-center gap-2 mt-0.5 text-[8px] text-muted-foreground/40 font-bold uppercase">
                            <span>{m.file_extension?.replace(".", "").toUpperCase()}</span>
                            <span className="size-0.5 rounded-full bg-border" />
                            <span>{(m.file_size_bytes / 1024).toFixed(0)} KB</span>
                            <span className="size-0.5 rounded-full bg-border" />
                            <span className="text-primary/40">REL v{m.version}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 ml-4">
                        <Button variant="ghost" size="icon" onClick={() => handleView(m)} className="h-7 w-7 rounded hover:bg-primary/5 text-muted-foreground/40 hover:text-primary transition-all">
                          <Eye className="size-3.5" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleDownload(m)} disabled={downloadingId === m.id} className="h-7 px-3 rounded text-[9px] font-bold uppercase border-border/60 hover:bg-muted/50">
                          {downloadingId === m.id ? <Loader2 className="size-3 animate-spin" /> : "Fetch"}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center bg-muted/[0.01]">
                  <p className="text-[9px] font-bold text-muted-foreground/30 uppercase tracking-widest">Library Vault Empty</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-3 space-y-4">
          <div className="p-3.5 rounded-lg border border-primary/20 bg-primary/5 space-y-2">
              <p className="text-[9px] font-bold text-primary uppercase tracking-[0.2em] mb-2 text-center">Node Operations</p>
              <Button asChild className="w-full h-8 text-[10px] font-bold uppercase rounded shadow-none bg-primary hover:bg-primary/90">
                <Link href="/student/assessments" className="flex items-center justify-between px-2">
                    Assessments <ArrowRight className="size-3 opacity-60" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full h-8 text-[10px] font-bold uppercase rounded border-primary/10 hover:bg-primary/[0.02]">
                <Link href="/student/study" className="flex items-center gap-2 justify-center text-primary/80">
                    <BrainCircuit className="size-3" /> Study Agent
                </Link>
              </Button>
          </div>

          <Card className="shadow-none border border-border/60 rounded-lg overflow-hidden bg-white/50">
            <CardHeader className="bg-muted/5 border-b border-border/40 py-2 px-4 text-center">
              <CardTitle className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest">Lead Instructor</CardTitle>
            </CardHeader>
            <CardContent className="p-4 text-center space-y-3">
              <div className="size-11 rounded-full bg-muted/50 mx-auto flex items-center justify-center border border-border/40">
                <Users className="size-4.5 text-muted-foreground/40" />
              </div>
              <div className="space-y-0">
                <p className="text-[11px] font-bold text-foreground/90 uppercase truncate">{workspace.lecturer}</p>
                <p className="text-[7px] text-muted-foreground/60 font-bold uppercase tracking-widest">Academic authority</p>
              </div>
              <Button variant="outline" size="sm" className="w-full h-7 text-[8px] font-bold uppercase rounded-md border-border/60 hover:bg-muted/50">Contact</Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Material Preview Protocol */}
      <Dialog open={!!viewingMaterial} onOpenChange={(open) => { if (!open) { setViewingMaterial(null); if (previewUrl) window.URL.revokeObjectURL(previewUrl); setPreviewUrl(null); } }}>
        <DialogContent className="max-w-4xl h-[80vh] flex flex-col p-0 overflow-hidden rounded-xl border border-border/40 shadow-2xl">
          <DialogHeader className="p-3 border-b bg-background sticky top-0 z-10 px-5">
            <div className="flex items-center justify-between pr-8">
              <div className="min-w-0">
                <DialogTitle className="text-xs font-bold uppercase tracking-tight truncate text-foreground/90">{viewingMaterial?.display_name || viewingMaterial?.original_filename}</DialogTitle>
                <p className="text-[8px] font-bold text-muted-foreground/50 uppercase tracking-widest mt-0.5 flex items-center gap-1.5"><Clock className="size-2" /> secure stream</p>
              </div>
              <Button variant="outline" size="sm" className="h-7 text-[9px] font-bold uppercase rounded-md border-border/60 hover:bg-muted/50" onClick={() => viewingMaterial && handleDownload(viewingMaterial)}>
                <Download className="size-3 mr-1.5 opacity-60" /> Export
              </Button>
            </div>
          </DialogHeader>
          <div className="flex-1 bg-muted/[0.02] relative">
            {loadingPreview ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                <Loader2 className="size-6 animate-spin text-primary/30" />
                <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/30">Syncing...</p>
              </div>
            ) : previewUrl ? (
              viewingMaterial?.file_extension?.toLowerCase().includes("pdf") || viewingMaterial?.mime_type === "application/pdf" ? (
                <iframe src={`${previewUrl}#toolbar=0`} className="w-full h-full border-none" title="Material Preview" />
              ) : viewingMaterial?.mime_type?.startsWith("image/") ? (
                <div className="w-full h-full flex items-center justify-center p-6 overflow-auto">
                  <img src={previewUrl} alt="Asset Preview" className="max-w-full max-h-full object-contain rounded-md shadow-lg border border-border/10 bg-white" />
                </div>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center p-8 max-w-xs">
                    <FileText className="size-8 mx-auto text-muted-foreground/20 mb-4" />
                    <p className="text-[10px] text-muted-foreground font-bold leading-relaxed uppercase tracking-widest">Preview Restricted. Execute export to view locally.</p>
                  </div>
                </div>
              )
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <p className="text-[9px] font-bold text-destructive/40 uppercase tracking-widest">Acquisition failed.</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
