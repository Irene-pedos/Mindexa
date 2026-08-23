// app/student/courses/[id]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  BookOpen,
  Users,
  FileText,
  Loader2,
  Eye,
  Download,
  ArrowRight,
  Sparkles,
  ChevronLeft,
  TrendingUp,
  GraduationCap,
  Bookmark,
} from "lucide-react";
import Link from "next/link";
import { studentApi, StudentCourseDetail } from "@/lib/api/student";
import { LecturerMaterialResponse } from "@/lib/api/lecturer";
import { Skeleton } from "@/components/ui/interfaces-skeleton";
import { toast } from "sonner";
import { FileCodeIcon } from "lucide-react";
import {
  Attachment,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from "@/components/ui/attachment";
import { getStoredProgress } from "@/components/mindexa/study-reader/hooks/use-reader-progress";

export default function StudentCourseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const workspaceId = params.id as string;
  const [workspace, setWorkspace] = useState<StudentCourseDetail | null>(null);
  const [materials, setMaterials] = useState<LecturerMaterialResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [readingProgressMap, setReadingProgressMap] = useState<Record<string, number>>({});

  useEffect(() => {
    async function load() {
      try {
        const [wsData, mats] = await Promise.all([
          studentApi.getWorkspaceDetail(workspaceId),
          studentApi.getWorkspaceMaterials(workspaceId),
        ]);
        setWorkspace(wsData);
        setMaterials(mats);

        // Check local storage progress for each material
        const progressMap: Record<string, number> = {};
        for (const m of mats) {
          const prog = getStoredProgress("lecturer_material", m.id);
          if (prog && prog.page > 0) {
            progressMap[m.id] = prog.page;
          }
        }
        setReadingProgressMap(progressMap);
      } catch {
        toast.error("Failed to load course details");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [workspaceId]);

  const handleDownload = async (m: LecturerMaterialResponse) => {
    try {
      setDownloadingId(m.id);
      await studentApi.downloadMaterial(m.id, m.display_name || m.original_filename);
      toast.success("Download started");
    } catch {
      toast.error("Failed to download");
    } finally {
      setDownloadingId(null);
    }
  };

  const handleOpenReader = (materialId: string) => {
    router.push(`/student/courses/${workspaceId}/materials/${materialId}`);
  };

  if (loading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-10 rounded-xl" />
        <Skeleton className="h-36 rounded-xl" />
        <div className="grid grid-cols-3 gap-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="py-20 text-center">
        <p className="text-sm text-muted-foreground">Course not found</p>
        <Button asChild variant="outline" size="sm" className="mt-4">
          <Link href="/student/courses">Back to Courses</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5 w-full mx-auto animate-in fade-in duration-300">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/25 pb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Button variant="outline" size="icon" asChild className="h-8 w-8 rounded-lg shrink-0 border-border/60">
            <Link href="/student/courses"><ChevronLeft className="size-4 text-muted-foreground" /></Link>
          </Button>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight text-foreground truncate">{workspace.title}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <Badge variant="outline" className="text-[9px] font-mono px-1.5 h-4 border-border/50">{workspace.code}</Badge>
              <span className="text-xs text-muted-foreground font-medium">{workspace.academic_year || "Global"}</span>
            </div>
          </div>
        </div>
        <Badge variant="outline" className="px-2.5 py-1 text-xs text-success bg-success/10 border-success/20 flex items-center gap-1.5 self-start sm:self-auto">
          <span className="size-1.5 rounded-full bg-success animate-pulse" />
          Active
        </Badge>
      </div>

      {/* Banner */}
      {workspace.banner_image_url ? (
        <div
          className="h-36 rounded-xl bg-cover bg-center border border-border/40 overflow-hidden"
          style={{ backgroundImage: `url(${workspace.banner_image_url})` }}
        />
      ) : (
        <div className="h-36 rounded-xl bg-gradient-to-br from-primary/15 via-primary/5 to-muted border border-border/40 flex items-center justify-center">
          <BookOpen className="size-10 text-primary/20" />
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="border-border/60 shadow-xs">
          <CardContent className="p-3.5">
            <div className="flex items-center gap-1.5 mb-2">
              <TrendingUp className="size-3.5 text-primary" />
              <span className="text-[10px] text-muted-foreground font-medium">Progress</span>
            </div>
            <p className="text-xl font-bold text-foreground tabular-nums">{workspace.progress}%</p>
            <Progress value={workspace.progress} className="h-1.5 mt-1.5" />
          </CardContent>
        </Card>
        <Card className="border-border/60 shadow-xs">
          <CardContent className="p-3.5">
            <div className="flex items-center gap-1.5 mb-2">
              <Users className="size-3.5 text-primary" />
              <span className="text-[10px] text-muted-foreground font-medium">Cohort</span>
            </div>
            <p className="text-xl font-bold text-foreground tabular-nums">{workspace.enrolled}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">students enrolled</p>
          </CardContent>
        </Card>
        <Card className="border-border/60 shadow-xs">
          <CardContent className="p-3.5">
            <div className="flex items-center gap-1.5 mb-2">
              <FileText className="size-3.5 text-primary" />
              <span className="text-[10px] text-muted-foreground font-medium">Assessments</span>
            </div>
            <p className="text-xl font-bold text-foreground tabular-nums">{workspace.assessments}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">total evaluations</p>
          </CardContent>
        </Card>
      </div>

      {/* Main content + sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-9 space-y-4">
          {/* Description */}
          {workspace.description && (
            <Card className="border-border/60 shadow-xs">
              <CardHeader className="px-4 pt-4 pb-2">
                <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
                  <BookOpen className="size-3.5 text-primary" />
                  About this course
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <p className="text-xs text-muted-foreground leading-relaxed font-medium">{workspace.description}</p>
              </CardContent>
            </Card>
          )}

          {/* Materials */}
          <Card className="border-border/60 shadow-xs overflow-hidden">
            <CardHeader className="px-4 pt-4 pb-2 border-b border-border/40">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
                  <BookOpen className="size-3.5 text-primary" />
                  Course Materials
                  <Badge variant="secondary" className="text-[10px] h-4 px-1.5 font-semibold ml-0.5">
                    {materials.length}
                  </Badge>
                </CardTitle>
              </div>
              <CardDescription className="text-[11px]">
                Lecture notes, slides, and study resources uploaded by your instructor.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {materials.length > 0 ? (
                <AttachmentGroup className="flex-col gap-0 divide-y divide-border/30">
                  {materials.map((m) => {
                    const savedPage = readingProgressMap[m.id];
                    return (
                      <Attachment
                        key={m.id}
                        className="w-full justify-between hover:bg-muted/30 bg-transparent rounded-none px-4 py-3 transition-colors cursor-pointer group"
                        onClick={() => handleOpenReader(m.id)}
                      >
                        <AttachmentMedia>
                          <FileCodeIcon className="size-4 text-primary" />
                        </AttachmentMedia>
                        <AttachmentContent>
                          <div className="flex items-center gap-2 flex-wrap">
                            <AttachmentTitle className="text-xs font-medium group-hover:text-primary transition-colors">
                              {m.display_name || m.original_filename}
                            </AttachmentTitle>
                            {savedPage && (
                              <Badge
                                variant="secondary"
                                className="text-[10px] h-4 px-1.5 font-normal bg-primary/10 text-primary border-primary/20 flex items-center gap-1"
                              >
                                <Bookmark className="size-2.5" />
                                <span>Continue: p. {savedPage}</span>
                              </Badge>
                            )}
                          </div>
                          <AttachmentDescription className="text-[10px] font-medium text-muted-foreground mt-0.5">
                            {m.file_extension?.replace(".", "").toUpperCase() || "FILE"} · {(m.file_size_bytes / (1024 * 1024)).toFixed(2)} MB · v{m.version}
                          </AttachmentDescription>
                        </AttachmentContent>
                        <AttachmentActions onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-lg hover:bg-muted"
                            onClick={() => handleOpenReader(m.id)}
                            title="Open in Study Reader"
                          >
                            <Eye className="size-3.5" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs font-medium rounded-lg border-border/60"
                            onClick={() => handleDownload(m)}
                            disabled={downloadingId === m.id}
                          >
                            {downloadingId === m.id ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5 mr-1.5" />}
                            {downloadingId === m.id ? "Saving…" : "Download"}
                          </Button>
                        </AttachmentActions>
                      </Attachment>
                    );
                  })}
                </AttachmentGroup>
              ) : (
                <div className="py-14 text-center">
                  <FileText className="size-10 mx-auto mb-3 text-muted-foreground/25" />
                  <p className="text-xs text-muted-foreground font-medium">No course materials uploaded yet.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-3 space-y-4">
          <Card className="border-primary/15 bg-primary/5 shadow-xs">
            <CardHeader className="px-4 pt-3.5 pb-2">
              <CardTitle className="text-[10px] font-semibold uppercase tracking-wider text-primary">
                Quick Navigation
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              <Button asChild size="sm" className="w-full justify-between h-8 text-xs font-semibold rounded-lg shadow-none">
                <Link href="/student/assessments">Assessments <ArrowRight className="size-3.5" /></Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="w-full h-8 text-xs font-medium rounded-lg border-border/60">
                <Link href="/student/study" className="flex items-center gap-2 justify-center">
                  <Sparkles className="size-3.5" /> Study Agent
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="border-border/60 shadow-xs">
            <CardContent className="p-4 text-center space-y-3">
              <div className="size-11 rounded-full bg-muted/60 mx-auto flex items-center justify-center border border-border/30">
                <GraduationCap className="size-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider">Lead Instructor</p>
                <p className="text-xs font-semibold text-foreground mt-0.5">{workspace.lecturer}</p>
              </div>
              <Button variant="outline" size="sm" className="w-full h-7 text-xs font-medium rounded-lg border-border/60">
                Contact Instructor
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}