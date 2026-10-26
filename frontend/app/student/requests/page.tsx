// app/student/requests/page.tsx
"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock3,
  CreditCard,
  FileText,
  GraduationCap,
  Info,
  Loader2,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  XCircle,
} from "lucide-react";
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
import { cn } from "@/lib/utils";

interface AssessmentOption {
  id: string;
  title: string;
  course_id: string | null;
}

const RETAKE_STATUS_LABEL: Record<string, string> = {
  FLAGGED: "Action Required",
  PAYMENT_PENDING: "Awaiting Payment",
  PAID: "Payment Under Review",
  ENROLLED: "Enrolled",
  CANCELLED: "Cancelled",
  SUBMITTED: "Submitted",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
  DECIDED: "Decided",
  CLOSED: "Closed",
  CONFIRMED: "Confirmed",
};

const TRIGGER_LABEL: Record<string, string> = {
  ENTRY_THRESHOLD_NOT_MET: "Coursework average below exam entry mark",
  SUMMATIVE_FAILED: "Summative assessment standard not met",
};

function formatDate(value?: string | null): string {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "-";
  }
}

function StatusBadge({ status }: { status: string }) {
  const norm = (status || "").toUpperCase();
  const isGood = ["ENROLLED", "APPROVED", "DECIDED", "CLOSED", "CONFIRMED", "PAID"].includes(norm);
  const isBad = ["REJECTED", "REJECTED_INVALID", "CANCELLED", "WITHDRAWN"].includes(norm);
  const isPending = ["FLAGGED", "PAYMENT_PENDING", "SUBMITTED", "PENDING", "UNDER_REVIEW"].includes(norm);

  const label = RETAKE_STATUS_LABEL[norm] ?? norm.replace(/_/g, " ").toLowerCase();

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize shrink-0",
        isGood &&
          "border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
        isBad &&
          "border border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
        isPending &&
          "border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
        !isGood &&
          !isBad &&
          !isPending &&
          "border border-border/70 bg-muted/60 text-muted-foreground",
      )}
    >
      {isGood && <CheckCircle2 className="size-3 text-emerald-600 dark:text-emerald-400" />}
      {isBad && <XCircle className="size-3 text-rose-600 dark:text-rose-400" />}
      {isPending && <Clock3 className="size-3 text-amber-600 dark:text-amber-400" />}
      {label}
    </span>
  );
}

