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
  Calendar,
  Award,
  FileText,
  Loader2,
  Eye,
  Download,
  ArrowRight,
  BrainCircuit,
  Upload,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";
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
        setLoading(false);
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
      <div className="max-w-7xl mx-auto space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Skeleton className="size-12 rounded-xl" />
            <div className="space-y-2">
              <Skeleton className="h-8 w-80 rounded-md" />
              <Skeleton className="h-4 w-56 rounded-md opacity-60" />
            </div>
          </div>
          <Skeleton className="h-8 w-24 rounded-full" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-9 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Skeleton className="h-28 w-full rounded-xl" />
              <Skeleton className="h-28 w-full rounded-xl" />
            </div>
            <Skeleton className="h-32 w-full rounded-xl" />
            <Skeleton className="h-[400px] w-full rounded-xl" />
          </div>
          <div className="lg:col-span-3 space-y-4">
            <Skeleton className="h-48 w-full rounded-xl" />
            <Skeleton className="h-56 w-full rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="py-24 text-center max-w-xl mx-auto">
        <h2 className="text-2xl font-semibold text-foreground/80 tracking-tight uppercase">
          Workspace context not found
        </h2>
        <p className="text-sm text-muted-foreground mt-2 mb-8">
          You may not be enrolled in this teaching workspace or it may have been
          archived.
        </p>
        <Button
          asChild
          variant="outline"
          size="sm"
          className="h-10 px-8 rounded-xl font-semibold text-sm uppercase"
        >
          <Link href="/student/courses">Back to Module Registry</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 p-6">
      <div className="flex items-center justify-between gap-6">
        <div className="flex items-center gap-4 min-w-0">
          <div className="size-11 rounded-xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20 shrink-0">
            <BookOpen className="size-6" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground/90 truncate">
              {workspace.title}
            </h1>
            <p className="text-[15px] text-muted-foreground/80 mt-0.5">
              {workspace.code} • {workspace.academic_year} • Instructor:{" "}
              {workspace.lecturer}
            </p>
          </div>
        </div>
        <Badge
          variant="outline"
          className="text-[11px] font-semibold h-7 px-4 rounded-full border-emerald-200 text-emerald-700 bg-emerald-50/50 shrink-0"
        >
          Active
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Main Content */}
        <div className="lg:col-span-9 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Card className="shadow-none border rounded-xl overflow-hidden hover:border-primary/20 transition-all">
              <CardHeader className="bg-muted/5 border-b py-3 px-5">
                <CardTitle className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Operational Progress
                </CardTitle>
              </CardHeader>
              <CardContent className="p-5">
                <div className="mb-2.5 flex justify-between text-xs font-semibold">
                  <span className="text-muted-foreground">
                    Syllabus Coverage
                  </span>
                  <span className="text-primary font-bold">
                    {workspace.progress}%
                  </span>
                </div>
                <Progress value={workspace.progress} className="h-2" />
              </CardContent>
            </Card>

            <Card className="shadow-none border rounded-xl overflow-hidden hover:border-primary/20 transition-all">
              <CardHeader className="bg-muted/5 border-b py-3 px-5">
                <CardTitle className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Registry Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="p-5 grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <span className="text-[10px] font-semibold text-muted-foreground block uppercase">
                    Enrolled
                  </span>
                  <span className="text-base font-bold tabular-nums text-foreground/80 flex items-center gap-1.5">
                    <Users className="size-4 text-muted-foreground/60" />{" "}
                    {workspace.enrolled}
                  </span>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-semibold text-muted-foreground block uppercase">
                    Evaluations
                  </span>
                  <span className="text-base font-bold tabular-nums text-foreground/80">
                    {workspace.assessments}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="shadow-none border rounded-xl overflow-hidden hover:border-primary/20 transition-all">
            <CardHeader className="bg-muted/5 border-b py-3 px-5">
              <CardTitle className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Workspace Description
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5">
              <p className="text-[15px] text-muted-foreground leading-relaxed font-medium">
                {workspace.description ||
                  "No description provided for this teaching workspace."}
              </p>
            </CardContent>
          </Card>

          <Card className="shadow-none border rounded-xl overflow-hidden hover:border-primary/20 transition-all">
            <CardHeader className="bg-muted/5 border-b py-3 px-5 flex flex-row items-center justify-between">
              <CardTitle className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Learning Materials ({materials.length})
              </CardTitle>
              <Badge
                variant="secondary"
                className="rounded-full h-5 px-3 text-[10px] font-bold bg-muted/50 border-none"
              >
                Library Vault
              </Badge>
            </CardHeader>
            <CardContent className="p-0">
              {materials.length > 0 ? (
                <div className="divide-y divide-muted/10">
                  {materials.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between p-4 hover:bg-muted/5 transition-colors group"
                    >
                      <div className="flex items-center gap-4 min-w-0">
                        <div className="bg-primary/5 p-2 rounded-lg text-primary group-hover:bg-primary group-hover:text-white transition-all border border-primary/5">
                          <FileText className="size-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-[15px] font-semibold text-foreground/80 truncate">
                            {m.display_name || m.original_filename}
                          </div>
                          <div className="text-[11px] text-muted-foreground/60 mt-0.5 font-bold uppercase">
                            {m.file_extension?.replace(".", "").toUpperCase()} •{" "}
                            {(m.file_size_bytes / 1024).toFixed(0)} KB • VERSION{" "}
                            {m.version}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 ml-4">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleView(m)}
                          className="h-9 w-9 rounded-lg hover:bg-primary/10"
                        >
                          <Eye className="size-4 text-primary" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownload(m)}
                          disabled={downloadingId === m.id}
                          className="h-9 px-5 rounded-lg text-[11px] font-bold border-border"
                        >
                          {downloadingId === m.id ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <>
                              <Download className="size-4 mr-2" />
                              Download
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-20 text-center bg-muted/5">
                  <FileText className="size-10 mx-auto text-muted-foreground/10 mb-4" />
                  <p className="text-[11px] font-bold text-muted-foreground/40 uppercase tracking-wider">
                    No materials released yet.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar Info */}
        <div className="lg:col-span-3 space-y-5">
          <Card className="shadow-none border rounded-xl overflow-hidden bg-primary/5 border-primary/10 hover:border-primary/20 transition-all">
            <CardHeader className="py-3 px-5 border-b border-primary/10 bg-primary/5 text-center">
              <CardTitle className="text-[11px] font-bold text-primary uppercase tracking-widest">
                Workflow Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3.5 space-y-2.5">
              <Button
                asChild
                className="w-full justify-between h-10.5 px-4 text-xs font-bold rounded-lg shadow-none"
                size="sm"
              >
                <Link href="/student/assessments">
                  <div className="flex items-center gap-3">
                    <FileText className="size-4" />
                    Launch Evaluations
                  </div>
                  <ArrowRight className="size-4 opacity-40" />
                </Link>
              </Button>
              <Button
                asChild
                variant="secondary"
                className="w-full justify-between h-10.5 px-4 text-xs font-bold rounded-lg"
                size="sm"
              >
                <Link href="/student/study">
                  <div className="flex items-center gap-3 text-primary">
                    <BrainCircuit className="size-4" />
                    Open Study Agent
                  </div>
                </Link>
              </Button>
              <Button
                asChild
                variant="secondary"
                className="w-full justify-between h-10.5 px-4 text-xs font-bold rounded-lg"
                size="sm"
              >
                <Link href="/student/resources">
                  <div className="flex items-center gap-3 text-foreground/70">
                    <Upload className="size-4" />
                    Private Notes Vault
                  </div>
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="shadow-none border rounded-xl overflow-hidden hover:border-primary/20 transition-all">
            <CardHeader className="bg-muted/5 border-b py-3 px-5 text-center">
              <CardTitle className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
                Instructor Node
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 text-center space-y-4">
              <div className="size-16 rounded-full bg-muted mx-auto flex items-center justify-center border-2 border-background shadow-sm">
                <Users className="size-7 text-muted-foreground" />
              </div>
              <div>
                <p className="text-[15px] font-bold text-foreground/90">{workspace.lecturer}</p>
                <p className="text-[10px] text-muted-foreground font-bold mt-1 uppercase tracking-tighter">
                  PRIMARY INSTRUCTOR
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full h-9 text-[11px] font-bold rounded-lg border-muted-foreground/20"
              >
                Contact Lecturer
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Material Viewer Dialog */}
      <Dialog
        open={!!viewingMaterial}
        onOpenChange={(open) => {
          if (!open) {
            setViewingMaterial(null);
            if (previewUrl) window.URL.revokeObjectURL(previewUrl);
            setPreviewUrl(null);
          }
        }}
      >
        <DialogContent className="max-w-5xl h-[85vh] flex flex-col p-0 overflow-hidden rounded-3xl border-none shadow-2xl">
          <DialogHeader className="p-6 border-b bg-background">
            <div className="flex items-center justify-between pr-10">
              <DialogTitle className="text-lg font-bold uppercase tracking-tight truncate">
                {viewingMaterial?.display_name ||
                  viewingMaterial?.original_filename}
              </DialogTitle>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 text-[11px] font-bold uppercase rounded-xl"
                  onClick={() =>
                    viewingMaterial && handleDownload(viewingMaterial)
                  }
                >
                  <Download className="size-4 mr-2" /> Download Asset
                </Button>
              </div>
            </div>
          </DialogHeader>
          <div className="flex-1 bg-muted/20 relative">
            {loadingPreview ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-5">
                <Loader2 className="size-10 animate-spin text-primary/40" />
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground/40">
                  Buffering Preview Stream...
                </p>
              </div>
            ) : previewUrl ? (
              viewingMaterial?.file_extension?.toLowerCase().includes("pdf") ||
              viewingMaterial?.mime_type === "application/pdf" ? (
                <iframe
                  src={`${previewUrl}#toolbar=0`}
                  className="w-full h-full border-none"
                  title="Material Preview"
                />
              ) : viewingMaterial?.mime_type?.startsWith("image/") ? (
                <div className="w-full h-full flex items-center justify-center p-8">
                  <img
                    src={previewUrl}
                    alt="Preview"
                    className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl"
                  />
                </div>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center p-12 max-w-sm">
                    <FileText className="size-16 mx-auto text-muted-foreground/10 mb-6" />
                    <h3 className="text-lg font-bold uppercase tracking-tight mb-3">
                      Preview Unavailable
                    </h3>
                    <p className="text-sm text-muted-foreground font-medium leading-relaxed">
                      Direct pedagogical preview is not supported for{" "}
                      {viewingMaterial?.file_extension?.toUpperCase()} assets.
                      Please download the file to view its contents.
                    </p>
                  </div>
                </div>
              )
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <p className="text-[11px] font-bold text-muted-foreground uppercase opacity-40">
                  Preview acquisition failed.
                </p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
