"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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
  GraduationCap,
  Building2,
  Calendar,
  Layers,
  Info,
  CheckCircle2,
  BookOpen,
  Library,
  ImageIcon,
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
    banner_image_url: "",
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
        ...(formData.banner_image_url ? { banner_image_url: formData.banner_image_url } : {}),
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
      <div className="w-full space-y-3.5 p-1 md:p-2 animate-pulse">
        <div className="flex items-center gap-4 pb-2 border-b">
          <Skeleton className="size-8 rounded-lg" />
          <Skeleton className="h-6 w-48 rounded" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-7 h-[300px] bg-zinc-50 rounded-xl border border-zinc-150" />
          <div className="lg:col-span-5 h-[200px] bg-zinc-50 rounded-xl border border-zinc-150" />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-3.5 p-1 md:p-2 animate-in fade-in duration-200">
      {/* Header Container */}
      <div className="flex items-center justify-between border-b pb-2">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            asChild
            className="h-8 w-8 rounded-lg border-zinc-200 bg-white hover:bg-zinc-50"
          >
            <Link href="/lecturer/courses">
              <ChevronLeft className="size-4 text-zinc-600" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
              Initialize Course Workspace
            </h1>
            <p className="text-sm text-muted-foreground mt-1 font-medium">
              Create a virtual pedagogical workspace from your registry teaching assignments.
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Form Side */}
          <div className="lg:col-span-7 space-y-4">
            <Card className="shadow-none border border-zinc-150 rounded-xl bg-white overflow-hidden">
              <CardHeader className="py-3 px-5 border-b bg-zinc-50/50">
                <CardTitle className="text-xs font-bold text-zinc-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Layers className="size-3.5 text-zinc-400" /> Workspace Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="p-5 space-y-4">
                {/* Select Assignment */}
                <div className="space-y-1.5">
                  <Label htmlFor="assignment" className="text-xs font-bold text-zinc-700 flex items-center gap-1.5">
                    <BookOpen className="size-3.5 text-zinc-400" /> Official Registry Assignment
                  </Label>
                  <Select onValueChange={handleAssignmentChange}>
                    <SelectTrigger id="assignment" className="h-9 rounded-lg border-zinc-200 bg-white text-xs font-medium focus:ring-1 focus:ring-primary/20">
                      <SelectValue placeholder="Select one of your official assignments..." />
                    </SelectTrigger>
                    <SelectContent className="rounded-lg border-zinc-200 shadow-lg">
                      {assignments.map((a) => (
                        <SelectItem
                          key={a.id}
                          value={a.id}
                          className="text-xs font-medium"
                        >
                          {a.course_code} • {a.course_name} ({a.class_section_name || "GLOBAL"})
                        </SelectItem>
                      ))}
                      {assignments.length === 0 && (
                        <SelectItem value="none" disabled>
                          No teaching assignments found
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                {/* Title */}
                <div className="space-y-1.5">
                  <Label htmlFor="title" className="text-xs font-bold text-zinc-700 flex items-center gap-1.5">
                    <FileText className="size-3.5 text-zinc-400" /> Display Title
                  </Label>
                  <Input
                    id="title"
                    placeholder="e.g. Algorithms & Complexity - Year 2"
                    required
                    className="h-9 rounded-lg border-zinc-200 bg-white text-xs font-semibold"
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

                {/* Description */}
                <div className="space-y-1.5">
                  <Label htmlFor="desc" className="text-xs font-bold text-zinc-700 flex items-center gap-1.5">
                    <Info className="size-3.5 text-zinc-400" /> Description & Learning Goals
                  </Label>
                  <Textarea
                    id="desc"
                    placeholder="Provide a syllabus summary or description for students..."
                    className="min-h-[100px] rounded-lg border-zinc-200 bg-white p-3 text-xs font-medium resize-none"
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

                {/* Banner Image URL */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="banner" className="text-xs font-bold text-zinc-700 flex items-center gap-1.5">
                      <ImageIcon className="size-3.5 text-zinc-400" /> Course Banner Image URL
                    </Label>
                    <Badge variant="outline" className="text-[9px] font-bold text-zinc-400 bg-zinc-50 border-zinc-200">
                      Optional
                    </Badge>
                  </div>
                  <Input
                    id="banner"
                    type="url"
                    placeholder="https://example.com/course-banner.jpg"
                    className="h-9 rounded-lg border-zinc-200 bg-white text-xs font-medium"
                    value={formData.banner_image_url}
                    onChange={(e) => setFormData((prev) => ({ ...prev, banner_image_url: e.target.value }))}
                    disabled={!selectedAssignment}
                  />
                  {formData.banner_image_url && (
                    <div
                      className="h-24 rounded-lg bg-cover bg-center border border-zinc-200 overflow-hidden"
                      style={{ backgroundImage: `url(${formData.banner_image_url})` }}
                    />
                  )}
                  <p className="text-[10px] text-muted-foreground font-medium">
                    A banner image helps students quickly identify the course topic.
                  </p>
                </div>

                {/* Materials Uploader */}

                <div className="pt-4 border-t border-zinc-100 space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-bold text-zinc-700 flex items-center gap-1.5">
                      <Upload className="size-3.5 text-zinc-400" /> Course Handouts
                    </Label>
                    <Badge variant="outline" className="text-[9px] font-bold text-zinc-400 bg-zinc-50 border-zinc-200">
                      Optional
                    </Badge>
                  </div>

                  <div className="flex items-center gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        document.getElementById("file-upload")?.click()
                      }
                      className="gap-1.5 rounded-lg h-8 px-3 text-[10px] font-bold uppercase border-zinc-200 bg-white hover:bg-zinc-50"
                      disabled={!selectedAssignment}
                    >
                      <Upload className="size-3.5" /> Upload File
                    </Button>
                    <input
                      id="file-upload"
                      type="file"
                      multiple
                      className="hidden"
                      onChange={handleFileChange}
                    />
                    <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 font-medium">
                      <Info className="size-3 text-zinc-400" /> Upload Syllabus or PDFs (optional)
                    </div>
                  </div>

                  {courseNotes.length > 0 && (
                    <div className="grid grid-cols-1 gap-2 pt-2">
                      {courseNotes.map((file, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between p-2.5 bg-zinc-50/50 rounded-lg border border-zinc-200"
                        >
                          <div className="flex items-center gap-2 truncate">
                            <FileText className="size-3.5 text-primary shrink-0" />
                            <span className="truncate text-xs font-semibold text-zinc-700">
                              {file.name}
                            </span>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-6 text-zinc-400 hover:text-red-500 rounded-lg"
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

          {/* Audit Audit Side */}
          <div className="lg:col-span-5 space-y-4">
            <Card className="shadow-none border border-zinc-150 rounded-xl bg-white overflow-hidden">
              <CardHeader className="py-3 px-5 border-b bg-zinc-50/50">
                <CardTitle className="text-xs font-bold text-zinc-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Library className="size-3.5 text-zinc-400" /> Registry Verification
                </CardTitle>
              </CardHeader>
              <CardContent className="p-5">
                {!selectedAssignment ? (
                  <div className="py-12 text-center text-xs text-muted-foreground/60 font-medium space-y-2">
                    <GraduationCap className="size-8 mx-auto opacity-30 text-muted-foreground" />
                    <p>Select a teaching assignment to verify details</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-3 p-3.5 rounded-lg border border-zinc-150 bg-zinc-50/50 text-xs">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">Institution</span>
                        <span className="font-semibold text-zinc-700">{selectedAssignment.institution_name}</span>
                      </div>
                      <div className="border-t border-zinc-150 pt-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">Academic Department</span>
                        <span className="font-semibold text-zinc-700">{selectedAssignment.department_name}</span>
                      </div>
                      <div className="border-t border-zinc-150 pt-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">Academic Year</span>
                        <span className="font-semibold text-zinc-700">{selectedAssignment.academic_year}</span>
                      </div>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="flex items-center justify-between border-b pb-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Registry Code</span>
                        <Badge variant="secondary" className="font-bold text-[9px] h-5 bg-zinc-100 border text-zinc-700">
                          {selectedAssignment.course_code}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between border-b pb-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Section Target</span>
                        <Badge variant="secondary" className="font-bold text-[9px] h-5 bg-zinc-100 border text-zinc-700">
                          {selectedAssignment.class_section_name || "GLOBAL"}
                        </Badge>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>

              {/* Action triggers */}
              <div className="p-4 bg-zinc-50/50 border-t border-zinc-100 flex flex-col gap-2">
                <Button
                  type="submit"
                  disabled={loading || !selectedAssignment}
                  className="w-full h-9 rounded-lg bg-primary hover:bg-primary/95 text-white font-bold uppercase text-[10px] tracking-wider shadow-none gap-1.5"
                >
                  {loading ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="size-3.5" />
                  )}
                  {loading ? "Initializing..." : "Initialize Workspace"}
                </Button>
                <Button
                  variant="ghost"
                  type="button"
                  asChild
                  className="w-full h-8.5 rounded-lg text-zinc-500 font-bold uppercase text-[9px] tracking-wider"
                >
                  <Link href="/lecturer/courses">Cancel</Link>
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </form>
    </div>
  );
}
