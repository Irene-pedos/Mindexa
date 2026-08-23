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
  Lock,
  FileText,
  Zap,
  Sparkles,
  CheckCircle,
  UserCheck,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import Link from "next/link";
import { assessmentApi } from "@/lib/api/assessment";
import { cn, formatAssessmentType } from "@/lib/utils";
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
  integrity_monitoring_enabled?: boolean;
  is_supervised?: boolean;
  allow_resume?: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_TABS = [
  { value: "all", label: "All" },
  { value: "DRAFT", label: "Drafts" },
  { value: "PUBLISHED", label: "Published" },
  { value: "ACTIVE", label: "Active" },
  { value: "CLOSED", label: "Closed" },
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
    SCHEDULED: "bg-primary/5 text-primary border-primary/15",
    ACTIVE: "bg-success/10 text-success border-success/20",
    CLOSED: "bg-muted text-foreground border-border",
    ARCHIVED: "bg-transparent text-muted-foreground border-border",
    CANCELLED: "bg-destructive/10 text-destructive border-destructive/20",
  };
  return m[status] ?? "bg-muted text-muted-foreground";
}

function gradingModeStyle(mode: string): string {
  const m: Record<string, string> = {
    AUTO: "bg-secondary text-secondary-foreground border-border",
    MANUAL: "bg-warning/10 text-warning border-warning/20",
    AI_ASSISTED: "bg-primary/10 text-primary border-primary/20",
  };
  return m[mode?.toUpperCase()] ?? "bg-muted text-muted-foreground";
}

