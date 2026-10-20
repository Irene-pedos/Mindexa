// app/student/resources/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Upload, FileText, Download, Trash2, Eye, Bookmark } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { toast } from "sonner";
import { studentApi, StudentResourceResponse } from "@/lib/api/student";
import { Skeleton } from "@/components/ui/skeleton";
import { getStoredProgress } from "@/components/mindexa/study-reader/hooks/use-reader-progress";

interface UploadingFile {
  id: number;
  name: string;
  progress: number;
  size: string;
}

export default function StudentResourcesPage() {
  const router = useRouter();
  const [resources, setResources] = useState<StudentResourceResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [readingProgressMap, setReadingProgressMap] = useState<Record<string, number>>({});

  useEffect(() => {
    loadResources();
  }, []);

  // Auto-poll every 4 seconds while any resource is still processing
  useEffect(() => {
    const hasPending = resources.some(
      (r) => r.processing_status === "PENDING" || r.processing_status === "PROCESSING"
    );
    if (!hasPending) return;
    const timer = setTimeout(() => loadResources(), 4000);
    return () => clearTimeout(timer);
  }, [resources]);

  const loadResources = async () => {
    try {
      const data = await studentApi.getPersonalResources();
      setResources(data);

      // Check stored progress for personal resources
      const progressMap: Record<string, number> = {};
      for (const r of data) {
        const prog = getStoredProgress("student_resource", r.id);
        if (prog && prog.page > 0) {
          progressMap[r.id] = prog.page;
        }
      }
      setReadingProgressMap(progressMap);
    } catch {
      toast.error("Failed to load resources");
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (const file of Array.from(files)) {
      const uploadId = Date.now();
      const newUpload = {
        id: uploadId,
        name: file.name,
        progress: 10,
        size: (file.size / (1024 * 1024)).toFixed(1) + " MB",
      };

      setUploadingFiles((prev) => [...prev, newUpload]);

      // Incremental upload progress simulation
      const progressInterval = setInterval(() => {
        setUploadingFiles((prev) =>
          prev.map((item) =>
            item.id === uploadId && item.progress < 70
              ? { ...item, progress: Math.min(item.progress + 12, 70) }
              : item
          )
        );
      }, 400);

      try {
        const formData = new FormData();
        formData.append("file", file);

        await studentApi.uploadPersonalResource(formData);
        setUploadingFiles((prev) =>
          prev.map((item) => (item.id === uploadId ? { ...item, progress: 100 } : item))
        );
        toast.success(`${file.name} uploaded successfully`);
        loadResources();
      } catch {
        toast.error(`Failed to upload ${file.name}`);
      } finally {
        clearInterval(progressInterval);
        setTimeout(() => {
          setUploadingFiles((prev) => prev.filter((item) => item.id !== uploadId));
        }, 600);
      }
    }

    // Reset input
    e.target.value = "";
  };

  const deleteResource = async (id: string) => {
    try {
      await studentApi.deletePersonalResource(id);
      setResources(resources.filter((r) => r.id !== id));
      toast.info("Resource removed");
    } catch {
      toast.error("Failed to delete resource");
    }
  };

  const handleDownload = async (resource: StudentResourceResponse) => {
    try {
      await studentApi.downloadPersonalResource(resource.id, resource.original_filename);
    } catch {
      toast.error("Failed to download resource");
    }
  };

  const handleOpenReader = (resourceId: string) => {
    router.push(`/student/resources/${resourceId}/read`);
  };

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="flex justify-between items-center pb-3 border-b border-border/25">
          <div className="space-y-1">
            <Skeleton className="h-7 w-52 sm:w-64" />
            <Skeleton className="h-4 w-72 sm:w-96 opacity-60" />
          </div>
          <Skeleton className="h-8.5 w-28 rounded-lg" />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:gap-3.5">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 w-full mx-auto animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border/25">
        <div className="space-y-0.5">
          <h1 className="text-xl font-semibold tracking-tight text-foreground flex items-center gap-2">
            <FileText className="size-4.5 text-primary" /> My Study Resources
          </h1>
          <p className="text-xs text-muted-foreground font-medium">
            Personal uploaded materials for revision and study support
          </p>
        </div>

        <label className="cursor-pointer">
          <Button asChild size="sm" className="h-8.5 text-xs font-semibold px-4 rounded-lg shadow-xs">
            <span>
              <Upload className="mr-1.5 size-4" />
              Upload Files
            </span>
          </Button>
          <input
            type="file"
            multiple
            className="hidden"
            onChange={handleFileUpload}
          />
        </label>
      </div>

      {/* Uploading Files */}
      {uploadingFiles.length > 0 && (
        <Card className="border-primary/20 bg-primary/5 shadow-xs">
          <CardHeader className="p-3.5 sm:p-4 pb-2">
            <CardTitle className="text-sm flex items-center gap-2 font-medium">
              <div className="size-3.5 rounded-full bg-primary/20 animate-pulse" />
              Uploading ({uploadingFiles.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3.5 sm:p-4 pt-1 space-y-3">
            {uploadingFiles.map((file) => (
              <div key={file.id} className="space-y-1.5">
                <div className="flex justify-between text-xs font-medium">
                  <span className="truncate max-w-[80%]">{file.name}</span>
                  <span>{file.progress.toFixed(0)}%</span>
                </div>
                <Progress value={file.progress} className="h-1.5" />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Resources List / Grid Card */}
      <Card className="border border-border/70 shadow-xs">
        <CardHeader className="p-4 sm:p-5 sm:pb-3.5 border-b border-border/40">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <CardTitle className="text-base sm:text-lg font-semibold tracking-tight">
                All Resources ({resources.length})
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Private study materials only. These are never visible to lecturers.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-3.5 sm:p-5">
          <div className="grid grid-cols-1 gap-2.5 sm:gap-3">
            {resources.length === 0 ? (
              <div className="text-center py-12 sm:py-16 border-2 border-dashed rounded-xl bg-muted/10">
                <FileText className="size-10 sm:size-12 text-muted-foreground mx-auto mb-3 opacity-25" />
                <p className="text-sm text-muted-foreground font-medium">No resources uploaded yet.</p>
                <p className="text-xs text-muted-foreground/80 mt-1">
                  Upload study guides, PDF textbooks, or notes above to read and query with AI.
                </p>
              </div>
            ) : (
              resources.map((resource) => {
                const savedPage = readingProgressMap[resource.id];
                return (
                  <div
                    key={resource.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-border/70 bg-card p-3.5 sm:p-4 hover:border-primary/40 hover:bg-muted/40 group transition-all cursor-pointer shadow-2xs"
                    onClick={() => handleOpenReader(resource.id)}
                  >
                    <div className="flex items-center gap-3 sm:gap-3.5 min-w-0">
                      <div className="size-10 sm:size-11 rounded-lg bg-muted flex items-center justify-center shrink-0 border border-border/40">
                        <FileText className="size-5 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm text-foreground group-hover:text-primary transition-colors truncate">
                            {resource.display_name || resource.original_filename}
                          </span>
                          {savedPage && (
                            <Badge
                              variant="secondary"
                              className="text-[10px] h-4.5 px-1.5 font-normal bg-primary/10 text-primary border-primary/20 flex items-center gap-1"
                            >
                              <Bookmark className="size-2.5" />
                              <span>Continue: p. {savedPage}</span>
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2 sm:gap-2.5 mt-1 flex-wrap">
                          <Badge variant="outline" className="text-[10px] uppercase font-semibold px-1.5 h-4.5 border-border/70">
                            {resource.file_extension}
                          </Badge>
                          <span>{resource.subject_tag || "General"}</span>
                          <span className="text-muted-foreground/60">•</span>
                          <span>{(resource.file_size_bytes / (1024 * 1024)).toFixed(1)} MB</span>
                          <span className="text-muted-foreground/60">•</span>
                          <span>{format(new Date(resource.created_at), "MMM d, yyyy")}</span>
                        </div>
                        {/* Status Badge */}
                        {resource.processing_status !== "PROCESSED" && (
                          <div className="mt-1.5 flex items-center gap-2">
                            <Badge variant="secondary" className="text-[9px] h-4 font-medium">
                              {resource.processing_status === "PROCESSING" ||
                              resource.processing_status === "PENDING"
                                ? "INDEXING FOR AI..."
                                : resource.processing_status === "FAILED"
                                ? "INDEXING FAILED"
                                : resource.processing_status}
                            </Badge>
                          </div>
                        )}
                      </div>
                    </div>

                    <div
                      className="flex items-center justify-end gap-1 sm:gap-1.5 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/30 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-muted-foreground hover:text-foreground"
                        onClick={() => handleOpenReader(resource.id)}
                        title="Open in Study Reader"
                      >
                        <Eye className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-muted-foreground hover:text-foreground"
                        onClick={() => handleDownload(resource)}
                        title="Download file"
                      >
                        <Download className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => deleteResource(resource.id)}
                        title="Delete resource"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
