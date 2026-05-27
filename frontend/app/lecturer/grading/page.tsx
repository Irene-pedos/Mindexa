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
  Users,
  User as UserIcon,
  RefreshCcw,
  Save,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { gradingApi } from "@/lib/api/grading";
import { groupWorkApi } from "@/lib/api/group-work";
import { apiClient } from "@/lib/api/client";
import { Loader2 } from "lucide-react";
import { GroupSubmissionList } from "@/components/mindexa/grading/group-submission-list";
import { GroupSubmissionReview } from "@/components/mindexa/grading/group-submission-review";
import { GroupAppealReview } from "@/components/mindexa/grading/group-appeal-review";
import { Skeleton } from "@/components/ui/skeleton";

export default function LecturerGradingQueue() {
  const [data, setData] = useState<any[]>([]);
  const [groupSubmissions, setGroupSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<any | null>(null);
  const [selectedGroupSubmission, setSelectedGroupSubmission] = useState<
    any | null
  >(null);
  const [activeTab, setActiveTab] = useState("individuals");
  const [overrideScore, setOverrideScore] = useState<string>("");

  useEffect(() => {
    if (activeTab === "individuals") {
      fetchSubmissions();
    } else {
      fetchGroupSubmissions();
    }
  }, [activeTab]);

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

  const fetchGroupSubmissions = async () => {
    setGroupsLoading(true);
    try {
      // Assuming a dedicated grading/group-queue endpoint
      const response = await apiClient("/grading/group-queue");
      setGroupSubmissions(response.items || []);
    } catch (err) {
      console.error("Failed to load group submissions", err);
    } finally {
      setGroupsLoading(false);
    }
  };

  const handleReviewGroup = async (summary: any) => {
    try {
      // Fetch full workspace/submission data for grading
      const detail = await groupWorkApi.getWorkspace(summary.assessment_id);
      setSelectedGroupSubmission({
        ...summary,
        ...detail,
      });
    } catch (err) {
      toast.error("Failed to load group details");
    }
  };

  const handleGradeGroup = async (score: number, feedback?: string) => {
    if (!selectedGroupSubmission) return;
    try {
      await groupWorkApi.gradeSubmission(
        selectedGroupSubmission.assessment_id,
        selectedGroupSubmission.id,
        {
          total_score: score,
          max_score: selectedGroupSubmission.assessment.total_marks,
          feedback,
        },
      );
      toast.success("Group mark assigned successfully");
      fetchGroupSubmissions();
      setSelectedGroupSubmission((prev: any) => ({
        ...prev,
        status: "GRADED",
        score,
      }));
    } catch (err: any) {
      toast.error(err.message || "Failed to grade group");
    }
  };

  const handleReleaseGroup = async () => {
    if (!selectedGroupSubmission) return;
    try {
      await groupWorkApi.releaseResult(
        selectedGroupSubmission.assessment_id,
        selectedGroupSubmission.id,
      );
      toast.success("Results released to all group members");
      setSelectedGroupSubmission(null);
      fetchGroupSubmissions();
    } catch (err: any) {
      toast.error(err.message || "Failed to release results");
    }
  };

  const handleAssignReassessment = async () => {
    if (!selectedGroupSubmission) return;
    try {
      await groupWorkApi.assignReassessment(
        selectedGroupSubmission.assessment_id,
        selectedGroupSubmission.id,
      );
      toast.success("Group-level reassessment assigned");
      setSelectedGroupSubmission(null);
      fetchGroupSubmissions();
    } catch (err: any) {
      toast.error(err.message || "Failed to assign reassessment");
    }
  };

  const handleFlagLowConfidence = async () => {
    toast.info(
      "Prioritize open-ended and integrity-sensitive submissions for lecturer review.",
    );
  };

  const handleApproveAll = async () => {
    try {
      toast.info("Refreshing the grading queue...");
      fetchSubmissions();
    } catch (e: any) {
      toast.error(e.message || "Failed to refresh queue.");
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

  if (selectedGroupSubmission) {
    return (
      <div className="fixed inset-0 z-50 bg-background">
        <GroupSubmissionReview
          submission={selectedGroupSubmission}
          onGrade={handleGradeGroup}
          onRelease={handleReleaseGroup}
          onAssignReassessment={handleAssignReassessment}
          onClose={() => setSelectedGroupSubmission(null)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Grading & Moderation Queue
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Closed questions are finalized automatically. Open responses and
            group work remain under lecturer-controlled review before results
            are released.
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={handleFlagLowConfidence}>
            <Flag className="mr-2 size-4" /> Prioritize Review
          </Button>
          <Button
            onClick={handleApproveAll}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <RefreshCcw className="mr-2 size-4" /> Refresh Queue
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-emerald-50/50 border-emerald-100">
          <CardHeader>
            <CardDescription className=" font-medium">
              Auto-Graded Ready
            </CardDescription>
            <CardTitle className="text-2xl">
              {data.filter((d) => d.ai_pre_graded).length}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs ">
              Deterministic responses finalized by the system
            </p>
          </CardContent>
        </Card>
        <Card className="bg-amber-50/50 border-amber-100">
          <CardHeader>
            <CardDescription className=" font-medium">
              Lecturer Review
            </CardDescription>
            <CardTitle className="text-2xl">
              {
                data.filter(
                  (d) => d.status !== "COMPLETED" && d.status !== "APPEALED",
                ).length
              }
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs ">
              Open-ended submissions and moderated overrides
            </p>
          </CardContent>
        </Card>
        <Card className="bg-blue-50/50 border-blue-100">
          <CardHeader>
            <CardDescription className=" font-medium">
              Appeals & Claims
            </CardDescription>
            <CardTitle className="text-2xl">
              {data.filter((d) => d.status === "APPEALED").length}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs">Student review requests</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-muted/50 p-1 h-12 w-full max-w-md border">
          <TabsTrigger
            value="individuals"
            className="flex-1 rounded-lg text-xs font-bold uppercase tracking-widest gap-2"
          >
            <UserIcon className="size-3.5" /> Individual Submissions
          </TabsTrigger>
          <TabsTrigger
            value="groups"
            className="flex-1 rounded-lg text-xs font-bold uppercase tracking-widest gap-2"
          >
            <Users className="size-3.5" /> Group Work
          </TabsTrigger>
        </TabsList>

        <TabsContent value="individuals" className="mt-8">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Submission Overview</CardTitle>
                  <CardDescription>
                    Reviewing per-student attempts across automatic and
                    lecturer-controlled grading paths
                  </CardDescription>
                </div>
                <div className="relative w-72">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input
                    placeholder="Search student or ID..."
                    className="pl-10"
                  />
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
                    <TableHead>System Pipeline</TableHead>
                    <TableHead>Review Signal</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell colSpan={7} className="py-4">
                          <div className="flex items-center gap-3">
                            <Skeleton className="size-8 rounded-lg" />
                            <div className="space-y-1">
                              <Skeleton className="h-4 w-32" />
                              <Skeleton className="h-3 w-48 opacity-60" />
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
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
                              ? "Auto-Graded"
                              : "Lecturer Review"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className={cn(
                                  "h-full rounded-full bg-amber-500",
                                )}
                                style={{ width: `70%` }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {item.ai_pre_graded
                                ? "Deterministic"
                                : "Open Response"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn(
                              "border-amber-200 bg-amber-50",
                              item.status === "TERMINATED" ? "text-red-600 border-red-200 bg-red-50" : "text-amber-600"
                            )}
                          >
                            {item.status === "TERMINATED" ? "AUTO-SUBMITTED" : item.status.replace("_", " ")}
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
                                  const detail =
                                    await gradingApi.getGradeDetail(
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
                                  toast.error(
                                    "Failed to load submission details",
                                  );
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
        </TabsContent>

        <TabsContent value="groups" className="mt-8">
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">Group Grading Queue</h2>
                <p className="text-xs text-muted-foreground">
                  Evaluate collective work products and discussion participation
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchGroupSubmissions}
                  disabled={groupsLoading}
                  className="h-8 rounded-lg text-[10px] font-bold uppercase tracking-widest gap-2"
                >
                  {groupsLoading ? (
                    <div className="size-3 rounded-full bg-primary/20 animate-pulse" />
                  ) : (
                    <RefreshCcw className="size-3.5" />
                  )}
                  Refresh
                </Button>
              </div>
            </div>

            <GroupSubmissionList
              submissions={groupSubmissions}
              onReview={handleReviewGroup}
              loading={groupsLoading}
            />
          </div>
        </TabsContent>
      </Tabs>

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
                      <h3 className="font-semibold">Review Analysis</h3>
                    </div>
                    <Badge
                      variant="outline"
                      className="bg-white border-blue-200 text-blue-700"
                    >
                      Suggested: {selectedStudent.ai_suggested_score}% (
                      {selectedStudent.ai_confidence}% Signal)
                    </Badge>
                  </div>
                  <p className="text-sm text-blue-900/80 leading-relaxed">
                    {selectedStudent.ai_rationale ||
                      "Structured guidance for open-question review will appear here. In the future AI phase, rubric-aligned suggestions will be advisory only and never final."}
                  </p>
                  {selectedStudent.ai_confidence < 75 && (
                    <div className="flex items-center gap-2 text-amber-600 bg-amber-50 p-2 rounded-md text-xs font-medium">
                      <MessageSquareWarning className="size-4" />
                      Review signal is weak. Lecturer judgment should dominate
                      this decision.
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
                    By saving, you finalize the academic decision. Future
                    AI-assisted grading suggestions will remain advisory and can
                    always be overridden by the lecturer.
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
