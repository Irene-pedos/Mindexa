"use client";

import React, { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { 
  AlertTriangle, 
  CheckCircle2, 
  Loader2, 
  Scale, 
  Unlock, 
  Users, 
  ChevronRight, 
  ChevronLeft,
  FileText, 
  FolderOpen, 
  ShieldAlert, 
  Calendar,
  Send
} from "lucide-react";
import { assessmentApi } from "@/lib/api/assessment";
import { gradingApi } from "@/lib/api/grading";
import { resultApi } from "@/lib/api/result";
import { toast } from "sonner";
import { AssessmentSummary } from "../types";

interface ClassStatRecord {
  class_id: string;
  class_name: string;
  total_students: number;
  submitted_count: number;
  pending_review_count: number;
  reviewed_count: number;
  released_count: number;
}

interface StudentResultSummary {
  id: string;
  attempt_id: string;
  student_id: string;
  student_name: string;
  total_score: number;
  max_score: number;
  percentage: number;
  letter_grade: string | null;
  is_passing: boolean;
  is_released: boolean;
  integrity_hold: boolean;
}

function ResultReleaseContent() {
  const searchParams = useSearchParams();
  const initialAsmtId = searchParams.get("assessmentId") || "all";
  const initialClassId = searchParams.get("classId");

  const [assessments, setAssessments] = useState<AssessmentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string>(initialAsmtId);
  const [classStats, setClassStats] = useState<ClassStatRecord[]>([]);
  const [classStatsLoading, setClassStatsLoading] = useState(false);
  
  const [selectedClass, setSelectedClass] = useState<ClassStatRecord | null>(null);
  const [studentResults, setStudentResults] = useState<StudentResultSummary[]>([]);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [selectedResultIds, setSelectedResultIds] = useState<string[]>([]);
  
  const [isReleasing, setIsReleasing] = useState(false);

  // Load all published assessments
  useEffect(() => {
    async function loadAssessments() {
      try {
        const res = await assessmentApi.getAssessments({ status: "PUBLISHED" });
        const items = res.items || [];
        setAssessments(items);
        if (initialAsmtId !== "all" && !items.some((a: AssessmentSummary) => a.id === initialAsmtId)) {
          // If query param assessment is loaded, keep it
          setSelectedAssessmentId(initialAsmtId);
        }
      } catch (err: any) {
        toast.error("Failed to load assessments");
      } finally {
        setLoading(false);
      }
    }
    loadAssessments();
  }, [initialAsmtId]);

  // Fetch Class stats when selected assessment changes
  useEffect(() => {
    async function fetchClasses() {
      if (selectedAssessmentId === "all") {
        setClassStats([]);
        setSelectedClass(null);
        setStudentResults([]);
        return;
      }
      setClassStatsLoading(true);
      setSelectedClass(null);
      setStudentResults([]);
      try {
        const res = await gradingApi.getAssessmentClassStats(selectedAssessmentId);
        const classes = res.classes || [];
        setClassStats(classes);
        if (initialClassId) {
          const match = classes.find((c: ClassStatRecord) => c.class_id === initialClassId);
          if (match) {
            setSelectedClass(match);
          }
        }
      } catch (err: any) {
        toast.error("Failed to fetch class sections stats");
      } finally {
        setClassStatsLoading(false);
      }
    }
    fetchClasses();
  }, [selectedAssessmentId, initialClassId]);

  // Load student results when class selection changes
  useEffect(() => {
    async function fetchResults() {
      if (!selectedClass || selectedAssessmentId === "all") {
        setStudentResults([]);
        setSelectedResultIds([]);
        return;
      }
      setResultsLoading(true);
      setSelectedResultIds([]);
      try {
        const res = await resultApi.getReleaseQueue(selectedAssessmentId, selectedClass.class_id);
        setStudentResults(res.items || []);
      } catch (err: any) {
        toast.error("Failed to load student results");
      } finally {
        setResultsLoading(false);
      }
    }
    fetchResults();
  }, [selectedClass, selectedAssessmentId]);

  // Toggle selection for student-by-student release
  const handleSelectResult = (attemptId: string) => {
    setSelectedResultIds(prev => 
      prev.includes(attemptId) 
        ? prev.filter(id => id !== attemptId)
        : [...prev, attemptId]
    );
  };

  const handleSelectAllResults = (checked: boolean) => {
    if (checked) {
      // Only select unreleased, non-hold graded students
      const eligible = studentResults
        .filter(r => !r.is_released && !r.integrity_hold && r.attempt_id)
        .map(r => r.attempt_id as string);
      setSelectedResultIds(eligible);
    } else {
      setSelectedResultIds([]);
    }
  };

  // Confirmation Dialog state
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    type: "class" | "selected";
    classId?: string;
    className?: string;
    count?: number;
  } | null>(null);

  const requestReleaseClass = (classId: string, className: string) => {
    setConfirmAction({
      type: "class",
      classId,
      className,
    });
    setConfirmDialogOpen(true);
  };

  const requestReleaseSelected = () => {
    setConfirmAction({
      type: "selected",
      count: selectedResultIds.filter(Boolean).length,
    });
    setConfirmDialogOpen(true);
  };

  // Perform class-level release (releases all graded submissions in class)
  const executeReleaseClass = async (classId: string, className: string) => {
    if (selectedAssessmentId === "all") return;
    setIsReleasing(true);
    try {
      await resultApi.releaseResults(selectedAssessmentId, undefined, classId);
      toast.success(`Results for ${className} released successfully.`);
      // Refresh class stats
      const res = await gradingApi.getAssessmentClassStats(selectedAssessmentId);
      setClassStats(res.classes || []);
      // Reset selected class
      setSelectedClass(null);
    } catch {
      toast.error("Failed to release class results.");
    } finally {
      setIsReleasing(false);
      setConfirmDialogOpen(false);
      setConfirmAction(null);
    }
  };

  // Release selected student results
  const executeReleaseSelected = async () => {
    if (selectedAssessmentId === "all" || selectedResultIds.length === 0) return;
    setIsReleasing(true);
    
    // Filter out null/undefined values just in case
    const selectedAttempts = selectedResultIds.filter(Boolean);

    try {
      await resultApi.releaseResults(selectedAssessmentId, selectedAttempts);
      toast.success(`Released results for ${selectedAttempts.length} students.`);
      
      // Refresh results
      if (selectedClass) {
        const res = await resultApi.getReleaseQueue(selectedAssessmentId, selectedClass.class_id);
        setStudentResults(res.items || []);
        
        // Also refresh class stats
        const classRes = await gradingApi.getAssessmentClassStats(selectedAssessmentId);
        setClassStats(classRes.classes || []);
      }
      setSelectedResultIds([]);
    } catch {
      toast.error("Failed to release selected results.");
    } finally {
      setIsReleasing(false);
      setConfirmDialogOpen(false);
      setConfirmAction(null);
    }
  };

  const selectedAssessment = assessments.find(a => a.id === selectedAssessmentId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href="/lecturer/grading"
              className="text-xs font-semibold text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors"
            >
              <ChevronLeft className="size-3.5" /> Back to Grading
            </Link>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Result Review & Release Queue</h1>
          <p className="text-xs text-muted-foreground">
            Audit grading completion by class section, run release validations, and publish results to students.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center space-y-3">
          <Loader2 className="size-8 text-primary animate-spin mx-auto" />
          <p className="text-xs text-muted-foreground font-medium">Loading assessments...</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* STEP 1: SELECT ASSESSMENT */}
          <Card className="shadow-none border border-border/50 bg-card/30 backdrop-blur-sm rounded-xl">
            <CardHeader className="p-4 border-b border-border/30 bg-muted/10">
              <Label className="text-xs font-semibold text-muted-foreground/80 mb-1.5 block">
                Select Assessment
              </Label>
              <Select
                value={selectedAssessmentId}
                onValueChange={setSelectedAssessmentId}
              >
                <SelectTrigger className="h-9 text-xs rounded-lg border-border/60 bg-background/50 hover:bg-background/80 transition-colors">
                  <SelectValue placeholder="Choose assessment..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Choose an assessment...</SelectItem>
                  {assessments.map((a: AssessmentSummary) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardHeader>
          </Card>

          {selectedAssessmentId === "all" ? (
            <div className="py-24 text-center border border-dashed rounded-xl bg-muted/5 flex flex-col items-center justify-center gap-3">
              <FileText className="size-8 text-muted-foreground/35" />
              <p className="text-xs text-muted-foreground italic">Select an assessment context to audit and release results.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* STEP 2: CLASS SECTIONS LIST */}
              <div className="lg:col-span-1 space-y-6">
                <Card className="shadow-none border border-border/50 bg-card/30 backdrop-blur-sm rounded-xl overflow-hidden">
                  <CardHeader className="p-4 border-b bg-muted/10 border-border/30">
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                      <Users className="size-4 text-primary" /> Class Sections Queue
                    </CardTitle>
                    <CardDescription className="text-[10px]">
                      Select a class section to view and release student-by-student.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    {classStatsLoading ? (
                      <div className="py-12 text-center">
                        <Loader2 className="size-5 text-primary animate-spin mx-auto" />
                      </div>
                    ) : classStats.length === 0 ? (
                      <div className="p-8 text-center text-xs text-muted-foreground italic">
                        No class sections assigned to this assessment.
                      </div>
                    ) : (
                      <div className="divide-y divide-border/20">
                        {classStats.map((c) => {
                          const isFullyGraded = c.pending_review_count === 0 && c.reviewed_count > 0;
                          const isSelected = selectedClass?.class_id === c.class_id;
                          
                          return (
                            <div
                              key={c.class_id}
                              onClick={() => setSelectedClass(c)}
                              className={`p-4 flex flex-col gap-2.5 transition-colors cursor-pointer hover:bg-primary/[0.02] ${
                                isSelected ? "bg-primary/[0.04]" : ""
                              }`}
                            >
                              <div className="flex justify-between items-start">
                                <div className="space-y-0.5">
                                  <p className="text-xs font-bold text-foreground">{c.class_name}</p>
                                  <p className="text-[10px] text-muted-foreground">
                                    Submissions: {c.submitted_count} / {c.total_students}
                                  </p>
                                </div>
                                <Badge
                                  variant="outline"
                                  className={`text-[9px] font-bold ${
                                    isFullyGraded 
                                      ? "bg-emerald-500/5 text-emerald-600 border-emerald-500/20"
                                      : "bg-amber-500/5 text-amber-600 border-amber-500/20"
                                  }`}
                                >
                                  {isFullyGraded ? "Grading Completed" : "Grading In Progress"}
                                </Badge>
                              </div>

                              <div className="flex items-center justify-between gap-2 mt-1">
                                <div className="flex gap-3 text-[10px] font-mono text-muted-foreground">
                                  <span>Pending: <strong className="text-rose-500">{c.pending_review_count}</strong></span>
                                  <span>Released: <strong className="text-indigo-500">{c.released_count}</strong></span>
                                </div>

                                <Button
                                  size="xs"
                                  variant="outline"
                                  disabled={!isFullyGraded || isReleasing}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    requestReleaseClass(c.class_id, c.class_name);
                                  }}
                                  className="h-7 text-[10px] font-bold rounded-lg border-indigo-500/20 text-indigo-600 hover:bg-indigo-500/5"
                                >
                                  Release Class
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* STEP 3: STUDENTS RESULT VIEW */}
              <div className="lg:col-span-2 space-y-6">
                {!selectedClass ? (
                  <div className="py-24 text-center border border-dashed rounded-xl bg-muted/5 flex flex-col items-center justify-center gap-3 h-full">
                    <Users className="size-8 text-muted-foreground/35" />
                    <p className="text-xs text-muted-foreground italic">Select a class section to view grading details and release results student-by-student.</p>
                  </div>
                ) : (
                  <Card className="shadow-none border border-border/50 bg-card/30 backdrop-blur-sm rounded-xl overflow-hidden">
                    <CardHeader className="p-4 border-b bg-muted/10 border-border/30 flex flex-row items-center justify-between">
                      <div className="space-y-1">
                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                          <CheckCircle2 className="size-4 text-primary" /> Students List: {selectedClass.class_name}
                        </CardTitle>
                        <CardDescription className="text-[10px]">
                          Select individual students to release results or release the entire class list.
                        </CardDescription>
                      </div>
                      
                      {selectedClass.pending_review_count > 0 && (
                        <Badge variant="outline" className="bg-amber-500/5 text-amber-600 border-amber-500/20 text-[9px] font-bold py-1 flex items-center gap-1.5">
                          <AlertTriangle className="size-3" /> Grading In Progress
                        </Badge>
                      )}
                    </CardHeader>
                    <CardContent className="p-0">
                      {/* Live Class Dashboard Performance Card */}
                      {selectedClass && studentResults.length > 0 && (() => {
                        const submitted = selectedClass.submitted_count || studentResults.length;
                        const pending = selectedClass.pending_review_count;
                        const graded = selectedClass.reviewed_count;
                        const flagged = studentResults.filter((r) => r.integrity_hold).length;
                        const scored = studentResults.filter(
                          (r) => r.total_score !== null && r.total_score !== undefined,
                        );
                        const avgPct =
                          scored.length > 0
                            ? Math.round(
                                scored.reduce((acc, curr) => acc + (curr.percentage || 0), 0) /
                                  scored.length,
                              )
                            : null;
                        const completionPct =
                          submitted > 0 ? Math.round((graded / submitted) * 100) : 0;

                        return (
                          <div className="p-4 bg-muted/5 border-b border-border/30 space-y-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-xs font-semibold text-muted-foreground">
                                <strong className="text-foreground">
                                  {graded}/{submitted} graded
                                </strong>
                                {" · "}
                                <strong
                                  className={
                                    pending > 0
                                      ? "text-amber-600 dark:text-amber-400"
                                      : "text-muted-foreground"
                                  }
                                >
                                  {pending} pending
                                </strong>
                                {" · "}
                                <strong
                                  className={
                                    flagged > 0
                                      ? "text-rose-600 dark:text-rose-400"
                                      : "text-muted-foreground"
                                  }
                                >
                                  {flagged} flagged / hold
                                </strong>
                                {avgPct !== null && (
                                  <>
                                    {" · "}
                                    <strong className="text-primary">avg {avgPct}%</strong>
                                  </>
                                )}
                              </p>
                              <span className="text-[10px] font-mono text-muted-foreground font-semibold">
                                {completionPct}% class completion
                              </span>
                            </div>
                            <div className="w-full h-1.5 bg-muted/60 rounded-full overflow-hidden flex">
                              <div
                                className="h-full bg-emerald-500 transition-all duration-300"
                                style={{ width: `${completionPct}%` }}
                              />
                              <div
                                className="h-full bg-amber-500 transition-all duration-300"
                                style={{
                                  width: `${submitted > 0 ? (pending / submitted) * 100 : 0}%`,
                                }}
                              />
                            </div>
                          </div>
                        );
                      })()}

                      {resultsLoading ? (
                        <div className="py-24 text-center">
                          <Loader2 className="size-7 text-primary animate-spin mx-auto" />
                          <p className="text-xs text-muted-foreground mt-2">Loading results...</p>
                        </div>
                      ) : studentResults.length === 0 ? (
                        <div className="py-20 text-center text-xs text-muted-foreground italic">
                          No student submissions found for this class section.
                        </div>
                      ) : (
                        <div>
                          {selectedClass.pending_review_count > 0 && (
                            <div className="p-3.5 bg-amber-50 border-b border-amber-100 flex items-start gap-2.5 text-amber-800">
                              <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                              <p className="text-[11px] leading-normal font-medium">
                                Results cannot be released because there are still <strong>{selectedClass.pending_review_count}</strong> unreviewed submissions. All student submissions must be reviewed and graded before result release is allowed.
                              </p>
                            </div>
                          )}

                          <Table>
                            <TableHeader className="bg-muted/5 border-b border-border/30">
                              <TableRow className="hover:bg-transparent">
                                <TableHead className="w-12 text-center px-4">
                                  <Checkbox
                                    checked={
                                      selectedResultIds.length > 0 && 
                                      selectedResultIds.length === studentResults.filter(r => !r.is_released && !r.integrity_hold && r.attempt_id).length
                                    }
                                    onCheckedChange={handleSelectAllResults}
                                    disabled={selectedClass.pending_review_count > 0 || isReleasing}
                                  />
                                </TableHead>
                                <TableHead className="text-xs font-semibold text-muted-foreground">Student Name</TableHead>
                                <TableHead className="text-xs font-semibold text-muted-foreground text-center">Score</TableHead>
                                <TableHead className="text-xs font-semibold text-muted-foreground text-center">Percentage</TableHead>
                                <TableHead className="text-xs font-semibold text-muted-foreground text-center">Integrity Hold</TableHead>
                                <TableHead className="text-xs font-semibold text-muted-foreground text-right pr-6">Status</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {studentResults.map((r) => {
                                const isEligible = !r.is_released && !r.integrity_hold && selectedClass.pending_review_count === 0 && r.attempt_id;
                                const isSelected = r.attempt_id ? selectedResultIds.includes(r.attempt_id) : false;

                                return (
                                  <TableRow key={r.student_id} className="h-12 border-border/10">
                                    <TableCell className="text-center px-4">
                                      <Checkbox
                                        checked={isSelected}
                                        onCheckedChange={() => r.attempt_id && handleSelectResult(r.attempt_id)}
                                        disabled={!isEligible || isReleasing}
                                      />
                                    </TableCell>
                                    <TableCell className="text-xs font-bold text-foreground">
                                      {r.student_name}
                                    </TableCell>
                                    <TableCell className="text-xs font-mono font-bold text-foreground/80 text-center">
                                      {r.total_score !== null && r.total_score !== undefined ? `${r.total_score} / ${r.max_score || 0} pts` : "N/A"}
                                    </TableCell>
                                    <TableCell className="text-xs font-mono font-bold text-foreground/70 text-center">
                                      {r.percentage !== null && r.percentage !== undefined ? `${r.percentage}%` : "N/A"} {r.letter_grade && `(${r.letter_grade})`}
                                    </TableCell>
                                    <TableCell className="text-center">
                                      {r.integrity_hold ? (
                                        <Badge className="bg-rose-500/10 text-rose-600 border border-rose-500/20 text-[9px] font-bold font-mono">
                                          <ShieldAlert className="size-3 mr-1" /> HOLD
                                        </Badge>
                                      ) : (
                                        <span className="text-[10px] text-muted-foreground/45 font-medium">None</span>
                                      )}
                                    </TableCell>
                                    <TableCell className="text-right pr-6">
                                      <Badge
                                        variant="outline"
                                        className={`text-[9px] font-bold uppercase tracking-wider font-mono ${
                                          r.is_released
                                            ? "bg-indigo-500/5 text-indigo-600 border-indigo-500/25"
                                            : "bg-muted/10 text-muted-foreground border-border/50"
                                        }`}
                                      >
                                        {r.is_released ? "Released" : "Unreleased"}
                                      </Badge>
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </CardContent>
                    
                    {selectedClass.pending_review_count === 0 && studentResults.length > 0 && (
                      <CardFooter className="p-4 border-t border-border/30 bg-muted/10 flex justify-between gap-3">
                        <span className="text-[10px] text-muted-foreground font-semibold font-mono">
                          Selected: {selectedResultIds.length} / {studentResults.filter(r => !r.is_released && !r.integrity_hold && r.attempt_id).length} Eligible
                        </span>

                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={selectedResultIds.length === 0 || isReleasing}
                            onClick={requestReleaseSelected}
                            className="h-8 text-xs font-bold rounded-lg"
                          >
                            <Send className="size-3.5 mr-1.5" /> Release Selected
                          </Button>
                          <Button
                            size="sm"
                            disabled={studentResults.every(r => r.is_released) || isReleasing}
                            onClick={() => requestReleaseClass(selectedClass.class_id, selectedClass.class_name)}
                            className="h-8 text-xs font-bold rounded-lg"
                          >
                            <Unlock className="size-3.5 mr-1.5" /> Release All Graded
                          </Button>
                        </div>
                      </CardFooter>
                    )}
                  </Card>
                )}
              </div>

            </div>
          )}
        </div>
      )}

      {/* Confirmation Dialog before Marks Release */}
      <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <Unlock className="size-5 text-emerald-600" />
              Confirm Official Marks Release
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground pt-1.5 leading-relaxed">
              {confirmAction?.type === "class" ? (
                <>
                  You are about to release official assessment results for all fully graded students in{" "}
                  <strong className="text-foreground">{confirmAction.className || "this class section"}</strong>.
                  Released grades and diagnostic feedback will immediately become visible to students on their portal.
                </>
              ) : (
                <>
                  You are about to release official assessment results for{" "}
                  <strong className="text-foreground">{confirmAction?.count || selectedResultIds.length} selected student(s)</strong>.
                  Released grades and feedback will immediately become visible to these students.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-xl border border-amber-500/20 bg-amber-50/50 dark:bg-amber-950/20 p-3 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
            <AlertTriangle className="size-4 shrink-0 text-amber-600 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold">Institutional Assessment Guard</p>
              <p className="text-[11px] leading-normal text-muted-foreground">
                Submissions with active integrity holds will remain safeguarded and unreleased. Incomplete submissions will be safely skipped.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              disabled={isReleasing}
              onClick={() => {
                setConfirmDialogOpen(false);
                setConfirmAction(null);
              }}
              className="rounded-xl"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={isReleasing}
              onClick={() => {
                if (confirmAction?.type === "class" && confirmAction.classId) {
                  executeReleaseClass(confirmAction.classId, confirmAction.className || "Class");
                } else {
                  executeReleaseSelected();
                }
              }}
              className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-1.5"
            >
              {isReleasing ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="size-3.5" />
              )}
              Confirm & Release Marks
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function ResultReleasePage() {
  return (
    <Suspense
      fallback={
        <div className="py-24 text-center space-y-3">
          <Loader2 className="size-8 text-primary animate-spin mx-auto" />
          <p className="text-xs text-muted-foreground font-medium">Loading release queue...</p>
        </div>
      }
    >
      <ResultReleaseContent />
    </Suspense>
  );
}
