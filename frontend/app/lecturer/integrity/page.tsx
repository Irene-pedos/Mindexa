// app/lecturer/integrity/page.tsx
"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { integrityApi, IntegrityFlag } from "@/lib/api/integrity";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  Clock,
  User,
  Shield,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Activity,
  Sparkles,
  RefreshCw,
  Search,
  X,
  ExternalLink,
  FileText,
  BookOpen,
  Radio,
  Download,
  Info,
  Check,
  Loader2,
  Filter,
  ArrowUpDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { AIIntegrityExplainer } from "@/components/mindexa/integrity/ai-explainer";

export default function LecturerIntegrityPage() {
  const [flags, setFlags] = useState<IntegrityFlag[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & Filter state
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");

  // Resolve Dialog State
  const [resolveTarget, setResolveTarget] = useState<IntegrityFlag | null>(null);
  const [resolveStatus, setResolveStatus] = useState<string>("CONFIRMED");
  const [resolveNotes, setResolveNotes] = useState<string>("");
  const [resolving, setResolving] = useState(false);

  // AI Explain Dialog State
  const [explainingFlagId, setExplainingFlagId] = useState<string | null>(null);

  const fetchFlags = useCallback(async () => {
    setLoading(true);
    try {
      const response = await integrityApi.getFlags();
      setFlags(response.flags || []);
    } catch (e: any) {
      toast.error(e.message || "Failed to load integrity flags");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFlags();
  }, [fetchFlags]);

  const handleResolveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolveTarget) return;

    if (resolveNotes.trim().length < 5) {
      toast.error("Resolution notes must be at least 5 characters long.");
      return;
    }

    setResolving(true);
    try {
      await integrityApi.resolveFlag(resolveTarget.id, {
        status: resolveStatus,
        resolution_notes: resolveNotes.trim(),
      });
      toast.success(`Flag resolved with disposition: ${resolveStatus}`);
      setResolveTarget(null);
      setResolveNotes("");
      fetchFlags();
    } catch (e: any) {
      toast.error(e.message || "Failed to resolve integrity flag");
    } finally {
      setResolving(false);
    }
  };

  // Filtered Flags
  const filteredFlags = useMemo(() => {
    return flags.filter((f) => {
      // Status filter
      if (statusFilter !== "all" && f.status !== statusFilter) {
        return false;
      }
      // Risk filter
      if (riskFilter !== "all" && f.risk_level !== riskFilter) {
        return false;
      }
      // Search term
      if (search.trim()) {
        const q = search.toLowerCase();
        const student = (f.student_name || "").toLowerCase();
        const asmt = (f.assessment_name || "").toLowerCase();
        const desc = (f.description || "").toLowerCase();
        const id = (f.student_id || "").toLowerCase();
        return (
          student.includes(q) ||
          asmt.includes(q) ||
          desc.includes(q) ||
          id.includes(q)
        );
      }
      return true;
    });
  }, [flags, statusFilter, riskFilter, search]);

  // Metric stats
  const metrics = useMemo(() => {
    const total = flags.length;
    const open = flags.filter((f) => f.status === "OPEN").length;
    const confirmed = flags.filter((f) => f.status === "CONFIRMED").length;
    const dismissed = flags.filter((f) => f.status === "DISMISSED").length;
    const highCritical = flags.filter(
      (f) => f.risk_level === "HIGH" || f.risk_level === "CRITICAL"
    ).length;

    return { total, open, confirmed, dismissed, highCritical };
  }, [flags]);

  const getRiskBadge = (risk: string) => {
    switch (risk) {
      case "CRITICAL":
        return "bg-rose-600 text-white border-rose-700";
      case "HIGH":
        return "bg-rose-500/10 text-rose-600 border-rose-500/25";
      case "MEDIUM":
        return "bg-amber-500/10 text-amber-600 border-amber-500/25";
      case "LOW":
        return "bg-primary/10 text-primary border-primary/20";
      default:
        return "bg-muted text-muted-foreground border-border/50";
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "OPEN":
        return "bg-rose-500/10 text-rose-600 border-rose-500/25";
      case "UNDER_REVIEW":
        return "bg-amber-500/10 text-amber-600 border-amber-500/25";
      case "CONFIRMED":
        return "bg-red-600 text-white border-red-700";
      case "DISMISSED":
        return "bg-emerald-500/10 text-emerald-600 border-emerald-500/25";
      case "ESCALATED":
        return "bg-indigo-500/10 text-indigo-600 border-indigo-500/25";
      default:
        return "bg-muted text-muted-foreground border-border/50";
    }
  };

  return (
    <div
      data-tour="lecturer-integrity"
      className="w-full space-y-4 p-1 md:p-2 animate-in fade-in duration-200"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/40 pb-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Shield className="size-6 text-primary" /> Integrity & Security Hub
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 font-medium">
            Centralized telemetry log, multi-modal violation analysis, and AI-powered flag explainers.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            asChild
            className="h-9 px-3 text-xs font-semibold rounded-xl border-border/70"
          >
            <Link href="/lecturer/supervision">
              <Radio className="size-3.5 mr-1.5 text-emerald-500 animate-pulse" /> Live Telemetry
            </Link>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={fetchFlags}
            className="h-9 px-3 text-xs font-semibold rounded-xl border-border/70 text-muted-foreground hover:text-foreground"
            title="Refresh logs"
          >
            <RefreshCw className={cn("size-3.5 mr-1.5", loading && "animate-spin")} /> Sync
          </Button>
        </div>
      </div>

      {/* Advisory Banner */}
      <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-primary/5 border border-primary/15 text-xs text-foreground/90 font-medium">
        <Info className="size-4 text-primary shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <span className="font-bold text-primary">Academic Integrity Governance:</span>{" "}
          Integrity flags and AI explanations are institutional review recommendations, not automatic disciplinary actions. Mindexa reconstructs telemetry events to assist evaluation, but all academic determinations must be confirmed by an authorized human reviewer.
        </div>
      </div>

      {/* Operational Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="shadow-none border border-border/70 rounded-2xl bg-card text-card-foreground">
          <CardContent className="p-3.5 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[10px] font-bold uppercase tracking-wider">Total Flags</span>
              <ShieldAlert className="size-4 text-primary" />
            </div>
            <div className="text-2xl font-bold font-mono text-foreground">
              {metrics.total}
            </div>
            <div className="text-[10px] text-muted-foreground font-medium">
              {metrics.highCritical} high/critical priority
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-none border border-border/70 rounded-2xl bg-card text-card-foreground">
          <CardContent className="p-3.5 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[10px] font-bold uppercase tracking-wider">Awaiting Review</span>
              <AlertTriangle className="size-4 text-amber-500" />
            </div>
            <div className="text-2xl font-bold font-mono text-amber-600">
              {metrics.open}
            </div>
            <div className="text-[10px] text-muted-foreground font-medium">
              Requires lecturer evaluation
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-none border border-border/70 rounded-2xl bg-card text-card-foreground">
          <CardContent className="p-3.5 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[10px] font-bold uppercase tracking-wider">Confirmed</span>
              <CheckCircle2 className="size-4 text-rose-600" />
            </div>
            <div className="text-2xl font-bold font-mono text-rose-600">
              {metrics.confirmed}
            </div>
            <div className="text-[10px] text-muted-foreground font-medium">
              Violations officially confirmed
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-none border border-border/70 rounded-2xl bg-card text-card-foreground">
          <CardContent className="p-3.5 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[10px] font-bold uppercase tracking-wider">Dismissed</span>
              <Check className="size-4 text-emerald-600" />
            </div>
            <div className="text-2xl font-bold font-mono text-emerald-600">
              {metrics.dismissed}
            </div>
            <div className="text-[10px] text-muted-foreground font-medium">
              Cleared false positives
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 border border-border/60 bg-card rounded-2xl">
        <div className="flex items-center gap-2.5 flex-1 min-w-[240px] flex-wrap">
          {/* Search input */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-2.5 size-3.5 text-muted-foreground" />
            <Input
              placeholder="Search student, assessment, description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-8 h-9 text-xs rounded-xl bg-background border-border/70 font-medium"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-muted-foreground hover:text-foreground"
                title="Clear search"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          {/* Status Filter */}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40 h-9 text-xs rounded-xl border-border/70 bg-background font-medium">
              <span className="flex items-center gap-1.5 truncate">
                <Activity className="size-3.5 text-muted-foreground shrink-0" />
                <SelectValue placeholder="Status" />
              </span>
            </SelectTrigger>
            <SelectContent className="rounded-xl text-xs">
              <SelectItem value="all">All Dispositions</SelectItem>
              <SelectItem value="OPEN">Open (Awaiting Review)</SelectItem>
              <SelectItem value="UNDER_REVIEW">Under Review</SelectItem>
              <SelectItem value="CONFIRMED">Confirmed Violations</SelectItem>
              <SelectItem value="DISMISSED">Dismissed / Cleared</SelectItem>
              <SelectItem value="ESCALATED">Escalated</SelectItem>
            </SelectContent>
          </Select>

          {/* Risk Filter */}
          <Select value={riskFilter} onValueChange={setRiskFilter}>
            <SelectTrigger className="w-36 h-9 text-xs rounded-xl border-border/70 bg-background font-medium">
              <span className="flex items-center gap-1.5 truncate">
                <ShieldAlert className="size-3.5 text-muted-foreground shrink-0" />
                <SelectValue placeholder="Risk Level" />
              </span>
            </SelectTrigger>
            <SelectContent className="rounded-xl text-xs">
              <SelectItem value="all">All Risk Levels</SelectItem>
              <SelectItem value="CRITICAL">Critical Risk</SelectItem>
              <SelectItem value="HIGH">High Risk</SelectItem>
              <SelectItem value="MEDIUM">Medium Risk</SelectItem>
              <SelectItem value="LOW">Low Risk</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="text-xs text-muted-foreground font-semibold">
          Showing {filteredFlags.length} of {flags.length} incidents
        </div>
      </div>

      {/* Incidents Listing */}
      <Card className="shadow-none border border-border/70 rounded-2xl bg-card text-card-foreground overflow-hidden">
        <CardHeader className="py-3 px-4 border-b border-border/40 bg-muted/20 flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <ShieldAlert className="size-3.5" /> Flagged Assessment Incidents
            </CardTitle>
            <CardDescription className="text-[11px] text-muted-foreground mt-0.5">
              Comprehensive telemetry incidents requiring reviewer verification
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <ScrollArea className="h-[620px]">
            <div className="divide-y divide-border/30">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="p-4 space-y-3">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <Skeleton className="size-9 rounded-full" />
                        <div className="space-y-1.5">
                          <Skeleton className="h-4 w-36" />
                          <Skeleton className="h-3 w-48 opacity-60" />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Skeleton className="h-6 w-20 rounded-full" />
                        <Skeleton className="h-6 w-20 rounded-full" />
                      </div>
                    </div>
                    <Skeleton className="h-14 w-full rounded-xl" />
                  </div>
                ))
              ) : filteredFlags.length === 0 ? (
                <div className="text-center py-24 space-y-3">
                  <div className="size-12 bg-muted/40 rounded-2xl flex items-center justify-center mx-auto text-muted-foreground/40">
                    <CheckCircle2 className="size-6" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-foreground">
                      No matching integrity flags found.
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {flags.length === 0
                        ? "The integrity audit log is clean."
                        : "Try adjusting your search query or filters."}
                    </p>
                  </div>
                </div>
              ) : (
                filteredFlags.map((flag) => (
                  <div
                    key={flag.id}
                    className="p-4 hover:bg-muted/20 transition-colors space-y-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      {/* Candidate and Assessment metadata */}
                      <div className="flex items-center gap-3">
                        <div className="size-9 rounded-full bg-muted/60 flex items-center justify-center text-muted-foreground shrink-0 border border-border/40">
                          <User className="size-4" />
                        </div>
                        <div>
                          <div className="font-bold text-xs text-foreground flex items-center gap-2">
                            {flag.student_name || "Candidate"}
                            {flag.student_id && (
                              <span className="text-[10px] font-mono text-muted-foreground/70 font-normal">
                                ID: {flag.student_id.slice(0, 8)}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                            <BookOpen className="size-3 text-muted-foreground/70" />
                            <span className="font-medium">
                              {flag.assessment_name || "General Assessment"}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Badges & Actions */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[9px] font-bold uppercase px-2 py-0.5 rounded-full border",
                            getRiskBadge(flag.risk_level)
                          )}
                        >
                          {flag.risk_level} RISK
                        </Badge>

                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[9px] font-bold uppercase px-2 py-0.5 rounded-full border",
                            getStatusBadge(flag.status)
                          )}
                        >
                          {flag.status.replace(/_/g, " ")}
                        </Badge>
                      </div>
                    </div>

                    {/* Description Quote Box */}
                    <div className="p-3 rounded-xl bg-muted/20 border border-border/40 text-xs text-foreground/90 font-medium leading-relaxed">
                      &ldquo;{flag.description}&rdquo;
                    </div>

                    {/* Timestamp & Action Toolbar */}
                    <div className="flex items-center justify-between gap-2 pt-1 flex-wrap">
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-medium">
                        <Clock className="size-3 text-muted-foreground/70" />
                        <span>{new Date(flag.created_at).toLocaleString()}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setExplainingFlagId(flag.id)}
                          className="h-7 text-xs font-semibold rounded-lg px-2.5 border-border/60"
                        >
                          <Sparkles className="size-3 mr-1 text-primary" /> Explain AI
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          asChild
                          className="h-7 text-xs font-semibold rounded-lg px-2.5 border-border/60"
                        >
                          <Link href="/lecturer/grading">
                            <ExternalLink className="size-3 mr-1" /> Audit Grading
                          </Link>
                        </Button>

                        {flag.status === "OPEN" && (
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => {
                              setResolveTarget(flag);
                              setResolveStatus("CONFIRMED");
                              setResolveNotes("");
                            }}
                            className="h-7 text-xs font-semibold rounded-lg px-3 bg-primary hover:bg-primary/95 text-primary-foreground"
                          >
                            <CheckCircle2 className="size-3 mr-1" /> Resolve
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* ── Resolve Flag Modal Dialog ── */}
      <Dialog
        open={!!resolveTarget}
        onOpenChange={(open) => {
          if (!open) {
            setResolveTarget(null);
            setResolveNotes("");
          }
        }}
      >
        <DialogContent className="max-w-md rounded-2xl border border-border bg-card text-card-foreground">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <CheckCircle2 className="size-4 text-primary" /> Resolve Integrity Flag
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Formally resolve and document the disposition for candidate{" "}
              <span className="font-semibold text-foreground">
                {resolveTarget?.student_name || "Unknown"}
              </span>.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleResolveSubmit} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Resolution Status</Label>
              <Select value={resolveStatus} onValueChange={setResolveStatus}>
                <SelectTrigger className="h-9 text-xs rounded-xl border-border/70 bg-background font-medium">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl text-xs">
                  <SelectItem value="CONFIRMED">
                    Confirmed — Violation Verified (Hold Maintained)
                  </SelectItem>
                  <SelectItem value="DISMISSED">
                    Dismissed — False Positive (Clear Hold)
                  </SelectItem>
                  <SelectItem value="ESCALATED">
                    Escalated — Refer to Academic Committee
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                Resolution Notes <span className="text-destructive">*</span>
              </Label>
              <Textarea
                placeholder="Enter justification notes (min 5 characters)..."
                value={resolveNotes}
                onChange={(e) => setResolveNotes(e.target.value)}
                className="min-h-[90px] text-xs rounded-xl bg-background border-border/70 font-medium"
                required
              />
            </div>

            <DialogFooter className="gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setResolveTarget(null)}
                className="h-8 text-xs font-semibold rounded-xl border-border/60"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={resolving || resolveNotes.trim().length < 5}
                className="h-8 text-xs font-semibold rounded-xl bg-primary hover:bg-primary/95 text-primary-foreground"
              >
                {resolving && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
                Confirm Resolution
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Wide Scrollable AI Explanation Modal Dialog ── */}
      <Dialog
        open={!!explainingFlagId}
        onOpenChange={(open) => {
          if (!open) setExplainingFlagId(null);
        }}
      >
        <DialogContent className="max-w-3xl sm:max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-card text-card-foreground">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Sparkles className="size-4 text-primary" /> Autonomous AI Integrity Analysis
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              In-depth synthesized narrative, telemetry timeline, and institutional escalation rationale.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2">
            {explainingFlagId && <AIIntegrityExplainer flagId={explainingFlagId} />}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setExplainingFlagId(null)}
              className="h-8 text-xs font-semibold rounded-xl border-border/60"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
