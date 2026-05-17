// app/lecturer/courses/[id]/page.tsx
"use client";
import React, { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import {
  Award,
  Plus,
  Loader2,
  Calendar,
  ExternalLink,
  Upload,
  FileText,
  Trash2,
  Database,
  Users,
} from "lucide-react";
import {
  lecturerApi,
  LecturerCourseDetail as ICourseDetail,
  StudentCourseRecordResponse,
  LecturerMaterialResponse,
} from "@/lib/api/lecturer";
import { toast } from "sonner";
import { format } from "date-fns";
import { Progress } from "@/components/ui/progress";

export default function LecturerCourseDetail() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [course, setCourse] = useState<ICourseDetail | null>(null);
  const [materials, setMaterials] = useState<LecturerMaterialResponse[]>([]);
  const [loading, setLoading] = useState(true);

  // Material Upload State
  const [uploading, setUploading] = useState(false);

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

  // Delete Course State
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadCourse = useCallback(async () => {
    try {
      setLoading(true);
      const [courseData, materialsData] = await Promise.all([
        lecturerApi.getCourseDetail(id),
        lecturerApi.getCourseMaterials(id),
      ]);
      setCourse(courseData);
      setMaterials(materialsData);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load course details";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadCourse();
  }, [loadCourse]);

  const handleDeleteCourse = async () => {
    setDeleting(true);
    try {
      await lecturerApi.deleteCourse(id);
      toast.success("Course deleted successfully");
      router.push("/lecturer/courses");
    } catch (err: any) {
      toast.error(err.message || "Failed to delete course");
      setDeleteDialogOpen(false);
    } finally {
      setDeleting(false);
    }
  };

  const handleUploadMaterial = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    const file = e.target.files[0];

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("course_id", id);
      formData.append("material_category", "LECTURE_NOTES");
      formData.append("is_student_visible", "true");

      await lecturerApi.uploadMaterial(formData);
      toast.success("Material uploaded successfully");

      // Refresh materials
      const materialsData = await lecturerApi.getCourseMaterials(id);
      setMaterials(materialsData);
    } catch (err: any) {
      toast.error(err.message || "Failed to upload material");
    } finally {
      setUploading(false);
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
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Loader2 className="size-10 animate-spin text-primary" />
            <div>
              <div className="h-8 w-64 bg-muted animate-pulse rounded-md" />
              <div className="h-4 w-48 bg-muted animate-pulse rounded-md mt-2" />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-8 space-y-8">
            <div className="h-32 w-full bg-muted animate-pulse rounded-xl" />
            <div className="h-64 w-full bg-muted animate-pulse rounded-xl" />
          </div>
          <div className="lg:col-span-4 space-y-6">
            <div className="h-48 w-full bg-muted animate-pulse rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="text-center py-20">
        <h2 className="text-xl font-medium">Course not found</h2>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/lecturer/courses">Back to My Courses</Link>
        </Button>
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
          <p className="text-muted-foreground mt-1">
            {course.code} • {course.student_count} students enrolled
          </p>
          <div className="flex flex-wrap gap-2 mt-2">
            {course.department_name && (
              <Badge variant="outline" className="bg-primary/5">
                {course.department_name}
              </Badge>
            )}
            {course.option_name && (
              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                {course.option_name}
              </Badge>
            )}
            {course.sections?.map(section => (
              <Badge key={section} variant="secondary">
                {section}
              </Badge>
            ))}
          </div>
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => setDeleteDialogOpen(true)}
            className="text-destructive hover:bg-destructive/10 border-destructive/20"
          >
            <Trash2 className="mr-2 size-5" /> Delete Course
          </Button>
          <Button asChild>
             <Link href="/lecturer/assessments/new">
               <Plus className="mr-2 size-5" /> New Assessment
             </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Main Content Area */}
        <div className="lg:col-span-8 space-y-8">
          {/* Performance Overview */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Award className="size-5 text-amber-500" /> Average Performance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-2 flex justify-between text-sm">
                <span className="text-muted-foreground">Course Wide Average</span>
                <span className="font-semibold">{course.performance_avg.toFixed(1)}%</span>
              </div>
              <Progress value={course.performance_avg} className="h-3" />
            </CardContent>
          </Card>

          {/* Description */}
          {course.description && (
            <Card>
              <CardHeader>
                <CardTitle>Course Description</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground leading-relaxed">
                  {course.description}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Student Roster */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Student Roster</CardTitle>
                  <CardDescription>Performance tracking for enrolled students</CardDescription>
                </div>
                <Badge variant="outline" className="font-mono">{course.student_count} Enrolled</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Progress</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {course.roster.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="text-center py-10 text-muted-foreground"
                      >
                        No students enrolled in this course yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    course.roster.map((student) => (
                      <TableRow key={student.id}>
                        <TableCell className="font-mono text-sm">
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
                                className="h-full bg-primary rounded-full transition-all"
                                style={{ width: `${student.progress}%` }}
                              />
                            </div>
                            <span className="text-xs font-medium">
                              {student.progress}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
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
        </div>

        {/* Sidebar Info Area */}
        <div className="lg:col-span-4 space-y-6">
          {/* Quick Actions Card */}
          <Card>
            <CardHeader>
              <CardTitle>Lecturer Actions</CardTitle>
              <CardDescription>Administrative workflows for this course</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button asChild className="w-full justify-start" size="lg">
                <Link href="/lecturer/assessments/new">
                  <Plus className="mr-2 size-4" /> Create Assessment
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-start" size="lg">
                <Link href="/lecturer/question-bank">
                  <Database className="mr-2 size-4" /> Question Bank
                </Link>
              </Button>
            </CardContent>
          </Card>

          {/* Quick Info Card */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground flex items-center gap-2"><Users className="size-4" /> Enrolled Students</span>
                <span className="font-medium">{course.student_count}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground flex items-center gap-2"><Plus className="size-4" /> Course Sections</span>
                <span className="font-medium">{course.sections?.length || 0}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground flex items-center gap-2"><Calendar className="size-4" /> Course Code</span>
                <span className="font-medium">{course.code}</span>
              </div>
            </CardContent>
          </Card>

          {/* Learning Materials Card */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle>Course Materials</CardTitle>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                disabled={uploading}
                onClick={() => document.getElementById("material-upload")?.click()}
              >
                {uploading ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              </Button>
              <input
                id="material-upload"
                type="file"
                className="hidden"
                onChange={handleUploadMaterial}
              />
            </CardHeader>
            <CardContent>
              {materials.length === 0 ? (
                <div className="text-center py-6 border-2 border-dashed rounded-lg">
                  <FileText className="size-8 mx-auto text-muted-foreground/50 mb-2" />
                  <p className="text-sm text-muted-foreground">No materials uploaded yet.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {materials.map((m) => (
                    <div key={m.id} className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50 border transition-colors group">
                      <div className="flex items-center gap-3 truncate">
                        <div className="bg-primary/10 p-2 rounded text-primary">
                          <FileText className="size-4" />
                        </div>
                        <div className="truncate">
                          <p className="text-sm font-medium truncate">{m.display_name || m.original_filename}</p>
                          <p className="text-xs text-muted-foreground">
                            {(m.file_size_bytes / 1024).toFixed(0)} KB • {m.file_extension.toUpperCase()}
                          </p>
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" className="size-7 opacity-0 group-hover:opacity-100 transition-opacity">
                        <ExternalLink className="size-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

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
                  <p className="text-xs uppercase font-medium text-muted-foreground">
                    Student ID
                  </p>
                  <p className="text-sm font-mono">{record.student_id}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs uppercase font-medium text-muted-foreground">
                    Email
                  </p>
                  <p className="text-sm truncate">{record.email}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs uppercase font-medium text-muted-foreground">
                    Enrolled
                  </p>
                  <p className="text-sm">
                    {format(new Date(record.enrolled_at), "MMM d, yyyy")}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs uppercase font-medium text-muted-foreground">
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
                              <p className="text-xs text-muted-foreground">
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

      {/* Delete Course Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Course</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{course.title}</strong>? This action cannot be undone and will remove all student enrollments.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteCourse}
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" /> Deleting...
                </>
              ) : (
                "Yes, Delete Course"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
