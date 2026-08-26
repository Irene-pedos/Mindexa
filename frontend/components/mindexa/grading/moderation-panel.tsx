"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  ShieldAlert,
  AlertTriangle,
  TrendingUp,
  Users,
  Scale,
  ArrowRightLeft,
  CheckCircle2,
  ChevronRight,
  Info,
} from "lucide-react";
import { gradingApi } from "@/lib/api/grading";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

interface ModerationPanelProps {
  questionId: string;
}

export function ModerationPanel({ questionId }: ModerationPanelProps) {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>(null);
  const [selectedResponse, setSelectedResponse] = useState<any>(null);
  const [newScore, setNewScore] = useState<string>("" );
  const [reason, setReason] = useState<string>("");
  const [isSubmitting, setIsSaving] = useState(false);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await gradingApi.getModerationStats(questionId);
      setStats(res);
    } catch {
      toast.error("Failed to load moderation analytics");
    } finally {
      setLoading(false);
    }
  }, [questionId]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleModerate = async () => {
    if (!selectedResponse) return;
    const maxMarks = Number(selectedResponse.max_score ?? 10);
    const parsedScore = parseFloat(newScore);

    if (isNaN(parsedScore) || parsedScore < 0 || parsedScore > maxMarks) {
      toast.error(`Score must be between 0 and ${maxMarks}`);
      return;
    }

    if (!reason || reason.trim().length < 10) {
      toast.error("Please provide a detailed revision reason (min 10 chars)");
      return;
    }

    setIsSaving(true);
    try {
      await gradingApi.moderateGrade({
        response_id: selectedResponse.response_id,
        new_score: parsedScore,
        revision_reason: reason.trim(),
      });
      toast.success("Grade superseded and revised successfully");
      setSelectedResponse(null);
      setNewScore("");
      setReason("");
      fetchStats();
    } catch (err: any) {
      toast.error(err.message || "Failed to revise grade");
    } finally {
      setIsSaving(false);
    }
  };

  if (loading || !stats) {
    return (
      <div className="space-y-4 font-sans">
        <Skeleton className="h-[90px] w-full rounded-2xl" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton className="h-[240px] w-full rounded-2xl" />
          <Skeleton className="h-[240px] w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 font-sans">
      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="bg-card/60 border border-border/40 rounded-2xl p-3 flex flex-col gap-0.5">
          <span className="text-[9px] font-bold uppercase text-muted-foreground tracking-wider">
            Total Graded
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-lg font-bold font-mono text-foreground">
              {stats.total_graded}
            </span>
            <Users className="size-3 text-muted-foreground" />
          </div>
        </div>

        <div className="bg-card/60 border border-border/40 rounded-2xl p-3 flex flex-col gap-0.5">
          <span className="text-[9px] font-bold uppercase text-muted-foreground tracking-wider">
            Average Score
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-lg font-bold font-mono text-primary">
              {stats.average_score.toFixed(1)}
            </span>
            <TrendingUp className="size-3 text-primary" />
          </div>
        </div>

        <div className="bg-card/60 border border-border/40 rounded-2xl p-3 flex flex-col gap-0.5">
          <span className="text-[9px] font-bold uppercase text-muted-foreground tracking-wider">
            Median Score
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-lg font-bold font-mono text-foreground">
              {stats.median_score.toFixed(1)}
            </span>
            <Scale className="size-3 text-muted-foreground" />
          </div>
        </div>

        <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-3 flex flex-col gap-0.5">
          <span className="text-[9px] font-bold uppercase text-amber-600 dark:text-amber-400 tracking-wider">
            AI Deviations
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-lg font-bold font-mono text-amber-700 dark:text-amber-300">
              {stats.significant_deviations_count}
            </span>
            <AlertTriangle className="size-3 text-amber-600" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Score Distribution */}
        <Card className="border border-border/40 bg-card/60 rounded-2xl overflow-hidden shadow-2xs">
          <CardHeader className="py-3 px-4 border-b border-border/30 bg-muted/10">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 text-foreground">
              <TrendingUp className="size-3.5 text-primary" /> Score Distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[220px] p-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.score_distribution}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="rgba(128,128,128,0.15)"
                />
                <XAxis
                  dataKey="score"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "currentColor", opacity: 0.6 }}
                />
                <YAxis
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "currentColor", opacity: 0.6 }}
                />
                <Tooltip
                  cursor={{ fill: "rgba(128,128,128,0.08)" }}
                  contentStyle={{
                    fontSize: "11px",
                    borderRadius: "12px",
                    border: "1px solid rgba(128,128,128,0.2)",
                    backgroundColor: "var(--background)",
                    color: "var(--foreground)",
                  }}
                />
                <Bar dataKey="count" fill="var(--primary)" radius={[4, 4, 0, 0]}>
                  {stats.score_distribution.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fillOpacity={0.85} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Flagged Outliers */}
        <Card className="border border-border/40 bg-card/60 rounded-2xl overflow-hidden shadow-2xs">
          <CardHeader className="py-3 px-4 border-b border-border/30 bg-muted/10">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-rose-600 flex items-center gap-1.5">
              <ShieldAlert className="size-3.5 text-rose-500" /> Moderation Priority Outliers
            </CardTitle>
            <CardDescription className="text-[10px]">
              High security risk or significant AI variance.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0 max-h-[220px] overflow-y-auto">
            <Table>
              <TableBody>
                {stats.outliers.length === 0 ? (
                  <TableRow>
                    <TableCell className="text-center py-8 text-muted-foreground text-xs italic">
                      No outliers detected for this question.
                    </TableCell>
                  </TableRow>
                ) : (
                  stats.outliers.map((o: any) => (
                    <TableRow
                      key={o.response_id}
                      className="group hover:bg-muted/10 border-b border-border/20 last:border-0"
                    >
                      <TableCell className="py-2.5 px-3">
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold text-foreground">
                            {o.student_name}
                          </span>
                          <span
                            className={cn(
                              "text-[9px] font-mono",
                              o.risk_score > 70
                                ? "text-rose-600 font-bold"
                                : "text-muted-foreground",
                            )}
                          >
                            Risk: {o.risk_score}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <span className="text-xs font-mono font-bold text-foreground">
                            {o.score}
                          </span>
                          <ArrowRightLeft className="size-3 text-muted-foreground" />
                          <span className="text-xs font-mono text-muted-foreground">
                            {o.ai_suggested_score}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="py-2.5 text-right pr-3">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-primary font-medium hover:bg-primary/10 rounded-lg"
                              onClick={() => {
                                setSelectedResponse(o);
                                setNewScore(o.score.toString());
                              }}
                            >
                              Moderate
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="sm:max-w-md bg-background border border-border/60 rounded-2xl shadow-2xl p-5 text-left font-sans">
                            <DialogHeader>
                              <DialogTitle className="text-base font-semibold text-foreground">
                                Moderate & Supersede Grade
                              </DialogTitle>
                              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                                Performing an immutable audit revision for {o.student_name}.
                              </DialogDescription>
                            </DialogHeader>

                            <div className="space-y-3 py-2 text-xs">
                              <div className="grid grid-cols-2 gap-2 bg-muted/20 p-2.5 rounded-xl border border-border/30">
                                <div>
                                  <span className="text-[9px] uppercase font-bold text-muted-foreground block">
                                    Current Score
                                  </span>
                                  <span className="text-sm font-mono font-bold text-foreground">
                                    {o.score} / {o.max_score ?? 10} pts
                                  </span>
                                </div>
                                <div>
                                  <span className="text-[9px] uppercase font-bold text-muted-foreground block">
                                    AI Suggestion
                                  </span>
                                  <span className="text-sm font-mono font-bold text-primary">
                                    {o.ai_suggested_score ?? "N/A"}
                                  </span>
                                </div>
                              </div>

                              <div className="space-y-1.5">
                                <Label className="text-xs font-medium">
                                  Revised Score (Max: {o.max_score ?? 10} pts)
                                </Label>
                                <Input
                                  type="number"
                                  min={0}
                                  max={Number(
                                    selectedResponse?.max_score ??
                                      o.max_score ??
                                      10,
                                  )}
                                  step="any"
                                  className="font-bold text-sm h-9 rounded-xl"
                                  value={newScore}
                                  onChange={(e) => setNewScore(e.target.value)}
                                />
                              </div>

                              <div className="space-y-1.5">
                                <Label className="text-xs font-medium">
                                  Revision Justification
                                </Label>
                                <Textarea
                                  placeholder="Academic rationale for adjusting this mark..."
                                  className="text-xs min-h-[80px] rounded-xl"
                                  value={reason}
                                  onChange={(e) => setReason(e.target.value)}
                                />
                              </div>
                            </div>

                            <DialogFooter className="mt-2 pt-2.5 border-t border-border/30 flex justify-end gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="rounded-xl text-xs h-8"
                                onClick={() => setSelectedResponse(null)}
                              >
                                Cancel
                              </Button>
                              <Button
                                size="sm"
                                className="rounded-xl text-xs h-8 bg-rose-600 hover:bg-rose-700 text-white font-medium"
                                onClick={handleModerate}
                                disabled={isSubmitting}
                              >
                                {isSubmitting ? "Processing..." : "Supersede Grade"}
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
