// frontend/app/student/resources/[id]/read/page.tsx
"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
  params: Promise<{ id: string }>;
}

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; source: ReaderSource };

const RESOURCES_HREF = "/student/resources";

export default function PersonalResourceReaderPage({ params }: PageProps) {
  const { id: resourceId } = use(params);
  const router = useRouter();
  const initialPage = useInitialPage();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    studyReaderApi
      .getMetadata("student_resource", resourceId)
      .then((meta) => {
        if (cancelled) return;
        setState({
          status: "ready",
          source: {
            kind: "student_resource",
            id: meta.id,
            title: meta.title,
            mimeType: meta.mime_type,
            extension: meta.extension,
            downloadFilename: meta.title,
          },
        });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({ status: "error", message: errorMessage(err, "This study resource could not be opened.") });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [resourceId, attempt]);

  const retry = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((n) => n + 1);
  }, []);

  if (state.status === "loading") return <ReaderLoadingScreen message="Opening study resource…" />;

  if (state.status === "error") {
    return (
      <ReaderErrorScreen
        title="Unable to open resource"
        message={state.message}
        backHref={RESOURCES_HREF}
        backLabel="Return to resources"
        onRetry={retry}
      />
    );
  }

  return (
    <LazyStudyReader
      source={state.source}
      onBack={() => router.push(RESOURCES_HREF)}
      initialPage={initialPage}
    />
  );
}
