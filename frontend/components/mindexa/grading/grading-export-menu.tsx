"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Download, FileArchive, FileSpreadsheet, FileText, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { markedScriptsApi, type MarksExportFormat } from "@/lib/api/marked-scripts";

interface GradingExportMenuProps {
  assessmentId: string;
  assessmentTitle: string;
}

/**
 * Export the marks (Excel or CSV, to re-enter into the college's publishing system)
 * and every student's marked paper (ZIP of PDFs, kept as proof of how they did).
 */
export function GradingExportMenu({ assessmentId, assessmentTitle }: GradingExportMenuProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [includeUnreleased, setIncludeUnreleased] = useState(false);

  const run = async (key: string, job: () => Promise<void>, done: string) => {
    if (busy) return;
    setBusy(key);
    try {
      await job();
      toast.success(done);
    } catch (err: unknown) {
      toast.error(err instanceof Error && err.message ? err.message : "The download failed. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const exportMarks = (format: MarksExportFormat) =>
    run(
      format,
      () => markedScriptsApi.downloadMarksheet(assessmentId, { format, includeUnreleased, title: assessmentTitle }),
      format === "csv" ? "CSV downloaded" : "Excel file downloaded",
    );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-xl text-xs font-medium" disabled={!!busy}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Marks
        </DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => void exportMarks("xlsx")} className="gap-2 text-xs">
          <FileSpreadsheet className="size-4 text-emerald-600" />
          Marks sheet (Excel .xlsx)
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void exportMarks("csv")} className="gap-2 text-xs">
          <FileText className="size-4 text-sky-600" />
          Marks sheet (CSV, for importing)
        </DropdownMenuItem>
        <DropdownMenuCheckboxItem
          checked={includeUnreleased}
          onCheckedChange={setIncludeUnreleased}
          onSelect={(e) => e.preventDefault()}
          className="text-xs"
        >
          Also list results not released yet
        </DropdownMenuCheckboxItem>
        <p className="px-2 pb-1.5 text-[10px] leading-snug text-muted-foreground">
          Rows not released yet are labelled in the &quot;Release Status&quot; column.
        </p>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Marked papers
        </DropdownMenuLabel>
        <DropdownMenuItem
          onSelect={() =>
            void run(
              "zip",
              () => markedScriptsApi.downloadBundle(assessmentId, assessmentTitle),
              "Marked papers downloaded",
            )
          }
          className="gap-2 text-xs"
        >
          <FileArchive className="size-4 text-amber-600" />
          All released papers (ZIP of PDFs)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
