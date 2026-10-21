// components/mindexa/grading/ai-sample-check-dialog.tsx
"use client";

// Bulk-accepting AI grades (spec §9.6): the lecturer first verifies a random
// sample of AI suggestions. Bulk accept is only offered once the sample is
// verified, and a low agreement rate requires an explicit, audited reason.

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Loader2, PenLine, ShieldCheck, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  markingApi,
  SAMPLE_AGREEMENT_THRESHOLD,
  type SampleCheck,
} from "@/lib/api/marking";

type Verdict = { agreed: boolean; score: string; feedback: string };

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export function AiSampleCheckDialog({
  open,
  onOpenChange,
  assessmentId,
  onCompleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assessmentId: string | null;
  onCompleted: () => void;
}) {
  const [check, setCheck] = useState<SampleCheck | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({});
  const [overrideReason, setOverrideReason] = useState("");

  const load = useCallback(async () => {
    if (!assessmentId) return;
    setLoading(true);
    try {
      setCheck(await markingApi.getLatestSampleCheck(assessmentId));
    } catch {
      setCheck(null); // none yet
    } finally {
      setLoading(false);
    }
  }, [assessmentId]);

  useEffect(() => {
    if (open) {
      setVerdicts({});
      setOverrideReason("");
      void load();
    }
  }, [open, load]);

  const verdictFor = (reviewId: string): Verdict =>
    verdicts[reviewId] ?? { agreed: true, score: "", feedback: "" };

  const setVerdict = (reviewId: string, patch: Partial<Verdict>) =>
    setVerdicts((prev) => ({ ...prev, [reviewId]: { ...verdictFor(reviewId), ...patch } }));

  const startSample = async () => {
    if (!assessmentId) return;
    setBusy(true);
    try {
      setCheck(await markingApi.createSampleCheck(assessmentId));
    } catch (err) {
      toast.error(errorMessage(err, "Could not start a sample check"));
    } finally {
      setBusy(false);
    }
  };

  const submitVerification = async () => {
    if (!assessmentId || !check) return;
    const verifications = check.items.map((item) => {
      const v = verdictFor(item.review_id);
      const score = parseFloat(v.score);
      return {
        review_id: item.review_id,
        agreed: v.agreed,
        lecturer_score: v.agreed || isNaN(score) ? null : score,
        lecturer_feedback: v.feedback.trim() || null,
      };
    });
    const invalid = verifications.find((v) => !v.agreed && v.lecturer_score === null);
    if (invalid) {
      toast.error("Enter your score for every item you disagree with.");
      return;
    }
    setBusy(true);
    try {
      setCheck(await markingApi.verifySampleCheck(assessmentId, check.id, verifications));
      toast.success("Sample verified — those grades are now final.");
    } catch (err) {
      toast.error(errorMessage(err, "Could not verify the sample"));
    } finally {
      setBusy(false);
    }
  };

  const lowAgreement =
    check?.status === "VERIFIED" && check.agreement_rate < SAMPLE_AGREEMENT_THRESHOLD;

  const bulkAccept = async () => {
    if (!assessmentId) return;
    if (lowAgreement && overrideReason.trim().length < 10) {
      toast.error("Explain (10+ characters) why you accept despite low agreement.");
      return;
    }
    setBusy(true);
    try {
      const res = await markingApi.bulkAccept(
        assessmentId,
        lowAgreement
          ? { override_low_agreement: true, override_reason: overrideReason.trim() }
          : {},
      );
      toast.success(`${res.accepted_count} AI grade(s) accepted.`);
      onCompleted();
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err, "Bulk accept failed"));
    } finally {
      setBusy(false);
    }
  };

  const pendingSample = check?.status === "PENDING";
  const verified = check?.status === "VERIFIED";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles className="size-4 text-primary" />
            Accept AI grades in bulk
          </DialogTitle>
          <DialogDescription className="text-xs">
            First check a random sample of AI grades. If you agree with at least{" "}
            {Math.round(SAMPLE_AGREEMENT_THRESHOLD * 100)}% of them, you can accept the
            remaining suggestions at once.
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex justify-center py-10">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && !check && (
          <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            No sample has been checked yet for this assessment.
          </div>
        )}

        {!loading && pendingSample && check && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Sample of {check.items.length} from the pending AI grades. Agree, or give your own score.
            </p>
            {check.items.map((item, idx) => {
              const v = verdictFor(item.review_id);
              return (
                <div key={item.review_id} className="space-y-2 rounded-xl border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-xs font-semibold">
                      {idx + 1}. {item.question_content || "Question"}
                    </p>
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      AI: {item.ai_suggested_score ?? "–"} / {item.max_score ?? "–"}
                    </Badge>
                  </div>
                  <p className="whitespace-pre-wrap rounded-lg bg-muted/40 p-2 text-xs">
                    {item.student_answer || <span className="italic text-muted-foreground">No text answer</span>}
                  </p>
                  {item.ai_feedback_draft && (
                    <p className="text-[11px] text-muted-foreground">
                      <span className="font-medium">AI feedback draft:</span> {item.ai_feedback_draft}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={v.agreed ? "default" : "outline"}
                      className="h-7 gap-1 text-xs"
                      onClick={() => setVerdict(item.review_id, { agreed: true })}
                    >
                      <Check className="size-3" /> Agree
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={!v.agreed ? "default" : "outline"}
                      className="h-7 gap-1 text-xs"
                      onClick={() => setVerdict(item.review_id, { agreed: false })}
                    >
                      <PenLine className="size-3" /> Adjust
                    </Button>
                    {!v.agreed && (
                      <Input
                        type="number"
                        min={0}
                        max={item.max_score ?? undefined}
                        step="0.5"
                        placeholder="Your score"
                        aria-label="Your score"
                        className="h-7 w-28 text-xs"
                        value={v.score}
                        onChange={(e) => setVerdict(item.review_id, { score: e.target.value })}
                      />
                    )}
                  </div>
                  <Textarea
                    placeholder="Feedback to the student (optional — agreeing accepts the AI draft)"
                    className="min-h-14 text-xs"
                    value={v.feedback}
                    onChange={(e) => setVerdict(item.review_id, { feedback: e.target.value })}
                  />
                </div>
              );
            })}
          </div>
        )}

        {!loading && verified && check && (
          <div className="space-y-3 rounded-xl border p-4 text-sm">
            <div className="flex items-center gap-2">
              <ShieldCheck className={lowAgreement ? "size-4 text-amber-500" : "size-4 text-emerald-500"} />
              <span>
                Sample verified — agreement{" "}
                <strong>{Math.round(check.agreement_rate * 100)}%</strong> on {check.checked_count} item(s).
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {check.pending_review_count} AI grade(s) are still waiting for review.
            </p>
            {lowAgreement && (
              <div className="space-y-1.5">
                <Label htmlFor="override-reason" className="text-xs text-amber-600">
                  Agreement is below {Math.round(SAMPLE_AGREEMENT_THRESHOLD * 100)}%. Review individually,
                  run a new sample, or give a reason to accept anyway (recorded in the audit log).
                </Label>
                <Textarea
                  id="override-reason"
                  className="min-h-16 text-xs"
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                />
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={busy}>
            Close
          </Button>
          {!loading && (!check || verified) && (
            <Button size="sm" variant="outline" onClick={startSample} disabled={busy || !assessmentId}>
              {busy && <Loader2 className="mr-1 size-3.5 animate-spin" />}
              {check ? "Run a new sample" : "Start sample check"}
            </Button>
          )}
          {!loading && pendingSample && (
            <Button size="sm" onClick={submitVerification} disabled={busy}>
              {busy && <Loader2 className="mr-1 size-3.5 animate-spin" />}
              Submit verification
            </Button>
          )}
          {!loading && verified && check && check.pending_review_count > 0 && (
            <Button size="sm" onClick={bulkAccept} disabled={busy}>
              {busy && <Loader2 className="mr-1 size-3.5 animate-spin" />}
              Accept remaining {check.pending_review_count}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
