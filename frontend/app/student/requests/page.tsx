"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Clock3, Loader2, RotateCcw, ShieldCheck, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { assessmentApi } from "@/lib/api/assessment";
import { appealApi, WITHDRAWABLE_APPEAL_STATUSES, type Appeal } from "@/lib/api/appeals";
import {
  EXCUSE_REASON_MIN_LENGTH,
  eligibilityApi,
  excuseApi,
  type AbsenceExcuse,
  type RetakeRecord,
  type StudentCourseEligibility,
} from "@/lib/api/eligibility";

interface AssessmentOption {
  id: string;
  title: string;
  course_id: string | null;
}

const RETAKE_STATUS_LABEL: Record<string, string> = {
  FLAGGED: "Flagged",
  PAYMENT_PENDING: "Awaiting payment",
  PAID: "Paid",
  ENROLLED: "Enrolled",
  CANCELLED: "Cancelled",
};

const TRIGGER_LABEL: Record<string, string> = {
  ENTRY_THRESHOLD_NOT_MET: "Coursework average below the exam entry mark",
  SUMMATIVE_FAILED: "Summative exam not passed",
};

function formatDate(value?: string | null): string {
  return value ? new Date(value).toLocaleDateString(undefined, { dateStyle: "medium" }) : "-";
}

