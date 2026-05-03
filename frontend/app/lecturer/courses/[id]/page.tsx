// app/lecturer/courses/[id]/page.tsx
"use client";
import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Award,
  Plus,
  Loader2,
  Mail,
  Calendar,
  ExternalLink,
} from "lucide-react";
import {
  lecturerApi,
  LecturerCourseDetail as ICourseDetail,
  StudentCourseRecordResponse,
} from "@/lib/api/lecturer";
import { toast } from "sonner";
import { format } from "date-fns";

export default function LecturerCourseDetail() {
  const params = useParams();
  const id = params.id as string;

  const [course, setCourse] = useState<ICourseDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // Add Student State
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [studentEmail, setStudentEmail] = useState("");
  const [adding, setAdding] = useState(false);

  // View Record State
  const [recordDialogOpen, setRecordDialogOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [record, setRecord] = useState<StudentCourseRecordResponse | null>(
    null,
  );
  const [loadingRecord, setLoadingRecord] = useState(false);

  async function loadCourse() {
    try {
      setLoading(true);
      const data = await lecturerApi.getCourseDetail(id);
      setCourse(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load course details";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCourse();
  }, [id, loadCourse]);

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentEmail) return;

    setAdding(true);
    try {
      await lecturerApi.enrollStudent(id, studentEmail);
      toast.success("Student added successfully");
      setStudentEmail("");
      setAddDialogOpen(false);
      loadCourse(); // Refresh roster
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to add student";
      toast.error(msg);
    } finally {
      setAdding(false);
    }
  };

  const openRecord = async (studentId: string, name: string) => {
    setSelectedStudent({ id: studentId, name });
    setRecordDialogOpen(true);
    setLoadingRecord(true);
    setRecord(null);

    try {
      const data = await lecturerApi.getStudentRecord(id, studentId);
      setRecord(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load student record";
      toast.error(msg);
      setRecordDialogOpen(false);
    } finally {
      setLoadingRecord(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="size-10 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!course) {
    return (
      <div className="text-center py-20">
        <h2 className="text-xl font-medium">Course not found</h2>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            {course.title}
          </h1>
          <p className="text-muted-foreground">
            {course.code} • {course.student_count} students enrolled
          </p>
        </div>
        <Button onClick={() => setAddDialogOpen(true)}>
          <Plus className="mr-2 size-5" /> Add Student
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <Card className="lg:col-span-8">
          <CardHeader>
            <CardTitle>Student Roster</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Last Submission</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {course.roster.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-center py-10 text-muted-foreground"
                    >
                      No students enrolled in this course yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  course.roster.map((student) => (
                    <TableRow key={student.id}>
                      <TableCell className="font-mono">
                        {student.student_id}
                      </TableCell>
                      <TableCell className="font-medium">
                        {student.name}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {student.email}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-600 rounded-full"
                              style={{ width: `${student.progress}%` }}
                            />
                          </div>
                          <span className="text-xs font-medium">
                            {student.progress}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {student.last_submission || "Never"}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openRecord(student.id, student.name)}
                        >
                          View Record
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="lg:col-span-4 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Course Overview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Enrolled Students</span>
                <span className="font-semibold text-lg">
                  {course.student_count}
                </span>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-2 font-medium">
                  <span className="text-muted-foreground">
                    Overall Performance
                  </span>
                  <span>{course.performance_avg}%</span>
                </div>
                <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full"
                    style={{ width: `${course.performance_avg}%` }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quick Links</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button asChild className="w-full" size="lg">
                <a href="/lecturer/assessments">Create Assessment</a>
              </Button>
              <Button asChild variant="outline" className="w-full" size="lg">
                <a href="/lecturer/question-bank">Question Bank</a>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Add Student Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <form onSubmit={handleAddStudent}>
            <DialogHeader>
              <DialogTitle>Add Student to Course</DialogTitle>
              <DialogDescription>
                Enter the student's email address to enroll them in{" "}
                {course.title}.
              </DialogDescription>
            </DialogHeader>
            <div className="py-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Student Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="student@mindexa.dev"
                    className="pl-9"
                    value={studentEmail}
                    onChange={(e) => setStudentEmail(e.target.value)}
                    required
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                type="button"
                onClick={() => setAddDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={adding}>
                {adding ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" /> Adding...
                  </>
                ) : (
                  "Enroll Student"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Student Record Dialog */}
      <Dialog open={recordDialogOpen} onOpenChange={setRecordDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Academic Record</DialogTitle>
            <DialogDescription>
              Performance history for {selectedStudent?.name} in {course.title}
            </DialogDescription>
          </DialogHeader>

          {loadingRecord ? (
            <div className="py-20 flex justify-center">
              <Loader2 className="size-8 animate-spin text-primary" />
            </div>
          ) : record ? (
            <div className="space-y-8 pt-4">
              {/* Header Info */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                    Student ID
                  </p>
                  <p className="text-sm font-mono">{record.student_id}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                    Email
                  </p>
                  <p className="text-sm truncate">{record.email}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                    Enrolled
                  </p>
                  <p className="text-sm">
                    {format(new Date(record.enrolled_at), "MMM d, yyyy")}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                    Course Progress
                  </p>
                  <p className="text-sm font-semibold text-emerald-600">
                    {record.overall_progress}%
                  </p>
                </div>
              </div>

              {/* Attempts List */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Award className="size-4 text-primary" /> Assessment History
                </h3>
                <div className="rounded-md border divide-y">
                  {record.attempts.length === 0 ? (
                    <div className="p-8 text-center text-sm text-muted-foreground">
                      No assessment attempts recorded for this student.
                    </div>
                  ) : (
                    record.attempts.map((att) => (
                      <div
                        key={att.id}
                        className="p-4 flex items-center justify-between"
                      >
                        <div className="space-y-1">
                          <p className="text-sm font-medium">
                            {att.assessment_title}
                          </p>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Calendar className="size-3" />
                              {att.submitted_at
                                ? format(
                                    new Date(att.submitted_at),
                                    "MMM d, HH:mm",
                                  )
                                : "In Progress"}
                            </span>
                            <Badge
                              variant={
                                att.status === "SUBMITTED" ||
                                att.status === "GRADED"
                                  ? "secondary"
                                  : "outline"
                              }
                              className="text-[10px] py-0 h-4"
                            >
                              {att.status}
                            </Badge>
                          </div>
                        </div>
                        <div className="text-right">
                          {att.percentage !== null ? (
                            <div className="space-y-0.5">
                              <p className="text-sm font-bold">
                                {att.percentage}%
                              </p>
                              <p className="text-[10px] text-muted-foreground">
                                {att.score} / {att.max_score}
                              </p>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">
                              No result yet
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : null}

          <DialogFooter className="pt-4 border-t">
            <Button variant="outline" onClick={() => setRecordDialogOpen(false)}>
              Close
            </Button>
            <Button className="gap-2">
              <ExternalLink className="size-4" /> Full Report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
