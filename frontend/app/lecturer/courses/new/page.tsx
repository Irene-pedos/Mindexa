// app/lecturer/courses/new/page.tsx
"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  BookOpen,
  Building2,
  ChevronLeft,
  FileCodeIcon,
  FileText,
  FolderPlus,
  GraduationCap,
  ImageIcon,
  Layers,
  Loader2,
  Plus,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { academicApi, TeachingAssignment } from "@/lib/api/academic";
import { lecturerApi } from "@/lib/api/lecturer";

function describe(a: TeachingAssignment): string {
  const where = [a.class_group_name, a.class_section_name]
    .filter(Boolean)
    .join(" · ");
  return [a.course_code, a.course_name, where && `(${where})`]
    .filter(Boolean)
    .join(" ");
}

function NewCourseForm() {
  const router = useRouter();
  const requested = useSearchParams().get("assignment") ?? "";

  const [assignments, setAssignments] = useState<TeachingAssignment[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [assignmentId, setAssignmentId] = useState(requested);
  const [titleEdit, setTitleEdit] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    academicApi
      .getMyAssignments()
      .then((data) => setAssignments(Array.isArray(data) ? data : []))
      .catch(() => toast.error("Could not load your teaching assignments"))
      .finally(() => setLoadingList(false));
  }, []);

  // Only assignments that have a course and no course workspace yet can be set up.
  const available = useMemo(
    () => assignments.filter((a) => a.course_id && !a.workspace_id),
    [assignments],
  );
  const selected = available.find((a) => a.id === assignmentId) ?? null;
  const alreadySetUp = assignments.find(
    (a) => a.id === requested && a.workspace_id,
  );

  // The title follows the chosen assignment until the lecturer types their own.
  const title =
    titleEdit ??
    (selected
      ? selected.class_section_name
        ? `${selected.course_name} (${selected.class_section_name})`
        : (selected.course_name ?? "")
      : "");

  const pick = (id: string) => {
    setAssignmentId(id);
    setTitleEdit(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) {
      toast.error("Please choose which teaching assignment to set up");
      return;
    }
    setSaving(true);
    try {
      const workspace = await lecturerApi.initializeWorkspace({
        teaching_assignment_id: selected.id,
        title: title.trim() || undefined,
        description: description.trim() || undefined,
        banner_image_url: bannerUrl.trim() || undefined,
      });

      let failed = 0;
      for (const file of files) {
        const body = new FormData();
        body.append("file", file);
        body.append("teaching_workspace_id", workspace.id);
        body.append("material_category", "LECTURE_NOTES");
        body.append("is_student_visible", "true");
        try {
          await lecturerApi.uploadMaterial(body);
        } catch {
          failed += 1;
        }
      }
      if (failed > 0) {
        toast.warning(
          `Course created, but ${failed} handout${failed > 1 ? "s" : ""} failed to upload. You can re-upload from the course page.`,
        );
      } else {
        toast.success("Course workspace created successfully");
      }
      router.push(`/lecturer/courses/${workspace.id}`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not set up the course",
      );
      setSaving(false);
    }
  };

  if (loadingList) {
    return (
      <div className="w-full max-w-full min-w-0 space-y-5 transition-all duration-300">
        <div className="flex items-center gap-3 pb-4 border-b border-border/40">
          <Skeleton className="size-8 rounded-lg" />
          <div className="space-y-1.5">
            <Skeleton className="h-6 w-48 rounded-lg" />
            <Skeleton className="h-3.5 w-64 rounded-lg" />
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <Skeleton className="lg:col-span-8 h-96 rounded-2xl" />
          <Skeleton className="lg:col-span-4 h-96 rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-full min-w-0 space-y-5 transition-all duration-300 pb-10">
      {/* Page Header */}
      <div className="flex items-center justify-between gap-3 border-b border-border/40 pb-4">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="outline"
            size="icon"
            asChild
            className="size-8.5 rounded-lg shrink-0 border-border/70 bg-card hover:bg-muted/50 shadow-2xs"
          >
            <Link href="/lecturer/assignments" aria-label="Back to assignments">
              <ChevronLeft className="size-4 text-muted-foreground" />
            </Link>
          </Button>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-bold tracking-tight text-foreground truncate">
              Set Up Course Workspace
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground truncate">
              Initialize a digital course space for your class roster, handouts, and assessments.
            </p>
          </div>
        </div>
      </div>

      {alreadySetUp ? (
        <Card className="rounded-2xl border border-border/70 bg-card shadow-2xs w-full min-w-0">
          <CardContent className="space-y-3 py-12 text-center flex flex-col items-center">
            <div className="size-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
              <FolderPlus className="size-6" />
            </div>
            <div className="space-y-1 max-w-md">
              <h3 className="text-sm font-semibold text-foreground">
                Course workspace already exists
              </h3>
              <p className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{describe(alreadySetUp)}</span> has already been configured.
              </p>
            </div>
            <Button asChild size="sm" className="h-8.5 px-4 rounded-lg text-xs font-semibold">
              <Link href={`/lecturer/courses/${alreadySetUp.workspace_id}`}>
                Open Course Workspace
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : available.length === 0 ? (
        <Card className="rounded-2xl border border-border/70 bg-card shadow-2xs w-full min-w-0">
          <CardContent className="space-y-3 py-12 text-center flex flex-col items-center">
            <div className="size-12 rounded-2xl bg-muted/40 border border-border/60 text-muted-foreground flex items-center justify-center">
              <BookOpen className="size-6" />
            </div>
            <div className="space-y-1 max-w-md">
              <h3 className="text-sm font-semibold text-foreground">
                No teaching assignments pending setup
              </h3>
              <p className="text-xs text-muted-foreground">
                {assignments.length === 0
                  ? "You have not been allocated any teaching assignments by your academic department yet."
                  : "All of your allocated courses have already been initialized into workspaces."}
              </p>
            </div>
            <Button asChild size="sm" variant="outline" className="h-8.5 px-4 rounded-lg text-xs font-medium border-border/70">
              <Link href="/lecturer/assignments">View Teaching Assignments</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <form onSubmit={submit} className="space-y-5 w-full min-w-0">
          {/* Responsive 12-column grid to fit full screen width */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 w-full min-w-0 items-start">
            {/* Left Column: Course Identity & Details */}
            <div className="lg:col-span-7 xl:col-span-8 w-full min-w-0 space-y-5">
              <Card className="rounded-2xl border border-border/70 bg-card shadow-2xs overflow-hidden w-full min-w-0">
                <CardHeader className="pt-5 pb-3 px-5 sm:px-6 border-b border-border/40 bg-muted/20">
                  <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <GraduationCap className="size-4 text-primary" />
                    Course Configuration
                  </CardTitle>
                  <CardDescription className="text-xs text-muted-foreground">
                    Link your official teaching assignment and define display properties.
                  </CardDescription>
                </CardHeader>

                <CardContent className="pt-4 pb-6 px-5 sm:px-6 space-y-4">
                  {/* Assignment Selector */}
                  <div className="space-y-1.5">
                    <Label htmlFor="assignment" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <Layers className="size-3.5 text-primary" />
                      Teaching Assignment
                      <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      value={assignmentId}
                      onValueChange={(v) => v && pick(v)}
                    >
                      <SelectTrigger id="assignment" className="h-9.5 text-xs sm:text-sm rounded-lg border-border/70 bg-background">
                        <SelectValue placeholder="Select an allocated course..." />
                      </SelectTrigger>
                      <SelectContent className="max-h-60">
                        {available.map((a) => (
                          <SelectItem key={a.id} value={a.id} className="text-xs sm:text-sm">
                            {describe(a)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {selected && (
                      <div className="p-2.5 rounded-lg bg-muted/30 border border-border/50 text-[11px] text-muted-foreground flex items-center gap-2">
                        <Building2 className="size-3 text-primary shrink-0" />
                        <span className="truncate">
                          {[
                            selected.institution_name,
                            selected.department_name,
                            selected.academic_period_name ?? selected.academic_year,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Course Title */}
                  <div className="space-y-1.5">
                    <Label htmlFor="title" className="text-xs font-semibold text-foreground">
                      Course Workspace Title
                      <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="title"
                      value={title}
                      maxLength={200}
                      onChange={(e) => setTitleEdit(e.target.value)}
                      placeholder="e.g. CS101: Introduction to Computer Systems (Section A)"
                      className="h-9.5 text-xs sm:text-sm rounded-lg border-border/70 bg-background text-foreground focus-visible:ring-primary/20"
                      required
                    />
                  </div>

                  {/* Description */}
                  <div className="space-y-1.5">
                    <Label htmlFor="description" className="text-xs font-semibold text-foreground">
                      Course Overview / Objectives (Optional)
                    </Label>
                    <Textarea
                      id="description"
                      rows={3}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Provide brief course syllabus information or class guidelines for your enrolled students..."
                      className="text-xs sm:text-sm rounded-lg border-border/70 bg-background text-foreground resize-none p-3 focus-visible:ring-primary/20 leading-relaxed placeholder:text-muted-foreground/60"
                    />
                  </div>

                  {/* Banner Link */}
                  <div className="space-y-1.5">
                    <Label htmlFor="banner" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <ImageIcon className="size-3.5 text-muted-foreground" />
                      Banner Image Link (Optional)
                    </Label>
                    <Input
                      id="banner"
                      type="url"
                      value={bannerUrl}
                      maxLength={500}
                      onChange={(e) => setBannerUrl(e.target.value)}
                      placeholder="https://images.unsplash.com/..."
                      className="h-9.5 text-xs sm:text-sm rounded-lg border-border/70 bg-background text-foreground"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      You can also drag-and-drop or upload custom banner files directly on the course page anytime.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right Column: Handouts & Actions */}
            <div className="lg:col-span-5 xl:col-span-4 w-full min-w-0 space-y-5">
              <Card className="rounded-2xl border border-border/70 bg-card shadow-2xs overflow-hidden w-full min-w-0">
                <CardHeader className="pt-5 pb-3 px-5 border-b border-border/40 bg-muted/20">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Upload className="size-4 text-primary" />
                      Initial Handouts
                    </CardTitle>
                    <span className="text-[11px] text-muted-foreground">Optional</span>
                  </div>
                  <CardDescription className="text-xs text-muted-foreground">
                    Upload initial lecture notes or syllabus documents.
                  </CardDescription>
                </CardHeader>

                <CardContent className="pt-4 pb-6 px-5 space-y-3.5">
                  <label className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-border/70 bg-muted/20 hover:bg-muted/40 p-4 text-center transition-colors">
                    <div className="p-2 rounded-full bg-card shadow-xs border border-border/60 text-primary">
                      <Upload className="size-4" />
                    </div>
                    <span className="text-xs font-semibold text-foreground">
                      Click to attach lecture files
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      PDF, DOCX, PPTX (max 25MB per file)
                    </span>
                    <input
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        const picked = Array.from(e.target.files ?? []);
                        setFiles((prev) => [...prev, ...picked]);
                        e.target.value = "";
                      }}
                    />
                  </label>

                  {files.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block">
                        Files to Upload ({files.length})
                      </span>
                      <ul className="rounded-xl border border-border/60 divide-y divide-border/40 bg-background max-h-48 overflow-y-auto">
                        {files.map((f, i) => (
                          <li
                            key={`${f.name}-${i}`}
                            className="flex items-center justify-between gap-2 px-3 py-2 text-xs"
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <FileCodeIcon className="size-3.5 text-primary shrink-0" />
                              <span className="min-w-0 truncate font-medium text-foreground">
                                {f.name}
                              </span>
                            </div>
                            <button
                              type="button"
                              aria-label={`Remove ${f.name}`}
                              className="size-5 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
                              onClick={() =>
                                setFiles((prev) => prev.filter((_, j) => j !== i))
                              }
                            >
                              <X className="size-3.5" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Submission Summary & Actions */}
                  <div className="pt-3 border-t border-border/40 space-y-2">
                    <Button
                      type="submit"
                      disabled={saving || !selected}
                      className="w-full h-9.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs"
                    >
                      {saving ? (
                        <>
                          <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                          Initializing Workspace...
                        </>
                      ) : (
                        <>
                          <Plus className="mr-1.5 size-3.5" />
                          Create Course Workspace
                        </>
                      )}
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      asChild
                      className="w-full h-9 rounded-lg text-xs font-medium border-border/70"
                    >
                      <Link href="/lecturer/assignments">Cancel</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}

export default function NewCoursePage() {
  return (
    <Suspense fallback={null}>
      <NewCourseForm />
    </Suspense>
  );
}
