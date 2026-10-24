"use client";

// app/admin/eligibility/page.tsx
// Per-institution exam-entry rules (spec R-20): coursework thresholds and what happens while
// coursework marks are still being graded or when a student has no coursework at all.

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertCircle, Building2, Loader2, RotateCcw, Save, UserCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { academicApi, type AcademicInstitution } from "@/lib/api/academic";
import {
  eligibilityPolicyApi,
  type EligibilityPolicy,
  type EligibilityPolicyUpdate,
  type NoCourseworkBehavior,
  type PendingMarksBehavior,
  type ReassessmentBlockScope,
} from "@/lib/api/eligibility-policy";

const PENDING_OPTIONS: Array<{ value: PendingMarksBehavior; label: string; hint: string }> = [
  {
    value: "BLOCK",
    label: "Block exam entry",
    hint: "The student cannot start the exam until every CAT / formative mark is released.",
  },
  {
    value: "MANUAL_REVIEW",
    label: "Hold for manual review",
    hint: "Entry is held until a head of department or exam officer grants an override.",
  },
  {
    value: "EXCLUDE",
    label: "Ignore ungraded work",
    hint: "Entry is decided on the marks already released; ungraded work is left out of the average.",
  },
];

const NO_COURSEWORK_OPTIONS: Array<{ value: NoCourseworkBehavior; label: string }> = [
  { value: "MANUAL_REVIEW", label: "Hold for manual review" },
  { value: "BLOCK", label: "Block exam entry" },
  { value: "ALLOW", label: "Allow exam entry" },
];

const SCOPE_OPTIONS: Array<{ value: ReassessmentBlockScope; label: string }> = [
  { value: "COURSE", label: "Only the same course" },
  { value: "ALL_COURSES", label: "Every course" },
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

const PERCENT_FIELDS: Array<{ key: keyof Pick<Draft, "formative_exempt_pct" | "summative_entry_pct" | "summative_pass_pct">; label: string; hint: string }> = [
  {
    key: "summative_entry_pct",
    label: "Exam entry threshold (%)",
    hint: "Minimum coursework average needed to sit the summative exam.",
  },
  {
    key: "summative_pass_pct",
    label: "Exam pass mark (%)",
    hint: "Below this the student is flagged for a retake.",
  },
  {
    key: "formative_exempt_pct",
    label: "Formative exemption (%)",
    hint: "A formative scored below this requires a reassessment before the next CAT.",
  },
];

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
        setError("Could not load institutions.");
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
      setError(err instanceof Error ? err.message : "Could not load the eligibility rules.");
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
    !!draft && PERCENT_FIELDS.every(({ key }) => isValidPercent(draft[key]));

  const save = async () => {
    if (!draft || !percentsValid) return;
    setSaving(true);
    try {
      const body: EligibilityPolicyUpdate = draft;
      const next = toDraft(await eligibilityPolicyApi.update(institutionId, body));
      setSaved(next);
      setDraft(next);
      toast.success("Eligibility rules saved. They apply to the next exam start.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the eligibility rules.");
    } finally {
      setSaving(false);
    }
  };

  const pendingHint = PENDING_OPTIONS.find((o) => o.value === draft?.pending_marks_behavior)?.hint;

  return (
    <div className="space-y-4 w-full max-w-3xl mx-auto animate-in fade-in duration-200 pb-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between border-b border-border/30 pb-3">
        <div className="space-y-0.5">
          <h1 className="text-base sm:text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
            <UserCheck className="size-4 text-primary" aria-hidden /> Exam Entry Rules
          </h1>
          <p className="text-xs text-muted-foreground">
            Decide who may sit a summative exam based on their coursework.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-muted/40 p-1.5 px-3 rounded-lg border border-border/60 self-start">
          <Building2 className="size-3.5 text-muted-foreground shrink-0" aria-hidden />
          <Label className="text-xs font-semibold text-muted-foreground whitespace-nowrap">Institution:</Label>
          <Select value={institutionId} onValueChange={setInstitutionId} disabled={institutions.length === 0}>
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

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
          <AlertCircle className="size-4 shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      ) : draft ? (
        <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">While coursework is still being graded</CardTitle>
              <CardDescription className="text-xs">
                What happens when a student has submitted a CAT or formative whose marks are not released yet.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Label htmlFor="pending-behavior" className="text-xs font-semibold">Pending marks</Label>
              <Select
                value={draft.pending_marks_behavior}
                onValueChange={(v) => update("pending_marks_behavior", v as PendingMarksBehavior)}
              >
                <SelectTrigger id="pending-behavior" className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PENDING_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value} className="text-xs">
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {pendingHint && <p className="text-[11px] text-muted-foreground">{pendingHint}</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Thresholds</CardTitle>
              <CardDescription className="text-xs">Percentages from 0 to 100.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              {PERCENT_FIELDS.map(({ key, label, hint }) => {
                const invalid = !isValidPercent(draft[key]);
                return (
                  <div key={key} className="space-y-1.5">
                    <Label htmlFor={key} className="text-xs font-semibold">{label}</Label>
                    <Input
                      id={key}
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      value={Number.isFinite(draft[key]) ? draft[key] : ""}
                      aria-invalid={invalid}
                      onChange={(e) => update(key, e.target.value === "" ? Number.NaN : Number(e.target.value))}
                      className="h-8 text-xs"
                    />
                    <p className={invalid ? "text-[11px] text-destructive" : "text-[11px] text-muted-foreground"}>
                      {invalid ? "Enter a number between 0 and 100." : hint}
                    </p>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Other cases</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="no-coursework" className="text-xs font-semibold">Student has no coursework</Label>
                  <Select
                    value={draft.no_coursework_behavior}
                    onValueChange={(v) => update("no_coursework_behavior", v as NoCourseworkBehavior)}
                  >
                    <SelectTrigger id="no-coursework" className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {NO_COURSEWORK_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="reassess-scope" className="text-xs font-semibold">Pending reassessment blocks a CAT in</Label>
                  <Select
                    value={draft.reassessment_block_scope}
                    onValueChange={(v) => update("reassessment_block_scope", v as ReassessmentBlockScope)}
                  >
                    <SelectTrigger id="reassess-scope" className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SCOPE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 p-3">
                <div className="space-y-0.5">
                  <Label htmlFor="hod-override" className="text-xs font-semibold">Allow head-of-department overrides</Label>
                  <p className="text-[11px] text-muted-foreground">
                    Lets a head of department admit a blocked student, with a recorded reason.
                  </p>
                </div>
                <Switch
                  id="hod-override"
                  checked={draft.allow_hod_override}
                  onCheckedChange={(v) => update("allow_hod_override", v)}
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={!dirty || saving}
              onClick={() => setDraft(saved)}
              className="h-8 text-xs gap-1.5 cursor-pointer"
            >
              <RotateCcw className="size-3" aria-hidden /> Discard changes
            </Button>
            <Button
              size="sm"
              disabled={!dirty || !percentsValid || saving}
              onClick={save}
              className="h-8 text-xs gap-1.5 cursor-pointer"
            >
              {saving ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <Save className="size-3" aria-hidden />}
              Save rules
            </Button>
          </div>
        </>
      ) : (
        !error && (
          <p className="py-10 text-center text-xs text-muted-foreground">
            {institutions.length === 0 ? "No institutions configured yet." : "Choose an institution to continue."}
          </p>
        )
      )}
    </div>
  );
}
