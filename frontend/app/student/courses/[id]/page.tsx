// app/(student)/courses/[id]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  Sparkles,
  ChevronLeft,
  Clock,
  LayoutDashboard,
  CheckCircle2
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { studentApi, StudentCourseDetail } from "@/lib/api/student";
import { LecturerMaterialResponse } from "@/lib/api/lecturer";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
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
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-64" />
            <Skeleton className="h-4 w-40 opacity-60" />
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-9 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-24 w-full rounded-xl" />
            </div>
            <Skeleton className="h-32 w-full rounded-xl" />
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
          <div className="lg:col-span-3 space-y-6">
            <Skeleton className="h-32 w-full rounded-xl" />
            <Skeleton className="h-48 w-full rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="py-20 text-center">
        <h2 className="text-lg font-semibold text-foreground/80">Course Not Found</h2>
        <p className="text-sm text-muted-foreground mt-2 mb-6">The requested course could not be identified.</p>
        <Button asChild variant="outline">
          <Link href="/student/courses">Back to Courses</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full mx-auto animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/25 pb-4">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="outline" size="icon" asChild className="h-9 w-9 rounded-lg shrink-0 border-border/60">
            <Link href="/student/courses">
              <ChevronLeft className="size-5 text-muted-foreground" />
            </Link>
          </Button>
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground truncate">{workspace.title}</h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className="text-[10px] font-semibold px-1.5 h-5">{workspace.code}</Badge>
              <span className="text-xs text-muted-foreground font-medium">{workspace.academic_year || "Global"}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="px-2.5 py-1 text-xs text-success bg-success/10 border-success/20 inline-flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-success animate-pulse" /> Active
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Main Area */}
        <div className="lg:col-span-9 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="bg-card/30 border border-border/45 rounded-xl shadow-sm overflow-hidden">
              <CardContent className="p-4 space-y-3">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-semibold text-muted-foreground">Course Progress</span>
                  <span className="text-xl font-bold tracking-tight text-primary">{workspace.progress}%</span>
                </div>
                <Progress value={workspace.progress} className="h-1.5 bg-muted" />
              </CardContent>
            </Card>

            <Card className="bg-card/30 border border-border/45 rounded-xl shadow-sm overflow-hidden">
              <CardContent className="p-4 grid grid-cols-2 divide-x divide-border/40">
                <div className="space-y-0.5">
                  <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground block">Cohort Size</span>
                  <span className="text-lg font-semibold tracking-tight text-foreground/80">{workspace.enrolled} Students</span>
                </div>
                <div className="space-y-0.5 pl-4">
                  <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground block">Assessments</span>
                  <span className="text-lg font-semibold tracking-tight text-foreground/80">{workspace.assessments} Total</span>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-card/30 border border-border/45 rounded-xl shadow-sm overflow-hidden">
            <CardHeader className="pb-2.5 pt-4.5 px-5">
              <CardTitle className="text-lg font-semibold">Course Description</CardTitle>
            </CardHeader>
            <CardContent className="pb-4 px-5">
              <p className="text-xs font-medium text-muted-foreground/90 leading-relaxed">
                {workspace.description || "No description provided for this course."}
              </p>
            </CardContent>
          </Card>

          {/* Library / Course Materials */}
          <Card className="bg-card/30 border border-border/45 rounded-xl shadow-sm overflow-hidden">
            <CardHeader className="pb-2.5 pt-4.5 px-5">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <BookOpen className="size-5 text-primary" /> Course Materials ({materials.length})
              </CardTitle>
              <CardDescription className="text-xs">Lecture notes, slides, and study resources uploaded by your instructor.</CardDescription>
            </CardHeader>
            <CardContent className="p-0 border-t border-border/40">
              {materials.length > 0 ? (
                <AttachmentGroup className="flex-col gap-2 p-4">
                  {materials.map((m) => (
                    <Attachment
                      key={m.id}
                      className="w-full justify-between hover:bg-card/45 bg-card/10 border border-border/20 rounded-xl p-3.5 transition-all"
                    >
                      <AttachmentMedia>
                        <FileCodeIcon className="size-5 text-primary" />
                      </AttachmentMedia>
                      <AttachmentContent>
                        <AttachmentTitle className="text-sm font-semibold">{m.display_name || m.original_filename}</AttachmentTitle>
                        <AttachmentDescription className="text-[11px] font-medium text-muted-foreground mt-0.5">
                          {m.file_extension?.replace(".", "").toUpperCase() || "FILE"} · {(m.file_size_bytes / (1024 * 1024)).toFixed(2)} MB · Version {m.version}
                        </AttachmentDescription>
                      </AttachmentContent>
                      <AttachmentActions>
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-muted" onClick={() => handleView(m)}>
                          <Eye className="size-4" />
                        </Button>
                        <Button variant="outline" size="sm" className="h-8 text-xs font-semibold rounded-lg border-border/60" onClick={() => handleDownload(m)} disabled={downloadingId === m.id}>
                          {downloadingId === m.id ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5 mr-2" />}
                          {downloadingId === m.id ? "Downloading..." : "Download"}
                        </Button>
                      </AttachmentActions>
                    </Attachment>
                  ))}
                </AttachmentGroup>
              ) : (
                <div className="py-16 text-center">
                  <FileText className="size-12 text-muted-foreground/30 mx-auto mb-4" />
                  <p className="text-xs font-semibold text-muted-foreground">No course materials uploaded yet.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-3 space-y-6">
          <Card className="bg-primary/5 border border-primary/10 rounded-xl shadow-sm overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-xs uppercase font-bold tracking-wider text-primary">Quick Navigation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button asChild className="w-full justify-between h-9 text-xs font-semibold rounded-lg shadow-none" size="sm">
                <Link href="/student/assessments">
                  Assessments <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full h-9 text-xs font-semibold rounded-lg border-border/60" size="sm">
                <Link href="/student/study" className="flex items-center gap-2 justify-center">
                  <Sparkles className="size-4" /> Study Agent
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="bg-card/30 border border-border/45 rounded-xl shadow-sm overflow-hidden">
            <CardContent className="p-4 text-center space-y-4">
              <div className="size-12 rounded-full bg-muted/65 mx-auto flex items-center justify-center border border-border/20">
                <Users className="size-6 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Lead Instructor</p>
                <p className="text-sm font-semibold text-foreground mt-0.5">{workspace.lecturer}</p>
              </div>
              <Button variant="outline" size="sm" className="w-full h-8 text-xs font-semibold rounded-lg border-border/60">Contact Instructor</Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Dialog Preview */}
      <Dialog open={!!viewingMaterial} onOpenChange={(open) => { if (!open) { setViewingMaterial(null); if (previewUrl) window.URL.revokeObjectURL(previewUrl); setPreviewUrl(null); } }}>
        <DialogContent className="max-w-4xl h-[80vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="p-4 border-b">
            <div className="flex items-center justify-between pr-8">
              <div>
                <DialogTitle className="truncate text-base font-semibold">{viewingMaterial?.display_name || viewingMaterial?.original_filename}</DialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5">Secure Document Stream</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => viewingMaterial && handleDownload(viewingMaterial)}>
                <Download className="size-4 mr-2" /> Download
              </Button>
            </div>
          </DialogHeader>
          <div className="flex-1 bg-muted/30 relative">
            {loadingPreview ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                <Loader2 className="size-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Loading preview...</p>
              </div>
            ) : previewUrl ? (
              viewingMaterial?.file_extension?.toLowerCase().includes("pdf") || viewingMaterial?.mime_type === "application/pdf" ? (
                <iframe src={`${previewUrl}#toolbar=0`} className="w-full h-full border-none" title="Material Preview" />
              ) : viewingMaterial?.mime_type?.startsWith("image/") ? (
                <div className="w-full h-full flex items-center justify-center p-6 overflow-auto">
                  <Image
                    src={previewUrl}
                    alt="Asset Preview"
                    width={1200}
                    height={900}
                    unoptimized
                    className="max-w-full max-h-full object-contain rounded-md shadow-lg border bg-white w-auto h-auto"
                  />
                </div>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center p-8 max-w-sm">
                    <FileText className="size-12 mx-auto text-muted-foreground/30 mb-4" />
                    <p className="text-sm text-muted-foreground leading-relaxed">Preview not supported. Please download the file to view its content.</p>
                  </div>
                </div>
              )
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <p className="text-sm text-muted-foreground">Failed to load preview.</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
