// frontend/components/mindexa/exam-office/exam-office-queue-view.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  Lock,
  Search,
  RefreshCw,
  Printer,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  FileText,
  KeyRound,
  ExternalLink,
  Ban,
  Clock,
  Layers,
  Sparkles,
  QrCode,
  Loader2,
  ChevronDown,
  Download,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  examOfficeApi,
  ExamDocumentType,
  ExamOfficeQueueItem,
} from "@/lib/api/exam-office";

const DOCUMENTS: Array<{ type: ExamDocumentType; label: string; file: string }> = [
  { type: "paper", label: "Exam paper (with seal QR)", file: "exam-paper.docx" },
  { type: "marking-scheme", label: "Marking scheme", file: "marking-scheme.docx" },
  { type: "moderation-form", label: "Moderation form", file: "moderation-form.docx" },
];

/** Next step of the print job lifecycle: REQUESTED → PRINTED → STORED → DISTRIBUTED. */
const NEXT_PRINT_STEP: Record<string, { status: string; label: string } | undefined> = {
  REQUESTED: { status: "PRINTED", label: "Mark printed" },
  PRINTED: { status: "STORED", label: "Mark stored" },
  STORED: { status: "DISTRIBUTED", label: "Mark distributed" },
};
import { cn } from "@/lib/utils";

interface ExamOfficeQueueViewProps {
  portal?: "lecturer" | "admin";
}

