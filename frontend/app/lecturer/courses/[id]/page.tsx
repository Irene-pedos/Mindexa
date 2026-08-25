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
  Edit2,
  ImageIcon,
  UploadCloud,
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
import { Label } from "@/components/ui/label";

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
  const [record, setRecord] = useState<StudentCourseRecordResponse | null>(
    null,
  );
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
    } catch (err: any) {
      toast.error(err.message || "Failed to update banner");
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
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-2 border-border/40">
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
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900 truncate">
              {workspace.title}
            </h1>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <Badge
                variant="outline"
                className="text-[9px] font-bold uppercase px-1.5 h-4.5 bg-primary/5 text-primary border-primary/20"
              >
                {workspace.code}
              </Badge>
              <span className="text-xs sm:text-sm text-muted-foreground font-medium">
                Academic Year: {workspace.academic_year}
              </span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto mt-2 sm:mt-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setArchiveDialogOpen(true)}
            className="flex-1 sm:flex-none text-red-600 hover:bg-red-50 hover:text-red-700 border-red-200 h-8 px-3 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-white"
          >
            Archive
          </Button>
          <Button
            asChild
            size="sm"
            className="flex-1 sm:flex-none rounded-lg text-[10px] font-bold uppercase tracking-wider h-8 px-3 shadow-none text-white bg-primary hover:bg-primary/95"
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
          {/* Banner */}
          <div className="relative group rounded-xl overflow-hidden border border-zinc-150 h-32">
            {workspace.banner_image_url ? (
              <div
                className="h-full w-full bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
                style={{
                  backgroundImage: `url(${workspace.banner_image_url})`,
                }}
              />
            ) : (
              <div className="h-full w-full bg-gradient-to-br from-primary/10 via-primary/5 to-zinc-50 flex flex-col items-center justify-center text-primary/30 gap-1.5">
                <BookOpen className="size-8" />
                <span className="text-[10px] font-medium tracking-wider uppercase">
                  No Banner Image
                </span>
              </div>
            )}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-100 sm:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setBannerDialogOpen(true)}
                className="h-7 text-xs font-semibold rounded-lg bg-white/90 text-zinc-900 shadow-sm border border-black/10 hover:bg-white"
              >
                <Edit2 className="size-3 mr-1.5" />{" "}
                {workspace.banner_image_url ? "Change Banner" : "Upload Banner"}
              </Button>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            <Card className="bg-white shadow-sm border border-zinc-150 rounded-xl overflow-hidden">
              <CardContent className="p-3.5 flex items-center justify-between">
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
              <CardContent className="p-3.5 flex items-center justify-between">
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

            <Card className="bg-white shadow-sm border border-zinc-150 rounded-xl overflow-hidden sm:col-span-2 md:col-span-1">
              <CardContent className="p-3.5 flex items-center justify-between">
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
            <CardContent className="p-3.5">
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
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 pt-3 px-3.5 border-b border-zinc-100 bg-zinc-50/50">
              <div className="space-y-0.5">
                <CardTitle className="text-xs font-bold flex items-center gap-1.5 uppercase text-zinc-700 tracking-wider">
                  <Layers className="size-4 text-primary shrink-0" /> Student
                  Cohort
                </CardTitle>
                <CardDescription className="text-[10px] font-medium text-muted-foreground">
                  Directory of students synchronized with this workspace.
                </CardDescription>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/60" />
                <Input
                  placeholder="Filter student names or IDs..."
                  className="pl-9 h-8 text-xs rounded-lg border-zinc-200 bg-white"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table className="min-w-[500px]">
                <TableHeader className="bg-zinc-50/50 border-b border-zinc-100">
                  <TableRow className="h-8 hover:bg-transparent border-none">
                    <TableHead className="text-[9px] font-bold uppercase tracking-wider pl-4 text-zinc-400 w-[120px]">
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
                          <div className="flex flex-col gap-1 w-24 sm:w-28">
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
            <CardHeader className="py-2.5 px-3.5 border-b border-primary/5 bg-primary/[0.02]">
              <CardTitle className="text-[10px] font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                Quick Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 py-3 px-3.5">
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

          <Card className="bg-white shadow-sm border border-zinc-150 rounded-xl overflow-hidden w-full">
            <CardHeader className="flex flex-col py-3 px-3.5 border-b border-zinc-100 bg-zinc-50/50 gap-2.5 w-full">
              <div className="flex items-center justify-between w-full">
                <CardTitle className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 text-zinc-700">
                  <BookOpen className="size-4 text-primary shrink-0" /> Handouts
                  <Badge
                    variant="outline"
                    className="ml-0.5 text-[8px] font-bold py-0 h-4 px-1 bg-zinc-100 border text-zinc-500"
                  >
                    {materials.length}
                  </Badge>
                </CardTitle>
              </div>
              <div className="flex flex-col gap-2 w-full">
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="h-7 w-full rounded-md border border-zinc-200 text-[10px] px-2 bg-white text-zinc-700 outline-none"
                  title="Handout Category"
                >
                  <option value="LECTURE_NOTES">Lecture Notes</option>
                  <option value="SYLLABUS">Syllabus</option>
                  <option value="ASSIGNMENT_SPECS">Assignment Specs</option>
                  <option value="RUBRIC">Rubric</option>
                  <option value="REFERENCE_MATERIALS">
                    Reference Materials
                  </option>
                </select>
                <div className="flex items-center justify-between w-full">
                  <label className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-500 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isMaterialVisible}
                      onChange={(e) => setIsMaterialVisible(e.target.checked)}
                      className="size-3 accent-primary rounded-sm border-zinc-300"
                    />
                    Public
                  </label>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-3 text-[10px] font-bold uppercase tracking-wider rounded-md border-zinc-200 text-zinc-700"
                    disabled={uploading}
                    onClick={() =>
                      document.getElementById("material-upload")?.click()
                    }
                  >
                    {uploading ? (
                      <Loader2 className="size-3.5 animate-spin mr-1.5" />
                    ) : (
                      <Upload className="size-3.5 mr-1.5" />
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
                  <div className="flex flex-col items-center justify-center py-10 px-4 space-y-1.5 text-zinc-400">
                    <FileText className="size-5 opacity-30" />
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-center">
                      No handouts uploaded
                    </p>
                  </div>
                ) : (
                  <AttachmentGroup className="flex-col gap-1.5 p-2.5">
                    {uploading && (
                      <Attachment state="uploading" className="w-full">
                        <AttachmentMedia>
                          <Spinner />
                        </AttachmentMedia>
                        <AttachmentContent>
                          <AttachmentTitle className="text-[10px] font-semibold">
                            Uploading material...
                          </AttachmentTitle>
                          <AttachmentDescription className="text-[9px]">
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
                          <FileCodeIcon className="size-4 text-primary" />
                        </AttachmentMedia>
                        <AttachmentContent className="min-w-0 flex-1">
                          <AttachmentTitle className="text-[10px] font-semibold truncate">
                            {m.display_name || m.original_filename}
                          </AttachmentTitle>
                          <AttachmentDescription className="text-[8px] font-medium truncate">
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
                                  ? "text-emerald-600 font-bold"
                                  : m.processing_status === "FAILED"
                                    ? "text-red-500 font-bold"
                                    : "text-blue-500 font-bold animate-pulse"
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
                            className="size-5 hover:bg-red-50 rounded"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteMaterialId(m.id);
                            }}
                          >
                            <XIcon className="size-3 text-red-500" />
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
        <DialogContent className="max-w-md p-0 overflow-hidden rounded-xl border border-zinc-200 shadow-xl bg-white">
          <DialogHeader className="p-4 border-b bg-zinc-50/50">
            <DialogTitle className="text-xs font-bold text-zinc-800 flex items-center gap-1.5 uppercase tracking-wider">
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
                  ? "border-primary bg-primary/5"
                  : "border-zinc-200 bg-zinc-50 hover:bg-zinc-100 hover:border-zinc-300",
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
                <div className="p-3 bg-white rounded-full shadow-sm border border-zinc-100 mb-1">
                  <UploadCloud className="size-5 text-primary" />
                </div>
                <h3 className="text-xs font-bold text-zinc-700">
                  Click to upload or drag and drop
                </h3>
                <p className="text-[10px] font-medium text-zinc-500">
                  SVG, PNG, JPG or GIF (max 5MB)
                </p>
              </div>
            </label>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-zinc-200" />
              </div>
              <div className="relative flex justify-center text-[9px] font-bold uppercase tracking-wider">
                <span className="bg-white px-2 text-zinc-400">
                  Or use a link
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="bannerUrl"
                className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider"
              >
                Image URL
              </Label>
              <Input
                id="bannerUrl"
                placeholder="https://example.com/banner.jpg"
                className="h-8 text-xs rounded-lg"
                value={bannerUrlInput}
                onChange={handleUrlChange}
              />
            </div>

            {bannerPreview && (
              <div className="space-y-1.5 pt-2 border-t border-zinc-100">
                <Label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider">
                  Preview
                </Label>
                <div
                  className="h-28 rounded-xl bg-cover bg-center border border-zinc-200 shadow-inner"
                  style={{ backgroundImage: `url(${bannerPreview})` }}
                />
              </div>
            )}
          </div>
          <div className="p-4 border-t bg-zinc-50/50 flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-[10px] font-bold uppercase rounded-lg"
              onClick={() => setBannerDialogOpen(false)}
              disabled={updatingBanner}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-8 text-[10px] font-bold uppercase text-white bg-primary hover:bg-primary/95 rounded-lg"
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
                    <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 block">
                      Student ID
                    </span>
                    <span className="font-semibold text-zinc-700">
                      {record.student_id}
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 block">
                      Email Address
                    </span>
                    <span className="font-semibold text-zinc-700 truncate block">
                      {record.email}
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 block">
                      Enrolled Date
                    </span>
                    <span className="font-semibold text-zinc-700">
                      {format(new Date(record.enrolled_at), "MMM d, yyyy")}
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 block">
                      Overall Progress
                    </span>
                    <span className="text-sm font-bold text-emerald-600 tabular-nums">
                      {record.overall_progress}%
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
                    <Activity className="size-4 text-zinc-400" /> Assessment
                    History
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
                              <span className="font-semibold">
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
            <Button
              size="sm"
              className="h-8 text-[10px] font-bold uppercase text-white bg-primary hover:bg-primary/95"
            >
              Export Report
            </Button>
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
            <AlertDialogTitle className="text-sm font-bold text-zinc-800">
              Delete Material
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-zinc-500 leading-normal font-medium">
              Are you sure you want to delete this course handout? This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-8 text-[10px] font-bold uppercase rounded-lg">
              Cancel
            </AlertDialogCancel>
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
