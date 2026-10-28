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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Trash2,
  Download,
  Eye,
  EyeOff,
  GraduationCap,
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
import { Label } from "@/components/ui/label";

const errorText = (err: unknown, fallback: string): string =>
  err instanceof Error && err.message ? err.message : fallback;

const MATERIAL_CATEGORIES: { value: string; label: string }[] = [
  { value: "LECTURE_NOTES", label: "Lecture Notes" },
  { value: "SYLLABUS", label: "Syllabus" },
  { value: "ASSIGNMENT_SPECS", label: "Assignment Specs" },
  { value: "RUBRIC", label: "Rubric" },
  { value: "REFERENCE_MATERIALS", label: "Reference Material" },
];

export default function LecturerWorkspaceDetail() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [workspace, setWorkspace] = useState<WorkspaceDetail | null>(null);
  const [materials, setMaterials] = useState<LecturerMaterialResponse[]>([]);
  const [loading, setLoading] = useState(true);

  // Handout upload state
  const [uploading, setUploading] = useState(false);
  const [isMaterialVisible, setIsMaterialVisible] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState("LECTURE_NOTES");
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [deleteMaterialId, setDeleteMaterialId] = useState<string | null>(null);

  // Student Record Dialog
  const [recordDialogOpen, setRecordDialogOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [record, setRecord] = useState<StudentCourseRecordResponse | null>(null);
  const [loadingRecord, setLoadingRecord] = useState(false);

  // Archive & Banner Dialogs
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const [bannerDialogOpen, setBannerDialogOpen] = useState(false);
  const [bannerUrlInput, setBannerUrlInput] = useState("");
  const [updatingBanner, setUpdatingBanner] = useState(false);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    try {
      const data = await lecturerApi.getWorkspaceDetail(id);
      setWorkspace(data);
      const materialsData = await lecturerApi.getWorkspaceMaterials(id);
      setMaterials(materialsData);
    } catch (err: unknown) {
      toast.error(errorText(err, "Failed to load course details"));
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
      toast.success("Course archived successfully");
      router.push("/lecturer/courses");
    } catch (err: unknown) {
      toast.error(errorText(err, "Failed to archive course"));
      setArchiving(false);
    }
  };

  const handleUpdateBanner = async () => {
    setUpdatingBanner(true);
    try {
      let finalUrl = bannerUrlInput;
      if (bannerFile) {
        finalUrl = (await lecturerApi.uploadImage(bannerFile)).url;
      }
      if (!finalUrl && !bannerFile) {
        toast.error("Please provide an image URL or upload a file");
        setUpdatingBanner(false);
        return;
      }
      const updated = await lecturerApi.updateWorkspace(id, {
        banner_image_url: finalUrl,
      });
      setWorkspace(updated);
      toast.success("Course banner updated");
      setBannerDialogOpen(false);
      setBannerFile(null);
      setBannerPreview("");
      setBannerUrlInput("");
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

  const handleUploadMaterial = async () => {
    if (!selectedFile) {
      toast.error("Please select a file to upload");
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("teaching_workspace_id", id);
      formData.append("material_category", selectedCategory);
      formData.append("is_student_visible", String(isMaterialVisible));
      await lecturerApi.uploadMaterial(formData);
      toast.success("Handout uploaded successfully");
      const materialsData = await lecturerApi.getWorkspaceMaterials(id);
      setMaterials(materialsData);
      setUploadDialogOpen(false);
      setSelectedFile(null);
    } catch (err: unknown) {
      toast.error(errorText(err, "Upload failed"));
    } finally {
      setUploading(false);
    }
  };

  const confirmDeleteMaterial = async () => {
    if (!deleteMaterialId) return;
    try {
      await lecturerApi.deleteMaterial(deleteMaterialId);
      toast.success("Handout removed");
      setMaterials((prev) => prev.filter((m) => m.id !== deleteMaterialId));
    } catch (err: unknown) {
      toast.error(errorText(err, "Failed to delete handout"));
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
    } catch {
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
      <div className="w-full max-w-full min-w-0 space-y-5 transition-all duration-300">
        <div className="flex items-center justify-between pb-4 border-b border-border/40">
          <div className="flex items-center gap-3">
            <Skeleton className="size-8 rounded-lg" />
            <div className="space-y-1.5">
              <Skeleton className="h-6 w-48 rounded-lg" />
              <Skeleton className="h-3.5 w-32 rounded-lg" />
            </div>
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-8 w-20 rounded-lg" />
            <Skeleton className="h-8 w-32 rounded-lg" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-8 xl:col-span-9 space-y-4">
            <Skeleton className="h-72 w-full rounded-2xl" />
          </div>
          <div className="lg:col-span-4 xl:col-span-3 space-y-4">
            <Skeleton className="h-64 w-full rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="py-20 text-center text-muted-foreground flex flex-col items-center justify-center gap-3">
        <div className="size-12 rounded-2xl bg-muted/40 border border-border/60 flex items-center justify-center text-muted-foreground">
          <Database className="size-6" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">Course not found</p>
          <p className="text-xs text-muted-foreground max-w-sm">
            This course may have been archived or is not attached to your account.
          </p>
        </div>
        <Button variant="outline" size="sm" asChild className="mt-2 text-xs rounded-lg border-border/60">
          <Link href="/lecturer/courses">Back to my courses</Link>
        </Button>
      </div>
    );
  }

  const academicPlacement = [
    workspace.institution_name,
    workspace.department_name,
    workspace.option_name,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="w-full max-w-full min-w-0 space-y-5 transition-all duration-300 pb-10">
      {/* Top Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/40 pb-4">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="outline"
            size="icon"
            asChild
            className="size-8.5 rounded-lg shrink-0 border-border/70 bg-card hover:bg-muted/50 shadow-2xs"
          >
            <Link href="/lecturer/courses">
              <ChevronLeft className="size-4 text-muted-foreground" />
            </Link>
          </Button>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg sm:text-xl font-bold tracking-tight text-foreground truncate">
                {workspace.title}
              </h1>
              <Badge
                variant="outline"
                className="text-[10px] font-mono font-semibold px-2 h-5 bg-primary/10 text-primary border-primary/20 rounded-md"
              >
                {workspace.code}
              </Badge>
              <span className="text-xs text-muted-foreground font-normal">
                {workspace.academic_year}
              </span>
            </div>
            {academicPlacement && (
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                {academicPlacement}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setBannerDialogOpen(true)}
            className="h-8.5 px-3 rounded-lg text-xs font-medium border-border/70 bg-card hover:bg-muted/50 text-foreground"
          >
            <ImageIcon className="size-3.5 mr-1.5 text-muted-foreground" />
            Banner
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setArchiveDialogOpen(true)}
            className="h-8.5 px-3 rounded-lg text-xs font-medium border-destructive/20 text-destructive bg-card hover:bg-destructive/10"
          >
            Archive
          </Button>
          <Button
            asChild
            size="sm"
            className="h-8.5 px-3.5 rounded-lg text-xs font-semibold shadow-xs text-primary-foreground bg-primary hover:bg-primary/90"
          >
            <Link href={`/lecturer/assessments/new?workspace=${id}`}>
              <Plus className="mr-1.5 size-3.5" /> New Assessment
            </Link>
          </Button>
        </div>
      </div>

      {/* Course Hero Banner (When Available) */}
      {workspace.banner_image_url && (
        <div className="relative rounded-2xl overflow-hidden border border-border/60 h-28 sm:h-32 bg-card shadow-2xs group w-full min-w-0">
          <div
            className="h-full w-full bg-cover bg-center transition-transform duration-500 group-hover:scale-102"
            style={{ backgroundImage: `url(${workspace.banner_image_url})` }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/40 to-transparent p-4 flex items-end justify-between">
            <span className="text-xs font-semibold text-foreground font-mono">
              {workspace.code} &bull; {workspace.class_name}
            </span>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setBannerDialogOpen(true)}
              className="h-7 text-xs font-medium rounded-lg bg-card/90 text-foreground shadow-xs border border-border/60"
            >
              <Edit2 className="size-3 mr-1.5" /> Edit Banner
            </Button>
          </div>
        </div>
      )}

      {/* KPI Stats Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full min-w-0">
        <div className="p-3.5 rounded-xl border border-border/60 bg-card shadow-2xs flex items-center justify-between min-w-0">
          <div className="space-y-0.5 min-w-0">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Class Average
            </p>
            <p className="text-xl font-bold tracking-tight text-primary tabular-nums">
              {workspace.performance_avg > 0 ? `${workspace.performance_avg.toFixed(1)}%` : "—"}
            </p>
          </div>
          <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
            <TrendingUp className="size-4" />
          </div>
        </div>

        <div className="p-3.5 rounded-xl border border-border/60 bg-card shadow-2xs flex items-center justify-between min-w-0">
          <div className="space-y-0.5 min-w-0">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Enrolled Students
            </p>
            <p className="text-xl font-bold tracking-tight text-foreground tabular-nums">
              {workspace.student_count}
            </p>
          </div>
          <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
            <Users className="size-4" />
          </div>
        </div>

        <div className="p-3.5 rounded-xl border border-border/60 bg-card shadow-2xs flex items-center justify-between min-w-0">
          <div className="space-y-0.5 min-w-0">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Assigned Cohort
            </p>
            <p className="text-sm font-bold truncate text-foreground mt-0.5">
              {workspace.class_name === "GLOBAL" ? "All Cohorts" : workspace.class_name}
            </p>
          </div>
          <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
            <Building2 className="size-4" />
          </div>
        </div>
      </div>

      {/* Main Grid: Student Cohort (Left) & Handouts / Resources (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 w-full min-w-0 items-start">
        {/* Left Column: Student Cohort Roster */}
        <div className="lg:col-span-8 xl:col-span-9 w-full min-w-0 space-y-4">
          <Card className="rounded-2xl border border-border/70 bg-card shadow-2xs overflow-hidden w-full min-w-0">
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border-b border-border/40 bg-muted/20">
              <div className="space-y-0.5">
                <CardTitle className="text-xs font-semibold flex items-center gap-1.5 uppercase text-muted-foreground tracking-wider">
                  <Layers className="size-3.5 text-primary shrink-0" />
                  Student Cohort ({workspace.roster?.length || 0})
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  View individual progress and click any student to review their assessment attempts.
                </CardDescription>
              </div>

              <div className="relative w-full sm:w-60">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <Input
                  placeholder="Filter name or ID..."
                  className="pl-8 h-8 text-xs rounded-lg border-border/70 bg-card text-foreground placeholder:text-muted-foreground"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </CardHeader>

            <CardContent className="p-0 overflow-x-auto w-full min-w-0">
              <Table className="w-full min-w-[500px]">
                <TableHeader className="bg-muted/30 border-b border-border/40">
                  <TableRow className="h-8 hover:bg-transparent border-none">
                    <TableHead className="text-[10px] font-semibold uppercase tracking-wider pl-4 text-muted-foreground w-[120px]">
                      Student ID
                    </TableHead>
                    <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Student Details
                    </TableHead>
                    <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground w-36">
                      Progress
                    </TableHead>
                    <TableHead className="text-right text-[10px] font-semibold uppercase tracking-wider pr-4 text-muted-foreground w-28">
                      Record
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
                        {workspace.roster?.length === 0
                          ? "No students enrolled in this course yet."
                          : "No students matching your filter."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRoster.map((student) => (
                      <TableRow
                        key={student.id}
                        className="hover:bg-muted/30 h-11 border-b border-border/40 transition-colors cursor-pointer group"
                        onClick={() => openRecord(student.id, student.name)}
                      >
                        <TableCell className="font-mono text-xs font-medium text-muted-foreground pl-4">
                          {student.student_id}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-semibold text-xs text-foreground group-hover:text-primary transition-colors">
                              {student.name}
                            </span>
                            <span className="text-[11px] text-muted-foreground truncate">
                              {student.email}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-emerald-500 rounded-full"
                                style={{ width: `${student.progress}%` }}
                              />
                            </div>
                            <span className="text-xs font-semibold tabular-nums text-foreground">
                              {student.progress}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right pr-4">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2.5 text-xs font-medium rounded-lg text-primary hover:bg-primary/10"
                          >
                            View
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

        {/* Right Column: Handouts & Course Material */}
        <div className="lg:col-span-4 xl:col-span-3 w-full min-w-0 space-y-4">
          <Card className="rounded-2xl border border-border/70 bg-card shadow-2xs overflow-hidden w-full min-w-0">
            <CardHeader className="p-3.5 border-b border-border/40 bg-muted/20 flex flex-row items-center justify-between">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 text-muted-foreground">
                <BookOpen className="size-3.5 text-primary shrink-0" />
                Handouts ({materials.length})
              </CardTitle>

              <Button
                size="sm"
                onClick={() => setUploadDialogOpen(true)}
                className="h-7 text-xs font-semibold px-2.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 shadow-2xs"
              >
                <Upload className="size-3 mr-1" />
                Upload
              </Button>
            </CardHeader>

            <CardContent className="p-2 w-full min-w-0">
              <ScrollArea className="max-h-80">
                {materials.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 px-4 text-center space-y-1.5 text-muted-foreground">
                    <FileText className="size-5 opacity-40 text-primary" />
                    <p className="text-xs font-semibold text-foreground">No handouts uploaded</p>
                    <p className="text-[11px] text-muted-foreground">
                      Upload syllabi, lecture notes, or rubrics for your class.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1.5 w-full min-w-0">
                    {materials.map((m) => (
                      <div
                        key={m.id}
                        className="p-2.5 rounded-xl border border-border/60 bg-background hover:bg-muted/30 transition-colors flex items-center justify-between gap-2 min-w-0 group"
                      >
                        <div
                          className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer"
                          onClick={async () => {
                            try {
                              await lecturerApi.downloadMaterial(m.id, m.original_filename);
                              toast.success("Download started");
                            } catch {
                              toast.error("Failed to download");
                            }
                          }}
                        >
                          <div className="size-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                            <FileCodeIcon className="size-3.5" />
                          </div>
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <p className="text-xs font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                              {m.display_name || m.original_filename}
                            </p>
                            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-mono">
                              <span>{(m.file_size_bytes / (1024 * 1024)).toFixed(1)} MB</span>
                              <span>&bull;</span>
                              <span>{m.is_student_visible ? "Visible" : "Hidden"}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 text-muted-foreground hover:text-foreground rounded-lg"
                            title="Download handout"
                            onClick={async () => {
                              try {
                                await lecturerApi.downloadMaterial(m.id, m.original_filename);
                                toast.success("Download started");
                              } catch {
                                toast.error("Failed to download");
                              }
                            }}
                          >
                            <Download className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 text-destructive hover:bg-destructive/10 rounded-lg"
                            title="Delete handout"
                            onClick={() => setDeleteMaterialId(m.id)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Upload Handout Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent className="max-w-md p-0 overflow-hidden rounded-2xl border border-border/70 bg-card text-card-foreground shadow-xl">
          <DialogHeader className="p-4 border-b border-border/40 bg-muted/20">
            <DialogTitle className="text-xs font-semibold uppercase tracking-wider text-foreground flex items-center gap-1.5">
              <Upload className="size-4 text-primary" /> Upload Course Handout
            </DialogTitle>
          </DialogHeader>

          <div className="p-4 space-y-4 text-xs">
            {/* Category Select */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground">Material Category</Label>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="h-9 rounded-lg border-border/70 bg-background text-xs">
                  <SelectValue placeholder="Select category..." />
                </SelectTrigger>
                <SelectContent>
                  {MATERIAL_CATEGORIES.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value} className="text-xs">
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Visibility Toggle */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-muted/30 border border-border/60">
              <div className="space-y-0.5">
                <span className="text-xs font-semibold text-foreground block">Student Visibility</span>
                <span className="text-[11px] text-muted-foreground block">
                  Allow enrolled students to download this material
                </span>
              </div>
              <Button
                type="button"
                variant={isMaterialVisible ? "default" : "outline"}
                size="sm"
                onClick={() => setIsMaterialVisible(!isMaterialVisible)}
                className="h-7 text-xs font-medium rounded-lg gap-1.5"
              >
                {isMaterialVisible ? (
                  <>
                    <Eye className="size-3" /> Visible
                  </>
                ) : (
                  <>
                    <EyeOff className="size-3" /> Hidden
                  </>
                )}
              </Button>
            </div>

            {/* File Selector */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground">Handout File</Label>
              <Input
                type="file"
                className="h-9 text-xs rounded-lg border-border/70 bg-background file:text-xs file:font-semibold file:text-primary cursor-pointer"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    setSelectedFile(e.target.files[0]);
                  }
                }}
              />
            </div>
          </div>

          <div className="p-4 border-t border-border/40 bg-muted/20 flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs font-medium rounded-lg border-border/70"
              onClick={() => {
                setUploadDialogOpen(false);
                setSelectedFile(null);
              }}
              disabled={uploading}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs font-semibold text-primary-foreground bg-primary hover:bg-primary/90 rounded-lg shadow-2xs"
              onClick={handleUploadMaterial}
              disabled={uploading || !selectedFile}
            >
              {uploading ? (
                <>
                  <Loader2 className="size-3.5 animate-spin mr-1.5" />
                  Uploading...
                </>
              ) : (
                "Upload Handout"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Banner Edit Dialog */}
      <Dialog open={bannerDialogOpen} onOpenChange={setBannerDialogOpen}>
        <DialogContent className="max-w-md p-0 overflow-hidden rounded-2xl border border-border/70 shadow-xl bg-card text-card-foreground">
          <DialogHeader className="p-4 border-b border-border/40 bg-muted/20">
            <DialogTitle className="text-xs font-semibold text-foreground flex items-center gap-1.5 uppercase tracking-wider">
              <ImageIcon className="size-4 text-primary" /> Update Course Banner
            </DialogTitle>
          </DialogHeader>

          <div className="p-4 space-y-4">
            <label
              htmlFor="banner-upload"
              className={cn(
                "relative flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-xl transition-colors text-center cursor-pointer overflow-hidden group",
                isDragging
                  ? "border-primary bg-primary/10"
                  : "border-border/70 bg-muted/20 hover:bg-muted/40",
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

              <div className="relative z-10 flex flex-col items-center gap-1.5">
                <div className="p-2.5 bg-card rounded-full shadow-xs border border-border/70 text-primary">
                  <UploadCloud className="size-4.5" />
                </div>
                <h3 className="text-xs font-semibold text-foreground">
                  Click to upload or drag image
                </h3>
                <p className="text-[10px] text-muted-foreground">
                  SVG, PNG, JPG or WebP (max 5MB)
                </p>
              </div>
            </label>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground">Or Image URL</Label>
              <Input
                placeholder="https://..."
                className="h-8.5 text-xs rounded-lg border-border/70 bg-background text-foreground"
                value={bannerUrlInput}
                onChange={(e) => {
                  setBannerUrlInput(e.target.value);
                  setBannerFile(null);
                  setBannerPreview(e.target.value);
                }}
              />
            </div>
          </div>

          <div className="p-4 border-t border-border/40 bg-muted/20 flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs font-medium rounded-lg border-border/70"
              onClick={() => setBannerDialogOpen(false)}
              disabled={updatingBanner}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs font-semibold text-primary-foreground bg-primary hover:bg-primary/90 rounded-lg shadow-2xs"
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

      {/* Student Record Dialog */}
      <Dialog open={recordDialogOpen} onOpenChange={setRecordDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] p-0 overflow-hidden rounded-2xl border border-border/70 shadow-xl bg-card text-card-foreground">
          <DialogHeader className="p-4 border-b border-border/40 bg-muted/20">
            <DialogTitle className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <GraduationCap className="size-4 text-primary" />
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
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 rounded-xl border border-border/60 bg-muted/30 text-xs">
                  <div>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block">
                      Student ID
                    </span>
                    <span className="font-semibold text-foreground font-mono">
                      {record.student_id}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block">
                      Email
                    </span>
                    <span className="font-semibold text-foreground truncate block">
                      {record.email}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block">
                      Enrolled Date
                    </span>
                    <span className="font-semibold text-foreground">
                      {record.enrolled_at ? format(new Date(record.enrolled_at), "MMM d, yyyy") : "N/A"}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block">
                      Progress
                    </span>
                    <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                      {record.overall_progress}%
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Activity className="size-3.5 text-primary" />
                    Assessment Attempts ({record.attempts?.length || 0})
                  </h3>

                  <div className="rounded-xl border border-border/60 divide-y divide-border/40 overflow-hidden max-h-56 overflow-y-auto">
                    {record.attempts?.length === 0 ? (
                      <div className="p-6 text-center text-xs text-muted-foreground italic">
                        No assessments recorded for this student yet.
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
                                  ? format(new Date(att.submitted_at), "MMM d, HH:mm")
                                  : "Pending Submission"}
                              </span>
                              <span>&bull;</span>
                              <span className="font-medium">{att.status}</span>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            {att.percentage !== null ? (
                              <p className="text-sm font-bold text-primary tabular-nums">
                                {att.percentage}%
                              </p>
                            ) : (
                              <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20 uppercase">
                                In Progress
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

          <div className="p-3 border-t border-border/40 bg-muted/20 flex justify-end">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs font-medium rounded-lg border-border/70"
              onClick={() => setRecordDialogOpen(false)}
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Archive Dialog */}
      <Dialog open={archiveDialogOpen} onOpenChange={setArchiveDialogOpen}>
        <DialogContent className="max-w-md p-0 overflow-hidden rounded-2xl bg-card border border-border/70 text-card-foreground shadow-xl">
          <DialogHeader className="p-4 border-b border-border/40 bg-muted/20">
            <DialogTitle className="text-xs font-semibold text-destructive uppercase tracking-wider">
              Archive Course
            </DialogTitle>
          </DialogHeader>
          <div className="p-4 text-xs text-muted-foreground leading-relaxed">
            Are you sure you want to archive this course? It will be removed from your active courses list, but student grades and submission histories are securely preserved.
          </div>
          <div className="p-3 border-t border-border/40 bg-muted/20 flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs font-medium rounded-lg border-border/70"
              onClick={() => setArchiveDialogOpen(false)}
              disabled={archiving}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="h-8 text-xs font-semibold rounded-lg shadow-2xs"
              onClick={handleArchiveWorkspace}
              disabled={archiving}
            >
              {archiving ? <Loader2 className="size-3.5 animate-spin" /> : "Confirm Archive"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Material Alert Dialog */}
      <AlertDialog
        open={!!deleteMaterialId}
        onOpenChange={(o) => !o && setDeleteMaterialId(null)}
      >
        <AlertDialogContent className="rounded-2xl bg-card border border-border/70 text-card-foreground shadow-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm font-semibold text-foreground">
              Delete Course Handout
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-muted-foreground leading-normal">
              Are you sure you want to permanently delete this material? Students will no longer have access to download it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-8 text-xs font-medium rounded-lg border-border/70">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 h-8 text-xs font-semibold rounded-lg shadow-2xs"
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
