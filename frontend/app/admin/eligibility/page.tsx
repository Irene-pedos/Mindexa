"use client";

// app/admin/eligibility/page.tsx
// Per-institution exam-entry rules (spec R-20): coursework thresholds and what happens while
// coursework marks are still being graded or when a student has no coursework at all.

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  Building2,
  Check,
  CheckCircle2,
  FileCheck,
  HelpCircle,
  Info,
  Loader2,
  RotateCcw,
  Save,
  Scale,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  UserCheck,
  UserX,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { academicApi, type AcademicInstitution } from "@/lib/api/academic";
import {
  eligibilityPolicyApi,
  type EligibilityPolicy,
  type EligibilityPolicyUpdate,
  type NoCourseworkBehavior,
  type PendingMarksBehavior,
  type ReassessmentBlockScope,
} from "@/lib/api/eligibility-policy";
import { cn } from "@/lib/utils";

const PENDING_OPTIONS: Array<{
  value: PendingMarksBehavior;
  label: string;
  badge: string;
  hint: string;
  icon: typeof ShieldAlert;
}> = [
  {
    value: "BLOCK",
    label: "Block exam entry",
    badge: "Strict Gate",
    hint: "The student cannot sit the summative exam until every CAT and formative mark is officially released.",
    icon: ShieldAlert,
  },
  {
    value: "MANUAL_REVIEW",
    label: "Hold for manual review",
    badge: "Review Required",
    hint: "Entry is suspended until a Head of Department or Exam Officer evaluates coursework and logs an override.",
    icon: UserCheck,
  },
  {
    value: "EXCLUDE",
    label: "Ignore ungraded work",
    badge: "Progressive",
    hint: "Entry is calculated only on already released grades; ungraded assessments are excluded from the coursework average.",
    icon: SlidersHorizontal,
  },
];

const NO_COURSEWORK_OPTIONS: Array<{
  value: NoCourseworkBehavior;
  label: string;
  description: string;
  icon: typeof UserX;
}> = [
  {
    value: "BLOCK",
    label: "Block exam entry",
    description: "Automatic disqualification if zero coursework marks exist.",
    icon: ShieldAlert,
  },
  {
    value: "MANUAL_REVIEW",
    label: "Manual review",
    description: "Hold for departmental authorization before admit card issuance.",
    icon: UserCheck,
  },
  {
    value: "ALLOW",
    label: "Allow exam entry",
    description: "Permit entry; final grade relies 100% on summative score.",
    icon: CheckCircle2,
  },
];

const SCOPE_OPTIONS: Array<{
  value: ReassessmentBlockScope;
  label: string;
  detail: string;
}> = [
  {
    value: "COURSE",
    label: "Current Module Only",
    detail: "Reassessment locks summative admission solely in the affected course.",
  },
  {
    value: "ALL_COURSES",
    label: "Institutional (All Modules)",
    detail: "Outstanding reassessments lock all exams across the academic term.",
  },
];

type Draft = Pick<
  EligibilityPolicy,
  | "formative_exempt_pct"
  | "summative_entry_pct"
  | "summative_pass_pct"
  | "reassessment_block_scope"
  | "pending_marks_behavior"
  | "no_coursework_behavior"
  | "allow_hod_override"
>;

function toDraft(policy: EligibilityPolicy): Draft {
  return {
    formative_exempt_pct: policy.formative_exempt_pct,
    summative_entry_pct: policy.summative_entry_pct,
    summative_pass_pct: policy.summative_pass_pct,
    reassessment_block_scope: policy.reassessment_block_scope,
    pending_marks_behavior: policy.pending_marks_behavior,
    no_coursework_behavior: policy.no_coursework_behavior,
    allow_hod_override: policy.allow_hod_override,
  };
}

function isValidPercent(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 100;
}

