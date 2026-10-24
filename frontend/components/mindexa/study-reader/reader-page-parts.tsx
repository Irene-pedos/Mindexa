"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Shared pieces of the pages that open the study reader (course material and personal resource). */

export function ReaderLoadingScreen({ message }: { message: string }) {
  return (
    <div
      role="status"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-background p-6"
    >
      <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
      <p className="text-xs font-medium text-muted-foreground">{message}</p>
    </div>
  );
}

interface ReaderErrorScreenProps {
  title: string;
  message: string;
  backHref: string;
  backLabel: string;
  onRetry?: () => void;
}

export function ReaderErrorScreen({ title, message, backHref, backLabel, onRetry }: ReaderErrorScreenProps) {
  return (
    <div
      role="alert"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background p-6 text-center"
    >
      <AlertCircle className="mb-3 size-10 text-destructive" aria-hidden />
      <h2 className="mb-1 text-sm font-semibold text-foreground">{title}</h2>
      <p className="mb-4 max-w-sm text-xs text-muted-foreground">{message}</p>
      <div className="flex items-center gap-2">
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            Try again
          </Button>
        )}
        <Button asChild variant="outline" size="sm">
          <Link href={backHref}>{backLabel}</Link>
        </Button>
      </div>
    </div>
  );
}

/** The reader pulls in pdf.js, so it is loaded only when a document is actually opened. */
export const LazyStudyReader = dynamic(
  () => import("./study-reader").then((m) => m.StudyReader),
  { ssr: false, loading: () => <ReaderLoadingScreen message="Opening study reader…" /> },
);

/** `?page=N` deep link (from search results, key points, AI citations); null when absent or invalid. */
export function useInitialPage(): number | null {
  const raw = useSearchParams().get("page");
  const page = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(page) && page >= 1 ? page : null;
}

export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}
