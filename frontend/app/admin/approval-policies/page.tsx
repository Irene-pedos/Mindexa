"use client";

// app/admin/approval-policies/page.tsx
// Per-institution assessment rules: whether moderation is required, what total marks a summative paper
// must have, and how strictly each automatic pre-moderation check applies.

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Info,
  Layers,
  LayoutGrid,
  Loader2,
  Lock,
  RotateCcw,
  Save,
  Scale,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Unlock,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { academicApi, type AcademicInstitution } from "@/lib/api/academic";
import {
  MODE_INFO,
  RULE_INFO,
  approvalPolicyApi,
  type ApprovalPolicy,
  type AssessmentTypeKey,
  type ComplianceRules,
  type RuleCode,
  type RuleMode,
} from "@/lib/api/approval-policy";
import { cn } from "@/lib/utils";

const TYPE_CONFIG: Record<
  AssessmentTypeKey,
  { label: string; short: string; desc: string }
> = {
  SUMMATIVE: {
    label: "Summative (Final Exam)",
    short: "Summative",
    desc: "End-of-term examinations and high-stakes terminal papers",
  },
  CAT: {
    label: "Continuous Assessment (CAT)",
    short: "CAT",
    desc: "Mid-semester evaluations and supervised tests",
  },
  FORMATIVE: {
    label: "Formative Assessment",
    short: "Formative",
    desc: "Diagnostic assessments, quizzes, and learning checkpoints",
  },
  HOMEWORK: {
    label: "Homework & Assignments",
    short: "Homework",
    desc: "Take-home exercises and independent study tasks",
  },
  GROUP_WORK: {
    label: "Group Work & Projects",
    short: "Group Work",
    desc: "Collaborative cohort projects and group submissions",
  },
  REASSESSMENT: {
    label: "Reassessment / Supplementary",
    short: "Reassessment",
    desc: "Remedial sittings, retakes, and grade-recovery assessments",
  },
};

const TYPE_ORDER: AssessmentTypeKey[] = [
  "SUMMATIVE",
  "CAT",
  "FORMATIVE",
  "HOMEWORK",
  "GROUP_WORK",
  "REASSESSMENT",
];

const RULE_ICONS: Record<RuleCode, typeof Scale> = {
  MARKS_TOTAL: Scale,
  MARKS_DISTRIBUTION: Layers,
  STRUCTURE: LayoutGrid,
  QUESTIONS_COMPLETE: CheckCircle2,
};

/** The platform's defaults used by "Reset to defaults" */
const DEFAULT_RULES: ComplianceRules = {
  MARKS_TOTAL: { mode: "BLOCKING" },
  MARKS_DISTRIBUTION: { mode: "BLOCKING" },
  STRUCTURE: {
    mode: "WARNING",
    expected_sections: 3,
    section_a_closed: true,
    section_c_open: true,
    choice_pools: true,
  },
  QUESTIONS_COMPLETE: { mode: "BLOCKING" },
};

/** Rules applicable only to summative assessments */
const SUMMATIVE_ONLY: RuleCode[] = ["MARKS_TOTAL", "STRUCTURE"];
const MODES: RuleMode[] = ["BLOCKING", "WARNING", "OFF"];

interface Draft {
  requires_moderation: boolean;
  fixedTotal: boolean;
  total: string;
  rules: ComplianceRules;
}

function toDraft(p: ApprovalPolicy): Draft {
  return {
    requires_moderation: p.requires_moderation,
    fixedTotal: p.summative_total_marks != null,
    total: p.summative_total_marks != null ? String(p.summative_total_marks) : "100",
    rules: JSON.parse(JSON.stringify(p.compliance_rules)) as ComplianceRules,
  };
}

