"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronLeft,
  Loader2,
  Upload,
  X,
  FileText,
  GraduationCap,
  Layers,
  Info,
  CheckCircle2,
  BookOpen,
  Library,
  ImageIcon,
  School,
} from "lucide-react";
import { lecturerApi } from "@/lib/api/lecturer";
import { academicApi, TeachingAssignment } from "@/lib/api/academic";
import { toast } from "sonner";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export default function NewWorkspacePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [fetchingAssignments, setFetchingAssignments] = useState(true);

  const [assignments, setAssignments] = useState<TeachingAssignment[]>([]);
  const [selectedAssignment, setSelectedAssignment] =
    useState<TeachingAssignment | null>(null);

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    banner_image_url: "",
  });

  const [courseNotes, setCourseNotes] = useState<File[]>([]);

  useEffect(() => {
    async function loadAssignments() {
      try {
        const data = await academicApi.getMyAssignments();
        setAssignments(Array.isArray(data) ? data : []);
      } catch (err: any) {
        toast.error("Failed to load teaching assignments");
      } finally {
        setFetchingAssignments(false);
      }
    }
    loadAssignments();
  }, []);

  const handleAssignmentChange = (val: string) => {
    const assignment = assignments.find((a) => a.id === val) || null;
    setSelectedAssignment(assignment);
    if (assignment) {
      setFormData((prev) => ({
        ...prev,
        title: `${assignment.course_name} (${assignment.class_section_name || "GLOBAL"})`,
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAssignment) {
      toast.error("Please select an official teaching assignment");
      return;
    }

    setLoading(true);
    try {
      const workspace = await lecturerApi.initializeWorkspace({
        teaching_assignment_id: selectedAssignment.id,
        title: formData.title,
        description: formData.description,
        ...(formData.banner_image_url ? { banner_image_url: formData.banner_image_url } : {}),
      });

      if (courseNotes.length > 0) {
        for (const file of courseNotes) {
          const uploadData = new FormData();
          uploadData.append("file", file);
          uploadData.append("teaching_workspace_id", workspace.id);
          uploadData.append("material_category", "LECTURE_NOTES");
          uploadData.append("is_student_visible", "true");
          await lecturerApi.uploadMaterial(uploadData);
        }
      }

      toast.success("Teaching workspace initialized successfully");
      router.push("/lecturer/courses");
    } catch (err: any) {
      toast.error(err.message || "Failed to initialize workspace");
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setCourseNotes((prev) => [...prev, ...newFiles]);
    }
  };

  const removeFile = (index: number) => {
    setCourseNotes((prev) => prev.filter((_, i) => i !== index));
  };

  if (fetchingAssignments) {
    return (
      <div className="w-full max-w-full 2xl:max-w-[1800px] mx-auto min-w-0 space-y-4 sm:space-y-5 p-1 sm:p-2 lg:p-3 transition-all duration-300 font-sans">
        <div className="flex items-center gap-3 pb-3 border-b border-border/40">
          <Skeleton className="size-8 rounded-lg" />
          <div className="space-y-1">
            <Skeleton className="h-6 w-48 rounded-lg" />
            <Skeleton className="h-3.5 w-72 rounded-lg" />
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
          <Skeleton className="lg:col-span-7 h-[460px] rounded-2xl" />
          <Skeleton className="lg:col-span-5 h-[360px] rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-full 2xl:max-w-[1800px] mx-auto min-w-0 space-y-4 sm:space-y-5 p-1 sm:p-2 lg:p-3 transition-all duration-300 font-sans pb-12">
      {/* Header Container */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/40 pb-3">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            asChild
            className="size-8 rounded-lg border-border/60 bg-card hover:bg-muted/50 shadow-2xs shrink-0"
          >
            <Link href="/lecturer/courses">
              <ChevronLeft className="size-4 text-muted-foreground" />
            </Link>
          </Button>
          <div>
            <h1 className="text-base sm:text-lg font-semibold tracking-tight text-foreground flex items-center gap-2">
              <School className="size-4.5 text-primary" />
              Initialize Course Workspace
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5 font-normal">
              Create a secure pedagogical workspace linked to your official registry teaching assignment.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="text-[10px] font-mono font-medium bg-primary/5 text-primary border-primary/20 rounded-full h-5 px-2"
          >
            Registry Integration
          </Badge>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 items-start">
          {/* Form Configuration Side */}
          <div className="lg:col-span-7 space-y-4">
            <Card className="rounded-2xl border border-border/60 bg-card shadow-2xs overflow-hidden">
              <CardHeader className="py-3 px-4 sm:px-5 border-b border-border/40 bg-muted/20 flex flex-row items-center justify-between">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Layers className="size-3.5 text-primary" /> Workspace Configuration
                </CardTitle>
                <span className="text-[10px] text-muted-foreground font-medium">Step 1 of 2</span>
              </CardHeader>
              <CardContent className="p-4 sm:p-5 space-y-4">
                {/* Select Assignment */}
                <div className="space-y-1.5">
                  <Label htmlFor="assignment" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <BookOpen className="size-3.5 text-primary" /> Official Registry Assignment <span className="text-destructive">*</span>
                  </Label>
                  <Select onValueChange={handleAssignmentChange} value={selectedAssignment?.id}>
                    <SelectTrigger id="assignment" className="h-9 rounded-lg border-border/60 bg-background text-xs font-medium text-foreground focus:ring-1 focus:ring-primary/20">
                      <SelectValue placeholder="Select one of your official assignments..." />
                    </SelectTrigger>
                    <SelectContent className="rounded-lg border-border/60 bg-popover shadow-lg">
                      {assignments.map((a) => (
                        <SelectItem
                          key={a.id}
                          value={a.id}
                          className="text-xs font-medium cursor-pointer"
                        >
                          {a.course_code} • {a.course_name} ({a.class_section_name || "GLOBAL"})
                        </SelectItem>
                      ))}
                      {assignments.length === 0 && (
                        <SelectItem value="none" disabled className="text-xs text-muted-foreground">
                          No teaching assignments found
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground">
                    Teaching assignments are pre-authorized by university academic administration.
                  </p>
                </div>

                {/* Title */}
                <div className="space-y-1.5">
                  <Label htmlFor="title" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <FileText className="size-3.5 text-primary" /> Workspace Display Title <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="title"
                    placeholder="e.g. Algorithms & Complexity - Year 2"
                    required
                    className="h-9 rounded-lg border-border/60 bg-background text-xs font-semibold text-foreground placeholder:text-muted-foreground disabled:opacity-60"
                    value={formData.title}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        title: e.target.value,
                      }))
                    }
                    disabled={!selectedAssignment}
                  />
                </div>

                {/* Description */}
                <div className="space-y-1.5">
                  <Label htmlFor="desc" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Info className="size-3.5 text-primary" /> Description & Learning Goals
                  </Label>
                  <Textarea
                    id="desc"
                    placeholder="Provide a syllabus summary, course overview, or guidance for students..."
                    className="min-h-[100px] rounded-lg border-border/60 bg-background p-3 text-xs font-normal text-foreground placeholder:text-muted-foreground resize-none disabled:opacity-60"
                    value={formData.description}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        description: e.target.value,
                      }))
                    }
                    disabled={!selectedAssignment}
                  />
                </div>

                {/* Banner Image URL */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="banner" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <ImageIcon className="size-3.5 text-primary" /> Course Banner Image URL
                    </Label>
                    <Badge variant="outline" className="text-[9px] font-semibold text-muted-foreground bg-muted/30 border-border/60">
                      Optional
                    </Badge>
                  </div>
                  <Input
                    id="banner"
                    type="url"
                    placeholder="https://images.unsplash.com/photo-..."
                    className="h-9 rounded-lg border-border/60 bg-background text-xs font-medium text-foreground placeholder:text-muted-foreground disabled:opacity-60"
                    value={formData.banner_image_url}
                    onChange={(e) => setFormData((prev) => ({ ...prev, banner_image_url: e.target.value }))}
                    disabled={!selectedAssignment}
                  />
                  {formData.banner_image_url && (
                    <div
                      className="h-24 rounded-xl bg-cover bg-center border border-border/60 overflow-hidden relative shadow-2xs"
                      style={{ backgroundImage: `url(${formData.banner_image_url})` }}
                    />
                  )}
                  <p className="text-[10px] text-muted-foreground">
                    A banner image helps students visually recognize the course space on their dashboard.
                  </p>
                </div>

                {/* Materials Uploader */}
                <div className="pt-3 border-t border-border/40 space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <Upload className="size-3.5 text-primary" /> Course Handouts & Syllabus
                    </Label>
                    <Badge variant="outline" className="text-[9px] font-semibold text-muted-foreground bg-muted/30 border-border/60">
                      Optional
                    </Badge>
                  </div>

                  <div className="flex items-center gap-3 flex-wrap">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => document.getElementById("file-upload")?.click()}
                      className="gap-1.5 rounded-lg h-8 px-3 text-xs font-medium border-border/60 bg-card hover:bg-muted/50 text-foreground shadow-2xs"
                      disabled={!selectedAssignment}
                    >
                      <Upload className="size-3.5 text-primary" /> Upload Handout
                    </Button>
                    <input
                      id="file-upload"
                      type="file"
                      multiple
                      className="hidden"
                      onChange={handleFileChange}
                    />
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-normal">
                      <Info className="size-3 text-muted-foreground shrink-0" /> Support PDF, DOCX, slides (auto-indexed for enrolled students)
                    </div>
                  </div>

                  {courseNotes.length > 0 && (
                    <div className="grid grid-cols-1 gap-2 pt-1">
                      {courseNotes.map((file, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between p-2.5 bg-muted/30 rounded-xl border border-border/60"
                        >
                          <div className="flex items-center gap-2 truncate">
                            <FileText className="size-3.5 text-primary shrink-0" />
                            <span className="truncate text-xs font-medium text-foreground">
                              {file.name}
                            </span>
                            <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                              ({(file.size / 1024).toFixed(0)} KB)
                            </span>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg"
                            onClick={() => removeFile(i)}
                          >
                            <X className="size-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Audit & Registry Side */}
          <div className="lg:col-span-5 space-y-4">
            <Card className="rounded-2xl border border-border/60 bg-card shadow-2xs overflow-hidden">
              <CardHeader className="py-3 px-4 sm:px-5 border-b border-border/40 bg-muted/20 flex flex-row items-center justify-between">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Library className="size-3.5 text-primary" /> Registry Verification
                </CardTitle>
                {selectedAssignment ? (
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[9px] font-semibold">
                    Verified
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-muted text-muted-foreground border-border/60 text-[9px] font-semibold">
                    Awaiting Selection
                  </Badge>
                )}
              </CardHeader>
              <CardContent className="p-4 sm:p-5">
                {!selectedAssignment ? (
                  <div className="py-12 text-center text-xs text-muted-foreground font-medium space-y-2.5">
                    <div className="size-10 rounded-xl bg-muted/40 border border-border/40 flex items-center justify-center mx-auto text-muted-foreground">
                      <GraduationCap className="size-5" />
                    </div>
                    <p className="font-semibold text-foreground text-xs">No Assignment Selected</p>
                    <p className="text-[11px] text-muted-foreground max-w-xs mx-auto">
                      Select an official teaching assignment on the left to verify registry records and cohort details.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-2.5 p-3.5 rounded-xl border border-border/60 bg-muted/30 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Institution</span>
                        <span className="font-semibold text-foreground text-right">{selectedAssignment.institution_name}</span>
                      </div>
                      <div className="border-t border-border/40 pt-2 flex items-center justify-between">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Department</span>
                        <span className="font-semibold text-foreground text-right">{selectedAssignment.department_name}</span>
                      </div>
                      <div className="border-t border-border/40 pt-2 flex items-center justify-between">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Academic Year</span>
                        <span className="font-semibold text-foreground">{selectedAssignment.academic_year}</span>
                      </div>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="flex items-center justify-between border-b border-border/40 pb-2">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Course Code</span>
                        <Badge variant="outline" className="font-mono font-semibold text-[10px] bg-primary/10 text-primary border-primary/20">
                          {selectedAssignment.course_code}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between border-b border-border/40 pb-2">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Target Cohort / Section</span>
                        <Badge variant="outline" className="font-semibold text-[10px] bg-muted text-foreground border-border/60">
                          {selectedAssignment.class_section_name || "GLOBAL"}
                        </Badge>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2">
                      <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span className="text-[11px] font-medium leading-tight">
                        Course parameters and student enrollment are verified against university records.
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>

              {/* Action Triggers */}
              <div className="p-4 bg-muted/20 border-t border-border/40 flex flex-col gap-2">
                <Button
                  type="submit"
                  disabled={loading || !selectedAssignment}
                  className="w-full h-9 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs shadow-2xs gap-1.5 transition-all"
                >
                  {loading ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="size-3.5" />
                  )}
                  {loading ? "Provisioning Workspace..." : "Initialize Workspace"}
                </Button>
                <Button
                  variant="outline"
                  type="button"
                  asChild
                  className="w-full h-8.5 rounded-xl border-border/60 bg-transparent hover:bg-muted/50 text-muted-foreground text-xs font-medium"
                >
                  <Link href="/lecturer/courses">Cancel</Link>
                </Button>
              </div>
            </Card>

            {/* Informational Guidance Callout */}
            <div className="rounded-xl border border-border/50 bg-muted/20 p-3.5 space-y-1.5 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5 font-semibold text-foreground text-xs">
                <Info className="size-3.5 text-primary shrink-0" />
                Institutional Oversight
              </div>
              <p className="text-[11px] leading-relaxed font-normal">
                Initializing creates an active workspace where you can deploy proctored assessments, distribute syllabus materials, and supervise submissions with real-time AI integrity telemetry.
              </p>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