function EmptyState({
  title,
  text,
  actionText,
  actionHref,
}: {
  title?: string;
  text: string;
  actionText?: string;
  actionHref?: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border/70 bg-card/40 p-8 text-center space-y-2.5">
      <div className="size-10 rounded-xl bg-muted/50 flex items-center justify-center mx-auto text-muted-foreground">
        <Info className="size-5" />
      </div>
      <div className="space-y-1">
        {title && <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">{title}</h3>}
        <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">{text}</p>
      </div>
      {actionText && actionHref && (
        <Button asChild variant="outline" size="sm" className="h-7 text-xs rounded-lg mt-1">
          <Link href={actionHref}>{actionText}</Link>
        </Button>
      )}
    </div>
  );
}

function EligibilityCard({ data }: { data: StudentCourseEligibility }) {
  const isEligible = data.summative_entry_eligible;

  return (
    <Card className="rounded-xl border border-border/70 bg-card text-card-foreground shadow-xs w-full min-w-0 transition-all duration-200 ease-linear">
      <CardHeader className="py-3.5 px-4 sm:px-5 border-b border-border/40 bg-muted/15">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono font-bold text-xs bg-muted/70 text-foreground px-2 py-0.5 rounded-md">
              {data.course_code}
            </span>
            <span className="text-sm font-semibold text-foreground truncate max-w-md">
              {data.course_title}
            </span>
          </div>

          {isEligible ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="size-3.5" /> Exam Eligible
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/30 bg-rose-500/10 px-2.5 py-0.5 text-xs font-semibold text-rose-700 dark:text-rose-300">
              <XCircle className="size-3.5" /> Entry Restricted
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-5 space-y-3.5">
        <p className="text-xs text-foreground/90 leading-relaxed font-medium">
          {data.summative_entry_reason}
        </p>

        {/* Coursework Metrics Chips */}
        <div className="flex flex-wrap items-center gap-2.5 text-xs">
          <div className="bg-muted/40 rounded-lg px-2.5 py-1.5 border border-border/40">
            <span className="text-muted-foreground mr-1.5">Coursework Average:</span>
            <span className="font-bold font-mono text-foreground">
              {data.has_coursework && data.coursework_average != null
                ? `${data.coursework_average.toFixed(1)}%`
                : "Not Available"}
            </span>
          </div>

          {data.pending_marks_count > 0 && (
            <div className="bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 rounded-lg px-2.5 py-1.5 font-medium flex items-center gap-1">
              <Clock3 className="size-3" />
              <span>{data.pending_marks_count} mark(s) pending grading</span>
            </div>
          )}

          {data.active_override && (
            <div className="bg-indigo-500/10 border border-indigo-500/20 text-indigo-700 dark:text-indigo-400 rounded-lg px-2.5 py-1.5 font-medium flex items-center gap-1">
              <ShieldCheck className="size-3" />
              <span>Special Academic Permission Granted</span>
            </div>
          )}
        </div>

        {/* Pending Reassessments */}
        {data.pending_reassessments.length > 0 && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-1.5">
            <span className="text-xs font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
              <AlertTriangle className="size-3.5 text-amber-600 dark:text-amber-400" />
              Reassessment Required
            </span>
            <ul className="text-xs text-amber-800 dark:text-amber-300 space-y-1 list-disc pl-4">
              {data.pending_reassessments.map((r) => (
                <li key={r.id}>
                  Assessment requirement: {r.source_assessment_title ?? "Component"}{" "}
                  (Previous score: {r.original_percentage.toFixed(0)}%)
                </li>
              ))}
            </ul>
          </div>
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
      toast.error("Enter the payment receipt reference code.");
      return;
    }
    setSaving(true);
    try {
      await eligibilityApi.attachRetakePayment(retake.id, {
        external_reference: reference.trim(),
        amount_text: amount.trim() || undefined,
      });
      toast.success("Payment reference submitted. The academic registry will review and confirm.");
      setReference("");
      setAmount("");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not record payment reference");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="rounded-xl border border-border/70 bg-card text-card-foreground shadow-xs w-full min-w-0 transition-all duration-200 ease-linear">
      <CardHeader className="py-3.5 px-4 sm:px-5 border-b border-border/40 bg-muted/15">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-xs bg-muted/70 text-foreground px-2 py-0.5 rounded-md">
                {retake.course_code || "Retake"}
              </span>
              <CardTitle className="text-sm font-semibold text-foreground">
                {retake.course_title || "Course Retake Obligation"}
              </CardTitle>
            </div>
            <CardDescription className="text-xs text-muted-foreground">
              Reason: {TRIGGER_LABEL[retake.trigger] ?? retake.trigger}
            </CardDescription>
          </div>
          <StatusBadge status={retake.status} />
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-5 space-y-3.5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
          <span>
            Original Session: <strong className="text-foreground font-semibold">{retake.from_period_name ?? "-"}</strong>
          </span>
          <span>
            Target Term: <strong className="text-foreground font-semibold">{retake.target_period_name ?? "To be scheduled"}</strong>
          </span>
          {retake.enrolled_at && (
            <span>
              Enrolled: <strong className="text-foreground font-semibold">{formatDate(retake.enrolled_at)}</strong>
            </span>
          )}
        </div>

        {payment && (
          <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-1 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-foreground flex items-center gap-1.5">
                <CreditCard className="size-3.5 text-primary" />
                Receipt Reference: <span className="font-mono font-bold">{payment.external_reference ?? "-"}</span>
              </span>
              <StatusBadge status={payment.status} />
            </div>
            {payment.status === "REJECTED" && payment.notes && (
              <p className="text-rose-600 dark:text-rose-400 font-medium pt-1">
                Registry Note: {payment.notes}
              </p>
            )}
          </div>
        )}

        {canPay && (!payment || payment.status === "REJECTED") && (
          <div className="rounded-lg border border-primary/20 bg-primary/[0.02] p-3.5 space-y-3">
            <div className="space-y-0.5">
              <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <CreditCard className="size-3.5 text-primary" /> Submit Retake Fee Reference
              </span>
              <p className="text-[11px] text-muted-foreground">
                Provide your bank or institutional payment reference to activate course re-enrollment.
              </p>
            </div>

            <div className="grid gap-2.5 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <div className="space-y-1">
                <Label htmlFor={`ref-${retake.id}`} className="text-xs font-medium">
                  Payment Reference / Transaction ID <span className="text-destructive">*</span>
                </Label>
                <Input
                  id={`ref-${retake.id}`}
                  placeholder="e.g. TXN-893427"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  className="h-8.5 text-xs bg-background"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor={`amt-${retake.id}`} className="text-xs font-medium">
                  Amount Paid (optional)
                </Label>
                <Input
                  id={`amt-${retake.id}`}
                  placeholder="e.g. $150 or RWF 50,000"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="h-8.5 text-xs bg-background"
                />
              </div>

              <Button
                size="sm"
                onClick={submit}
                disabled={saving || !reference.trim()}
                className="h-8.5 text-xs rounded-lg font-medium"
              >
                {saving && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
                Submit
              </Button>
            </div>
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

  const eligibleCount = useMemo(
    () => eligibility.filter((e) => e.summative_entry_eligible).length,
    [eligibility],
  );

  const pendingAppealsCount = useMemo(
    () => appeals.filter((a) => !["DECIDED", "REJECTED", "WITHDRAWN"].includes(a.status.toUpperCase())).length,
    [appeals],
  );

  const submitExcuse = async () => {
    const target = assessments.find((a) => a.id === excuseAssessment);
    if (!target?.course_id) {
      toast.error("Choose the assessment you were unable to attend.");
      return;
    }
    if (excuseReason.trim().length < EXCUSE_REASON_MIN_LENGTH) {
      toast.error(`Please detail your absence justification in at least ${EXCUSE_REASON_MIN_LENGTH} characters.`);
      return;
    }
    setSubmittingExcuse(true);
    try {
      await excuseApi.create({
        assessment_id: target.id,
        course_id: target.course_id,
        reason: excuseReason.trim(),
      });
      toast.success("Absence excuse successfully submitted for faculty review.");
      setExcuseAssessment("");
      setExcuseReason("");
      setExcuses(await excuseApi.listMine());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not submit absence excuse");
    } finally {
      setSubmittingExcuse(false);
    }
  };

  const withdrawExcuse = async (id: string) => {
    try {
      await excuseApi.withdraw(id);
      toast.success("Absence excuse withdrawn.");
      setExcuses(await excuseApi.listMine());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not withdraw excuse");
    }
  };

  const withdrawAppeal = async (id: string) => {
    try {
      await appealApi.withdraw(id);
      toast.success("Grade appeal withdrawn.");
      setAppeals(await appealApi.listMine());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not withdraw appeal");
    }
  };

  if (loading) {
    return (
      <div className="w-full min-w-0 transition-all duration-200 ease-linear space-y-4 py-2">
        <Skeleton className="h-8 w-56 rounded-lg" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-44 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 transition-all duration-200 ease-linear space-y-4 pb-12 animate-in fade-in duration-200">
      {/* ── Executive Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/40 pb-3">
        <div className="space-y-0.5">
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            Eligibility &amp; Academic Requests
          </h1>
          <p className="text-xs text-muted-foreground">
            Manage your exam permissions, retake obligations, mark appeals, and absence excuses.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => void load()}
          className="h-8 gap-1.5 text-xs rounded-lg self-start sm:self-auto font-medium"
        >
          <RotateCcw className="size-3.5" /> Refresh Status
        </Button>
      </div>

      {/* ── Overview Status Metric Strip ── */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 w-full min-w-0">
        <div className="bg-card border border-border/70 rounded-xl p-3 shadow-xs space-y-0.5">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[10px] uppercase font-bold tracking-wider">Exam Entry</span>
            <GraduationCap className="size-3.5 text-primary" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold text-foreground tabular-nums font-mono">
              {eligibleCount} / {eligibility.length}
            </span>
            <span className="text-xs text-muted-foreground font-medium">Eligible</span>
          </div>
        </div>

        <div className="bg-card border border-border/70 rounded-xl p-3 shadow-xs space-y-0.5">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[10px] uppercase font-bold tracking-wider">Retakes</span>
            <RotateCcw className="size-3.5 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold text-foreground tabular-nums font-mono">
              {retakes.length}
            </span>
            <span className="text-xs text-muted-foreground font-medium">Active</span>
          </div>
        </div>

        <div className="bg-card border border-border/70 rounded-xl p-3 shadow-xs space-y-0.5">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[10px] uppercase font-bold tracking-wider">Appeals</span>
            <FileText className="size-3.5 text-primary" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold text-foreground tabular-nums font-mono">
              {appeals.length}
            </span>
            <span className="text-xs text-muted-foreground font-medium">
              ({pendingAppealsCount} in review)
            </span>
          </div>
        </div>

        <div className="bg-card border border-border/70 rounded-xl p-3 shadow-xs space-y-0.5">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[10px] uppercase font-bold tracking-wider">Excuses</span>
            <Clock3 className="size-3.5 text-primary" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold text-foreground tabular-nums font-mono">
              {excuses.length}
            </span>
            <span className="text-xs text-muted-foreground font-medium">Reported</span>
          </div>
        </div>
      </section>

      {/* ── Request Sections Navigation Tabs ── */}
      <Tabs defaultValue={initialTab} className="space-y-3.5 w-full min-w-0">
        <TabsList className="bg-muted/40 p-1 rounded-xl h-auto flex flex-wrap gap-1 border border-border/50">
          <TabsTrigger
            value="retakes"
            className="rounded-lg text-xs font-semibold px-3 py-1.5 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-xs gap-1.5"
          >
            <GraduationCap className="size-3.5" />
            Eligibility &amp; Retakes
            {(eligibility.length > 0 || retakes.length > 0) && (
              <Badge variant="outline" className="ml-1 text-[10px] font-mono px-1 py-0 h-4 border-border/60">
                {eligibility.length + retakes.length}
              </Badge>
            )}
          </TabsTrigger>

          <TabsTrigger
            value="appeals"
            className="rounded-lg text-xs font-semibold px-3 py-1.5 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-xs gap-1.5"
          >
            <FileText className="size-3.5" />
            Mark Appeals
            {appeals.length > 0 && (
              <Badge variant="outline" className="ml-1 text-[10px] font-mono px-1 py-0 h-4 border-border/60">
                {appeals.length}
              </Badge>
            )}
          </TabsTrigger>

          <TabsTrigger
            value="excuses"
            className="rounded-lg text-xs font-semibold px-3 py-1.5 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-xs gap-1.5"
          >
            <Clock3 className="size-3.5" />
            Absence Excuses
            {excuses.length > 0 && (
              <Badge variant="outline" className="ml-1 text-[10px] font-mono px-1 py-0 h-4 border-border/60">
                {excuses.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Course Eligibility & Retakes ── */}
        <TabsContent value="retakes" className="space-y-4 w-full min-w-0 mt-0">
          {/* Exam Eligibility List */}
          <section className="space-y-3">
            <div className="flex items-center justify-between border-b border-border/40 pb-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <ShieldCheck className="size-3.5 text-primary" /> Exam Entry Status by Course
              </h2>
              <span className="text-xs text-muted-foreground font-medium">
                {eligibleCount} of {eligibility.length} course(s) eligible
              </span>
            </div>

            {eligibility.length === 0 ? (
              <EmptyState text="No active course eligibility records found." />
            ) : (
              <div className="space-y-3">
                {eligibility.map((e) => (
                  <EligibilityCard key={e.course_id} data={e} />
                ))}
              </div>
            )}
          </section>

          {/* Retake Obligations List */}
          <section className="space-y-3 pt-2">
            <div className="flex items-center justify-between border-b border-border/40 pb-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <RotateCcw className="size-3.5 text-primary" /> Course Retake Obligations
              </h2>
              <span className="text-xs text-muted-foreground font-medium">
                {retakes.length} retake requirement(s)
              </span>
            </div>

            {retakes.length === 0 ? (
              <EmptyState text="You have no outstanding retake obligations." />
            ) : (
              <div className="space-y-3">
                {retakes.map((r) => (
                  <RetakeCard key={r.id} retake={r} onChanged={load} />
                ))}
              </div>
            )}
          </section>
        </TabsContent>

        {/* ── Tab 2: Mark Appeals ── */}
        <TabsContent value="appeals" className="space-y-3 w-full min-w-0 mt-0">
          {appeals.length === 0 ? (
            <EmptyState
              title="No Active Mark Appeals"
              text="You have not submitted any assessment appeals. If you believe your awarded marks require formal re-evaluation, open any released assessment from the Results section and click 'Request Review'."
              actionText="View Released Results"
              actionHref="/student/results"
            />
          ) : (
            appeals.map((a) => (
              <Card key={a.id} className="rounded-xl border border-border/70 bg-card text-card-foreground shadow-xs w-full min-w-0 transition-all duration-200 ease-linear">
                <CardHeader className="py-3.5 px-4 sm:px-5 border-b border-border/40 bg-muted/15">
                  <div className="flex flex-wrap items-center justify-between gap-2.5">
                    <div>
                      <CardTitle className="text-sm font-semibold text-foreground">
                        {assessmentTitle.get(a.assessment_id) ?? "Assessment Result Appeal"}
                      </CardTitle>
                      <CardDescription className="text-xs text-muted-foreground">
                        Submitted: {formatDate(a.submitted_at)}
                      </CardDescription>
                    </div>
                    <StatusBadge status={a.status} />
                  </div>
                </CardHeader>

                <CardContent className="p-4 sm:p-5 space-y-3 text-xs">
                  <div className="bg-muted/30 rounded-lg p-3 border border-border/40 space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                      Appeal Reason
                    </span>
                    <p className="text-foreground leading-relaxed font-medium">{a.reason}</p>
                  </div>

                  {a.decided_at && (
                    <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300 font-medium">
                      <CheckCircle2 className="size-3.5 shrink-0" />
                      <span>
                        Outcome: Mark adjusted from <strong className="font-mono">{a.original_total}</strong> to{" "}
                        <strong className="font-mono">{a.final_total ?? a.original_total}</strong>
                        {a.outcome ? ` (${a.outcome.replace(/_/g, " ").toLowerCase()})` : ""}
                      </span>
                    </div>
                  )}

                  {a.decision_note && (
                    <div className="p-3 rounded-lg bg-muted/40 border border-border/50 text-muted-foreground space-y-0.5">
                      <span className="font-semibold text-foreground block">Faculty Decision Note:</span>
                      <p>{a.decision_note}</p>
                    </div>
                  )}

                  {WITHDRAWABLE_APPEAL_STATUSES.includes(a.status) && (
                    <div className="pt-1 flex justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => withdrawAppeal(a.id)}
                        className="h-7.5 text-xs rounded-lg text-muted-foreground hover:text-destructive hover:border-destructive/40"
                      >
                        Withdraw Appeal
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* ── Tab 3: Absence Excuses ── */}
        <TabsContent value="excuses" className="space-y-4 w-full min-w-0 mt-0">
          {/* Submit Absence Excuse Form */}
          <Card className="rounded-xl border border-border/70 bg-card text-card-foreground shadow-xs w-full min-w-0 transition-all duration-200 ease-linear">
            <CardHeader className="py-3.5 px-4 sm:px-5 border-b border-border/40 bg-muted/15">
              <div className="space-y-0.5">
                <CardTitle className="text-sm font-bold text-foreground flex items-center gap-1.5">
                  <Clock3 className="size-3.5 text-primary" /> Report a Missed Assessment
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  If an emergency, documented medical condition, or university-sanctioned obligation prevented attendance, explain it below.
                </CardDescription>
              </div>
            </CardHeader>

            <CardContent className="p-4 sm:p-5 space-y-3.5">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Select Missed Assessment <span className="text-destructive">*</span></Label>
                <Select value={excuseAssessment} onValueChange={setExcuseAssessment}>
                  <SelectTrigger className="h-9 text-xs rounded-lg border-border/70 bg-background font-medium">
                    <SelectValue placeholder="Choose the assessment you missed" />
                  </SelectTrigger>
                  <SelectContent className="rounded-lg text-xs">
                    {assessments
                      .filter((a) => a.course_id)
                      .map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.title}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="excuse-reason" className="text-xs font-semibold">
                    Detailed Reason &amp; Justification <span className="text-destructive">*</span>
                  </Label>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {excuseReason.trim().length} / {EXCUSE_REASON_MIN_LENGTH} min
                  </span>
                </div>
                <Textarea
                  id="excuse-reason"
                  rows={3}
                  placeholder="Explain the reason for your absence in detail..."
                  value={excuseReason}
                  onChange={(e) => setExcuseReason(e.target.value)}
                  className="text-xs rounded-lg bg-background border-border/70 font-medium leading-relaxed"
                />
              </div>

              <Button
                onClick={submitExcuse}
                disabled={submittingExcuse || excuseReason.trim().length < EXCUSE_REASON_MIN_LENGTH || !excuseAssessment}
                className="h-8.5 text-xs rounded-lg font-medium"
              >
                {submittingExcuse && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
                <Send className="mr-1.5 size-3" /> Submit Absence Excuse
              </Button>
            </CardContent>
          </Card>

          {/* Submitted Excuses Feed */}
          <section className="space-y-3 pt-1">
            <div className="border-b border-border/40 pb-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Clock3 className="size-3.5 text-primary" /> Submitted Absence Excuses
              </h2>
            </div>

            {excuses.length === 0 ? (
              <EmptyState text="You have not submitted any absence excuses." />
            ) : (
              excuses.map((x) => (
                <Card key={x.id} className="rounded-xl border border-border/70 bg-card text-card-foreground shadow-xs w-full min-w-0 transition-all duration-200 ease-linear">
                  <CardHeader className="py-3 px-4 sm:px-5 border-b border-border/40 bg-muted/15">
                    <div className="flex flex-wrap items-center justify-between gap-2.5">
                      <div>
                        <CardTitle className="text-sm font-semibold text-foreground">
                          {assessmentTitle.get(x.assessment_id) ?? "Assessment Excuse"}
                        </CardTitle>
                        <CardDescription className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Calendar className="size-3" /> Reported: {formatDate(x.created_at)}
                        </CardDescription>
                      </div>
                      <StatusBadge status={x.status} />
                    </div>
                  </CardHeader>

                  <CardContent className="p-4 sm:p-5 space-y-2.5 text-xs">
                    <p className="text-foreground leading-relaxed">{x.reason}</p>
                    {x.decision_note && (
                      <div className="p-2.5 rounded-lg bg-muted/40 border border-border/50 text-muted-foreground">
                        <span className="font-semibold text-foreground block">Faculty Decision:</span>
                        <p>{x.decision_note}</p>
                      </div>
                    )}
                    {x.status === "SUBMITTED" && (
                      <div className="pt-1 flex justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => withdrawExcuse(x.id)}
                          className="h-7 text-xs rounded-lg text-muted-foreground hover:text-destructive hover:border-destructive/40"
                        >
                          Withdraw
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function StudentRequestsPage() {
  return (
    <Suspense
      fallback={
        <div className="w-full space-y-4 py-2">
          <Skeleton className="h-8 w-48 rounded-lg" />
          <Skeleton className="h-44 w-full rounded-xl" />
        </div>
      }
    >
      <RequestsContent />
    </Suspense>
  );
}
