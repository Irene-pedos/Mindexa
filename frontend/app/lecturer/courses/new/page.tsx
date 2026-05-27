// app/(lecturer)/courses/new/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronLeft,
  Loader2,
  Upload,
  X,
  FileText,
  Check,
  GraduationCap,
  Building2,
  Calendar,
  Layers,
} from "lucide-react";
import { lecturerApi } from "@/lib/api/lecturer";
import { academicApi, TeachingAssignment } from "@/lib/api/academic";
import { toast } from "sonner";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export default function NewWorkspacePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [fetchingAssignments, setFetchingAssignments] = useState(true);

  const [assignments, setAssignments] = useState<TeachingAssignment[]>([]);
  const [selectedAssignment, setSelectedAssignment] =
    useState<TeachingAssignment | null>(null);

  const [formData, setFormData] = useState({
    title: "",
    description: "",
  });

  const [courseNotes, setCourseNotes] = useState<File[]>([]);

  useEffect(() => {
    async function loadAssignments() {
      try {
        const data = await academicApi.getMyAssignments();
        setAssignments(data);
      } catch (err: any) {
        toast.error("Failed to load teaching assignments");
      } finally {
        setFetchingAssignments(false);
      }
    }
    loadAssignments();
  }, []);

  const handleAssignmentChange = (val: string) => {
    const assignment = assignments.find((a) => a.id === val) || null;
    setSelectedAssignment(assignment);
    if (assignment) {
      setFormData((prev) => ({
        ...prev,
        title: `${(assignment as any).course_name} (${(assignment as any).class_section_name})`,
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAssignment) {
      toast.error("Please select an official teaching assignment");
      return;
    }

    setLoading(true);
    try {
      const workspace = await lecturerApi.initializeWorkspace({
        teaching_assignment_id: selectedAssignment.id,
        title: formData.title,
        description: formData.description,
      });

      if (courseNotes.length > 0) {
        for (const file of courseNotes) {
          const uploadData = new FormData();
          uploadData.append("file", file);
          uploadData.append("teaching_workspace_id", workspace.id);
          uploadData.append("material_category", "LECTURE_NOTES");
          uploadData.append("is_student_visible", "true");
          await lecturerApi.uploadMaterial(uploadData);
        }
      }

      toast.success("Teaching workspace initialized successfully");
      router.push("/lecturer/courses");
    } catch (err: any) {
      toast.error(err.message || "Failed to initialize workspace");
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setCourseNotes((prev) => [...prev, ...newFiles]);
    }
  };

  const removeFile = (index: number) => {
    setCourseNotes((prev) => prev.filter((_, i) => i !== index));
  };

  if (fetchingAssignments) {
    return (
      <div className="max-w-5xl mx-auto space-y-6 p-6">
        <div className="flex items-center gap-4">
          <Skeleton className="size-10 rounded-xl" />
          <Skeleton className="h-8 w-64 rounded-md" />
        </div>
        <Skeleton className="h-[400px] w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 p-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          asChild
          className="h-10 w-10 rounded-xl border"
        >
          <Link href="/lecturer/courses">
            <ChevronLeft className="size-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground/90">
            Initialize Workspace
          </h1>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-tight opacity-70">
            Provision a pedagogical environment for your assigned class
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-7 space-y-5">
            <Card className="shadow-none border rounded-xl overflow-hidden hover:border-primary/20 transition-all">
              <CardHeader className="bg-muted/5 border-b py-4 px-5">
                <CardTitle className="text-xs font-semibold uppercase tracking-widest text-foreground/80">
                  Workspace Blueprint
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5 p-5">
                <div className="space-y-2">
                  <Label className="text-[11px] font-semibold text-muted-foreground ml-0.5">
                    Official Registry Assignment
                  </Label>
                  <Select onValueChange={handleAssignmentChange}>
                    <SelectTrigger className="h-10 rounded-lg text-sm bg-background border-muted-foreground/20">
                      <SelectValue placeholder="Select assigned course..." />
                    </SelectTrigger>
                    <SelectContent>
                      {assignments.map((a) => (
                        <SelectItem key={a.id} value={a.id} className="text-sm">
                          {(a as any).course_code} • {(a as any).course_name} (
                          {(a as any).class_section_name})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-[11px] font-semibold text-muted-foreground ml-0.5">
                    Workspace Display Title
                  </Label>
                  <Input
                    placeholder="e.g. Data Structures & Algorithms - Section B"
                    required
                    className="h-10 rounded-lg text-sm font-medium"
                    value={formData.title}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        title: e.target.value,
                      }))
                    }
                    disabled={!selectedAssignment}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-[11px] font-semibold text-muted-foreground ml-0.5">
                    Objectives & Description (Optional)
                  </Label>
                  <Textarea
                    placeholder="Briefly describe the operational goals for this specific class section..."
                    className="min-h-[100px] rounded-lg text-sm resize-none p-3 focus-visible:ring-1"
                    value={formData.description}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        description: e.target.value,
                      }))
                    }
                    disabled={!selectedAssignment}
                  />
                </div>

                <div className="pt-5 border-t space-y-4">
                  <Label className="text-[11px] font-semibold text-muted-foreground ml-0.5">
                    Initial Learning Materials
                  </Label>
                  <div className="flex items-center gap-4">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        document.getElementById("file-upload")?.click()
                      }
                      className="gap-2 rounded-lg h-9 px-4 font-semibold text-[10px] uppercase tracking-wider border-primary/20"
                      disabled={!selectedAssignment}
                    >
                      <Upload className="size-3.5" /> Select Materials
                    </Button>
                    <input
                      id="file-upload"
                      type="file"
                      multiple
                      className="hidden"
                      onChange={handleFileChange}
                    />
                    <p className="text-[11px] text-muted-foreground font-medium italic">
                      Upload syllabus or initial notes
                    </p>
                  </div>

                  {courseNotes.length > 0 && (
                    <div className="grid grid-cols-1 gap-2 mt-2">
                      {courseNotes.map((file, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between p-2.5 bg-muted/20 rounded-lg border border-muted/50 text-sm"
                        >
                          <div className="flex items-center gap-3 truncate">
                            <FileText className="size-4 text-primary shrink-0" />
                            <span className="truncate font-medium uppercase tracking-tight text-foreground/70 text-[11px]">
                              {file.name}
                            </span>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-7 rounded-md text-muted-foreground hover:text-destructive transition-colors"
                            onClick={() => removeFile(i)}
                          >
                            <X className="size-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-5 space-y-5">
            <Card className="shadow-none border rounded-xl overflow-hidden flex flex-col h-fit hover:border-primary/20 transition-all">
              <CardHeader className="bg-muted/5 border-b py-4 px-5">
                <CardTitle className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Registry Audit
                </CardTitle>
              </CardHeader>
              <CardContent className="p-5">
                {!selectedAssignment ? (
                  <div className="py-16 text-center space-y-3">
                    <div className="size-10 rounded-full bg-muted flex items-center justify-center mx-auto text-muted-foreground/30 border-2 border-dashed">
                      <GraduationCap className="size-5" />
                    </div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest opacity-50">
                      Pending Selection
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-3 p-4 rounded-xl border bg-muted/5">
                      <div className="flex items-start gap-3">
                        <Building2 className="size-3.5 text-primary/60 mt-0.5" />
                        <div className="min-w-0">
                          <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
                            Institution
                          </p>
                          <p className="text-xs font-medium truncate text-foreground/80">
                            {(selectedAssignment as any).institution_name}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <Layers className="size-3.5 text-primary/60 mt-0.5" />
                        <div className="min-w-0">
                          <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
                            Department
                          </p>
                          <p className="text-xs font-medium truncate text-foreground/80">
                            {(selectedAssignment as any).department_name}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <Calendar className="size-3.5 text-primary/60 mt-0.5" />
                        <div className="min-w-0">
                          <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
                            Academic Cycle
                          </p>
                          <p className="text-xs font-medium text-foreground/80">
                            {(selectedAssignment as any).academic_year}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 flex flex-col gap-2">
                      <div className="flex items-center justify-between px-1">
                        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                          Registry Code
                        </span>
                        <Badge
                          variant="secondary"
                          className="rounded-full font-semibold h-5 px-2.5 text-[9px] uppercase bg-primary/5 text-primary border-primary/10"
                        >
                          {(selectedAssignment as any).course_code}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between px-1">
                        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                          Target Section
                        </span>
                        <Badge
                          variant="outline"
                          className="rounded-full font-medium h-5 px-2.5 text-[9px] uppercase border-muted-foreground/20 text-muted-foreground"
                        >
                          {(selectedAssignment as any).class_section_name}
                        </Badge>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
              <CardFooter className="flex justify-between border-t p-5 bg-muted/5 gap-3">
                <Button
                  variant="ghost"
                  type="button"
                  className="rounded-lg h-9 px-5 font-semibold uppercase text-[11px]"
                  asChild
                >
                  <Link href="/lecturer/courses">Cancel</Link>
                </Button>
                <Button
                  type="submit"
                  disabled={loading || !selectedAssignment}
                  className="rounded-lg h-9 px-6 font-semibold uppercase text-[11px] shadow-none gap-2"
                >
                  {loading ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Check className="size-3.5" />
                  )}
                  {loading ? "Initializing..." : "Finalize Workspace"}
                </Button>
              </CardFooter>
            </Card>
          </div>
        </div>
      </form>
    </div>
  );
}
