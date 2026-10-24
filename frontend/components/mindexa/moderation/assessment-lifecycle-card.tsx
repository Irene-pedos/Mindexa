// components/mindexa/moderation/assessment-lifecycle-card.tsx
"use client";

// The lecturer's view of a SUMMATIVE assessment's path to publication:
//   DRAFT → submit → PENDING_MODERATION → CHANGES_REQUESTED ⇄ resubmit
//   → APPROVED → (exam office seals) → SEALED → publish
// plus the audited edit available after approval.

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Loader2,
  MessageSquare,
  Pencil,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { assessmentApi } from "@/lib/api/assessment";
import {
  COMMENT_CATEGORY_LABELS,
  moderationApi,
  type ModerationOverview,
} from "@/lib/api/moderation";
import { cn } from "@/lib/utils";

const STAGE_TEXT: Record<string, string> = {
  DRAFT:
    "Finish the paper, then submit it. It must pass the automated checks and be approved by the department moderator before the Exam Office seals it.",
  PENDING_MODERATION:
    "Submitted to the department moderation queue. Waiting for a moderator to review it. The paper is locked while it is under review.",
  CHANGES_REQUESTED:
    "The moderator asked for changes. Edit the paper, mark each comment as resolved, then resubmit.",
  APPROVED:
    "Approved by the moderator. Waiting for the Exam Office to seal it. Changes now need a recorded justification.",
  SEALED: "Sealed by the Exam Office. You can now publish it to students.",
  PUBLISHED: "Sealed and published.",
};

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export function AssessmentLifecycleCard({
  assessment,
  overview,
  onChanged,
  beforeSubmit,
}: {
  assessment: { id: string; status: string; title: string; duration_minutes?: number | null };
  overview: ModerationOverview | null;
  onChanged: () => void;
  /** Runs before (re)submitting, e.g. the editor saves what is still unsaved. */
  beforeSubmit?: () => Promise<void>;
}) {
  const status = assessment.status;
  const [busy, setBusy] = useState(false);
  const [resolving, setResolving] = useState<string | null>(null);
  const [resubmitNote, setResubmitNote] = useState("");
  const [publishErrors, setPublishErrors] = useState<string[]>([]);

  // Post-approval edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editReason, setEditReason] = useState("");
  const [editTitle, setEditTitle] = useState(assessment.title);
  const [editDuration, setEditDuration] = useState(
    assessment.duration_minutes ? String(assessment.duration_minutes) : "",
  );
  const [editInstructions, setEditInstructions] = useState("");
  const [editBanner, setEditBanner] = useState("");
  const [reprint, setReprint] = useState(false);

  const latestRound = overview?.rounds?.[overview.rounds.length - 1];
  const comments = useMemo(() => latestRound?.comments ?? [], [latestRound]);
  const openComments = comments.filter((c) => !c.resolved);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };

  const submit = () =>
    run(async () => {
      try {
        await beforeSubmit?.();
        if (status === "CHANGES_REQUESTED") {
          await moderationApi.resubmitForModeration(assessment.id, resubmitNote.trim() || undefined);
          toast.success("Resubmitted for moderation.");
          setResubmitNote("");
        } else {
          await moderationApi.submitForModeration(assessment.id);
          toast.success("Submitted for department moderation.");
        }
        onChanged();
      } catch (err) {
        toast.error(errorMessage(err, "Could not submit for moderation"));
      }
    });

  const resolve = async (commentId: string) => {
    setResolving(commentId);
    try {
      await moderationApi.resolveComment(commentId);
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err, "Could not resolve the comment"));
    } finally {
      setResolving(null);
    }
  };

  const publish = () =>
    run(async () => {
      setPublishErrors([]);
      try {
        // The server answers 200 even when it refuses to publish
        const result = await assessmentApi.finalizeAssessment(assessment.id);
        if (!result.validation_passed) {
          setPublishErrors(result.errors?.length ? result.errors : ["Publishing was refused."]);
          toast.error("The assessment could not be published.");
          return;
        }
        toast.success("Assessment published to students.");
        onChanged();
      } catch (err) {
        toast.error(errorMessage(err, "Could not publish the assessment"));
      }
    });

  const submitPostApprovalEdit = () =>
    run(async () => {
      if (editReason.trim().length < 10) {
        toast.error("Give a reason of at least 10 characters.");
        return;
      }
      const duration = parseInt(editDuration, 10);
      try {
        await assessmentApi.postApprovalEdit(assessment.id, {
          reason: editReason.trim(),
          reprint_required: reprint,
          title: editTitle.trim() && editTitle.trim() !== assessment.title ? editTitle.trim() : undefined,
          instructions: editInstructions.trim() || undefined,
          duration_minutes:
            !isNaN(duration) && duration !== assessment.duration_minutes ? duration : undefined,
          notice_banner: editBanner.trim() || undefined,
        });
        toast.success("Edit recorded. The Exam Office and moderators were notified where required.");
        setEditOpen(false);
        setEditReason("");
        onChanged();
      } catch (err) {
        toast.error(errorMessage(err, "The edit was refused"));
      }
    });

  const canPostApprovalEdit = ["APPROVED", "SEALED", "PUBLISHED"].includes(status);

  return (
    <Card className="border-primary/20 bg-primary/[0.02] shadow-none">
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 shrink-0 rounded-xl bg-primary/10 p-2.5 text-primary">
              <ShieldCheck className="size-5" />
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-foreground">Moderation &amp; publishing</h3>
                <Badge variant="outline" className="text-[10px] font-bold">
                  Stage: {status.replace(/_/g, " ")}
                </Badge>
                {latestRound && (
                  <Badge variant="secondary" className="text-[10px]">
                    Round {latestRound.round_no}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {status === "PENDING_MODERATION" && latestRound?.reviewer_id
                  ? "A moderator has taken this paper and is reviewing it. You will be notified, and the paper opens for editing, if they ask for changes. It is locked while the review is open."
                  : (STAGE_TEXT[status] ?? "")}
              </p>
            </div>
          </div>

          <div className="flex w-full shrink-0 flex-wrap items-center justify-end gap-2 md:w-auto">
            {canPostApprovalEdit && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 rounded-lg text-xs"
                onClick={() => setEditOpen(true)}
              >
                <Pencil className="size-3.5" /> Request edit
              </Button>
            )}

            {(status === "DRAFT" || status === "CHANGES_REQUESTED") && (
              <Button
                size="sm"
                disabled={busy || (status === "CHANGES_REQUESTED" && openComments.length > 0)}
                onClick={submit}
                className="h-8 gap-1.5 rounded-lg text-xs"
              >
                {busy ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : status === "CHANGES_REQUESTED" ? (
                  <>
                    <RotateCcw className="size-3.5" /> Resubmit for moderation
                  </>
                ) : (
                  <>
                    <ShieldCheck className="size-3.5" /> Submit for moderation
                  </>
                )}
              </Button>
            )}

            {status === "SEALED" && (
              <Button
                size="sm"
                disabled={busy}
                onClick={publish}
                className="h-8 gap-1.5 rounded-lg bg-emerald-600 text-xs text-white hover:bg-emerald-700"
              >
                {busy ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <>
                    <Check className="size-3.5" /> Publish sealed assessment
                  </>
                )}
              </Button>
            )}
          </div>
        </div>

        {publishErrors.length > 0 && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-3 text-xs text-rose-700 dark:text-rose-300">
            <p className="mb-1 flex items-center gap-1.5 font-semibold">
              <AlertTriangle className="size-3.5" /> Not published
            </p>
            <ul className="list-disc space-y-0.5 pl-5">
              {publishErrors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Checks the moderator waived when approving, so the author knows what was accepted as-is */}
        {latestRound?.compliance_override && (
          <div className="space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
            <p className="font-semibold text-amber-800 dark:text-amber-300">
              Approved with waived checks: {latestRound.compliance_override.codes.join(", ")}
            </p>
            <p className="text-muted-foreground">Moderator&apos;s reason: {latestRound.compliance_override.reason}</p>
          </div>
        )}

        {/* Moderator feedback for the latest round */}
        {latestRound && (latestRound.decision_note || comments.length > 0) && (
          <div className="space-y-2 border-t pt-3">
            <h4 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              <MessageSquare className="size-3.5" /> Moderator feedback
            </h4>
            {latestRound.decision_note && (
              <p className="rounded-lg bg-muted/40 p-2.5 text-xs">{latestRound.decision_note}</p>
            )}
            {comments.map((c) => (
              <div
                key={c.id}
                className={cn(
                  "flex items-start justify-between gap-3 rounded-lg border p-2.5 text-xs",
                  c.resolved ? "border-emerald-500/20 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/5",
                )}
              >
                <div className="space-y-1">
                  <Badge variant="secondary" className="text-[9px] uppercase tracking-wider">
                    {COMMENT_CATEGORY_LABELS[c.category] ?? c.category}
                  </Badge>
                  <p>{c.comment}</p>
                </div>
                {c.resolved ? (
                  <span className="flex shrink-0 items-center gap-1 text-emerald-600">
                    <CheckCircle2 className="size-3.5" /> Resolved
                  </span>
                ) : status === "CHANGES_REQUESTED" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 shrink-0 text-[11px]"
                    disabled={resolving === c.id}
                    onClick={() => resolve(c.id)}
                  >
                    {resolving === c.id ? <Loader2 className="size-3 animate-spin" /> : "Mark resolved"}
                  </Button>
                ) : null}
              </div>
            ))}
            {status === "CHANGES_REQUESTED" && (
              <div className="space-y-1.5 pt-1">
                {openComments.length > 0 && (
                  <p className="text-[11px] text-amber-600">
                    Resolve all {openComments.length} open comment(s) before resubmitting.
                  </p>
                )}
                <Textarea
                  placeholder="Optional: what did you change? (shown to the moderator)"
                  className="min-h-14 text-xs"
                  value={resubmitNote}
                  onChange={(e) => setResubmitNote(e.target.value)}
                />
              </div>
            )}
          </div>
        )}
      </CardContent>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Request an edit</DialogTitle>
            <DialogDescription className="text-xs">
              This paper is {status.toLowerCase()}, so edits are recorded with a reason. Sealed papers
              are un-sealed and the Exam Office is told whether to reprint. Questions and marks cannot be
              changed here, and nothing can change once students have started.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="pae-reason" className="text-xs">Reason (required, 10+ characters)</Label>
              <Textarea
                id="pae-reason"
                className="min-h-16 text-xs"
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pae-title" className="text-xs">Title</Label>
              <Input id="pae-title" className="h-9 text-sm" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pae-duration" className="text-xs">Duration (minutes)</Label>
              <Input id="pae-duration" type="number" min={1} className="h-9 text-sm" value={editDuration} onChange={(e) => setEditDuration(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pae-instructions" className="text-xs">New instructions (leave empty to keep)</Label>
              <Textarea id="pae-instructions" className="min-h-14 text-xs" value={editInstructions} onChange={(e) => setEditInstructions(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pae-banner" className="text-xs">Notice for students (optional)</Label>
              <Input id="pae-banner" className="h-9 text-sm" value={editBanner} onChange={(e) => setEditBanner(e.target.value)} />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-2.5">
              <Label htmlFor="pae-reprint" className="text-xs">The printed paper must be reprinted</Label>
              <Switch id="pae-reprint" checked={reprint} onCheckedChange={setReprint} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button size="sm" onClick={submitPostApprovalEdit} disabled={busy}>
              {busy && <Loader2 className="mr-1 size-3.5 animate-spin" />}
              Record edit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
