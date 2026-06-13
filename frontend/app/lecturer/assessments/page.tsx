// app/lecturer/assessments/page.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Plus,
  Search,
  Eye,
  Edit,
  Trash2,
  Clock,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  BookOpen,
  Copy,
  BarChart2,
  MonitorPlay,
  CheckSquare,
  Filter,
  AlertTriangle,
  Cpu,
  RefreshCw,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import Link from "next/link";
import { assessmentApi } from "@/lib/api/assessment";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/interfaces-skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useRouter } from "next/navigation";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Assessment {
  id: string;
  title: string;
  assessment_type: string;
  status: string;
  grading_mode: string;
  result_release_mode: string | null;
  total_marks: number;
  passing_marks: number | null;
  duration_minutes: number | null;
  window_start: string | null;
  window_end: string | null;
  max_attempts: number;
  is_group_assessment: boolean;
  is_finalized: boolean;
  draft_step: number | null;
  course_name: string | null;
  course_code: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_TABS = [
  { value: "all", label: "All" },
  { value: "DRAFT", label: "Drafts" },
  { value: "PUBLISHED", label: "Published" },
  { value: "SCHEDULED", label: "Scheduled" },
  { value: "ACTIVE", label: "Active" },
  { value: "CLOSED", label: "Closed" },
  { value: "ARCHIVED", label: "Archived" },
  { value: "CANCELLED", label: "Cancelled" },
] as const;

const ASSESSMENT_TYPES = [
  "CAT",
  "EXAM",
  "HOMEWORK",
  "ASSIGNMENT",
  "QUIZ",
  "FORMATIVE",
  "SUMMATIVE",
  "PRACTICE",
];

const GRADING_MODES = ["AUTO", "MANUAL", "AI_ASSISTED"];

const RISKY_STATUSES = new Set(["PUBLISHED", "ACTIVE", "CLOSED", "SCHEDULED"]);
const DRAFT_ONLY_BULK = true; // Only allow bulk-delete of DRAFTs

// ─── Helpers ─────────────────────────────────────────────────────────────────

function statusStyle(status: string): string {
  const m: Record<string, string> = {
    DRAFT: "bg-muted text-muted-foreground border-border/40",
    PUBLISHED: "bg-primary/10 text-primary border-primary/20",
    SCHEDULED: "bg-violet-50 text-violet-700 border-violet-200",
    ACTIVE: "bg-emerald-50 text-emerald-700 border-emerald-200",
    CLOSED: "bg-muted text-foreground border-border",
    ARCHIVED: "bg-transparent text-muted-foreground border-border",
    CANCELLED: "bg-red-50 text-red-600 border-red-200",
  };
  return m[status] ?? "bg-muted text-muted-foreground";
}

function gradingModeStyle(mode: string): string {
  const m: Record<string, string> = {
    AUTO: "bg-sky-50 text-sky-700 border-sky-200",
    MANUAL: "bg-amber-50 text-amber-700 border-amber-200",
    AI_ASSISTED: "bg-purple-50 text-purple-700 border-purple-200",
  };
  return m[mode?.toUpperCase()] ?? "bg-muted text-muted-foreground";
}

function releaseStyle(mode: string | null): string {
  if (!mode) return "bg-muted text-muted-foreground";
  if (mode === "IMMEDIATE") return "bg-emerald-50 text-emerald-700";
  if (mode === "MANUAL") return "bg-amber-50 text-amber-700";
  return "bg-muted text-muted-foreground";
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Debounce hook for server-side search
function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ─── Delete Dialog ────────────────────────────────────────────────────────────

interface DeleteDialogProps {
  open: boolean;
  assessment: Assessment | null;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

function DeleteDialog({
  open,
  assessment,
  onClose,
  onConfirm,
}: DeleteDialogProps) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const isRisky = assessment ? RISKY_STATUSES.has(assessment.status) : false;
  const canConfirm = !isRisky || typed === assessment?.title;

  const handleClose = () => {
    setTyped("");
    onClose();
  };

  const handleConfirm = async () => {
    setBusy(true);
    await onConfirm();
    setBusy(false);
    setTyped("");
  };

  return (
    <AlertDialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <AlertDialogContent className="max-w-md rounded-2xl shadow-xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-base font-semibold flex items-center gap-2">
            <AlertTriangle className="size-4 text-destructive" />
            Delete Assessment
          </AlertDialogTitle>
          <AlertDialogDescription className="text-xs text-muted-foreground leading-relaxed">
            {isRisky ? (
              <>
                <span className="block mb-2 font-medium text-destructive/80">
                  This assessment is <strong>{assessment?.status}</strong> and
                  may have student data. This action cannot be undone.
                </span>
                Type the assessment title to confirm:
                <span className="block mt-1 px-2 py-1 bg-muted rounded text-foreground font-mono text-[11px]">
                  {assessment?.title}
                </span>
                <Input
                  className="mt-2 h-8 text-xs rounded-lg"
                  placeholder="Type title to confirm…"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                />
              </>
            ) : (
              <>
                Are you sure you want to delete &ldquo;{assessment?.title}
                &rdquo;? This cannot be undone.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            className="h-8 rounded-lg text-xs"
            onClick={handleClose}
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            className="h-8 rounded-lg text-xs bg-destructive hover:bg-destructive/90"
            disabled={!canConfirm || busy}
            onClick={handleConfirm}
          >
            {busy ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ─── Bulk Delete Dialog ───────────────────────────────────────────────────────

interface BulkDeleteDialogProps {
  open: boolean;
  count: number;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

function BulkDeleteDialog({
  open,
  count,
  onClose,
  onConfirm,
}: BulkDeleteDialogProps) {
  const [busy, setBusy] = useState(false);
  const handleConfirm = async () => {
    setBusy(true);
    await onConfirm();
    setBusy(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={(v) => !v && onClose()}>
      <AlertDialogContent className="max-w-sm rounded-2xl shadow-xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-base font-semibold flex items-center gap-2">
            <Trash2 className="size-4 text-destructive" />
            Delete {count} Draft{count !== 1 ? "s" : ""}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-xs text-muted-foreground">
            This will permanently delete the selected draft assessments. This
            action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            className="h-8 rounded-lg text-xs"
            onClick={onClose}
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            className="h-8 rounded-lg text-xs bg-destructive hover:bg-destructive/90 text-white"
            disabled={busy}
            onClick={handleConfirm}
          >
            {busy ? "Deleting…" : `Delete ${count} drafts`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ManageAssessmentsPage() {
  const router = useRouter();
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState("newest");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(15);
  const [totalCount, setTotalCount] = useState(0);
  const [statusTab, setStatusTab] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [gradingFilter, setGradingFilter] = useState("all");

  // Tab counts
  const [tabCounts, setTabCounts] = useState<Record<string, number>>({});

  // Delete dialogs
  const [deleteTarget, setDeleteTarget] = useState<Assessment | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  // Finalize busy state
  const [finalizingId, setFinalizingId] = useState<string | null>(null);

  const debouncedSearch = useDebounce(searchTerm, 350);

  const fetchAssessments = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = {
        page,
        page_size: pageSize,
        sort: sortBy,
      };
      if (statusTab !== "all") params.status = statusTab;
      if (typeFilter !== "all") params.assessment_type = typeFilter;
      if (gradingFilter !== "all") params.grading_mode = gradingFilter;
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();

      const response = await assessmentApi.getAssessments(params);
      setAssessments(response.items || []);
      setTotalCount(response.total || 0);
    } catch (err: any) {
      toast.error(err.message || "Failed to load assessments");
    } finally {
      setLoading(false);
    }
  }, [
    statusTab,
    page,
    pageSize,
    sortBy,
    typeFilter,
    gradingFilter,
    debouncedSearch,
  ]);

  // Fetch counts for tab badges (all statuses, once on mount and after mutations)
  const fetchTabCounts = useCallback(async () => {
    try {
      const statuses = STATUS_TABS.filter((t) => t.value !== "all").map(
        (t) => t.value,
      );
      const results = await Promise.allSettled(
        statuses.map((s) =>
          assessmentApi.getAssessments({ status: s, page: 1, page_size: 1 }),
        ),
      );
      const counts: Record<string, number> = {};
      results.forEach((r, i) => {
        if (r.status === "fulfilled") {
          counts[statuses[i]] = r.value.total ?? 0;
        }
      });
      setTabCounts(counts);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchAssessments();
  }, [fetchAssessments]);

  useEffect(() => {
    fetchTabCounts();
  }, [fetchTabCounts]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await assessmentApi.deleteAssessment(deleteTarget.id);
      toast.success("Assessment deleted");
      setDeleteTarget(null);
      fetchAssessments();
      fetchTabCounts();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete");
    }
  };

  const handleBulkDelete = async () => {
    // Only draft IDs
    const draftIds = selectedIds.filter((id) => {
      const a = assessments.find((x) => x.id === id);
      return a?.status === "DRAFT";
    });

    if (draftIds.length === 0) {
      toast.error("Only draft assessments can be bulk deleted.");
      setBulkDeleteOpen(false);
      return;
    }

    let ok = 0;
    let fail = 0;
    for (const id of draftIds) {
      try {
        await assessmentApi.deleteAssessment(id);
        ok++;
      } catch {
        fail++;
      }
    }

    if (ok > 0) toast.success(`Deleted ${ok} draft${ok !== 1 ? "s" : ""}`);
    if (fail > 0)
      toast.error(`${fail} deletion${fail !== 1 ? "s" : ""} failed`);
    setSelectedIds([]);
    setBulkDeleteOpen(false);
    fetchAssessments();
    fetchTabCounts();
  };

  const handleFinalize = async (id: string) => {
    setFinalizingId(id);
    try {
      await assessmentApi.finalizeAssessment(id);
      toast.success("Assessment finalized and published");
      fetchAssessments();
      fetchTabCounts();
    } catch (err: any) {
      toast.error(err.message || "Failed to finalize");
    } finally {
      setFinalizingId(null);
    }
  };

  const handleDuplicate = async (id: string, title: string) => {
    toast.info(`Cloning "${title}"…`);
    try {
      // Clone by fetching detail and creating a new draft with the same config
      const detail = await assessmentApi.getAssessmentById(id);
      const clone = await assessmentApi.createAssessment({
        title: `${detail.title} (Copy)`,
        assessment_type: detail.assessment_type,
        total_marks: detail.total_marks,
        duration_minutes: detail.duration_minutes,
        grading_mode: detail.grading_mode,
        result_release_mode: detail.result_release_mode ?? "MANUAL",
      });
      toast.success("Draft cloned — opening editor…");
      router.push(`/lecturer/assessments/new?draft=${clone.id}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to duplicate");
    }
  };

  // ── Selection helpers ─────────────────────────────────────────────────────

  const draftAssessments = assessments.filter((a) => a.status === "DRAFT");
  const selectableIds = DRAFT_ONLY_BULK
    ? draftAssessments.map((a) => a.id)
    : assessments.map((a) => a.id);

  const toggleSelectAll = () => {
    if (
      selectedIds.length === selectableIds.length &&
      selectableIds.length > 0
    ) {
      setSelectedIds([]);
    } else {
      setSelectedIds(selectableIds);
    }
  };

  const toggleSelect = (id: string, isDraft: boolean) => {
    if (!isDraft) return; // Can only select drafts for bulk ops
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const totalPages = Math.ceil(totalCount / pageSize);
  const needsGradingCount = assessments.filter(
    (a) =>
      (a.status === "ACTIVE" || a.status === "CLOSED") &&
      a.grading_mode !== "AUTO",
  ).length;

  return (
    <div className="space-y-4">
      {/* ── Page header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Assessments</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage, monitor, and govern your assessment registry
          </p>
        </div>
        <Button
          size="sm"
          asChild
          className="h-8 rounded-full px-4 gap-1.5 shadow-none font-medium text-xs"
        >
          <Link href="/lecturer/assessments/new">
            <Plus className="size-3.5" /> New Assessment
          </Link>
        </Button>
      </div>

      {/* ── Needs grading callout ── */}
      {!loading && needsGradingCount > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <Cpu className="size-3.5 text-amber-600 shrink-0" />
          <p className="text-xs text-amber-800 font-medium">
            {needsGradingCount} assessment{needsGradingCount !== 1 ? "s" : ""}{" "}
            currently open or closed require manual grading attention.
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-6 px-2 text-[10px] text-amber-700 hover:bg-amber-100 rounded"
            onClick={() => setGradingFilter("MANUAL")}
          >
            Filter
          </Button>
        </div>
      )}

      {/* ── Card ── */}
      <div className="rounded-xl border border-border/50 bg-background overflow-hidden">
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 border-b border-border/30 bg-muted/10">
          <div className="flex flex-wrap items-center gap-2">
            {/* Sort */}
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-36 h-7 text-[11px] rounded-lg bg-background border-muted/60 shadow-none font-medium">
                <ArrowUpDown className="mr-1.5 size-3 text-muted-foreground/60" />
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent className="rounded-xl text-xs">
                <SelectItem value="newest" className="text-xs">
                  Newest first
                </SelectItem>
                <SelectItem value="oldest" className="text-xs">
                  Oldest first
                </SelectItem>
                <SelectItem value="title" className="text-xs">
                  Alphabetical
                </SelectItem>
              </SelectContent>
            </Select>

            {/* Type filter */}
            <Select
              value={typeFilter}
              onValueChange={(v) => {
                setTypeFilter(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-36 h-7 text-[11px] rounded-lg bg-background border-muted/60 shadow-none font-medium">
                <Filter className="mr-1.5 size-3 text-muted-foreground/60" />
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent className="rounded-xl text-xs">
                <SelectItem value="all" className="text-xs">
                  All types
                </SelectItem>
                {ASSESSMENT_TYPES.map((t) => (
                  <SelectItem key={t} value={t} className="text-xs">
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Grading mode filter */}
            <Select
              value={gradingFilter}
              onValueChange={(v) => {
                setGradingFilter(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-36 h-7 text-[11px] rounded-lg bg-background border-muted/60 shadow-none font-medium">
                <CheckSquare className="mr-1.5 size-3 text-muted-foreground/60" />
                <SelectValue placeholder="Grading" />
              </SelectTrigger>
              <SelectContent className="rounded-xl text-xs">
                <SelectItem value="all" className="text-xs">
                  All grading
                </SelectItem>
                {GRADING_MODES.map((m) => (
                  <SelectItem key={m} value={m} className="text-xs">
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Clear filters */}
            {(typeFilter !== "all" ||
              gradingFilter !== "all" ||
              searchTerm) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[10px] text-muted-foreground hover:text-foreground rounded-lg"
                onClick={() => {
                  setTypeFilter("all");
                  setGradingFilter("all");
                  setSearchTerm("");
                }}
              >
                <RefreshCw className="size-3 mr-1" /> Clear
              </Button>
            )}
          </div>

          {/* Search */}
          <div className="relative w-full sm:w-56">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3 text-muted-foreground/60" />
            <Input
              placeholder="Search assessments…"
              className="pl-7 h-7 text-[11px] rounded-lg bg-background border-muted/60 focus-visible:ring-1 shadow-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Content */}
        <div className="p-3">
          {loading ? (
            <div className="space-y-3">
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="w-20 h-7 rounded-lg" />
                ))}
              </div>
              <div className="space-y-1.5">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <Skeleton key={i} className="w-full h-12 rounded-lg" />
                ))}
              </div>
            </div>
          ) : (
            <Tabs
              value={statusTab}
              onValueChange={(v) => {
                setStatusTab(v);
                setPage(1);
                setSelectedIds([]);
              }}
            >
              {/* Tabs */}
              <TabsList className="bg-muted/30 p-0.5 rounded-xl w-full flex-wrap h-auto gap-0.5 mb-3">
                {STATUS_TABS.map((tab) => {
                  const count =
                    tab.value === "all" ? totalCount : tabCounts[tab.value];
                  return (
                    <TabsTrigger
                      key={tab.value}
                      value={tab.value}
                      className="text-[10px] font-semibold uppercase tracking-tight px-3 h-7 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm"
                    >
                      {tab.label}
                      {count !== undefined && count > 0 && (
                        <span className="ml-1.5 px-1.5 py-0 rounded-full bg-muted text-muted-foreground text-[9px] font-bold">
                          {count}
                        </span>
                      )}
                    </TabsTrigger>
                  );
                })}
              </TabsList>

              <TabsContent value={statusTab} className="mt-0 outline-none">
                {/* Bulk action bar */}
                {selectedIds.length > 0 && (
                  <div className="flex items-center justify-between bg-primary/5 px-3 py-1.5 rounded-lg border border-primary/10 mb-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-primary/80">
                      {selectedIds.length} draft
                      {selectedIds.length !== 1 ? "s" : ""} selected
                    </span>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setBulkDeleteOpen(true)}
                      className="h-6 px-3 rounded-lg text-[9px] font-bold uppercase shadow-none"
                    >
                      <Trash2 className="mr-1 size-3" /> Delete Selected
                    </Button>
                  </div>
                )}

                {/* Table */}
                <div className="rounded-xl border border-muted/30 overflow-hidden">
                  <Table>
                    <TableHeader className="bg-muted/20">
                      <TableRow className="hover:bg-transparent border-none">
                        <TableHead className="w-[36px] px-3">
                          <Checkbox
                            checked={
                              selectableIds.length > 0 &&
                              selectedIds.length === selectableIds.length
                            }
                            onCheckedChange={toggleSelectAll}
                          />
                        </TableHead>
                        <TableHead className="text-[9px] font-semibold uppercase tracking-wider h-9 min-w-[180px]">
                          Assessment
                        </TableHead>
                        <TableHead className="text-[9px] font-semibold uppercase tracking-wider h-9">
                          Course
                        </TableHead>
                        <TableHead className="text-[9px] font-semibold uppercase tracking-wider text-center h-9">
                          Type
                        </TableHead>
                        <TableHead className="text-[9px] font-semibold uppercase tracking-wider text-center h-9">
                          Grading
                        </TableHead>
                        <TableHead className="text-[9px] font-semibold uppercase tracking-wider text-center h-9">
                          Release
                        </TableHead>
                        <TableHead className="text-[9px] font-semibold uppercase tracking-wider h-9">
                          Metrics
                        </TableHead>
                        <TableHead className="text-[9px] font-semibold uppercase tracking-wider text-center h-9">
                          Status
                        </TableHead>
                        <TableHead className="text-right text-[9px] font-semibold uppercase tracking-wider pr-3 h-9">
                          Actions
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {assessments.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={9}
                            className="text-center py-20 text-muted-foreground"
                          >
                            <div className="flex flex-col items-center gap-3">
                              <BookOpen className="size-8 opacity-10" />
                              <p className="text-xs font-medium text-muted-foreground/60">
                                No assessments found
                              </p>
                              <Button
                                size="sm"
                                asChild
                                className="h-7 rounded-full px-4 text-xs"
                              >
                                <Link href="/lecturer/assessments/new">
                                  <Plus className="size-3.5 mr-1" /> Create your
                                  first assessment
                                </Link>
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        assessments.map((item) => {
                          const isDraft = item.status === "DRAFT";
                          const isActive = item.status === "ACTIVE";
                          const isClosed = item.status === "CLOSED";
                          const canEdit =
                            isDraft ||
                            item.status === "PUBLISHED" ||
                            item.status === "SCHEDULED";
                          const totalQ = (item as any).question_count ?? null;
                          const draftStep = isDraft ? item.draft_step : null;

                          return (
                            <TableRow
                              key={item.id}
                              className={cn(
                                "group transition-colors border-muted/10 h-12",
                                selectedIds.includes(item.id) && "bg-muted/30",
                              )}
                            >
                              {/* Checkbox — only drafts selectable */}
                              <TableCell className="px-3">
                                <Checkbox
                                  checked={selectedIds.includes(item.id)}
                                  disabled={!isDraft}
                                  onCheckedChange={() =>
                                    toggleSelect(item.id, isDraft)
                                  }
                                  className={cn(
                                    !isDraft && "opacity-20 cursor-not-allowed",
                                  )}
                                />
                              </TableCell>

                              {/* Title */}
                              <TableCell>
                                <div className="font-medium text-xs leading-snug text-foreground/90 truncate max-w-[200px]">
                                  {item.title}
                                </div>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  {item.window_start && (
                                    <span className="text-[9px] text-muted-foreground flex items-center gap-0.5">
                                      <Clock className="size-2.5" />
                                      {fmtDate(item.window_start)}
                                    </span>
                                  )}
                                  {draftStep !== null &&
                                    draftStep !== undefined && (
                                      <span className="text-[9px] px-1.5 py-0 rounded-full bg-violet-50 text-violet-600 border border-violet-100 font-medium">
                                        Step {draftStep} of 6
                                      </span>
                                    )}
                                  {item.max_attempts > 1 && (
                                    <span className="text-[9px] text-muted-foreground">
                                      ×{item.max_attempts} attempts
                                    </span>
                                  )}
                                </div>
                              </TableCell>

                              {/* Course */}
                              <TableCell>
                                <div className="text-[11px] font-medium text-foreground/70 truncate max-w-[140px]">
                                  {item.course_name || "—"}
                                </div>
                                {item.course_code && (
                                  <div className="text-[9px] text-muted-foreground font-mono">
                                    {item.course_code}
                                  </div>
                                )}
                              </TableCell>

                              {/* Type */}
                              <TableCell className="text-center">
                                <Badge
                                  variant="outline"
                                  className="text-[8px] font-bold uppercase tracking-tight h-4 px-1.5 rounded border-muted/50 text-muted-foreground/80"
                                >
                                  {item.assessment_type}
                                </Badge>
                              </TableCell>

                              {/* Grading mode */}
                              <TableCell className="text-center">
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "text-[8px] font-bold uppercase tracking-tight h-4 px-1.5 rounded",
                                    gradingModeStyle(item.grading_mode),
                                  )}
                                >
                                  {item.grading_mode === "AI_ASSISTED"
                                    ? "AI"
                                    : item.grading_mode}
                                </Badge>
                              </TableCell>

                              {/* Release mode */}
                              <TableCell className="text-center">
                                <span
                                  className={cn(
                                    "text-[8px] font-bold uppercase tracking-tight px-1.5 py-0.5 rounded",
                                    releaseStyle(item.result_release_mode),
                                  )}
                                >
                                  {item.result_release_mode ?? "—"}
                                </span>
                              </TableCell>

                              {/* Metrics */}
                              <TableCell>
                                <div className="text-xs font-medium text-foreground/80">
                                  {item.total_marks} pts
                                  {item.passing_marks !== null &&
                                    item.passing_marks !== undefined && (
                                      <span className="text-muted-foreground font-normal ml-1 text-[9px]">
                                        / pass {item.passing_marks}
                                      </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  {item.duration_minutes && (
                                    <span className="text-[9px] text-muted-foreground">
                                      {item.duration_minutes}min
                                    </span>
                                  )}
                                  {totalQ !== null && (
                                    <span className="text-[9px] text-muted-foreground">
                                      · {totalQ}Q
                                    </span>
                                  )}
                                </div>
                              </TableCell>

                              {/* Status */}
                              <TableCell className="text-center">
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "text-[8px] font-bold uppercase tracking-tight h-4 px-1.5 rounded-full",
                                    statusStyle(item.status),
                                  )}
                                >
                                  {item.status}
                                </Badge>
                              </TableCell>

                              {/* Actions */}
                              <TableCell className="text-right pr-3">
                                <div className="flex justify-end gap-0.5 transition-opacity">
                                  {/* View — non-drafts */}
                                  {!isDraft && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      asChild
                                      className="h-6 w-6 rounded hover:bg-muted/80"
                                      title="View"
                                    >
                                      <Link
                                        href={`/lecturer/assessments/${item.id}`}
                                      >
                                        <Eye className="size-3 text-muted-foreground" />
                                      </Link>
                                    </Button>
                                  )}

                                  {/* Edit */}
                                  {canEdit && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      asChild
                                      className="h-6 w-6 rounded hover:bg-muted/80"
                                      title="Edit"
                                    >
                                      <Link
                                        href={
                                          isDraft
                                            ? `/lecturer/assessments/new?draft=${item.id}`
                                            : `/lecturer/assessments/${item.id}/edit`
                                        }
                                      >
                                        <Edit className="size-3 text-muted-foreground" />
                                      </Link>
                                    </Button>
                                  )}

                                  {/* Finalize shortcut — drafts only */}
                                  {isDraft &&
                                    item.draft_step &&
                                    item.draft_step >= 4 && (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 rounded hover:bg-emerald-50"
                                        title="Finalize & Publish"
                                        disabled={finalizingId === item.id}
                                        onClick={() => handleFinalize(item.id)}
                                      >
                                        <CheckSquare
                                          className={cn(
                                            "size-3 text-emerald-600",
                                            finalizingId === item.id &&
                                              "animate-pulse",
                                          )}
                                        />
                                      </Button>
                                    )}

                                  {/* Duplicate */}
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 rounded hover:bg-muted/80"
                                    title="Duplicate"
                                    onClick={() =>
                                      handleDuplicate(item.id, item.title)
                                    }
                                  >
                                    <Copy className="size-3 text-muted-foreground" />
                                  </Button>

                                  {/* Results — active or closed */}
                                  {(isActive || isClosed) && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      asChild
                                      className="h-6 w-6 rounded hover:bg-muted/80"
                                      title="Results & Grading"
                                    >
                                      <Link
                                        href={`/lecturer/assessments/${item.id}/results`}
                                      >
                                        <BarChart2 className="size-3 text-muted-foreground" />
                                      </Link>
                                    </Button>
                                  )}

                                  {/* Live supervision — active only */}
                                  {isActive && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      asChild
                                      className="h-6 w-6 rounded hover:bg-sky-50"
                                      title="Live Supervision"
                                    >
                                      <Link
                                        href={`/lecturer/supervision?assessment=${item.id}`}
                                      >
                                        <MonitorPlay className="size-3 text-sky-600" />
                                      </Link>
                                    </Button>
                                  )}

                                  {/* Delete */}
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 rounded hover:bg-red-50"
                                    title="Delete"
                                    onClick={() => setDeleteTarget(item)}
                                  >
                                    <Trash2 className="size-3 text-muted-foreground hover:text-destructive" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between pt-3">
                    <p className="text-[10px] font-medium text-muted-foreground/70">
                      {(page - 1) * pageSize + 1}–
                      {Math.min(page * pageSize, totalCount)} of {totalCount}
                    </p>
                    <div className="flex gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="h-7 px-2.5 rounded-lg text-[10px] font-medium shadow-none border-muted/40"
                      >
                        <ChevronLeft className="size-3 mr-1" /> Prev
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setPage((p) => Math.min(totalPages, p + 1))
                        }
                        disabled={page === totalPages}
                        className="h-7 px-2.5 rounded-lg text-[10px] font-medium shadow-none border-muted/40"
                      >
                        Next <ChevronRight className="size-3 ml-1" />
                      </Button>
                    </div>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </div>
      </div>

      {/* ── Dialogs ── */}
      <DeleteDialog
        open={!!deleteTarget}
        assessment={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
      <BulkDeleteDialog
        open={bulkDeleteOpen}
        count={selectedIds.length}
        onClose={() => setBulkDeleteOpen(false)}
        onConfirm={handleBulkDelete}
      />
    </div>
  );
}