function StatusBadge({ status }: { status: string }) {
  const good = ["ENROLLED", "APPROVED", "DECIDED", "CLOSED", "CONFIRMED", "PAID"].includes(status);
  const bad = ["REJECTED", "REJECTED_INVALID", "CANCELLED", "WITHDRAWN"].includes(status);
  return (
    <Badge variant={good ? "default" : bad ? "destructive" : "secondary"}>
      {RETAKE_STATUS_LABEL[status] ?? status.replace(/_/g, " ").toLowerCase()}
    </Badge>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="py-8 text-center text-sm text-muted-foreground">{text}</p>;
}

function EligibilityCard({ data }: { data: StudentCourseEligibility }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">{data.course_code}</CardTitle>
            <CardDescription>{data.course_title}</CardDescription>
          </div>
          {data.summative_entry_eligible ? (
            <Badge className="gap-1"><CheckCircle2 className="h-3 w-3" /> Eligible</Badge>
          ) : (
            <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> Not eligible</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p>{data.summative_entry_reason}</p>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-muted-foreground">
          <span>
            Coursework average:{" "}
            <span className="font-medium text-foreground">
              {data.has_coursework && data.coursework_average != null
                ? `${data.coursework_average.toFixed(1)}%`
                : "none yet"}
            </span>
          </span>
          {data.pending_marks_count > 0 && <span>{data.pending_marks_count} mark(s) still pending</span>}
          {data.active_override && (
            <span className="flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> Special permission granted</span>
          )}
        </div>
        {data.pending_reassessments.length > 0 && (
          <ul className="list-disc pl-5 text-muted-foreground">
            {data.pending_reassessments.map((r) => (
              <li key={r.id}>
                Reassessment required for {r.source_assessment_title ?? "an assessment"} (scored{" "}
                {r.original_percentage.toFixed(0)}%)
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function RetakeCard({ retake, onChanged }: { retake: RetakeRecord; onChanged: () => void }) {
  const [reference, setReference] = useState("");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const canPay = retake.status === "FLAGGED" || retake.status === "PAYMENT_PENDING";
  const payment = retake.payment_reference;

  const submit = async () => {
    if (!reference.trim()) {
      toast.error("Enter the payment reference from your receipt.");
      return;
    }
    setSaving(true);
    try {
      await eligibilityApi.attachRetakePayment(retake.id, {
        external_reference: reference.trim(),
        amount_text: amount.trim() || undefined,
      });
      toast.success("Payment reference sent. The office will confirm it.");
      setReference("");
      setAmount("");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the payment reference");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">
              {retake.course_code} {retake.course_title ? `- ${retake.course_title}` : ""}
            </CardTitle>
            <CardDescription>{TRIGGER_LABEL[retake.trigger] ?? retake.trigger}</CardDescription>
          </div>
          <StatusBadge status={retake.status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-muted-foreground">
          <span>From: {retake.from_period_name ?? "-"}</span>
          <span>Retake in: {retake.target_period_name ?? "to be assigned"}</span>
          {retake.enrolled_at && <span>Enrolled {formatDate(retake.enrolled_at)}</span>}
        </div>

        {payment && (
          <div className="rounded-md border p-3">
            <p className="flex items-center gap-2">
              Payment reference <span className="font-mono">{payment.external_reference ?? "-"}</span>
              <StatusBadge status={payment.status} />
            </p>
            {payment.status === "REJECTED" && payment.notes && (
              <p className="mt-1 text-destructive">Rejected: {payment.notes}</p>
            )}
          </div>
        )}

        {canPay && (!payment || payment.status === "REJECTED") && (
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div className="space-y-1">
              <Label htmlFor={`ref-${retake.id}`}>Payment reference</Label>
              <Input id={`ref-${retake.id}`} value={reference} onChange={(e) => setReference(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`amt-${retake.id}`}>Amount (optional)</Label>
              <Input id={`amt-${retake.id}`} value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <Button onClick={submit} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Send
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RequestsContent() {
  const params = useSearchParams();
  const initialTab = ["retakes", "appeals", "excuses"].includes(params.get("tab") ?? "")
    ? (params.get("tab") as string)
    : "retakes";

  const [loading, setLoading] = useState(true);
  const [retakes, setRetakes] = useState<RetakeRecord[]>([]);
  const [eligibility, setEligibility] = useState<StudentCourseEligibility[]>([]);
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [excuses, setExcuses] = useState<AbsenceExcuse[]>([]);
  const [assessments, setAssessments] = useState<AssessmentOption[]>([]);

  const [excuseAssessment, setExcuseAssessment] = useState("");
  const [excuseReason, setExcuseReason] = useState("");
  const [submittingExcuse, setSubmittingExcuse] = useState(false);

  const load = useCallback(async () => {
    try {
      const [retakeList, appealList, excuseList, assessmentPage] = await Promise.all([
        eligibilityApi.listRetakes(),
        appealApi.listMine(),
        excuseApi.listMine(),
        assessmentApi.getAssessments({ page_size: 100 }),
      ]);
      const options: AssessmentOption[] = ((assessmentPage?.items ?? []) as AssessmentOption[]).map((a) => ({
        id: a.id,
        title: a.title,
        course_id: a.course_id ?? null,
      }));
      setRetakes(retakeList);
      setAppeals(appealList);
      setExcuses(excuseList);
      setAssessments(options);

      const courseIds = Array.from(
        new Set([...options.map((o) => o.course_id), ...retakeList.map((r) => r.course_id)].filter((c): c is string => !!c)),
      ).slice(0, 12);
      const settled = await Promise.allSettled(courseIds.map((id) => eligibilityApi.getCourseEligibility(id)));
      setEligibility(
        settled.flatMap((s) => (s.status === "fulfilled" ? [s.value] : [])),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load your requests");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const assessmentTitle = useMemo(
    () => new Map(assessments.map((a) => [a.id, a.title])),
    [assessments],
  );

  const submitExcuse = async () => {
    const target = assessments.find((a) => a.id === excuseAssessment);
    if (!target?.course_id) {
      toast.error("Choose the assessment you missed.");
      return;
    }
    if (excuseReason.trim().length < EXCUSE_REASON_MIN_LENGTH) {
      toast.error(`Explain your absence in at least ${EXCUSE_REASON_MIN_LENGTH} characters.`);
      return;
    }
    setSubmittingExcuse(true);
    try {
      await excuseApi.create({
        assessment_id: target.id,
        course_id: target.course_id,
        reason: excuseReason.trim(),
      });
      toast.success("Excuse submitted.");
      setExcuseAssessment("");
      setExcuseReason("");
      setExcuses(await excuseApi.listMine());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not submit the excuse");
    } finally {
      setSubmittingExcuse(false);
    }
  };

  const withdrawExcuse = async (id: string) => {
    try {
      await excuseApi.withdraw(id);
      setExcuses(await excuseApi.listMine());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not withdraw the excuse");
    }
  };

  const withdrawAppeal = async (id: string) => {
    try {
      await appealApi.withdraw(id);
      setAppeals(await appealApi.listMine());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not withdraw the appeal");
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold">Eligibility &amp; requests</h1>
        <p className="text-sm text-muted-foreground">
          Your exam eligibility, retakes, mark appeals and absence excuses in one place.
        </p>
      </div>

      <Tabs defaultValue={initialTab}>
        <TabsList>
          <TabsTrigger value="retakes">Retakes{retakes.length > 0 ? ` (${retakes.length})` : ""}</TabsTrigger>
          <TabsTrigger value="appeals">Appeals{appeals.length > 0 ? ` (${appeals.length})` : ""}</TabsTrigger>
          <TabsTrigger value="excuses">Excuses{excuses.length > 0 ? ` (${excuses.length})` : ""}</TabsTrigger>
        </TabsList>

        <TabsContent value="retakes" className="space-y-6">
          <section className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground">Exam eligibility by course</h2>
            {eligibility.length === 0 ? (
              <EmptyState text="No course eligibility to show yet." />
            ) : (
              eligibility.map((e) => <EligibilityCard key={e.course_id} data={e} />)
            )}
          </section>
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <RotateCcw className="h-4 w-4" /> Retake obligations
            </h2>
            {retakes.length === 0 ? (
              <EmptyState text="You have no retakes." />
            ) : (
              retakes.map((r) => <RetakeCard key={r.id} retake={r} onChanged={load} />)
            )}
          </section>
        </TabsContent>

        <TabsContent value="appeals" className="space-y-3">
          {appeals.length === 0 ? (
            <EmptyState text="You have not appealed any mark. Open a released result to request a review." />
          ) : (
            appeals.map((a) => (
              <Card key={a.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">
                      {assessmentTitle.get(a.assessment_id) ?? "Assessment"}
                    </CardTitle>
                    <StatusBadge status={a.status} />
                  </div>
                  <CardDescription>Submitted {formatDate(a.submitted_at)}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p className="text-muted-foreground">{a.reason}</p>
                  {a.decided_at && (
                    <p>
                      Mark {a.original_total} to <span className="font-medium">{a.final_total ?? a.original_total}</span>
                      {a.outcome ? ` (${a.outcome.replace(/_/g, " ").toLowerCase()})` : ""}
                    </p>
                  )}
                  {a.decision_note && <p className="text-muted-foreground">Note: {a.decision_note}</p>}
                  {WITHDRAWABLE_APPEAL_STATUSES.includes(a.status) && (
                    <Button variant="outline" size="sm" onClick={() => withdrawAppeal(a.id)}>
                      Withdraw appeal
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="excuses" className="space-y-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Report a missed assessment</CardTitle>
              <CardDescription>
                If you were sick or had an emergency, explain it here. Your lecturer decides whether to allow a new attempt.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label>Assessment</Label>
                <Select value={excuseAssessment} onValueChange={setExcuseAssessment}>
                  <SelectTrigger><SelectValue placeholder="Choose the assessment you missed" /></SelectTrigger>
                  <SelectContent>
                    {assessments.filter((a) => a.course_id).map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="excuse-reason">Reason</Label>
                <Textarea
                  id="excuse-reason"
                  rows={3}
                  value={excuseReason}
                  onChange={(e) => setExcuseReason(e.target.value)}
                />
              </div>
              <Button onClick={submitExcuse} disabled={submittingExcuse}>
                {submittingExcuse && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Submit excuse
              </Button>
            </CardContent>
          </Card>

          {excuses.length === 0 ? (
            <EmptyState text="No excuses submitted." />
          ) : (
            excuses.map((x) => (
              <Card key={x.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">
                      {assessmentTitle.get(x.assessment_id) ?? "Assessment"}
                    </CardTitle>
                    <StatusBadge status={x.status} />
                  </div>
                  <CardDescription className="flex items-center gap-1">
                    <Clock3 className="h-3 w-3" /> {formatDate(x.created_at)}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p className="text-muted-foreground">{x.reason}</p>
                  {x.decision_note && <p>Note: {x.decision_note}</p>}
                  {x.status === "SUBMITTED" && (
                    <Button variant="outline" size="sm" onClick={() => withdrawExcuse(x.id)}>
                      Withdraw
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function StudentRequestsPage() {
  return (
    <Suspense fallback={<Skeleton className="m-6 h-40" />}>
      <RequestsContent />
    </Suspense>
  );
}