function ModePicker({
  value,
  onChange,
  id,
}: {
  value: RuleMode;
  onChange: (mode: RuleMode) => void;
  id: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={`Strictness for ${id}`}
      className="inline-flex rounded-lg bg-muted/70 p-0.5 border border-border/60"
    >
      {MODES.map((mode) => {
        const isSelected = value === mode;
        return (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onChange(mode)}
            className={cn(
              "rounded-md px-2.5 py-1 text-[11px] font-semibold transition-all cursor-pointer whitespace-nowrap",
              isSelected
                ? mode === "BLOCKING"
                  ? "bg-rose-600 text-white shadow-xs font-bold"
                  : mode === "WARNING"
                    ? "bg-amber-500 text-white shadow-xs font-bold"
                    : "bg-background text-foreground shadow-xs font-bold border border-border/40"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {MODE_INFO[mode].label}
          </button>
        );
      })}
    </div>
  );
}

function describe(code: RuleCode, draft: Draft): string {
  const mode = draft.rules[code].mode;
  const total = draft.fixedTotal ? draft.total || "?" : null;
  if (mode === "OFF") return "Check is disabled for this assessment category.";
  const consequence =
    mode === "BLOCKING"
      ? "Authors cannot submit until this passes; moderators can still approve with justification."
      : "Advisory check only; authors receive feedback but are never prevented from submitting.";
  switch (code) {
    case "MARKS_TOTAL":
      return total
        ? `Paper marks must exactly equal ${total} marks. ${consequence}`
        : "No fixed total target is enforced; any total marks sum is accepted.";
    case "STRUCTURE": {
      const s = draft.rules.STRUCTURE;
      const parts = [
        s.expected_sections
          ? `${s.expected_sections} section${s.expected_sections === 1 ? "" : "s"}`
          : "any section count",
        s.section_a_closed ? "Section A closed-ended" : null,
        s.section_c_open ? "Section C open-ended" : null,
        s.choice_pools ? "choice pools in later sections" : null,
      ].filter(Boolean);
      return `Expected layout: ${parts.join(", ")}. ${consequence}`;
    }
    default:
      return consequence;
  }
}

export default function ApprovalPoliciesPage() {
  const [institutions, setInstitutions] = useState<AcademicInstitution[]>([]);
  const [institutionId, setInstitutionId] = useState("");
  const [policies, setPolicies] = useState<ApprovalPolicy[]>([]);
  const [type, setType] = useState<AssessmentTypeKey>("SUMMATIVE");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Expandable rules state
  const [expandedRules, setExpandedRules] = useState<Record<string, boolean>>({
    MARKS_TOTAL: false,
    MARKS_DISTRIBUTION: false,
    STRUCTURE: true,
    QUESTIONS_COMPLETE: false,
  });

  const toggleRuleExpand = (code: string) => {
    setExpandedRules((prev) => ({ ...prev, [code]: !prev[code] }));
  };

  const setAllRulesExpanded = (expand: boolean) => {
    setExpandedRules({
      MARKS_TOTAL: expand,
      MARKS_DISTRIBUTION: expand,
      STRUCTURE: expand,
      QUESTIONS_COMPLETE: expand,
    });
  };

  useEffect(() => {
    academicApi
      .getInstitutions()
      .then((list) => {
        setInstitutions(list);
        if (list.length > 0) setInstitutionId(list[0].id);
        else setLoading(false);
      })
      .catch(() => {
        setError("Could not load institutions.");
        setLoading(false);
      });
  }, []);

  const loadPolicies = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      setPolicies(await approvalPolicyApi.list(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the rules.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (institutionId) void loadPolicies(institutionId);
  }, [institutionId, loadPolicies]);

  const policy = useMemo(
    () => policies.find((p) => p.assessment_type === type) ?? null,
    [policies, type],
  );

  useEffect(() => {
    setDraft(policy ? toDraft(policy) : null);
  }, [policy]);

  const dirty = useMemo(() => {
    if (!policy || !draft) return false;
    return JSON.stringify(draft) !== JSON.stringify(toDraft(policy));
  }, [policy, draft]);

  const isSummative = type === "SUMMATIVE";
  const visibleRules = (Object.keys(RULE_INFO) as RuleCode[]).filter(
    (c) => isSummative || !SUMMATIVE_ONLY.includes(c),
  );

  const setMode = (code: RuleCode, mode: RuleMode) =>
    setDraft((d) =>
      d ? { ...d, rules: { ...d.rules, [code]: { ...d.rules[code], mode } } } : d,
    );

  const setStructure = (patch: Partial<ComplianceRules["STRUCTURE"]>) =>
    setDraft((d) =>
      d
        ? {
            ...d,
            rules: {
              ...d.rules,
              STRUCTURE: { ...d.rules.STRUCTURE, ...patch },
            },
          }
        : d,
    );

  const totalInvalid =
    isSummative && !!draft?.fixedTotal && !(parseInt(draft.total, 10) > 0);

  const save = async () => {
    if (!policy || !draft || totalInvalid) return;
    setSaving(true);
    try {
      const updated = await approvalPolicyApi.update(policy.id, {
        requires_moderation: draft.requires_moderation,
        ...(isSummative
          ? {
              summative_total_marks: draft.fixedTotal
                ? parseInt(draft.total, 10)
                : null,
            }
          : {}),
        compliance_rules: draft.rules,
      });
      setPolicies((prev) =>
        prev.map((p) => (p.id === updated.id ? updated : p)),
      );
      toast.success("Policy rules saved. Changes apply immediately to new submissions.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "The rules could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  };

  const currentInstitution = institutions.find((i) => i.id === institutionId);

  // Summary counts of rules
  const blockingCount = useMemo(() => {
    if (!draft) return 0;
    return visibleRules.filter((c) => draft.rules[c].mode === "BLOCKING").length;
  }, [draft, visibleRules]);

  const warningCount = useMemo(() => {
    if (!draft) return 0;
    return visibleRules.filter((c) => draft.rules[c].mode === "WARNING").length;
  }, [draft, visibleRules]);

  return (
    <div className="space-y-4 w-full">
      {/* Top Header Card */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-card p-4 rounded-xl border border-border/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <ShieldCheck className="size-4.5" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">
                Assessment Approval Policies
              </h1>
              <p className="text-xs text-muted-foreground">
                Define pre-moderation gates, marks constraints, and automated verification rules per assessment category.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-start md:self-auto bg-muted/40 p-1.5 px-3 rounded-lg border border-border/60">
          <Building2 className="size-3.5 text-muted-foreground shrink-0" />
          <Label className="text-xs font-semibold text-muted-foreground whitespace-nowrap">
            Institution:
          </Label>
          <Select
            value={institutionId}
            onValueChange={setInstitutionId}
            disabled={institutions.length === 0}
          >
            <SelectTrigger className="h-7 text-xs font-bold w-44 sm:w-52 bg-card border border-border/70 shadow-none px-2 focus:ring-0">
              <SelectValue placeholder="Choose institution..." />
            </SelectTrigger>
            <SelectContent>
              {institutions.map((i) => (
                <SelectItem key={i.id} value={i.id} className="text-xs">
                  {i.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Assessment Category Switcher Bar */}
      <div className="bg-card p-2 rounded-xl border border-border/80 shadow-xs">
        <div
          className="flex gap-1.5 overflow-x-auto scrollbar-none py-0.5"
          role="tablist"
          aria-label="Assessment type"
        >
          {TYPE_ORDER.map((t) => {
            const isSelected = type === t;
            const pol = policies.find((p) => p.assessment_type === t);
            const isModerated = pol ? pol.requires_moderation : false;

            return (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={isSelected}
                onClick={() => setType(t)}
                className={cn(
                  "flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition-all cursor-pointer shrink-0 border",
                  isSelected
                    ? "border-primary bg-primary text-primary-foreground shadow-xs font-bold"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/70",
                )}
              >
                <span>{TYPE_CONFIG[t].short}</span>
                <span
                  className={cn(
                    "text-[10px] px-1.5 py-0.2 rounded-full font-bold uppercase tracking-wider",
                    isModerated
                      ? isSelected
                        ? "bg-white/20 text-white"
                        : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30"
                      : isSelected
                        ? "bg-white/10 text-white/80"
                        : "bg-muted text-muted-foreground border border-border/60",
                  )}
                >
                  {isModerated ? "Moderated" : "Exempt"}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-center gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
        >
          <AlertCircle className="size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-5 space-y-4">
            <Skeleton className="h-44 w-full rounded-xl" />
            <Skeleton className="h-32 w-full rounded-xl" />
          </div>
          <div className="lg:col-span-7 space-y-4">
            <Skeleton className="h-64 w-full rounded-xl" />
            <Skeleton className="h-44 w-full rounded-xl" />
          </div>
        </div>
      ) : !policy || !draft ? (
        <div className="rounded-xl border border-dashed border-border/80 p-12 text-center text-xs text-muted-foreground bg-card">
          {institutions.length === 0
            ? "No institutions configured yet."
            : "No policy found for this assessment category."}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left Column (5 cols): Moderation Pipeline Gate, Marks Target, and Category Overview */}
          <div className="lg:col-span-5 space-y-4">
            {/* Moderation Gate Card */}
            <Card className="rounded-xl border border-border/80 bg-card shadow-xs overflow-hidden">
              <CardHeader className="p-4 pb-3 border-b border-border/60 bg-muted/20">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {draft.requires_moderation ? (
                      <Lock className="size-4 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <Unlock className="size-4 text-muted-foreground" />
                    )}
                    <CardTitle className="text-sm font-bold text-foreground">
                      Moderation Pipeline Gate
                    </CardTitle>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] font-bold px-2 py-0.5",
                      draft.requires_moderation
                        ? "border-emerald-500/30 text-emerald-700 dark:text-emerald-400 bg-emerald-500/10"
                        : "border-border text-muted-foreground bg-muted/40",
                    )}
                  >
                    {draft.requires_moderation ? "Moderation Enforced" : "Direct Publish Allowed"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border/70 bg-muted/15">
                  <div className="space-y-0.5 min-w-0 pr-2">
                    <Label
                      htmlFor="requires-moderation-switch"
                      className="text-xs font-bold text-foreground cursor-pointer"
                    >
                      Require Peer Moderation
                    </Label>
                    <p className="text-[11px] text-muted-foreground">
                      Paper must be approved by department moderator and exam office before release.
                    </p>
                  </div>
                  <Switch
                    id="requires-moderation-switch"
                    checked={draft.requires_moderation}
                    onCheckedChange={(v) =>
                      setDraft((d) => (d ? { ...d, requires_moderation: v } : d))
                    }
                  />
                </div>

                <div className="rounded-lg p-3 text-xs leading-relaxed border bg-muted/20 border-border/60 text-muted-foreground space-y-2">
                  <div className="flex items-center gap-1.5 font-bold text-foreground text-[11px]">
                    <Info className="size-3.5 text-primary" />
                    Workflow impact:
                  </div>
                  {draft.requires_moderation ? (
                    <p className="text-[11px]">
                      When authors complete their paper, it is queued for departmental moderation. Automatic pre-moderation checks enforce baseline standard compliance prior to submission.
                    </p>
                  ) : (
                    <p className="text-[11px]">
                      Authors can schedule and publish directly without departmental review. Automatic quality checks are bypassed.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Summative Marks Target Card (Only for Summative) */}
            {isSummative && (
              <Card className="rounded-xl border border-border/80 bg-card shadow-xs overflow-hidden">
                <CardHeader className="p-4 pb-3 border-b border-border/60 bg-muted/20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Scale className="size-4 text-primary" />
                      <CardTitle className="text-sm font-bold text-foreground">
                        Summative Total Marks Policy
                      </CardTitle>
                    </div>
                    <Badge variant="outline" className="text-[10px] font-bold px-1.5 py-0">
                      Summative Only
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-4 space-y-3.5">
                  <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border/70 bg-muted/15">
                    <div className="space-y-0.5 min-w-0 pr-2">
                      <Label
                        htmlFor="fixed-total-switch"
                        className="text-xs font-bold text-foreground cursor-pointer"
                      >
                        Enforce Fixed Total Marks
                      </Label>
                      <p className="text-[11px] text-muted-foreground">
                        Require every summative paper to equal an exact institutional total.
                      </p>
                    </div>
                    <Switch
                      id="fixed-total-switch"
                      checked={draft.fixedTotal}
                      onCheckedChange={(v) =>
                        setDraft((d) => (d ? { ...d, fixedTotal: v } : d))
                      }
                    />
                  </div>

                  {draft.fixedTotal && (
                    <div className="space-y-2.5 p-3 rounded-lg border border-border/60 bg-background">
                      <div className="flex items-center justify-between gap-3">
                        <Label htmlFor="marks-total-input" className="text-xs font-bold text-foreground">
                          Target Marks:
                        </Label>
                        <div className="flex items-center gap-1.5">
                          <Input
                            id="marks-total-input"
                            type="number"
                            min={1}
                            inputMode="numeric"
                            value={draft.total}
                            onChange={(e) =>
                              setDraft((d) => (d ? { ...d, total: e.target.value } : d))
                            }
                            aria-invalid={totalInvalid}
                            className="h-8 w-24 text-xs font-bold text-right"
                          />
                          <span className="text-xs font-semibold text-muted-foreground">marks</span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1 pt-1">
                        <span className="text-[10px] font-bold text-muted-foreground mr-1 uppercase tracking-wider">
                          Quick Presets:
                        </span>
                        {[100, 50, 60, 40, 75].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() =>
                              setDraft((d) => (d ? { ...d, total: String(preset) } : d))
                            }
                            className={cn(
                              "rounded-md border px-2 py-0.5 text-[10px] font-bold transition-all cursor-pointer",
                              draft.total === String(preset)
                                ? "bg-primary text-primary-foreground border-primary shadow-xs"
                                : "border-border/70 hover:bg-muted text-muted-foreground hover:text-foreground",
                            )}
                          >
                            {preset}m
                          </button>
                        ))}
                      </div>

                      {totalInvalid && (
                        <p className="text-xs font-medium text-destructive pt-1">
                          Please enter a positive whole number greater than 0.
                        </p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Policy Strictness Overview Card */}
            <Card className="rounded-xl border border-border/80 bg-card shadow-xs overflow-hidden">
              <CardHeader className="p-4 pb-2.5 border-b border-border/60 bg-muted/20">
                <CardTitle className="text-xs font-bold text-foreground uppercase tracking-wider">
                  Policy Strictness Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-2.5 text-xs">
                <div className="flex items-center justify-between py-1 border-b border-border/40">
                  <span className="text-muted-foreground">Category Mode</span>
                  <span className="font-bold text-foreground">{TYPE_CONFIG[type].label}</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-border/40">
                  <span className="text-muted-foreground">Moderation Requirement</span>
                  <span className="font-bold text-foreground">
                    {draft.requires_moderation ? "Mandatory Review" : "Exempt"}
                  </span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-border/40">
                  <span className="text-muted-foreground">Blocking Checks</span>
                  <span className="font-bold text-rose-600 dark:text-rose-400">
                    {draft.requires_moderation ? `${blockingCount} required` : "0 (bypassed)"}
                  </span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-muted-foreground">Advisory Checks</span>
                  <span className="font-bold text-amber-600 dark:text-amber-400">
                    {draft.requires_moderation ? `${warningCount} warnings` : "0 (bypassed)"}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column (7 cols): Automatic Pre-Moderation Quality Checks */}
          <div className="lg:col-span-7 space-y-4">
            <Card className="rounded-xl border border-border/80 bg-card shadow-xs overflow-hidden">
              <CardHeader className="p-4 pb-3 border-b border-border/60 bg-muted/20">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-sm font-bold text-foreground">
                      Automatic Pre-Moderation Checks
                    </CardTitle>
                    <CardDescription className="text-xs text-muted-foreground">
                      Verified automatically when authors submit and re-audited during moderation.
                    </CardDescription>
                  </div>
                  {draft.requires_moderation && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const anyClosed = Object.values(expandedRules).some((v) => !v);
                        setAllRulesExpanded(anyClosed);
                      }}
                      className="h-7 px-2.5 text-[11px] font-semibold rounded-lg shrink-0 self-start sm:self-auto"
                    >
                      <SlidersHorizontal className="size-3 mr-1" />
                      {Object.values(expandedRules).some((v) => !v)
                        ? "Expand Details"
                        : "Collapse All"}
                    </Button>
                  )}
                </div>
              </CardHeader>

              <CardContent className="p-0 divide-y divide-border/60">
                {!draft.requires_moderation ? (
                  <div className="p-8 text-center text-xs text-muted-foreground space-y-2">
                    <ShieldAlert className="size-8 text-muted-foreground/40 mx-auto" />
                    <p className="font-semibold text-foreground">
                      Pre-moderation checks are inactive for {TYPE_CONFIG[type].short}.
                    </p>
                    <p className="max-w-md mx-auto text-[11px]">
                      Because moderation is disabled for this category, lecturers can publish papers directly without undergoing automated compliance gates.
                    </p>
                    <div className="pt-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setDraft((d) => (d ? { ...d, requires_moderation: true } : d))
                        }
                        className="h-7 text-xs font-semibold"
                      >
                        Enable Moderation for {TYPE_CONFIG[type].short}
                      </Button>
                    </div>
                  </div>
                ) : (
                  visibleRules.map((code) => {
                    const RuleIcon = RULE_ICONS[code] || CheckCircle2;
                    const isExpanded = !!expandedRules[code];
                    const currentMode = draft.rules[code].mode;

                    return (
                      <div
                        key={code}
                        className="p-4 space-y-3 transition-colors hover:bg-muted/[0.02]"
                      >
                        {/* Rule Header Row */}
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                          <div className="flex items-start gap-3 min-w-0">
                            <div
                              className={cn(
                                "size-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
                                currentMode === "BLOCKING"
                                  ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                                  : currentMode === "WARNING"
                                    ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                                    : "bg-muted text-muted-foreground",
                              )}
                            >
                              <RuleIcon className="size-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-xs sm:text-sm font-bold text-foreground">
                                  {RULE_INFO[code].title}
                                </p>
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "text-[9px] font-bold px-1.5 py-0 uppercase tracking-wider",
                                    currentMode === "BLOCKING" &&
                                      "border-rose-500/30 text-rose-700 dark:text-rose-400 bg-rose-500/10",
                                    currentMode === "WARNING" &&
                                      "border-amber-500/30 text-amber-700 dark:text-amber-400 bg-amber-500/10",
                                    currentMode === "OFF" &&
                                      "border-border text-muted-foreground bg-muted/40",
                                  )}
                                >
                                  {MODE_INFO[currentMode].label}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {RULE_INFO[code].help}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                            <ModePicker
                              id={code}
                              value={currentMode}
                              onChange={(m) => setMode(code, m)}
                            />
                            <button
                              type="button"
                              onClick={() => toggleRuleExpand(code)}
                              className="size-7 rounded-lg border border-border/60 hover:bg-muted/70 flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                              aria-label={isExpanded ? "Collapse rule" : "Expand rule"}
                            >
                              {isExpanded ? (
                                <ChevronUp className="size-3.5" />
                              ) : (
                                <ChevronDown className="size-3.5" />
                              )}
                            </button>
                          </div>
                        </div>

                        {/* Consequence Banner */}
                        <div
                          className={cn(
                            "flex items-start gap-2 rounded-lg p-2.5 text-xs",
                            currentMode === "BLOCKING"
                              ? "bg-rose-500/5 text-rose-900 dark:text-rose-200 border border-rose-500/15"
                              : currentMode === "WARNING"
                                ? "bg-amber-500/5 text-amber-900 dark:text-amber-200 border border-amber-500/15"
                                : "bg-muted/40 text-muted-foreground border border-border/40",
                          )}
                        >
                          <CheckCircle2
                            className={cn(
                              "size-3.5 shrink-0 mt-0.5",
                              currentMode === "BLOCKING"
                                ? "text-rose-600 dark:text-rose-400"
                                : currentMode === "WARNING"
                                  ? "text-amber-600 dark:text-amber-400"
                                  : "text-muted-foreground",
                            )}
                          />
                          <span className="leading-relaxed text-[11px] sm:text-xs">
                            {describe(code, draft)}
                          </span>
                        </div>

                        {/* Expandable Granular Parameters for STRUCTURE Rule */}
                        {isExpanded && code === "STRUCTURE" && currentMode !== "OFF" && (
                          <div className="rounded-xl border border-border/70 bg-muted/30 p-3.5 sm:p-4 space-y-3.5 mt-2 animate-in fade-in-50 duration-200">
                            <div className="flex items-center justify-between border-b border-border/60 pb-2">
                              <span className="text-xs font-bold text-foreground">
                                Blueprint Structure Parameters
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                Detailed section layout validation criteria
                              </span>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2">
                              <div className="space-y-1.5 sm:col-span-2">
                                <Label htmlFor="expected-sections" className="text-xs font-semibold text-foreground">
                                  Expected Section Count
                                </Label>
                                <div className="flex flex-wrap items-center gap-3">
                                  <Input
                                    id="expected-sections"
                                    type="number"
                                    min={1}
                                    max={20}
                                    className="h-8 w-24 text-xs font-semibold"
                                    disabled={draft.rules.STRUCTURE.expected_sections == null}
                                    value={draft.rules.STRUCTURE.expected_sections ?? ""}
                                    onChange={(e) => {
                                      const n = parseInt(e.target.value, 10);
                                      setStructure({
                                        expected_sections: Number.isFinite(n)
                                          ? Math.min(20, Math.max(1, n))
                                          : 3,
                                      });
                                    }}
                                  />
                                  <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground cursor-pointer">
                                    <Switch
                                      checked={draft.rules.STRUCTURE.expected_sections == null}
                                      onCheckedChange={(any) =>
                                        setStructure({ expected_sections: any ? null : 3 })
                                      }
                                    />
                                    <span>Allow variable section counts</span>
                                  </label>
                                </div>
                              </div>

                              {(
                                [
                                  [
                                    "section_a_closed",
                                    "Section A Closed-Ended",
                                    "First section must contain objective questions (MCQ, True/False)",
                                  ],
                                  [
                                    "section_c_open",
                                    "Section C Open-Ended",
                                    "Final section must contain constructive response / essays",
                                  ],
                                  [
                                    "choice_pools",
                                    "Choice Pools in Advanced Sections",
                                    "Permits optional questions (e.g. answer 3 of 5)",
                                  ],
                                ] as const
                              ).map(([key, title, subtitle]) => (
                                <div
                                  key={key}
                                  className="flex items-center justify-between gap-3 p-2.5 rounded-lg border border-border/60 bg-background/80"
                                >
                                  <div className="space-y-0.5 min-w-0 pr-2">
                                    <p className="text-xs font-semibold text-foreground">{title}</p>
                                    <p className="text-[10px] text-muted-foreground truncate">{subtitle}</p>
                                  </div>
                                  <Switch
                                    checked={draft.rules.STRUCTURE[key]}
                                    onCheckedChange={(v) => setStructure({ [key]: v })}
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Full-Width Sticky Bottom Action Bar inside the main container */}
      <div className="sticky bottom-0 -mx-6 -mb-6 px-6 py-3.5 border-t border-border/80 bg-background/95 backdrop-blur-md z-20 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-2 text-xs text-muted-foreground self-start sm:self-auto">
          {dirty ? (
            <Badge
              variant="secondary"
              className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 font-semibold"
            >
              Unsaved changes
            </Badge>
          ) : (
            <span className="flex items-center gap-1.5 font-medium text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="size-3.5" /> All rules saved and active.
            </span>
          )}
          {currentInstitution && (
            <span className="hidden md:inline text-[11px] text-muted-foreground">
              • {currentInstitution.name} ({TYPE_CONFIG[type].short})
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={saving}
            onClick={() =>
              setDraft((d) =>
                d
                  ? {
                      ...d,
                      rules: JSON.parse(
                        JSON.stringify(DEFAULT_RULES),
                      ) as ComplianceRules,
                    }
                  : d,
              )
            }
            className="h-8 px-3 text-xs font-semibold rounded-lg"
          >
            <RotateCcw className="mr-1.5 size-3.5" /> Reset to Defaults
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!dirty || saving || totalInvalid}
            onClick={() => void save()}
            className="h-8 px-4 text-xs font-semibold rounded-lg shadow-xs"
          >
            {saving ? (
              <Loader2 className="mr-1.5 size-3.5 animate-spin" />
            ) : (
              <Save className="mr-1.5 size-3.5" />
            )}
            Save Policy Rules
          </Button>
        </div>
      </div>
    </div>
  );
}
