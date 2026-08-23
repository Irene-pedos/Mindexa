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
  Cell 
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
  Info
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
  const [newScore, setNewScore] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [isSubmitting, setIsSaving] = useState(false);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await gradingApi.getModerationStats(questionId);
      setStats(res);
    } catch (err) {
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
    return <div className="space-y-4">
      <Skeleton className="h-[100px] w-full rounded-md" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Skeleton className="h-[250px] w-full rounded-md" />
        <Skeleton className="h-[250px] w-full rounded-md" />
      </div>
    </div>;
  }

  return (
    <div className="space-y-6">
      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-card border rounded-lg p-3 flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Total Graded</span>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold">{stats.total_graded}</span>
            <Users className="size-3 text-muted-foreground" />
          </div>
        </div>
        <div className="bg-card border rounded-lg p-3 flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Average Score</span>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold text-primary">{stats.average_score.toFixed(1)}</span>
            <TrendingUp className="size-3 text-primary" />
          </div>
        </div>
        <div className="bg-card border rounded-lg p-3 flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Median Score</span>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold">{stats.median_score.toFixed(1)}</span>
            <Scale className="size-3 text-muted-foreground" />
          </div>
        </div>
        <div className="bg-card border rounded-lg p-3 flex flex-col gap-1 border-amber-200 bg-amber-50/30">
          <span className="text-[10px] font-bold uppercase text-amber-800 tracking-wider">AI Deviations</span>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold text-amber-700">{stats.significant_deviations_count}</span>
            <AlertTriangle className="size-3 text-amber-600" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Score Distribution */}
        <Card className="shadow-none border border-muted-foreground/10 bg-muted/5">
          <CardHeader className="py-3">
             <CardTitle className="text-sm font-semibold flex items-center gap-2">
               <TrendingUp className="size-4" /> Score Distribution
             </CardTitle>
          </CardHeader>
          <CardContent className="h-[240px] pt-0">
             <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.score_distribution}>
                   <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                   <XAxis 
                    dataKey="score" 
                    fontSize={10} 
                    tickLine={false} 
                    axisLine={false}
                    tick={{ fill: 'currentColor', opacity: 0.5 }}
                   />
                   <YAxis 
                    fontSize={10} 
                    tickLine={false} 
                    axisLine={false}
                    tick={{ fill: 'currentColor', opacity: 0.5 }}
                   />
                   <Tooltip 
                    cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                    contentStyle={{ fontSize: '10px', borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                   />
                   <Bar dataKey="count" fill="var(--primary)" radius={[4, 4, 0, 0]}>
                      {stats.score_distribution.map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fillOpacity={0.8} />
                      ))}
                   </Bar>
                </BarChart>
             </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Flagged Outliers */}
        <Card className="shadow-none border border-red-100 bg-white">
          <CardHeader className="py-3 border-b bg-red-50/30">
             <CardTitle className="text-sm font-bold text-red-800 flex items-center gap-2 uppercase tracking-tight">
               <ShieldAlert className="size-4" /> Moderation Priority List
             </CardTitle>
             <CardDescription className="text-[11px]">
               Outliers identified by high security risk or significant AI disagreement.
             </CardDescription>
          </CardHeader>
          <CardContent className="p-0 max-h-[240px] overflow-y-auto">
             <Table>
                <TableBody>
                   {stats.outliers.length === 0 ? (
                      <TableRow>
                        <TableCell className="text-center py-10 text-muted-foreground text-xs italic">
                           No outliers detected for this question.
                        </TableCell>
                      </TableRow>
                   ) : (
                      stats.outliers.map((o: any) => (
                        <TableRow key={o.response_id} className="group hover:bg-muted/5 border-b last:border-0">
                           <TableCell className="py-2">
                              <div className="flex flex-col">
                                 <span className="text-xs font-semibold">{o.student_name}</span>
                                 <div className="flex items-center gap-2">
                                    <span className={cn(
                                       "text-[10px] font-mono",
                                       o.risk_score > 70 ? "text-red-600 font-bold" : "text-muted-foreground"
                                    )}>Risk: {o.risk_score}%</span>
                                 </div>
                              </div>
                           </TableCell>
                           <TableCell className="py-2">
                              <div className="flex flex-col items-end">
                                 <div className="flex items-center gap-1.5">
                                    <span className="text-xs font-bold">{o.score}</span>
                                    <ArrowRightLeft className="size-2.5 text-muted-foreground" />
                                    <span className="text-xs text-muted-foreground">{o.ai_suggested_score}</span>
                                 </div>
                                 <span className={cn(
                                    "text-[9px] font-bold uppercase",
                                    Math.abs(o.deviation) > 2 ? "text-amber-600" : "text-muted-foreground/60"
                                 )}>Delta: {o.deviation > 0 ? '+' : ''}{o.deviation}</span>
                              </div>
                           </TableCell>
                           <TableCell className="py-2 text-right">
                              <Dialog>
                                 <DialogTrigger asChild>
                                    <Button 
                                      variant="ghost" 
                                      size="sm" 
                                      className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100"
                                      onClick={() => {
                                        setSelectedResponse(o);
                                        setNewScore(o.score.toString());
                                      }}
                                    >
                                       <ChevronRight className="size-4" />
                                    </Button>
                                 </DialogTrigger>
                                 <DialogContent className="sm:max-w-md">
                                    <DialogHeader>
                                       <DialogTitle className="text-lg">Moderate Grade</DialogTitle>
                                       <DialogDescription className="text-xs">
                                          Performing an immutable supersede review for {o.student_name}. 
                                          This will create a new grade record and notify the student.
                                       </DialogDescription>
                                    </DialogHeader>
                                    
                                    <div className="space-y-4 py-4">
                                       <div className="grid grid-cols-2 gap-4 bg-muted/30 p-3 rounded border">
                                          <div className="flex flex-col gap-0.5">
                                             <span className="text-[10px] font-bold uppercase text-muted-foreground">Original Score</span>
                                             <span className="text-sm font-mono font-bold">{o.score} / {o.max_score ?? 10}</span>
                                          </div>
                                          <div className="flex flex-col gap-0.5">
                                             <span className="text-[10px] font-bold uppercase text-muted-foreground">AI Suggestion</span>
                                             <span className="text-sm font-mono">{o.ai_suggested_score ?? 'N/A'}</span>
                                          </div>
                                       </div>

                                       <div className="space-y-2">
                                          <Label className="text-xs font-semibold">Revised Score (Max: {o.max_score ?? 10} pts)</Label>
                                          <div className="relative">
                                             <Input 
                                               type="number" 
                                               min={0}
                                               max={Number(selectedResponse?.max_score ?? o.max_score ?? 10)}
                                               step="any"
                                               className="font-bold text-lg h-10 w-24 pr-8"
                                               value={newScore}
                                               onChange={(e) => setNewScore(e.target.value)}
                                               onBlur={(e) => {
                                                 const val = parseFloat(e.target.value);
                                                 const maxMarks = Number(selectedResponse?.max_score ?? o.max_score ?? 10);
                                                 if (!isNaN(val)) {
                                                   if (val < 0) setNewScore("0");
                                                   else if (val > maxMarks) setNewScore(String(maxMarks));
                                                 }
                                               }}
                                             />
                                             <span className="absolute left-16 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground">PTS</span>
                                          </div>
                                       </div>

                                       <div className="space-y-2">
                                          <Label className="text-xs font-semibold">Mandatory Revision Reason</Label>
                                          <Textarea 
                                            placeholder="Explain the academic justification for this adjustment (audit requirement)..." 
                                            className="text-xs min-h-[100px] leading-relaxed"
                                            value={reason}
                                            onChange={(e) => setReason(e.target.value)}
                                          />
                                       </div>

                                       <div className="bg-amber-50 border border-amber-100 p-2 rounded flex items-start gap-2">
                                          <Info className="size-3.5 text-amber-600 mt-0.5" />
                                          <p className="text-[10px] text-amber-800 leading-tight">
                                             By clicking &quot;supersede&quot;, the current grade becomes obsolete. The institutional metadata will record this as a Moderator Revision.
                                          </p>
                                       </div>
                                    </div>

                                    <DialogFooter>
                                       <Button variant="outline" className="text-xs" onClick={() => setSelectedResponse(null)}>Cancel</Button>
                                       <Button 
                                         className="bg-red-600 hover:bg-red-700 text-xs font-bold uppercase"
                                         onClick={handleModerate}
                                         disabled={isSubmitting}
                                       >
                                          {isSubmitting ? "Processing..." : "Supersede & Finalize"}
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
