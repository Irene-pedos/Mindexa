"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api/client";
import { studentApi, type StudentCourseListItem, type StudentResourceResponse } from "@/lib/api/student";
import type { TutorMaterial } from "@/lib/tutor-chat";

interface AttemptSummary {
  status?: string;
  assessment_type?: string;
  is_supervised?: boolean;
  ai_assistance_allowed?: boolean;
  title?: string;
  assessment_title?: string;
}

export interface ExamBlock {
  title: string;
}

/**
 * What the tutor can draw on: the student's own uploads, their course workspaces, and each
 * course's materials; plus whether an open exam attempt switches the tutor off. (The server is the
 * real gate; this lets the page explain instead of failing on the first message.)
 */
export function useTutorData() {
  const [resources, setResources] = useState<StudentResourceResponse[]>([]);
  const [workspaces, setWorkspaces] = useState<StudentCourseListItem[]>([]);
  const [materials, setMaterials] = useState<TutorMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [examBlock, setExamBlock] = useState<ExamBlock | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [personal, attempts, courses] = await Promise.all([
          studentApi.getPersonalResources().catch(() => []),
          apiClient("/attempts/me").catch(() => ({ items: [] })),
          studentApi.getWorkspaces().catch(() => []),
        ]);
        if (cancelled) return;
        setResources(personal);
        setWorkspaces(courses);

        const open: AttemptSummary[] = ((attempts?.items ?? []) as AttemptSummary[]).filter(
          (a) => a.status === "IN_PROGRESS" || a.status === "PAUSED"
        );
        if (open.length > 0) {
          const blocking =
            open.find(
              (a) =>
                a.assessment_type === "CAT" ||
                a.assessment_type === "SUMMATIVE" ||
                a.is_supervised ||
                a.ai_assistance_allowed === false
            ) ?? open[0];
          setExamBlock({ title: blocking.title || blocking.assessment_title || "Active Assessment" });
        }

        const perCourse = await Promise.all(
          courses.map(async (course) => {
            try {
              const items = await studentApi.getWorkspaceMaterials(course.id);
              return items.map((m) => ({
                ...m,
                workspace_id: course.id,
                teaching_workspace_id: course.id,
                course_code: course.code,
                course_name: course.title,
              }));
            } catch {
              return [];
            }
          })
        );
        if (!cancelled) setMaterials(perCourse.flat());
      } catch (err) {
        console.error("Failed to load study tutor data", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { resources, setResources, workspaces, materials, loading, examBlock };
}