export default function EligibilityPolicyPage() {
  const [institutions, setInstitutions] = useState<AcademicInstitution[]>([]);
  const [institutionId, setInstitutionId] = useState("");
  const [saved, setSaved] = useState<Draft | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    academicApi
      .getInstitutions()
      .then((list) => {
        setInstitutions(list);
        if (list.length > 0) setInstitutionId(list[0].id);
        else setLoading(false);
      })
      .catch(() => {
        setError("Could not load institutions list.");
        setLoading(false);
      });
  }, []);

  const loadPolicy = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const next = toDraft(await eligibilityPolicyApi.get(id));
      setSaved(next);
      setDraft(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the eligibility policy.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (institutionId) void loadPolicy(institutionId);
  }, [institutionId, loadPolicy]);

  const update = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));

  const dirty = !!draft && !!saved && JSON.stringify(draft) !== JSON.stringify(saved);
  const percentsValid =
    !!draft &&
    isValidPercent(draft.summative_entry_pct) &&
    isValidPercent(draft.summative_pass_pct) &&
    isValidPercent(draft.formative_exempt_pct);

  const save = async () => {
    if (!draft || !percentsValid) return;
    setSaving(true);
    try {
      const body: EligibilityPolicyUpdate = draft;
      const next = toDraft(await eligibilityPolicyApi.update(institutionId, body));
      setSaved(next);
      setDraft(next);
      toast.success("Eligibility policy saved successfully. Applied to upcoming exam cohorts.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the eligibility policy.");
    } finally {
      setSaving(false);
    }
  };

  const selectedInstitution = institutions.find((i) => i.id === institutionId);

  return (
    <div className="w-full min-w-0 space-y-6 transition-all duration-300 ease-in-out">
      {/* Header Bar */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between pb-5 border-b border-border/40">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Scale className="size-4.5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold tracking-tight text-foreground">
                  Exam Entry & Eligibility Policy
                </h1>
                <Badge variant="outline" className="text-[10px] font-mono px-2 py-0 h-5 border-primary/30 text-primary bg-primary/5">
                  R-20 Standard
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Institutional coursework requirements, threshold gates, and grading exception policies.
              </p>
            </div>
          </div>
        </div>

        {/* Institution Selector & Status Pill */}
        <div className="flex flex-wrap items-center gap-2.5 self-start lg:self-auto">
          <div className="flex items-center gap-2 bg-card px-3 py-1.5 rounded-xl border border-border shadow-xs">
            <Building2 className="size-4 text-muted-foreground shrink-0" />
            <span className="text-xs font-medium text-muted-foreground">Institution:</span>
            <Select
              value={institutionId}
              onValueChange={setInstitutionId}
              disabled={institutions.length === 0 || loading}
            >
              <SelectTrigger className="h-7 text-xs font-semibold w-48 sm:w-56 border-none bg-transparent shadow-none px-1.5 focus:ring-0">
                <SelectValue placeholder="Select institution..." />
              </SelectTrigger>
              <SelectContent align="end">
                {institutions.map((i) => (
                  <SelectItem key={i.id} value={i.id} className="text-xs">
                    {i.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {dirty && (
            <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 text-[11px] gap-1 px-2.5 py-1">
              <span className="size-1.5 rounded-full bg-amber-500 animate-pulse" />
              Unsaved Changes
            </Badge>
          )}
        </div>
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-xs text-destructive">
          <AlertCircle className="size-4.5 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-semibold">Unable to fetch policy details</p>
            <p className="opacity-90">{error}</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" aria-busy="true">
          <div className="lg:col-span-7 space-y-6">
            <Skeleton className="h-64 w-full rounded-2xl" />
            <Skeleton className="h-64 w-full rounded-2xl" />
          </div>
          <div className="lg:col-span-5 space-y-6">
            <Skeleton className="h-80 w-full rounded-2xl" />
            <Skeleton className="h-48 w-full rounded-2xl" />
          </div>
        </div>
      ) : draft ? (
        <div className="space-y-6">
          {/* Main 2-Column Responsive Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column: Academic Thresholds & Pending Marks Strategy (7 Cols) */}
            <div className="lg:col-span-7 space-y-6">
              {/* Thresholds Card */}
              <Card className="rounded-2xl border border-border shadow-xs">
                <CardHeader className="px-4 sm:px-5 pt-4 sm:pt-5 pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base font-semibold tracking-tight">
                        Academic Mark Thresholds
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Minimum benchmark percentages for examination seating and module progression.
                      </CardDescription>
                    </div>
                    <Badge variant="outline" className="text-[10px] font-mono">
                      Scale: 0-100%
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="px-4 sm:px-5 pb-4 sm:pb-5 pt-1 space-y-4 sm:space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                    {/* Summative Entry Threshold */}
                    <div className="p-3.5 sm:p-4 rounded-xl bg-muted/20 border border-border/60 space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="summative_entry_pct" className="text-xs font-semibold">
                          Exam Entry
                        </Label>
                        <span className="text-xs font-mono font-bold text-primary">
                          {draft.summative_entry_pct}%
                        </span>
                      </div>
                      <Input
                        id="summative_entry_pct"
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        value={Number.isFinite(draft.summative_entry_pct) ? draft.summative_entry_pct : ""}
                        onChange={(e) =>
                          update("summative_entry_pct", e.target.value === "" ? Number.NaN : Number(e.target.value))
                        }
                        className="h-9 text-xs font-semibold"
                      />
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        Coursework avg needed to sit the summative examination.
                      </p>
                    </div>

                    {/* Summative Pass Mark */}
                    <div className="p-3.5 sm:p-4 rounded-xl bg-muted/20 border border-border/60 space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="summative_pass_pct" className="text-xs font-semibold">
                          Module Pass
                        </Label>
                        <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
                          {draft.summative_pass_pct}%
                        </span>
                      </div>
                      <Input
                        id="summative_pass_pct"
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        value={Number.isFinite(draft.summative_pass_pct) ? draft.summative_pass_pct : ""}
                        onChange={(e) =>
                          update("summative_pass_pct", e.target.value === "" ? Number.NaN : Number(e.target.value))
                        }
                        className="h-9 text-xs font-semibold"
                      />
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        Minimum score to achieve passing academic credits.
                      </p>
                    </div>

                    {/* Formative Exemption */}
                    <div className="p-3.5 sm:p-4 rounded-xl bg-muted/20 border border-border/60 space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="formative_exempt_pct" className="text-xs font-semibold">
                          Formative Exemption
                        </Label>
                        <span className="text-xs font-mono font-bold text-amber-600 dark:text-amber-400">
                          {draft.formative_exempt_pct}%
                        </span>
                      </div>
                      <Input
                        id="formative_exempt_pct"
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        value={Number.isFinite(draft.formative_exempt_pct) ? draft.formative_exempt_pct : ""}
                        onChange={(e) =>
                          update("formative_exempt_pct", e.target.value === "" ? Number.NaN : Number(e.target.value))
                        }
                        className="h-9 text-xs font-semibold"
                      />
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        Below this triggers a mandatory reassessment mandate.
                      </p>
                    </div>
                  </div>

                  {/* Visual Progression Scale */}
                  <div className="p-3.5 sm:p-4 rounded-xl bg-card border border-border/80 space-y-2.5">
                    <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
                      <span>Progression Pipeline</span>
                      <span className="font-mono text-[11px]">0% — 100% Benchmark</span>
                    </div>
                    <div className="relative h-3 w-full bg-muted rounded-full overflow-hidden flex">
                      <div
                        style={{ width: `${Math.min(100, Math.max(0, draft.formative_exempt_pct))}%` }}
                        className="h-full bg-amber-500/70 transition-all duration-300"
                        title="Formative Exemption Zone"
                      />
                      <div
                        style={{
                          width: `${Math.max(
                            0,
                            Math.min(100, draft.summative_entry_pct) - Math.min(100, draft.formative_exempt_pct)
                          )}%`,
                        }}
                        className="h-full bg-primary/70 transition-all duration-300"
                        title="Entry Threshold Zone"
                      />
                      <div
                        style={{
                          width: `${Math.max(
                            0,
                            100 - Math.max(draft.summative_entry_pct, draft.formative_exempt_pct)
                          )}%`,
                        }}
                        className="h-full bg-emerald-500/70 transition-all duration-300"
                        title="Pass Zone"
                      />
                    </div>
                    <div className="flex flex-wrap justify-between items-center gap-1 text-[10px] text-muted-foreground font-mono">
                      <span>Remedial (&lt;{draft.formative_exempt_pct}%)</span>
                      <span>Entry Gate ({draft.summative_entry_pct}%)</span>
                      <span>Passing ({draft.summative_pass_pct}%)</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Pending Coursework Marks Card */}
              <Card className="rounded-2xl border border-border shadow-xs">
                <CardHeader className="px-4 sm:px-5 pt-4 sm:pt-5 pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base font-semibold tracking-tight">
                        Pending Coursework Behavior
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Action required when a candidate has submitted coursework that is actively under grading.
                      </CardDescription>
                    </div>
                    <Badge variant="secondary" className="text-[10px] uppercase font-bold">
                      CAT & Formatives
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="px-4 sm:px-5 pb-4 sm:pb-5 pt-1 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {PENDING_OPTIONS.map((opt) => {
                      const isSelected = draft.pending_marks_behavior === opt.value;
                      const Icon = opt.icon;
                      return (
                        <div
                          key={opt.value}
                          onClick={() => update("pending_marks_behavior", opt.value)}
                          className={cn(
                            "cursor-pointer p-3.5 sm:p-4 rounded-xl border transition-all duration-200 flex flex-col justify-between gap-3 text-left",
                            isSelected
                              ? "bg-primary/5 border-primary shadow-xs ring-1 ring-primary/20"
                              : "bg-card border-border/70 hover:border-border hover:bg-muted/10"
                          )}
                        >
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <div
                                className={cn(
                                  "size-7 rounded-lg flex items-center justify-center",
                                  isSelected
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-muted text-muted-foreground"
                                )}
                              >
                                <Icon className="size-3.5" />
                              </div>
                              {isSelected && <Check className="size-4 text-primary" />}
                            </div>
                            <h4 className="text-xs font-semibold text-foreground pt-1">{opt.label}</h4>
                            <p className="text-[11px] text-muted-foreground leading-relaxed">{opt.hint}</p>
                          </div>
                          <span
                            className={cn(
                              "text-[9px] font-bold uppercase tracking-wider",
                              isSelected ? "text-primary" : "text-muted-foreground"
                            )}
                          >
                            {opt.badge}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right Column: Edge Cases, Overrides & Summary (5 Cols) */}
            <div className="lg:col-span-5 space-y-6">
              {/* Exceptions & Overrides Card */}
              <Card className="rounded-2xl border border-border shadow-xs">
                <CardHeader className="px-4 sm:px-5 pt-4 sm:pt-5 pb-3">
                  <CardTitle className="text-base font-semibold tracking-tight">
                    Exceptions & Scope Controls
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Handling candidates without coursework and reassessment boundary rules.
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-4 sm:px-5 pb-4 sm:pb-5 pt-1 space-y-4 sm:space-y-5">
                  {/* Zero Coursework Behavior */}
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold">Zero Coursework Submissions</Label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {NO_COURSEWORK_OPTIONS.map((opt) => {
                        const isSelected = draft.no_coursework_behavior === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => update("no_coursework_behavior", opt.value)}
                            className={cn(
                              "p-2.5 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1",
                              isSelected
                                ? "bg-primary/5 border-primary text-primary font-semibold shadow-2xs"
                                : "bg-card border-border/70 text-muted-foreground hover:bg-muted/20"
                            )}
                          >
                            <span className="text-[11px] leading-tight">{opt.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Reassessment Block Scope */}
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold">Pending Reassessment Enforces Lock</Label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {SCOPE_OPTIONS.map((opt) => {
                        const isSelected = draft.reassessment_block_scope === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => update("reassessment_block_scope", opt.value)}
                            className={cn(
                              "p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1",
                              isSelected
                                ? "bg-primary/5 border-primary text-primary shadow-2xs ring-1 ring-primary/20"
                                : "bg-card border-border/70 text-muted-foreground hover:bg-muted/20"
                            )}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-foreground">{opt.label}</span>
                              {isSelected && <Check className="size-3.5 text-primary" />}
                            </div>
                            <span className="text-[10px] text-muted-foreground leading-tight">{opt.detail}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* HOD Override Switch */}
                  <div className="flex items-center justify-between gap-3 sm:gap-4 p-3.5 rounded-xl bg-muted/20 border border-border/60">
                    <div className="space-y-0.5">
                      <Label htmlFor="hod-override" className="text-xs font-semibold cursor-pointer">
                        Head of Department Overrides
                      </Label>
                      <p className="text-[11px] text-muted-foreground">
                        Permit authorized Department Heads to admit flagged candidates with audit reasoning.
                      </p>
                    </div>
                    <Switch
                      id="hod-override"
                      checked={draft.allow_hod_override}
                      onCheckedChange={(v) => update("allow_hod_override", v)}
                      className="shrink-0"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Policy Enactment Card */}
              <div className="p-4 sm:p-5 rounded-2xl bg-card border border-border/80 shadow-2xs space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                  <Sparkles className="size-4 text-primary" />
                  <span>Institutional Application</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Rules actively govern candidate eligibility checks across all upcoming summative examination cohorts for{" "}
                  <strong>{selectedInstitution?.name || "the chosen institution"}</strong>.
                </p>
                <div className="pt-2 flex items-center justify-end gap-2 border-t border-border/40">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!dirty || saving}
                    onClick={() => setDraft(saved)}
                    className="h-8 text-xs gap-1.5 cursor-pointer rounded-lg text-muted-foreground hover:text-foreground"
                  >
                    <RotateCcw className="size-3.5" /> Discard
                  </Button>
                  <Button
                    size="sm"
                    disabled={!dirty || !percentsValid || saving}
                    onClick={save}
                    className="h-8 text-xs gap-1.5 cursor-pointer rounded-lg px-4"
                  >
                    {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                    Save Policy
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        !error && (
          <div className="py-16 text-center text-xs text-muted-foreground">
            {institutions.length === 0 ? "No institutions configured yet." : "Choose an institution to continue."}
          </div>
        )
      )}
    </div>
  );
}
