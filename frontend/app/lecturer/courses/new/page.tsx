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
  Info,
  CheckCircle2,
  BookOpen,
  FileUp,
  Clock,
  Package,
  Library,
} from "lucide-react";
import { lecturerApi } from "@/lib/api/lecturer";
import { academicApi, TeachingAssignment } from "@/lib/api/academic";
import { toast } from "sonner";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

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
        title: `${assignment.course_name} (${assignment.class_section_name || "GLOBAL"})`,
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
      <div className="max-w-5xl mx-auto space-y-6 p-6 animate-pulse">
        <div className="flex items-center gap-4">
          <Skeleton className="size-10 rounded-xl" />
          <Skeleton className="h-8 w-64 rounded-md" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-7 h-[400px] bg-muted/20 rounded-2xl border" />
          <div className="lg:col-span-5 h-[300px] bg-muted/20 rounded-2xl border" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 p-6">
      <div className="flex items-center justify-between border-b border-muted/20 pb-5">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            asChild
            className="h-9 w-9 rounded-lg border border-muted/30 hover:bg-muted/10 transition-colors"
          >
            <Link href="/lecturer/courses">
              <ChevronLeft className="size-4 text-muted-foreground" />
            </Link>
          </Button>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-primary flex items-center gap-2">
              <Layers className="size-5" /> Initialize Workspace
            </h1>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mt-0.5">
              Provision a pedagogical environment for your assigned class
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 space-y-6">
            <Card className="shadow-none border border-muted/20 rounded-2xl overflow-hidden bg-white">
              <CardHeader className="bg-muted/5 border-b py-4 px-6">
                <CardTitle className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Workspace Blueprint
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6 p-6">
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground ml-1">
                    Official Registry Assignment
                  </Label>
                  <Select onValueChange={handleAssignmentChange}>
                    <SelectTrigger className="h-10 rounded-xl border-muted/30 bg-muted/5 focus:ring-1 focus:ring-primary/40 font-medium">
                      <div className="flex items-center gap-2">
                        <BookOpen className="size-4 text-primary/60" />
                        <SelectValue placeholder="Search assigned module..." />
                      </div>
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border-muted/20 shadow-none">
                      {assignments.map((a) => (
                        <SelectItem
                          key={a.id}
                          value={a.id}
                          className="text-sm font-medium"
                        >
                          {a.course_code} • {a.course_name} (
                          {a.class_section_name || "GLOBAL"})
                        </SelectItem>
                      ))}
                      {assignments.length === 0 && (
                        <SelectItem value="none" disabled>
                          No active assignments found
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground ml-1">
                    Workspace Display Title
                  </Label>
                  <Input
                    placeholder="e.g. Data Structures & Algorithms - Section B"
                    required
                    className="h-10 rounded-xl border-muted/30 bg-muted/5 focus-visible:ring-1 focus-visible:ring-primary/40 font-semibold uppercase tracking-tight"
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

                <div className="space-y-1.5">
                  <Label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground ml-1">
                    Objectives & Description (Optional)
                  </Label>
                  <Textarea
                    placeholder="Briefly describe the operational goals for this specific class section..."
                    className="min-h-[120px] rounded-xl border-muted/30 bg-muted/5 p-4 text-sm font-medium resize-none focus-visible:ring-1 focus-visible:ring-primary/40"
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

                <div className="pt-6 border-t border-muted/10 space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground ml-1">
                      Initial Learning Materials
                    </Label>
                    <Badge
                      variant="outline"
                      className="h-5 rounded-full text-[9px] font-bold border-muted/30 text-muted-foreground uppercase"
                    >
                      Optional
                    </Badge>
                  </div>

                  <div className="flex items-center gap-4">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        document.getElementById("file-upload")?.click()
                      }
                      className="gap-2 rounded-lg h-9 px-4 font-semibold text-[10px] uppercase tracking-widest border-primary/20 hover:bg-primary/5 hover:text-primary transition-all shadow-none"
                      disabled={!selectedAssignment}
                    >
                      <Upload className="size-3.5" /> Select Assets
                    </Button>
                    <input
                      id="file-upload"
                      type="file"
                      multiple
                      className="hidden"
                      onChange={handleFileChange}
                    />
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-medium uppercase tracking-tight italic">
                      <Info className="size-3" />
                      Pedagogical blueprints (PDF, Docs)
                    </div>
                  </div>

                  {courseNotes.length > 0 && (
                    <div className="grid grid-cols-1 gap-2 mt-4">
                      {courseNotes.map((file, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between p-3 bg-primary/[0.02] rounded-xl border border-primary/10 text-sm"
                        >
                          <div className="flex items-center gap-3 truncate">
                            <div className="bg-white p-1.5 rounded-lg border border-primary/10 shadow-none">
                              <FileText className="size-3.5 text-primary" />
                            </div>
                            <span className="truncate font-semibold uppercase tracking-tight text-foreground/70 text-[10px]">
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

          <div className="lg:col-span-5 space-y-6">
            <Card className="shadow-none border border-muted/20 rounded-2xl overflow-hidden flex flex-col h-fit bg-white">
              <CardHeader className="bg-muted/5 border-b py-4 px-6">
                <CardTitle className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Registry Audit
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                {!selectedAssignment ? (
                  <div className="py-20 text-center space-y-4">
                    <div className="size-12 rounded-full bg-muted/30 flex items-center justify-center mx-auto text-muted-foreground/30 border border-muted/40">
                      <GraduationCap className="size-6" />
                    </div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest opacity-40">
                      Context Synchronization Required
                    </p>
                  </div>
                ) : (
                  <div className="space-y-5">
                    <div className="space-y-4 p-5 rounded-2xl border border-muted/10 bg-muted/5">
                      <div className="flex items-start gap-3">
                        <Building2 className="size-4 text-primary mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
                            Institution & Entity
                          </p>
                          <p className="text-[13px] font-semibold truncate text-foreground uppercase tracking-tight">
                            {selectedAssignment.institution_name}
                          </p>
                          {(selectedAssignment.campus_name || selectedAssignment.college_name) && (
                            <p className="text-[10px] text-muted-foreground font-medium mt-0.5 uppercase">
                                {selectedAssignment.campus_name || selectedAssignment.college_name}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-start gap-3 border-t border-muted/10 pt-4">
                        <Library className="size-4 text-primary mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
                            Academic Context
                          </p>
                          <p className="text-[13px] font-semibold truncate text-foreground uppercase tracking-tight">
                            {selectedAssignment.department_name}
                          </p>
                          {selectedAssignment.option_name && (
                            <p className="text-[10px] text-muted-foreground font-medium mt-0.5 uppercase leading-tight">
                                {selectedAssignment.option_name}
                            </p>
                          )}
                          {selectedAssignment.class_group_name && (
                            <p className="text-[10px] text-primary/60 font-bold mt-1 uppercase">
                                LEVEL: {selectedAssignment.class_group_level ? `YEAR ${selectedAssignment.class_group_level}` : selectedAssignment.class_group_name}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-start gap-3 border-t border-muted/10 pt-4">
                        <Calendar className="size-4 text-primary mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
                            Academic Cycle
                          </p>
                          <p className="text-[13px] font-semibold text-foreground uppercase tracking-tight">
                            {selectedAssignment.academic_year}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 space-y-3">
                      <div className="flex items-center justify-between px-2">
                        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                          Registry Code
                        </span>
                        <Badge
                          variant="outline"
                          className="rounded-full font-bold h-6 px-3 text-[10px] uppercase bg-primary/5 text-primary border-primary/20"
                        >
                          {selectedAssignment.course_code}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between px-2">
                        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                          Target Section
                        </span>
                        <Badge
                          variant="outline"
                          className="rounded-full font-bold h-6 px-3 text-[10px] uppercase border-muted/30 text-foreground/70"
                        >
                          {selectedAssignment.class_section_name ||
                            "GLOBAL"}
                        </Badge>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
              <div className="p-6 bg-muted/5 border-t border-muted/10 flex flex-col gap-3">
                <Button
                  type="submit"
                  disabled={loading || !selectedAssignment}
                  className="w-full h-10 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold uppercase text-[11px] tracking-widest shadow-none gap-2"
                >
                  {loading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="size-4" />
                  )}
                  {loading ? "Initializing..." : "Finalize Workspace"}
                </Button>
                <Button
                  variant="ghost"
                  type="button"
                  className="w-full h-9 rounded-lg font-semibold uppercase text-[10px] tracking-widest text-muted-foreground"
                  asChild
                >
                  <Link href="/lecturer/courses">Abort Provisioning</Link>
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </form>
    </div>
  );
}
