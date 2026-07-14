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
  Lock, 
  Unlock, 
  CheckCircle2, 
  AlertTriangle, 
  Send, 
  ChevronRight,
  ShieldAlert,
  Loader2,
  RefreshCcw
} from "lucide-react";
import { resultApi } from "@/lib/api/result";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

interface ResultReleasePanelProps {
  assessmentId: string;
}

export function ResultReleasePanel({ assessmentId }: ResultReleasePanelProps) {
  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState<any[]>([]);
  const [isReleasing, setIsReleasing] = useState(false);

  const fetchResults = useCallback(async () => {
    setLoading(true);
    try {
      const res = await resultApi.getAssessmentResults(assessmentId);
      setResults(res.items || []);
    } catch (err) {
      toast.error("Failed to load results");
    } finally {
      setLoading(false);
    }
  }, [assessmentId]);

  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  const handleReleaseAll = async () => {
    setIsReleasing(true);
    try {
      const res = await resultApi.releaseResults(assessmentId);
      toast.success(`${res.released_count} results released successfully`);
      if (res.held_count > 0) {
        toast.warning(`${res.held_count} results held due to integrity flags`);
      }
      fetchResults();
    } catch (err: any) {
      toast.error(err.message || "Failed to release results");
    } finally {
      setIsReleasing(false);
    }
  };

  const handleClearHold = async (resultId: string) => {
    const reason = prompt("Enter justification for clearing this integrity hold:");
    if (!reason) return;

    try {
      await resultApi.clearHold(resultId, reason);
      toast.success("Integrity hold cleared");
      fetchResults();
    } catch (err: any) {
      toast.error(err.message || "Failed to clear hold");
    }
  };

  if (loading) {
    return <Skeleton className="h-[400px] w-full rounded-xl" />;
  }

  const releasableCount = results.filter(r => !r.is_released && !r.integrity_hold).length;
  const heldCount = results.filter(r => r.integrity_hold).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h3 className="text-sm font-bold uppercase tracking-wider text-foreground/80">Result Release Management</h3>
          <p className="text-[10px] text-muted-foreground uppercase font-medium">
            {releasableCount} items ready for release • {heldCount} items under integrity hold
          </p>
        </div>
        <Button 
          disabled={releasableCount === 0 || isReleasing} 
          onClick={handleReleaseAll}
          className="h-8 text-[10px] font-bold uppercase tracking-widest gap-2 bg-emerald-600 hover:bg-emerald-700"
        >
          {isReleasing ? <Loader2 className="size-3 animate-spin" /> : <Send className="size-3" />}
          Release All Releasable ({releasableCount})
        </Button>
      </div>

      <div className="border rounded-lg bg-card overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/30">
            <TableRow>
              <TableHead className="text-[10px] font-bold uppercase h-8">Student</TableHead>
              <TableHead className="text-[10px] font-bold uppercase h-8">Score</TableHead>
              <TableHead className="text-[10px] font-bold uppercase h-8">Grade</TableHead>
              <TableHead className="text-[10px] font-bold uppercase h-8">State</TableHead>
              <TableHead className="text-[10px] font-bold uppercase h-8">Integrity</TableHead>
              <TableHead className="text-[10px] font-bold uppercase h-8 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {results.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10 text-muted-foreground text-xs italic">
                  No results calculated yet for this assessment.
                </TableCell>
              </TableRow>
            ) : (
              results.map((r) => (
                <TableRow key={r.id} className="h-10 hover:bg-muted/5 transition-colors border-b last:border-0">
                  <TableCell className="py-1 text-xs font-medium">
                    {r.student_name || "Student"}
                  </TableCell>
                  <TableCell className="py-1 text-xs font-mono font-bold">
                    {r.total_score} / {r.max_score} ({r.percentage}%)
                  </TableCell>
                  <TableCell className="py-1">
                    <Badge variant="outline" className="text-[10px] h-5 font-bold">{r.letter_grade}</Badge>
                  </TableCell>
                  <TableCell className="py-1">
                    {r.is_released ? (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 uppercase">
                        <CheckCircle2 className="size-3" /> Released
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600 uppercase">
                        <Lock className="size-3" /> Awaiting Release
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="py-1">
                    {r.integrity_hold ? (
                      <Badge variant="destructive" className="text-[8px] font-black h-4 uppercase bg-red-600">
                        <ShieldAlert className="size-2 mr-1" /> Integrity Hold
                      </Badge>
                    ) : (
                      <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-tight">Clear</span>
                    )}
                  </TableCell>
                  <TableCell className="py-1 text-right">
                    <div className="flex justify-end gap-1">
                      {r.integrity_hold && (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-6 px-2 text-[8px] font-bold uppercase text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => handleClearHold(r.id)}
                        >
                          Clear Hold
                        </Button>
                      )}
                      {!r.is_released && !r.integrity_hold && (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="h-6 px-2 text-[8px] font-bold uppercase border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                          onClick={() => resultApi.releaseResults(assessmentId, [r.attempt_id]).then(() => fetchResults())}
                        >
                          Release
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
