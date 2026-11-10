"use client";

import { useState } from "react";
import { toast } from "sonner";
import { FileDown, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { markedScriptsApi } from "@/lib/api/marked-scripts";

interface OfficialPaperButtonProps {
  /** The attempt (or result) id from the results page address. */
  attemptId: string;
  label: string;
}

/**
 * Downloads the student's own archived marked paper: their answers, the correct
 * answers, the marks and the feedback, with a verification code. Only released
 * results reach this page, and the server checks that the paper is theirs.
 */
export function OfficialPaperButton({ attemptId, label }: OfficialPaperButtonProps) {
  const [busy, setBusy] = useState(false);

  const download = async () => {
    setBusy(true);
    try {
      await markedScriptsApi.downloadPaper(attemptId, { label });
    } catch (err: unknown) {
      toast.error(err instanceof Error && err.message ? err.message : "Could not download your marked paper.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={busy}
      onClick={() => void download()}
      className="h-8 gap-1.5 text-xs rounded-lg border-border/70 font-medium"
    >
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : <FileDown className="size-3.5" />}
      Marked paper (PDF)
    </Button>
  );
}
