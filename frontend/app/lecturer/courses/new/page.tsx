"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, FileText, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
      .catch(() => toast.error("Could not load your assignments"))
      .finally(() => setLoadingList(false));
  }, []);

  // Only assignments that have a course and no course space yet can be set up.
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
      toast.error("Choose which assignment to set up");
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
          `Course created, but ${failed} handout${failed > 1 ? "s" : ""} failed to upload. You can add them from the course page.`,
        );
      } else {
        toast.success("Course is ready");
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
      <div className="mx-auto max-w-2xl space-y-4 p-4 sm:p-6">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5 p-4 sm:p-6">
      <header className="flex items-center gap-3">
        <Button variant="outline" size="icon" asChild className="size-8">
          <Link href="/lecturer/assignments" aria-label="Back to assignments">
            <ChevronLeft className="size-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Set up a course
          </h1>
          <p className="text-sm text-muted-foreground">
            Creates the space where you manage this course&apos;s class list,
            handouts and assessments.
          </p>
        </div>
      </header>

      {alreadySetUp ? (
        <Card>
          <CardContent className="space-y-3 py-8 text-center">
            <p className="text-sm">
              <span className="font-semibold">{describe(alreadySetUp)}</span>{" "}
              is already set up.
            </p>
            <Button asChild size="sm">
              <Link href={`/lecturer/courses/${alreadySetUp.workspace_id}`}>
                Open course
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : available.length === 0 ? (
        <Card>
          <CardContent className="space-y-3 py-8 text-center">
            <p className="text-sm text-muted-foreground">
              {assignments.length === 0
                ? "You have no teaching assignments yet. Your administrator assigns courses to you."
                : "Every assignment you have is already set up."}
            </p>
            <Button asChild size="sm" variant="outline">
              <Link href="/lecturer/assignments">View my assignments</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Course</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="assignment">Assignment</Label>
                <Select
                  value={assignmentId}
                  onValueChange={(v) => v && pick(v)}
                >
                  <SelectTrigger id="assignment">
                    <SelectValue placeholder="Choose an assignment" />
                  </SelectTrigger>
                  <SelectContent>
                    {available.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {describe(a)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selected && (
                  <p className="text-xs text-muted-foreground">
                    {[
                      selected.institution_name,
                      selected.department_name,
                      selected.academic_period_name ?? selected.academic_year,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="title">Course title</Label>
                <Input
                  id="title"
                  value={title}
                  maxLength={200}
                  onChange={(e) => setTitleEdit(e.target.value)}
                  placeholder="Shown to you and your students"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="description">Description (optional)</Label>
                <Textarea
                  id="description"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Defaults to the course description from your institution"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="banner">Banner image link (optional)</Label>
                <Input
                  id="banner"
                  type="url"
                  value={bannerUrl}
                  maxLength={500}
                  onChange={(e) => setBannerUrl(e.target.value)}
                  placeholder="https://…"
                />
                <p className="text-xs text-muted-foreground">
                  You can also upload a picture from the course page later.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">
                Handouts (optional)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground hover:bg-muted/40">
                <Upload className="size-4" />
                Add files for students
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
                <ul className="divide-y rounded-lg border">
                  {files.map((f, i) => (
                    <li
                      key={`${f.name}-${i}`}
                      className="flex items-center gap-2 px-3 py-2 text-sm"
                    >
                      <FileText className="size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">{f.name}</span>
                      <button
                        type="button"
                        aria-label={`Remove ${f.name}`}
                        onClick={() =>
                          setFiles((prev) => prev.filter((_, j) => j !== i))
                        }
                      >
                        <X className="size-4 text-muted-foreground" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" asChild>
              <Link href="/lecturer/assignments">Cancel</Link>
            </Button>
            <Button type="submit" disabled={saving || !selected}>
              {saving && <Loader2 className="mr-1.5 size-4 animate-spin" />}
              Set up course
            </Button>
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
