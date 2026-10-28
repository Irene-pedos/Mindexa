// app/lecturer/courses/[id]/page.tsx
"use client";

import React, { useEffect, useState, useCallback } from "react";import { useParams, useRouter } from "next/navigation";
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
  Upload,
  FileText,
  Database,
  Users,
  ArrowRight,
  ChevronLeft,
  Search,
  Building2,
  Layers,
  TrendingUp,
  Activity,
  BookOpen,
  Edit2,
  ImageIcon,
  UploadCloud,
  FileCodeIcon,
  XIcon,
} from "lucide-react";
import {
  lecturerApi,
  StudentCourseRecordResponse,
  LecturerMaterialResponse,
  WorkspaceDetail,
} from "@/lib/api/lecturer";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import { Label } from "@/components/ui/label";

const errorText = (err: unknown, fallback: string): string =>
  err instanceof Error && err.message ? err.message : fallback;

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
  const [selectedCategory, setSelectedCategory] = useState("LECTURE_NOTES");

  const [recordDialogOpen, setRecordDialogOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [record, setRecord] = useState<StudentCourseRecordResponse | null>(null);
  const [loadingRecord, setLoadingRecord] = useState(false);

  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const [bannerDialogOpen, setBannerDialogOpen] = useState(false);
  const [bannerUrlInput, setBannerUrlInput] = useState("");
  const [updatingBanner, setUpdatingBanner] = useState(false);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  const loadWorkspace = useCallback(async () => {
    try {
      setLoading(true);
      const [workspaceData, materialsData] = await Promise.all([
        lecturerApi.getWorkspaceDetail(id),
        lecturerApi.getWorkspaceMaterials(id),
      ]);
      setWorkspace(workspaceData);
      setMaterials(materialsData);
      setBannerUrlInput(workspaceData.banner_image_url || "");
      setBannerPreview(workspaceData.banner_image_url || "");
    } catch (err: unknown) {
      toast.error("Failed to load the course");
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
      toast.success("Course archived");
      router.push("/lecturer/courses");
    } catch (err: unknown) {
      toast.error(errorText(err, "Failed to archive workspace"));
      setArchiveDialogOpen(false);
    } finally {
      setArchiving(false);
    }
  };

  const handleUpdateBanner = async () => {
    if (!workspace) return;
    setUpdatingBanner(true);
    try {
      let finalUrl = bannerUrlInput;
      if (bannerFile) {
        const uploadRes = await lecturerApi.uploadImage(bannerFile);
        finalUrl = uploadRes.url;
      }
      const updated = await lecturerApi.updateWorkspace(id, {
        banner_image_url: finalUrl,
      });
      setWorkspace(updated);
      toast.success("Banner updated successfully");
      setBannerDialogOpen(false);
      setBannerFile(null);
    } catch (err: unknown) {
      toast.error(errorText(err, "Failed to update banner"));
    } finally {
      setUpdatingBanner(false);
    }
  };

  const handleBannerFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setBannerFile(file);
      setBannerUrlInput("");
      setBannerPreview(URL.createObjectURL(file));
    }
  };

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setBannerUrlInput(e.target.value);
    setBannerPreview(e.target.value);
    setBannerFile(null);
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
      formData.append("material_category", selectedCategory);
      formData.append("is_student_visible", String(isMaterialVisible));
      await lecturerApi.uploadMaterial(formData);
      toast.success("Material uploaded successfully");
      const materialsData = await lecturerApi.getWorkspaceMaterials(id);
      setMaterials(materialsData);
    } catch (err: unknown) {
      toast.error(errorText(err, "Upload failed"));
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
    } catch (err: unknown) {
      toast.error(errorText(err, "Failed to delete material"));
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
      <div className="w-full max-w-full 2xl:max-w-[1800px] mx-auto min-w-0 space-y-4 sm:space-y-5 p-1 sm:p-2 lg:p-3 transition-all duration-300 font-sans">
        <div className="flex items-center justify-between pb-3 border-b border-border/40">
          <div className="flex items-center gap-3">
            <Skeleton className="size-8 rounded-lg" />
            <div className="space-y-1">
              <Skeleton className="h-6 w-48 rounded-lg" />
              <Skeleton className="h-3.5 w-32 rounded-lg" />
            </div>
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-8 w-20 rounded-xl" />
            <Skeleton className="h-8 w-32 rounded-xl" />
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
          <div className="lg:col-span-9 space-y-4">
            <Skeleton className="h-32 rounded-2xl" />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 rounded-xl" />
              ))}
            </div>
            <Skeleton className="h-64 rounded-2xl" />
          </div>
          <div className="lg:col-span-3 space-y-4">
            <Skeleton className="h-28 rounded-2xl" />
            <Skeleton className="h-80 rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="py-20 text-center text-muted-foreground flex flex-col items-center justify-center gap-2.5">
        <div className="size-12 rounded-2xl bg-muted/40 border border-border/60 flex items-center justify-center text-muted-foreground">
          <Database className="size-6" />
        </div>
        <p className="text-sm font-semibold text-foreground">Course not found</p>
        <p className="text-xs text-muted-foreground max-w-sm">This course may have been archived, or it isn&apos;t one of your assignments.</p>
        <Button variant="outline" size="sm" asChild className="mt-2 text-xs rounded-xl border-border/60">
          <Link href="/lecturer/courses">Back to my courses</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-full 2xl:max-w-[1800px] mx-auto min-w-0 space-y-4 sm:space-y-5 p-1 sm:p-2 lg:p-3 transition-all duration-300 font-sans pb-12">
      {/* Header Container */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/40 pb-3">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="outline"
            size="icon"
            asChild
            className="size-8 rounded-lg shrink-0 border-border/60 bg-card hover:bg-muted/50 shadow-2xs"
          >
            <Link href="/lecturer/courses">
              <ChevronLeft className="size-4 text-muted-foreground" />
            </Link>
          </Button>
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-semibold tracking-tight text-foreground truncate">
              {workspace.title}
            </h1>
            <div className="flex flex-wrap items-center gap-2 mt-0.5">
              <Badge
                variant="outline"
                className="text-[10px] font-mono font-medium px-2 h-5 bg-primary/10 text-primary border-primary/20 rounded-full"
              >
                {workspace.code}
              </Badge>
              <span className="text-xs text-muted-foreground font-normal">
                {workspace.academic_year}
              </span>
            </div>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {[
                workspace.institution_name,
                workspace.department_name,
                workspace.option_name,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setArchiveDialogOpen(true)}
            className="h-8 px-3 rounded-xl text-xs font-semibold border-destructive/20 text-destructive bg-card hover:bg-destructive/10 shadow-2xs"
          >
            Archive
          </Button>
          <Button
            asChild
            size="sm"
            className="h-8 px-3.5 rounded-xl text-xs font-semibold shadow-2xs text-primary-foreground bg-primary hover:bg-primary/90"
          >
            <Link href={`/lecturer/assessments/new?workspace=${id}`}>
              <Plus className="mr-1.5 size-3.5" /> New Assessment
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 items-start">
        {/* Main Area */}
        <div className="lg:col-span-9 space-y-4">
          {/* Banner */}
          <div className="relative group rounded-2xl overflow-hidden border border-border/60 h-32 bg-card shadow-2xs">
            {workspace.banner_image_url ? (
              <div
                className="h-full w-full bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
                style={{
                  backgroundImage: `url(${workspace.banner_image_url})`,
                }}
              />
            ) : (
              <div className="h-full w-full bg-gradient-to-br from-primary/10 via-primary/5 to-muted/30 flex flex-col items-center justify-center text-primary/40 gap-1.5">
                <BookOpen className="size-8" />
                <span className="text-[10px] font-medium tracking-wider uppercase">
                  No Banner Image
                </span>
              </div>
            )}
            <div className="absolute inset-0 bg-background/50 backdrop-blur-xs transition-opacity flex items-center justify-center opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setBannerDialogOpen(true)}
                className="h-7 text-xs font-semibold rounded-lg bg-card/90 text-foreground shadow-sm border border-border/60 hover:bg-card"
              >
                <Edit2 className="size-3 mr-1.5" />
                {workspace.banner_image_url ? "Change Banner" : "Upload Banner"}
              </Button>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card className="rounded-xl border border-border/60 bg-card shadow-2xs hover:border-border transition-colors">
              <CardContent className="p-3.5 flex items-center justify-between">
                <div className="space-y-0.5">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Class Average
                  </p>
                  <p className="text-xl font-bold tracking-tight text-primary tabular-nums">
                    {workspace.performance_avg.toFixed(1)}%
                  </p>
                </div>
                <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                  <TrendingUp className="size-4" />
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-xl border border-border/60 bg-card shadow-2xs hover:border-border transition-colors">
              <CardContent className="p-3.5 flex items-center justify-between">
                <div className="space-y-0.5">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Enrolled Students
                  </p>
                  <p className="text-xl font-bold tracking-tight text-foreground tabular-nums">
                    {workspace.student_count}
                  </p>
                </div>
                <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                  <Users className="size-4" />
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-xl border border-border/60 bg-card shadow-2xs hover:border-border transition-colors">
              <CardContent className="p-3.5 flex items-center justify-between min-w-0">
                <div className="space-y-0.5 min-w-0">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Class
                  </p>
                  <p className="text-sm font-bold truncate text-foreground mt-0.5">
                    {workspace.class_name === "GLOBAL"
                      ? "All classes"
                      : workspace.class_name}
                  </p>
                </div>
                <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                  <Building2 className="size-4" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Student Roster Table */}
          <Card className="rounded-2xl border border-border/60 bg-card shadow-2xs overflow-hidden">
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 border-b border-border/40 bg-muted/20">
              <div className="space-y-0.5">
                <CardTitle className="text-xs font-semibold flex items-center gap-1.5 uppercase text-muted-foreground tracking-wider">
                  <Layers className="size-3.5 text-primary shrink-0" /> Student Cohort
                </CardTitle>
                <CardDescription className="text-[10px] font-normal text-muted-foreground">
                  Students enrolled in this course&apos;s classes. Select one to see their results.
                </CardDescription>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <Input
                  placeholder="Filter student names or IDs..."
                  className="pl-8 h-8 text-xs rounded-lg border-border/60 bg-background text-foreground placeholder:text-muted-foreground"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table className="min-w-[500px]">
                <TableHeader className="bg-muted/30 border-b border-border/40">
                  <TableRow className="h-8 hover:bg-transparent border-none">
                    <TableHead className="text-[10px] font-semibold uppercase tracking-wider pl-4 text-muted-foreground w-[120px]">
                      ID
                    </TableHead>
                    <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Student Details
                    </TableHead>
                    <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Progression
                    </TableHead>
                    <TableHead className="text-right text-[10px] font-semibold uppercase tracking-wider pr-4 text-muted-foreground">
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
                        className="hover:bg-muted/30 h-12 border-b border-border/40 transition-colors cursor-pointer group"
                        onClick={() => openRecord(student.id, student.name)}
                      >
                        <TableCell className="font-mono text-[10px] font-medium text-muted-foreground pl-4">
                          {student.student_id}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-semibold text-xs text-foreground group-hover:text-primary transition-colors">
                              {student.name}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {student.email}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1 w-24 sm:w-28">
                            <span className="text-[10px] text-muted-foreground font-semibold tabular-nums">
                              {student.progress}%
                            </span>
                            <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-emerald-500 rounded-full"
                                style={{ width: `${student.progress}%` }}
                              />
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right pr-4">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2.5 text-[10px] font-semibold uppercase tracking-wider rounded-lg border-border/60 bg-card group-hover:bg-primary group-hover:text-primary-foreground group-hover:border-primary transition-all opacity-0 group-hover:opacity-100 shadow-2xs"
                          >
                            View record
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
          <Card className="rounded-2xl border border-primary/20 bg-primary/5 shadow-2xs">
            <CardHeader className="py-2.5 px-3.5 border-b border-primary/10 bg-primary/10">
              <CardTitle className="text-[10px] font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                Quick Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 py-3 px-3.5">
              <Button
                asChild
                className="w-full justify-between h-8.5 text-xs font-semibold rounded-xl shadow-2xs text-primary-foreground bg-primary hover:bg-primary/90"
              >
                <Link href={`/lecturer/assessments/new?workspace=${id}`}>
                  New Assessment <ArrowRight className="size-3.5" />
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="w-full h-8.5 text-xs font-semibold rounded-xl border-border/60 bg-card hover:bg-muted/50 text-foreground shadow-2xs"
              >
                <Link
                  href="/lecturer/question-bank"
                  className="flex items-center gap-1.5 justify-center"
                >
                  <Database className="size-3.5 text-muted-foreground" /> Question Bank
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border border-border/60 bg-card shadow-2xs overflow-hidden w-full">
            <CardHeader className="flex flex-col py-3 px-3.5 border-b border-border/40 bg-muted/20 gap-2.5 w-full">
              <div className="flex items-center justify-between w-full">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 text-muted-foreground">
                  <BookOpen className="size-3.5 text-primary shrink-0" /> Handouts
                  <Badge
                    variant="outline"
                    className="ml-0.5 text-[9px] font-semibold py-0 h-4 px-1.5 bg-muted text-muted-foreground border-border/60"
                  >
                    {materials.length}
                  </Badge>
                </CardTitle>
              </div>
              <div className="flex flex-col gap-2 w-full">
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="h-8 w-full rounded-lg border border-border/60 text-xs px-2.5 bg-background text-foreground outline-none focus:ring-1 focus:ring-primary/20"
                  title="Handout Category"
                >
                  <option value="LECTURE_NOTES">Lecture Notes</option>
                  <option value="SYLLABUS">Syllabus</option>
                  <option value="ASSIGNMENT_SPECS">Assignment Specs</option>
                  <option value="RUBRIC">Rubric</option>
                  <option value="REFERENCE_MATERIALS">Reference Materials</option>
                </select>
                <div className="flex items-center justify-between w-full pt-1">
                  <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isMaterialVisible}
                      onChange={(e) => setIsMaterialVisible(e.target.checked)}
                      className="size-3.5 accent-primary rounded border-border/60"
                    />
                    Student Visible
                  </label>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7.5 px-2.5 text-xs font-semibold rounded-lg border-border/60 bg-card hover:bg-muted/50 text-foreground shadow-2xs"
                    disabled={uploading}
                    onClick={() =>
                      document.getElementById("material-upload")?.click()
                    }
                  >
                    {uploading ? (
                      <Loader2 className="size-3.5 animate-spin mr-1.5 text-primary" />
                    ) : (
                      <Upload className="size-3.5 mr-1.5 text-primary" />
                    )}
                    Upload
                  </Button>
                  <input
                    id="material-upload"
                    type="file"
                    className="hidden"
                    onChange={handleUploadMaterial}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-64">
                {materials.length === 0 && !uploading ? (
                  <div className="flex flex-col items-center justify-center py-10 px-4 space-y-1.5 text-muted-foreground">
                    <FileText className="size-5 opacity-30" />
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-center">
                      No handouts uploaded
                    </p>
                  </div>
                ) : (
                  <AttachmentGroup className="flex-col gap-1.5 p-2.5">
                    {uploading && (
                      <Attachment state="uploading" className="w-full rounded-xl border border-border/60 bg-background">
                        <AttachmentMedia>
                          <Spinner />
                        </AttachmentMedia>
                        <AttachmentContent>
                          <AttachmentTitle className="text-[10px] font-semibold text-foreground">
                            Uploading material...
                          </AttachmentTitle>
                          <AttachmentDescription className="text-[9px] text-muted-foreground">
                            Processing handouts upload
                          </AttachmentDescription>
                        </AttachmentContent>
                      </Attachment>
                    )}
                    {materials.map((m) => (
                      <Attachment
                        key={m.id}
                        className="w-full min-w-0 max-w-full overflow-hidden justify-between hover:bg-muted/40 border border-border/60 transition-all cursor-pointer rounded-xl p-2 bg-background"
                        onClick={async () => {
                          try {
                            await lecturerApi.downloadMaterial(
                              m.id,
                              m.original_filename,
                            );
                            toast.success("Download started");
                          } catch {
                            toast.error("Failed to download material");
                          }
                        }}
                      >
                        <AttachmentMedia>
                          <FileCodeIcon className="size-4 text-primary" />
                        </AttachmentMedia>
                        <AttachmentContent className="min-w-0 flex-1">
                          <AttachmentTitle className="text-xs font-semibold truncate text-foreground">
                            {m.display_name || m.original_filename}
                          </AttachmentTitle>
                          <AttachmentDescription className="text-[9px] font-medium truncate text-muted-foreground">
                            {m.file_extension
                              ? m.file_extension.replace(".", "").toUpperCase()
                              : "FILE"}{" "}
                            · {(m.file_size_bytes / (1024 * 1024)).toFixed(2)}{" "}
                            MB
                            {!m.is_student_visible && " · Hidden"}
                            {" · "}
                            <span
                              className={
                                m.processing_status === "PROCESSED"
                                  ? "text-emerald-600 dark:text-emerald-400 font-semibold"
                                  : m.processing_status === "FAILED"
                                    ? "text-destructive font-semibold"
                                    : "text-blue-600 dark:text-blue-400 font-semibold animate-pulse"
                              }
                            >
                              {m.processing_status || "PENDING"}
                            </span>
                          </AttachmentDescription>
                        </AttachmentContent>
                        <AttachmentActions
                          onClick={(e) => e.stopPropagation()}
                          className="ml-1 shrink-0"
                        >
                          <AttachmentAction
                            aria-label="Remove material"
                            className="size-5 hover:bg-destructive/10 rounded"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteMaterialId(m.id);
                            }}
                          >
                            <XIcon className="size-3 text-destructive" />
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

      {/* Banner Edit Dialog */}
      <Dialog open={bannerDialogOpen} onOpenChange={setBannerDialogOpen}>
        <DialogContent className="max-w-md p-0 overflow-hidden rounded-2xl border border-border/60 shadow-xl bg-card text-card-foreground">
          <DialogHeader className="p-4 border-b border-border/40 bg-muted/20">
            <DialogTitle className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 uppercase tracking-wider">
              <ImageIcon className="size-4 text-primary" /> Update Course Banner
            </DialogTitle>
          </DialogHeader>
          <div className="p-4 space-y-4">
            <label
              htmlFor="banner-upload"
              tabIndex={0}
              className={cn(
                "relative flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-xl transition-colors text-center cursor-pointer overflow-hidden group",
                isDragging
                  ? "border-primary bg-primary/10"
                  : "border-border/60 bg-muted/20 hover:bg-muted/40",
              )}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                  const file = e.dataTransfer.files[0];
                  setBannerFile(file);
                  setBannerUrlInput("");
                  setBannerPreview(URL.createObjectURL(file));
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  document.getElementById("banner-upload")?.click();
                }
              }}
            >
              <input
                id="banner-upload"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleBannerFileChange}
              />

              {bannerPreview ? (
                <div
                  className="absolute inset-0 bg-cover bg-center opacity-40 group-hover:opacity-30 transition-opacity"
                  style={{ backgroundImage: `url(${bannerPreview})` }}
                />
              ) : null}

              <div className="relative z-10 flex flex-col items-center gap-2">
                <div className="p-3 bg-card rounded-full shadow-sm border border-border/60 mb-1 text-primary">
                  <UploadCloud className="size-5" />
                </div>
                <h3 className="text-xs font-semibold text-foreground">
                  Click to upload or drag and drop
                </h3>
                <p className="text-[10px] text-muted-foreground">
                  SVG, PNG, JPG or GIF (max 5MB)
                </p>
              </div>
            </label>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border/40" />
              </div>
              <div className="relative flex justify-center text-[9px] font-semibold uppercase tracking-wider">
                <span className="bg-card px-2 text-muted-foreground">
                  Or use a link
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="bannerUrl"
                className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider"
              >
                Image URL
              </Label>
              <Input
                id="bannerUrl"
                placeholder="https://images.unsplash.com/photo-..."
                className="h-8 text-xs rounded-lg border-border/60 bg-background text-foreground"
                value={bannerUrlInput}
                onChange={handleUrlChange}
              />
            </div>

            {bannerPreview && (
              <div className="space-y-1.5 pt-2 border-t border-border/40">
                <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Preview
                </Label>
                <div
                  className="h-28 rounded-xl bg-cover bg-center border border-border/60 shadow-inner"
                  style={{ backgroundImage: `url(${bannerPreview})` }}
                />
              </div>
            )}
          </div>
          <div className="p-4 border-t border-border/40 bg-muted/20 flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs font-medium rounded-xl border-border/60"
              onClick={() => setBannerDialogOpen(false)}
              disabled={updatingBanner}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs font-semibold text-primary-foreground bg-primary hover:bg-primary/90 rounded-xl shadow-2xs"
              onClick={handleUpdateBanner}
              disabled={updatingBanner}
            >
              {updatingBanner ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                "Save Banner"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Student record dialog */}
      <Dialog open={recordDialogOpen} onOpenChange={setRecordDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] p-0 overflow-hidden rounded-2xl border border-border/60 shadow-xl bg-card text-card-foreground">
          <DialogHeader className="p-4 border-b border-border/40 bg-muted/20">
            <DialogTitle className="text-sm font-semibold text-foreground">
              Academic Record: {selectedStudent?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="p-4">
            {loadingRecord ? (
              <div className="space-y-3">
                <Skeleton className="h-12 w-full rounded-xl" />
                <Skeleton className="h-24 w-full rounded-xl" />
              </div>
            ) : record ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-xl border border-border/60 bg-muted/30 text-xs">
                  <div>
                    <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground block">
                      Student ID
                    </span>
                    <span className="font-semibold text-foreground">
                      {record.student_id}
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground block">
                      Email Address
                    </span>
                    <span className="font-semibold text-foreground truncate block">
                      {record.email}
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground block">
                      Enrolled Date
                    </span>
                    <span className="font-semibold text-foreground">
                      {format(new Date(record.enrolled_at), "MMM d, yyyy")}
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground block">
                      Overall Progress
                    </span>
                    <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                      {record.overall_progress}%
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Activity className="size-3.5 text-primary" /> Assessment History
                  </h3>
                  <div className="rounded-xl border border-border/60 divide-y divide-border/40 overflow-hidden max-h-60 overflow-y-auto">
                    {record.attempts.length === 0 ? (
                      <div className="p-8 text-center text-xs text-muted-foreground italic">
                        No assessments attempted yet.
                      </div>
                    ) : (
                      record.attempts.map((att) => (
                        <div
                          key={att.id}
                          className="p-3 flex items-center justify-between hover:bg-muted/30 transition-colors"
                        >
                          <div className="space-y-0.5 min-w-0 pr-4">
                            <p className="text-xs font-semibold text-foreground truncate">
                              {att.assessment_title}
                            </p>
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                              <span>
                                {att.submitted_at
                                  ? format(
                                      new Date(att.submitted_at),
                                      "MMM d, HH:mm",
                                    )
                                  : "Pending Submission"}
                              </span>
                              <span>•</span>
                              <span className="font-medium">
                                {att.status}
                              </span>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            {att.percentage !== null ? (
                              <p className="text-sm font-bold text-primary tabular-nums">
                                {att.percentage}%
                              </p>
                            ) : (
                              <span className="text-[9px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20 uppercase">
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
          <div className="p-4 border-t border-border/40 bg-muted/20 flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs font-medium rounded-xl border-border/60"
              onClick={() => setRecordDialogOpen(false)}
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Archive Dialog */}
      <Dialog open={archiveDialogOpen} onOpenChange={setArchiveDialogOpen}>
        <DialogContent className="max-w-md p-0 overflow-hidden rounded-2xl bg-card border border-border/60 text-card-foreground shadow-xl">
          <DialogHeader className="p-4 border-b border-border/40 bg-muted/20">
            <DialogTitle className="text-xs font-semibold text-destructive uppercase tracking-wider">
              Archive course
            </DialogTitle>
          </DialogHeader>
          <div className="p-5">
            <p className="text-xs text-muted-foreground leading-relaxed font-normal">
              Archive this course? It disappears from your active courses, but
              all student grades and attempts are kept.
            </p>
          </div>
          <div className="p-4 border-t border-border/40 bg-muted/20 flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs font-medium rounded-xl border-border/60"
              onClick={() => setArchiveDialogOpen(false)}
              disabled={archiving}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="h-8 text-xs font-semibold rounded-xl shadow-2xs"
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
        <AlertDialogContent className="rounded-2xl bg-card border border-border/60 text-card-foreground shadow-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm font-semibold text-foreground">
              Delete Material
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-muted-foreground leading-normal font-normal">
              Are you sure you want to delete this course handout? This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-8 text-xs font-medium rounded-xl border-border/60">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 h-8 text-xs font-semibold rounded-xl shadow-2xs"
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
