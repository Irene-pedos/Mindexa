"use client";

import { useState } from "react";
import { toast } from "sonner";
import { FileText, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { markedScriptsApi, type MarkedScriptVersion } from "@/lib/api/marked-scripts";

const TRIGGER_LABEL: Record<string, string> = {
  RELEASE: "First released",
  CORRECTION: "Re-marked after release",
  APPEAL: "After appeal",
  BACKFILL: "Archived copy",
};

function when(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

interface MarkedPaperButtonProps {
  attemptId: string;
  studentName: string;
  className?: string;
}

/**
 * Opens the student's archived marked paper (PDF). When a mark changed after release
 * (appeal or re-mark) every earlier version stays available from the menu.
 */
export function MarkedPaperButton({ attemptId, studentName, className }: MarkedPaperButtonProps) {
  const [versions, setVersions] = useState<MarkedScriptVersion[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState<number | null>(null);

  const loadVersions = async (open: boolean) => {
    if (!open || versions || loading) return;
    setLoading(true);
    try {
      const history = await markedScriptsApi.getHistory(attemptId);
      setVersions([...history.versions].sort((a, b) => b.version - a.version));
    } catch (err: unknown) {
      toast.error(err instanceof Error && err.message ? err.message : "Could not load the marked paper");
    } finally {
      setLoading(false);
    }
  };

  const download = async (version: number) => {
    setDownloading(version);
    try {
      await markedScriptsApi.downloadPaper(attemptId, { version, label: studentName });
    } catch (err: unknown) {
      toast.error(err instanceof Error && err.message ? err.message : "The download failed. Please try again.");
    } finally {
      setDownloading(null);
    }
  };

  return (
    <DropdownMenu onOpenChange={(open) => void loadVersions(open)}>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" className={className ?? "h-7 gap-1 rounded-lg text-xs font-medium"}>
          <FileText className="size-3.5" />
          Marked paper
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-[11px] font-medium text-muted-foreground">
          {studentName} · PDF
        </DropdownMenuLabel>
        {loading && (
          <div className="flex items-center gap-2 px-2 py-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Preparing…
          </div>
        )}
        {versions?.map((v, index) => (
          <DropdownMenuItem
            key={v.version}
            onSelect={() => void download(v.version)}
            className="flex-col items-start gap-0.5 text-xs"
            disabled={downloading !== null}
          >
            <span className="font-medium">
              {index === 0 ? "Current" : "Earlier"} · version {v.version}
              {downloading === v.version && " …"}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {TRIGGER_LABEL[v.trigger] ?? v.trigger} · {when(v.created_at)} · {v.total_score}/{v.max_score}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
