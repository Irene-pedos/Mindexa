// app/lecturer/grading/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import {
  Eye,
  ThumbsUp,
  Search,
  CheckCircle2,
  MoreHorizontal,
  Flag,
  BrainCircuit,
  MessageSquareWarning,
  Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

import { gradingApi } from "@/lib/api/grading";
import { Loader2 } from "lucide-react";

export default function LecturerGradingQueue() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<any | null>(null);
  const [overrideScore, setOverrideScore] = useState<string>("");

  useEffect(() => {
    fetchSubmissions();
  }, []);

  const fetchSubmissions = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await gradingApi.getGradingQueue();
      setData(response.items || []);
    } catch (error: any) {
      setLoadError(error.message || "Could not load grading queue");
      toast.error(error.message || "Could not load grading queue");
    } finally {
      setLoading(false);
    }
  };

  const handleFlagLowConfidence = async () => {
    toast.info("Flagging low confidence submissions...");
    // In a real app, this would iterate through 'data' and flag those with confidence < threshold
  };

  const handleApproveAll = async () => {
    try {
      toast.info("Bulk approval initiated...");
      // Logic for bulk approve if backend supports it
      fetchSubmissions();
    } catch (e: any) {
      toast.error(e.message || "Failed to approve all.");
    }
  };

  const handleApproveSingle = async (responseId: string, score: number) => {
    try {
      await gradingApi.saveGrade(responseId, {
        accept_ai_suggestion: true,
        score: score,
      });
      toast.success("AI score approved");
      fetchSubmissions();
    } catch (e: any) {
      toast.error(e.message || "Failed to approve score.");
    }
  };

  const handleOverrideScore = async () => {
    if (!selectedStudent || !overrideScore) return;
    const scoreNum = parseFloat(overrideScore);
    try {
      await gradingApi.saveGrade(selectedStudent.response_id, {
        accept_ai_suggestion: false,
        override_score: scoreNum,
      });
      toast.success(`Score manually updated to ${scoreNum}`);
      setSelectedStudent(null);
      setOverrideScore("");
      fetchSubmissions();
    } catch (e: any) {
      toast.error(e.message || "Failed to update score.");
    }
  };

  return (
    <div className="space-y-8 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Grading & Review Queue
          </h1>
          <p className="text-muted-foreground mt-1">
            Analyze AI-graded submissions, review open questions, and finalize
            academic results
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={handleFlagLowConfidence}>
            <Flag className="mr-2 size-4" /> Flag Low Confidence
          </Button>
          <Button
            onClick={handleApproveAll}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <CheckCircle2 className="mr-2 size-4" /> Approve All AI Scores
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-emerald-50/50 border-emerald-100">
          <CardHeader className="pb-2">
            <CardDescription className="text-emerald-700 font-medium">
              Auto-Graded
            </CardDescription>
            <CardTitle className="text-3xl">18</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-emerald-600">
              Closed questions finalized
            </p>
          </CardContent>
        </Card>
        <Card className="bg-amber-50/50 border-amber-100">
          <CardHeader className="pb-2">
            <CardDescription className="text-amber-700 font-medium">
              Pending Review
            </CardDescription>
            <CardTitle className="text-3xl">
              {data.filter((d) => d.status !== "COMPLETED").length}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-amber-600">
              Submissions requiring manual oversight
            </p>
          </CardContent>
        </Card>
        <Card className="bg-blue-50/50 border-blue-100">
          <CardHeader className="pb-2">
            <CardDescription className="text-blue-700 font-medium">
              Appeals
            </CardDescription>
            <CardTitle className="text-3xl">2</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-blue-600">Student review requests</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Submission Overview</CardTitle>
              <CardDescription>
                Database Systems CAT – Mid-Semester 2026
              </CardDescription>
            </div>
            <div className="relative w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input placeholder="Search student or ID..." className="pl-10" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loadError ? (
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {loadError}
            </div>
          ) : null}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">Reg Number</TableHead>
                <TableHead>Student Name</TableHead>
                <TableHead>Final Score</TableHead>
                <TableHead>AI Proposed</TableHead>
                <TableHead>AI Confidence</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="size-6 animate-spin text-muted-foreground" />
                      <span>Loading submissions...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : data.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center py-8 text-muted-foreground"
                  >
                    No pending submissions in queue.
                  </TableCell>
                </TableRow>
              ) : (
                data.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium text-xs">
                      {item.id.substring(0, 8)}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">
                        {item.student_name || "Unknown Student"}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {item.assessment_title}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground">Pending</span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className="bg-primary/10 text-primary font-mono"
                      >
                        {item.ai_pre_graded
                          ? "AI Evaluated"
                          : "Manual Required"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className={cn("h-full rounded-full bg-amber-500")}
                            style={{ width: `70%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground">
                          ---
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className="text-amber-600 border-amber-200 bg-amber-50"
                      >
                        {item.status.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Review Submission"
                          onClick={async () => {
                            // Fetch full detail when selected
                            try {
                              const detail = await gradingApi.getGradeDetail(
                                item.response_id,
                              );
                              setSelectedStudent({
                                ...item,
                                ...detail,
                              });
                              setOverrideScore(
                                detail.ai_suggested_score?.toString() || "",
                              );
                            } catch (e) {
                              toast.error("Failed to load submission details");
                            }
                          }}
                        >
                          <Eye className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Detailed View Modal (Sheet) */}
      <Sheet
        open={!!selectedStudent}
        onOpenChange={(open) => !open && setSelectedStudent(null)}
      >
        <SheetContent className="sm:max-w-xl overflow-y-auto w-[90vw]">
          {selectedStudent && (
            <>
              <SheetHeader className="mb-6">
                <SheetTitle className="text-2xl">Submission Review</SheetTitle>
                <SheetDescription>
                  {selectedStudent.student_name} -{" "}
                  {selectedStudent.assessment_title}
                </SheetDescription>
              </SheetHeader>

              <div className="space-y-8">
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-primary/20 text-primary hover:bg-primary/30">
                      Question 1
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {selectedStudent.maxScore} Marks
                    </span>
                  </div>
                  <p className="font-medium text-lg leading-relaxed">
                    {selectedStudent.questionText}
                  </p>
                </div>

                <div className="space-y-3 bg-muted/30 p-4 rounded-xl border">
                  <Label className="text-xs uppercase text-muted-foreground font-bold tracking-wider">
                    Students Answer
                  </Label>
                  <p className="text-sm leading-relaxed">
                    {selectedStudent.openQuestionAnswer}
                  </p>
                </div>

                <div className="space-y-4 border rounded-xl p-5 bg-blue-50/50 border-blue-100">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-blue-700">
                      <BrainCircuit className="size-5" />
                      <h3 className="font-semibold">AI Grading Analysis</h3>
                    </div>
                    <Badge
                      variant="outline"
                      className="bg-white border-blue-200 text-blue-700"
                    >
                      Proposed: {selectedStudent.ai_suggested_score}% (
                      {selectedStudent.ai_confidence}% Conf.)
                    </Badge>
                  </div>
                  <p className="text-sm text-blue-900/80 leading-relaxed">
                    {selectedStudent.ai_rationale}
                  </p>
                  {selectedStudent.ai_confidence < 75 && (
                    <div className="flex items-center gap-2 text-amber-600 bg-amber-50 p-2 rounded-md text-xs font-medium">
                      <MessageSquareWarning className="size-4" />
                      Low confidence. Manual review highly recommended.
                    </div>
                  )}
                </div>

                <div className="space-y-4 pt-4 border-t">
                  <Label className="text-sm font-semibold">
                    Final Lecturer Score
                  </Label>
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      <Input
                        type="number"
                        value={overrideScore}
                        onChange={(e) => setOverrideScore(e.target.value)}
                        className="w-24 text-lg font-bold pl-3 pr-8 h-12"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                        %
                      </span>
                    </div>
                    <Button
                      onClick={handleOverrideScore}
                      size="lg"
                      className="h-12"
                    >
                      Save & Confirm Score
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    By saving, you confirm this score. The AI grade is discarded
                    if overridden.
                  </p>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
