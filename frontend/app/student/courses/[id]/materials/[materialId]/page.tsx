// frontend/app/student/courses/[id]/materials/[materialId]/page.tsx
"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { studyReaderApi } from "@/lib/api/study-reader";
import type { ReaderSource } from "@/components/mindexa/study-reader/types";
import {
  LazyStudyReader,
  ReaderErrorScreen,
  ReaderLoadingScreen,
  errorMessage,
  useInitialPage,
} from "@/components/mindexa/study-reader/reader-page-parts";

interface PageProps {
  params: Promise<{ id: string; materialId: string }>;
}

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; source: ReaderSource };

export default function CourseMaterialReaderPage({ params }: PageProps) {
  const { id: workspaceId, materialId } = use(params);
  const router = useRouter();
  const initialPage = useInitialPage();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  const courseHref = `/student/courses/${workspaceId}`;

  useEffect(() => {
    let cancelled = false;

    // One request: the reader's own metadata endpoint also enforces visibility and enrolment.
    studyReaderApi
      .getMetadata("lecturer_material", materialId)
      .then((meta) => {
        if (cancelled) return;

        // A link into the wrong course, or to a superseded upload, should land on the right document.
        if (meta.workspace_id && meta.workspace_id !== workspaceId) {
          router.replace(`/student/courses/${meta.workspace_id}/materials/${meta.id}`);
          return;
        }
        if (!meta.is_current && meta.latest_material_id) {
          toast.info("Opened the latest version of this material. Your notes and highlights came with you.");
          const suffix = initialPage ? `?page=${initialPage}` : "";
          router.replace(`${courseHref}/materials/${meta.latest_material_id}${suffix}`);
          return;
        }

        setState({
          status: "ready",
          source: {
            kind: "lecturer_material",
            id: meta.id,
            workspaceId,
            title: meta.title,
            mimeType: meta.mime_type,
            extension: meta.extension,
            academicResourceId: meta.id,
            downloadFilename: meta.title,
            courseCode: meta.course_code ?? undefined,
            courseTitle: meta.course_title ?? undefined,
          },
        });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({ status: "error", message: errorMessage(err, "This material could not be opened.") });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [workspaceId, materialId, attempt, router, courseHref, initialPage]);

  const retry = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((n) => n + 1);
  }, []);

  if (state.status === "loading") return <ReaderLoadingScreen message="Opening course material…" />;

  if (state.status === "error") {
    return (
      <ReaderErrorScreen
        title="Unable to open material"
        message={state.message}
        backHref={courseHref}
        backLabel="Return to course"
        onRetry={retry}
      />
    );
  }

  return (
    <LazyStudyReader
      source={state.source}
      onBack={() => router.push(courseHref)}
      initialPage={initialPage}
    />
  );
}