export function ExamOfficeQueueView({ portal = "lecturer" }: ExamOfficeQueueViewProps) {
  const [queue, setQueue] = useState<ExamOfficeQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("ALL");

  // Seal Dialog State
  const [sealingItem, setSealingItem] = useState<ExamOfficeQueueItem | null>(null);
  const [sparePercent, setSparePercent] = useState<number>(5);
  const [sealNotes, setSealNotes] = useState("");
  const [isSealing, setIsSealing] = useState(false);

  // Revoke Dialog State
  const [revokingItem, setRevokingItem] = useState<ExamOfficeQueueItem | null>(null);
  const [revokeReason, setRevokeReason] = useState("");
  const [isRevoking, setIsRevoking] = useState(false);

  // Document download / print job progress (keyed so only one button spins)
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const fetchQueue = useCallback(async () => {
    try {
      setLoading(true);
      const res = await examOfficeApi.getExamOfficeQueue();
      setQueue(res || []);
    } catch (err: any) {
      toast.error(err.message || "Failed to load exam office queue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  const handleSeal = async () => {
    if (!sealingItem) return;
    try {
      setIsSealing(true);
      const result = await examOfficeApi.sealAssessment(sealingItem.assessment_id, {
        spare_percent: sparePercent,
        notes: sealNotes.trim() || undefined,
      });
      toast.success(
        `Assessment sealed! Verification Code: ${result.verification_code} (${result.copies_total} copies requested)`
      );
      setSealingItem(null);
      setSealNotes("");
      fetchQueue();
    } catch (err: any) {
      toast.error(err.message || "Failed to seal assessment");
    } finally {
      setIsSealing(false);
    }
  };

  const handleDownload = async (
    item: ExamOfficeQueueItem,
    doc: (typeof DOCUMENTS)[number],
  ) => {
    const key = `doc:${item.assessment_id}:${doc.type}`;
    setBusyKey(key);
    try {
      await examOfficeApi.downloadDocument(item.assessment_id, doc.type, doc.file);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not download the document");
    } finally {
      setBusyKey(null);
    }
  };

  const handleAdvancePrintJob = async (item: ExamOfficeQueueItem) => {
    const job = item.print_job;
    const next = job ? NEXT_PRINT_STEP[job.status] : undefined;
    if (!job || !next) return;
    const key = `job:${job.id}`;
    setBusyKey(key);
    try {
      await examOfficeApi.updatePrintJob(job.id, { status: next.status });
      toast.success(`Print job ${next.status.toLowerCase()}.`);
      fetchQueue();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not update the print job");
    } finally {
      setBusyKey(null);
    }
  };

  const handleRevoke = async () => {
    // The API requires at least 5 characters; check here so the error is clear
    if (!revokingItem || revokeReason.trim().length < 5) {
      toast.error("Enter a reason for revoking the seal (at least 5 characters).");
      return;
    }
    try {
      setIsRevoking(true);
      await examOfficeApi.revokeSeal(revokingItem.assessment_id, revokeReason.trim());
      toast.success("Exam seal revoked. Assessment returned to Approved state.");
      setRevokingItem(null);
      setRevokeReason("");
      fetchQueue();
    } catch (err: any) {
      toast.error(err.message || "Failed to revoke seal");
    } finally {
      setIsRevoking(false);
    }
  };

  const filteredQueue = queue.filter((item) => {
    const matchesSearch =
      (item.title || "").toLowerCase().includes(search.toLowerCase()) ||
      (item.assessment_id || "").toLowerCase().includes(search.toLowerCase());

    if (!matchesSearch) return false;
    if (filterStatus === "ALL") return true;
    if (filterStatus === "APPROVED") return item.status === "APPROVED";
    if (filterStatus === "SEALED") return item.status === "SEALED";
    return true;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-primary/10 rounded-xl text-primary">
              <Lock className="size-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Exam Office & Sealing Management</h1>
              <p className="text-sm text-muted-foreground">
                Cryptographic sealing, watermark generation, and exam print-job dispatch.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchQueue}
            disabled={loading}
            className="h-9 gap-1.5"
          >
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Metric Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: "Queue Workload",
            value: queue.length,
            icon: Layers,
            pill: "bg-primary/10 text-primary",
          },
          {
            label: "Awaiting Seal",
            value: queue.filter((i) => i.status === "APPROVED").length,
            icon: Clock,
            pill: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
          },
          {
            label: "Cryptographically Sealed",
            value: queue.filter((i) => i.status === "SEALED").length,
            icon: ShieldCheck,
            pill: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
          },
          {
            label: "Master Print Total",
            value: queue.reduce((acc, i) => acc + (i.print_job?.copies_total || 0), 0),
            icon: Printer,
            pill: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
          },
        ].map((stat, i) => (
          <Card
            key={i}
            className="border border-border/60 shadow-none rounded-2xl bg-card overflow-hidden p-5"
          >
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {stat.label}
                </p>
                <h3 className="text-2xl font-bold tracking-tight">
                  {stat.value}
                </h3>
              </div>
              <div className={cn("size-11 rounded-xl flex items-center justify-center shrink-0", stat.pill)}>
                <stat.icon className="size-5" />
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Filter and Search Bar */}
      <Card className="border-border/60 shadow-none">
        <CardContent className="p-4 flex flex-col md:flex-row gap-3 items-center justify-between">
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search assessment title or ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-xs"
            />
          </div>

          <div className="flex items-center gap-1.5 flex-wrap w-full md:w-auto">
            {["ALL", "APPROVED", "SEALED"].map((st) => (
              <Button
                key={st}
                variant={filterStatus === st ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterStatus(st)}
                className="h-8 text-xs capitalize"
              >
                {st === "APPROVED"
                  ? "Awaiting Seal"
                  : st === "SEALED"
                  ? "Cryptographically Sealed"
                  : "All Records"}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Queue Items */}
      {loading ? (
        <div className="grid grid-cols-1 gap-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse h-28 border-border/50" />
          ))}
        </div>
      ) : filteredQueue.length === 0 ? (
        <Card className="p-12 text-center border-dashed">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted/60 mb-3">
            <Lock className="size-6 text-muted-foreground" />
          </div>
          <h3 className="text-base font-semibold">No assessments in Exam Office queue</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
            Assessments approved by department moderators will automatically route here for official sealing.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredQueue.map((item) => {
            const isSealed = item.status === "SEALED";
            const sealData = item.seal;
            const printData = item.print_job;

            return (
              <Card
                key={item.assessment_id}
                className={cn(
                  "border transition-all shadow-none",
                  isSealed ? "border-emerald-500/30 bg-emerald-500/[0.02]" : "border-border/60"
                )}
              >
                <CardContent className="p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="space-y-2 flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h3 className="font-semibold text-base text-foreground truncate">
                        {item.title}
                      </h3>
                      <Badge
                        className={cn(
                          "text-[10px] font-semibold h-5 uppercase tracking-wide",
                          isSealed
                            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30"
                            : "bg-blue-500/15 text-blue-700 dark:text-blue-400 border border-blue-500/30"
                        )}
                      >
                        {isSealed ? "SEALED & LOCKED" : "MODERATION APPROVED"}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs text-muted-foreground">
                      <div>
                        Assessment ID: <span className="font-mono text-foreground">{item.assessment_id.slice(0, 8)}</span>
                      </div>
                      {isSealed && sealData && (
                        <div className="flex items-center gap-1.5">
                          <KeyRound className="size-3.5 text-primary" />
                          <span>Code: <strong className="font-mono text-primary font-bold">{sealData.verification_code}</strong></span>
                        </div>
                      )}
                      {isSealed && printData && (
                        <div className="flex items-center gap-1.5">
                          <Printer className="size-3.5 text-foreground/70" />
                          <span>
                            Copies: <strong>{printData.copies_total}</strong> ({printData.enrolled_count} + {printData.spare_percent}% spare)
                            {" · "}
                            <Badge variant="outline" className="text-[9px] uppercase">
                              {printData.status}
                            </Badge>
                          </span>
                        </div>
                      )}
                    </div>

                    {isSealed && sealData?.sealed_at && (
                      <p className="text-[11px] text-muted-foreground">
                        Cryptographically sealed on {format(new Date(sealData.sealed_at), "PPP p")}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0 w-full md:w-auto justify-end flex-wrap">
                    {!isSealed ? (
                      <Button
                        size="sm"
                        className="h-9 text-xs rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                        onClick={() => {
                          setSealingItem(item);
                          setSparePercent(5);
                          setSealNotes("");
                        }}
                      >
                        <Lock className="size-3.5" />
                        Seal Assessment
                      </Button>
                    ) : (
                      <>
                        {printData && NEXT_PRINT_STEP[printData.status] && (
                          <Button
                            size="sm"
                            className="h-9 text-xs rounded-lg gap-1.5"
                            disabled={busyKey === `job:${printData.id}`}
                            onClick={() => handleAdvancePrintJob(item)}
                          >
                            {busyKey === `job:${printData.id}` ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <Printer className="size-3.5" />
                            )}
                            {NEXT_PRINT_STEP[printData.status]?.label}
                          </Button>
                        )}

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="outline" className="h-9 text-xs rounded-lg gap-1.5">
                              <Download className="size-3.5 text-primary" />
                              Documents
                              <ChevronDown className="size-3 text-muted-foreground" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {DOCUMENTS.map((doc) => (
                              <DropdownMenuItem
                                key={doc.type}
                                disabled={busyKey === `doc:${item.assessment_id}:${doc.type}`}
                                onSelect={() => handleDownload(item, doc)}
                              >
                                <FileText className="mr-2 size-3.5" />
                                {doc.label}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>

                        <Button
                          size="sm"
                          variant="outline"
                          className="h-9 text-xs rounded-lg text-rose-600 border-rose-500/30 hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-400 gap-1.5"
                          onClick={() => {
                            setRevokingItem(item);
                            setRevokeReason("");
                          }}
                        >
                          <Ban className="size-3.5" />
                          Revoke Seal
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Seal Dialog */}
      <Dialog open={sealingItem !== null} onOpenChange={(open) => !open && setSealingItem(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg flex items-center gap-2">
              <Lock className="size-5 text-emerald-600" />
              Cryptographically Seal Assessment
            </DialogTitle>
            <DialogDescription className="text-xs">
              Sealing finalizes the exam blueprint, computes a SHA-256 integrity hash, locks content from editing, and generates an official verification code with master print packaging.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="p-3 bg-muted/40 rounded-xl border text-xs space-y-1">
              <p className="font-semibold text-foreground">{sealingItem?.title}</p>
              <p className="text-muted-foreground text-[11px]">ID: {sealingItem?.assessment_id}</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Spare Copies Margin (%)</Label>
              <Input
                type="number"
                min={0}
                max={50}
                value={sparePercent}
                onChange={(e) => setSparePercent(parseInt(e.target.value) || 0)}
                className="text-xs h-9"
              />
              <p className="text-[10px] text-muted-foreground">
                Additional exam copies printed to handle defects or walk-in candidates (default 5%).
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Exam Office Dispatch Notes (Optional)</Label>
              <Textarea
                placeholder="e.g., Safe storage box #14; scheduled for morning printing run."
                value={sealNotes}
                onChange={(e) => setSealNotes(e.target.value)}
                className="text-xs min-h-[70px]"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSealingItem(null)}
              className="h-9 text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={isSealing}
              onClick={handleSeal}
              className="h-9 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
            >
              {isSealing ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <>
                  <Lock className="size-3.5" />
                  Confirm & Seal Exam
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke Seal Dialog */}
      <Dialog open={revokingItem !== null} onOpenChange={(open) => !open && setRevokingItem(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg flex items-center gap-2 text-rose-600">
              <Ban className="size-5" />
              Revoke Assessment Seal
            </DialogTitle>
            <DialogDescription className="text-xs">
              Revoking a seal invalidates the verification code and print job. The assessment will return to moderation status and require resealing before publishing.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <Label className="text-xs font-medium">Mandatory Revocation Reason *</Label>
            <Textarea
              placeholder="e.g., Scheduling date altered; question formatting discrepancy detected prior to printing."
              value={revokeReason}
              onChange={(e) => setRevokeReason(e.target.value)}
              className="text-xs min-h-[80px]"
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRevokingItem(null)}
              className="h-9 text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={isRevoking || !revokeReason.trim()}
              onClick={handleRevoke}
              className="h-9 text-xs bg-rose-600 hover:bg-rose-700 text-white"
            >
              {isRevoking ? <Loader2 className="size-3.5 animate-spin" /> : "Revoke Seal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