function releaseStyle(mode: string | null): string {
  if (!mode) return "bg-muted text-muted-foreground border-border";
  if (mode === "IMMEDIATE") return "bg-success/10 text-success border-success/20";
  if (mode === "MANUAL") return "bg-warning/10 text-warning border-warning/20";
  return "bg-muted text-muted-foreground border-border";
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
            className="h-8 rounded-lg text-xs text-white bg-destructive hover:bg-destructive/90"
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
    <div data-tour="lecturer-create" className="w-full space-y-3.5 p-1 md:p-2 animate-in fade-in duration-200">
      {/* ── Page header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Assessments</h1>
          <p className="text-sm text-muted-foreground mt-1 font-medium">
            Manage, monitor, and govern your assessment registry.
          </p>
        </div>
        <Button
          data-tour="lecturer-create-assessment"
          size="sm"
          asChild
          className="h-8 rounded-lg px-4 gap-1.5 shadow-none font-bold text-[10px] uppercase tracking-wider text-white"
        >
          <Link href="/lecturer/assessments/new">
            <Plus className="size-3.5" /> New Assessment
          </Link>
        </Button>
      </div>

      {/* ── Needs grading callout ── */}
      {!loading && needsGradingCount > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-warning/15 bg-warning/5 px-3 py-2">
          <Cpu className="size-3.5 text-warning shrink-0" />
          <p className="text-xs text-warning-foreground font-medium">
            {needsGradingCount} assessment{needsGradingCount !== 1 ? "s" : ""}{" "}
            currently open or closed require manual grading attention.
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-6 px-2 text-[10px] text-warning hover:bg-warning/10 rounded-lg"
            onClick={() => setGradingFilter("MANUAL")}
          >
            Filter
          </Button>
        </div>
      )}

      {/* ── Card ── */}
      <div className="rounded-2xl border border-border/70 bg-card text-card-foreground shadow-sm overflow-hidden">
        {/* Toolbar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3.5 border-b border-border/40 bg-muted/20">
          <div className="flex flex-wrap items-center gap-2">
            {/* Sort Dropdown */}
            <Select
              value={sortBy}
              onValueChange={(val) => {
                setSortBy(val);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-44 h-8 text-xs rounded-xl bg-background border-border/60 shadow-none font-medium">
                <ArrowUpDown className="mr-1.5 size-3.5 text-muted-foreground" />
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent className="rounded-xl text-xs">
                <SelectItem value="newest" className="text-xs">
                  Newest first
                </SelectItem>
                <SelectItem value="oldest" className="text-xs">
                  Oldest first
                </SelectItem>
                <SelectItem value="title" className="text-xs">
                  Title (A → Z)
                </SelectItem>
                <SelectItem value="title_desc" className="text-xs">
                  Title (Z → A)
                </SelectItem>
                <SelectItem value="due_date" className="text-xs">
                  Due Date (Earliest)
                </SelectItem>
                <SelectItem value="due_date_desc" className="text-xs">
                  Due Date (Latest)
                </SelectItem>
                <SelectItem value="marks" className="text-xs">
                  Marks (Highest)
                </SelectItem>
                <SelectItem value="marks_asc" className="text-xs">
                  Marks (Lowest)
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
              <SelectTrigger className="w-36 h-8 text-xs rounded-xl bg-background border-border/60 shadow-none font-medium">
                <Filter className="mr-1.5 size-3.5 text-muted-foreground" />
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

            {/* Grading Mode Filter */}
            <Select
              value={gradingFilter}
              onValueChange={(v) => {
                setGradingFilter(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-36 h-8 text-xs rounded-xl bg-background border-border/60 shadow-none font-medium">
                <Cpu className="mr-1.5 size-3.5 text-muted-foreground" />
                <SelectValue placeholder="Grading" />
              </SelectTrigger>
              <SelectContent className="rounded-xl text-xs">
                <SelectItem value="all" className="text-xs">
                  All grading
                </SelectItem>
                {GRADING_MODES.map((m) => (
                  <SelectItem key={m} value={m} className="text-xs">
                    {m.replace("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Clear filters */}
            {(typeFilter !== "all" ||
              gradingFilter !== "all" ||
              searchTerm.trim().length > 0 ||
              sortBy !== "newest") && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground rounded-xl"
                onClick={() => {
                  setTypeFilter("all");
                  setGradingFilter("all");
                  setSearchTerm("");
                  setSortBy("newest");
                  setPage(1);
                }}
              >
                <RefreshCw className="size-3 mr-1" /> Reset
              </Button>
            )}
          </div>

          {/* Search with interactive Clear button */}
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/70 pointer-events-none" />
            <Input
              placeholder="Search title, course code…"
              className="pl-8.5 pr-8 h-8 text-xs rounded-xl bg-background border-border/60 focus-visible:ring-1 shadow-none"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm("");
                  setPage(1);
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
                title="Clear search"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="p-3.5">
          {loading ? (
            <div className="space-y-3">
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="w-24 h-8 rounded-xl" />
                ))}
              </div>
              <div className="space-y-2 pt-2">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <Skeleton key={i} className="w-full h-12 rounded-xl" />
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
              {/* Upgraded Tabs List */}
              <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1 mb-3">
                <TabsList className="bg-muted/40 p-1 rounded-xl border border-border/50 h-auto gap-1 inline-flex shrink-0">
                  {STATUS_TABS.map((tab) => {
                    const count =
                      tab.value === "all" ? totalCount : tabCounts[tab.value];
                    const isActive = statusTab === tab.value;

                    return (
                      <TabsTrigger
                        key={tab.value}
                        value={tab.value}
                        className={cn(
                          "text-xs font-semibold px-3 py-1.5 rounded-lg transition-all duration-200 gap-2",
                          "data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:border data-[state=active]:border-border/60",
                          "text-muted-foreground hover:text-foreground hover:bg-background/50"
                        )}
                      >
                        <span>{tab.label}</span>
                        {count !== undefined && count > 0 && (
                          <span
                            className={cn(
                              "px-1.5 py-0.2 rounded-full text-[10px] font-bold tabular-nums transition-colors",
                              isActive
                                ? "bg-primary/10 text-primary"
                                : "bg-muted text-muted-foreground"
                            )}
                          >
                            {count}
                          </span>
                        )}
                      </TabsTrigger>
                    );
                  })}
                </TabsList>

                {debouncedSearch && (
                  <div className="text-xs text-muted-foreground hidden sm:flex items-center gap-1.5 font-medium pr-1">
                    <span>Results for</span>
                    <span className="font-semibold text-foreground">
                      &ldquo;{debouncedSearch}&rdquo;
                    </span>
                    <span className="text-muted-foreground/60">({totalCount})</span>
                  </div>
                )}
              </div>

              <TabsContent value={statusTab} className="mt-0 outline-none">
                {/* Bulk action bar */}
                {selectedIds.length > 0 && (
                  <div className="flex items-center justify-between bg-primary/5 px-3.5 py-2 rounded-xl border border-primary/15 mb-3">
                    <span className="text-xs font-semibold text-primary">
                      {selectedIds.length} draft
                      {selectedIds.length !== 1 ? "s" : ""} selected
                    </span>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setBulkDeleteOpen(true)}
                      className="h-7 px-3 rounded-lg text-xs font-semibold shadow-none"
                    >
                      <Trash2 className="mr-1.5 size-3.5" /> Delete Selected
                    </Button>
                  </div>
                )}

                {/* Table */}
                <div className="rounded-xl border border-border/60 overflow-hidden bg-background">
                  <Table>
                    <TableHeader className="bg-muted/30">
                      <TableRow className="hover:bg-transparent border-b border-border/40">
                        <TableHead className="w-[36px] px-3">
                          <Checkbox
                            checked={
                              selectableIds.length > 0 &&
                              selectedIds.length === selectableIds.length
                            }
                            onCheckedChange={toggleSelectAll}
                          />
                        </TableHead>
                        <TableHead
                          onClick={() => {
                            setSortBy(sortBy === "title" ? "title_desc" : "title");
                            setPage(1);
                          }}
                          className="text-[11px] font-semibold uppercase tracking-wider h-10 min-w-[180px] cursor-pointer select-none hover:text-foreground"
                        >
                          <span className="flex items-center gap-1.5">
                            <FileText className="size-3 text-muted-foreground/60" /> Assessment
                            {sortBy === "title" && <ArrowUpDown className="size-3 text-primary" />}
                            {sortBy === "title_desc" && <ArrowUpDown className="size-3 text-primary rotate-180" />}
                          </span>
                        </TableHead>
                        <TableHead className="text-[11px] font-semibold uppercase tracking-wider h-10">
                          <span className="flex items-center gap-1.5">
                            <BookOpen className="size-3 text-muted-foreground/60" /> Course
                          </span>
                        </TableHead>
                        <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-center h-10">
                          <span className="flex items-center justify-center gap-1.5">
                            <Filter className="size-3 text-muted-foreground/60" /> Type
                          </span>
                        </TableHead>
                        <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-center h-10">
                          <span className="flex items-center justify-center gap-1.5">
                            <Zap className="size-3 text-muted-foreground/60" /> Release
                          </span>
                        </TableHead>
                        <TableHead
                          onClick={() => {
                            setSortBy(sortBy === "marks" ? "marks_asc" : "marks");
                            setPage(1);
                          }}
                          className="text-[11px] font-semibold uppercase tracking-wider h-10 cursor-pointer select-none hover:text-foreground"
                        >
                          <span className="flex items-center gap-1.5">
                            <BarChart2 className="size-3 text-muted-foreground/60" /> Metrics
                            {sortBy === "marks" && <ArrowUpDown className="size-3 text-primary" />}
                            {sortBy === "marks_asc" && <ArrowUpDown className="size-3 text-primary rotate-180" />}
                          </span>
                        </TableHead>
                        <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-center h-10">
                          <span className="flex items-center justify-center gap-1.5">
                            <CheckSquare className="size-3 text-muted-foreground/60" /> Status
                          </span>
                        </TableHead>
                        <TableHead className="text-right text-[11px] font-semibold uppercase tracking-wider pr-3.5 h-10">
                          Actions
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {assessments.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={8}
                            className="text-center py-16 text-muted-foreground"
                          >
                            <div className="flex flex-col items-center gap-3 max-w-sm mx-auto">
                              <div className="p-3 rounded-2xl bg-muted/40 border border-border/50 text-muted-foreground">
                                <Search className="size-6 opacity-60" />
                              </div>
                              <div className="space-y-1">
                                <p className="text-sm font-semibold text-foreground">
                                  {searchTerm
                                    ? `No assessments match "${searchTerm}"`
                                    : statusTab !== "all"
                                    ? `No ${statusTab.toLowerCase()} assessments found`
                                    : "No assessments registered yet"}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {searchTerm
                                    ? "Try refining your search query or reset your filters."
                                    : "Get started by creating your first academic assessment."}
                                </p>
                              </div>
                              {searchTerm || typeFilter !== "all" || gradingFilter !== "all" ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setSearchTerm("");
                                    setTypeFilter("all");
                                    setGradingFilter("all");
                                    setPage(1);
                                  }}
                                  className="h-8 rounded-xl text-xs mt-1"
                                >
                                  <RefreshCw className="size-3 mr-1.5" /> Clear Filters
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  asChild
                                  className="h-8 rounded-xl px-4 text-xs font-semibold mt-1"
                                >
                                  <Link href="/lecturer/assessments/new">
                                    <Plus className="size-3.5 mr-1" /> Create Assessment
                                  </Link>
                                </Button>
                              )}
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
                                      <span className="text-[9px] px-1.5 py-0 rounded-full bg-primary/5 text-primary border border-primary/10 font-medium flex items-center gap-1">
                                        <Edit className="size-2.5" /> Step {draftStep} of 6
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
                                  {formatAssessmentType(item.assessment_type, {
                                    integrity_monitoring_enabled: item.integrity_monitoring_enabled,
                                    is_supervised: item.is_supervised,
                                    allow_resume: item.allow_resume,
                                  })}
                                </Badge>
                              </TableCell>


                              {/* Release mode */}
                              <TableCell className="text-center">
                                <span
                                  className={cn(
                                    "text-[8px] font-bold uppercase tracking-tight px-1.5 py-0.5 rounded inline-flex items-center justify-center gap-1 border",
                                    releaseStyle(item.result_release_mode),
                                  )}
                                >
                                  {item.result_release_mode === "IMMEDIATE" && <Zap className="size-2.5" />}
                                  {item.result_release_mode === "MANUAL" && <UserCheck className="size-2.5" />}
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
                                    "text-[8px] font-bold uppercase tracking-tight h-5 px-2 rounded-full inline-flex items-center gap-1 border w-fit mx-auto",
                                    statusStyle(item.status),
                                  )}
                                >
                                  {item.status === "ACTIVE" && <span className="size-1.5 rounded-full bg-success animate-pulse shrink-0" />}
                                  {item.status === "PUBLISHED" && <CheckCircle className="size-2.5 shrink-0" />}
                                  {item.status === "DRAFT" && <FileText className="size-2.5 shrink-0" />}
                                  {item.status === "SCHEDULED" && <Clock className="size-2.5 shrink-0" />}
                                  {item.status === "CLOSED" && <Lock className="size-2.5 shrink-0" />}
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
                                        className="h-6 w-6 rounded hover:bg-success/10"
                                        title="Finalize & Publish"
                                        disabled={finalizingId === item.id}
                                        onClick={() => handleFinalize(item.id)}
                                      >
                                        <CheckSquare
                                          className={cn(
                                            "size-3 text-success",
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
                                      className="h-6 w-6 rounded hover:bg-primary/10"
                                      title="Live Supervision"
                                    >
                                      <Link
                                        href={`/lecturer/supervision?assessment=${item.id}`}
                                      >
                                        <MonitorPlay className="size-3 text-primary" />
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
