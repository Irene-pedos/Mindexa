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
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-96 opacity-60" />
          </div>
          <Skeleton className="h-12 w-32 rounded-lg" />
        </div>
        <div className="grid grid-cols-1 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
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
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="py-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <div className="size-4 rounded-full bg-primary/20 animate-pulse" />
              Uploading ({uploadingFiles.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pb-6">
            {uploadingFiles.map((file) => (
              <div key={file.id} className="space-y-2">
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

      {/* Resources List */}
      <Card>
        <CardHeader>
          <CardTitle>All Resources ({resources.length})</CardTitle>
          <CardDescription>Private study materials only. These are never visible to lecturers.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {resources.length === 0 ? (
              <div className="text-center py-20 border-2 border-dashed rounded-xl">
                <FileText className="size-12 text-muted-foreground mx-auto mb-4 opacity-20" />
                <p className="text-muted-foreground">No resources uploaded yet.</p>
              </div>
            ) : (
              resources.map((resource) => {
                const savedPage = readingProgressMap[resource.id];
                return (
                  <div
                    key={resource.id}
                    className="flex items-center justify-between rounded-xl border p-5 hover:bg-muted/50 group transition-all cursor-pointer"
                    onClick={() => handleOpenReader(resource.id)}
                  >
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center shrink-0">
                        <FileText className="size-6 text-muted-foreground" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="font-medium text-foreground group-hover:text-primary transition-colors">
                            {resource.display_name || resource.original_filename}
                          </div>
                          {savedPage && (
                            <Badge
                              variant="secondary"
                              className="text-[10px] h-4 px-1.5 font-normal bg-primary/10 text-primary border-primary/20 flex items-center gap-1"
                            >
                              <Bookmark className="size-2.5" />
                              <span>Continue: p. {savedPage}</span>
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground flex items-center gap-3 mt-0.5">
                          <Badge variant="outline" className="text-[10px] uppercase font-bold px-1.5 h-5">
                            {resource.file_extension}
                          </Badge>
                          <span>{resource.subject_tag || "General"}</span> •{" "}
                          <span>{(resource.file_size_bytes / (1024 * 1024)).toFixed(1)} MB</span> •{" "}
                          <span>{format(new Date(resource.created_at), "MMM d, yyyy")}</span>
                        </div>
                        {/* Status Badge */}
                        {resource.processing_status !== "PROCESSED" && (
                          <div className="mt-1 flex items-center gap-2">
                            <Badge variant="secondary" className="text-[9px] h-4">
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
                      className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleOpenReader(resource.id)}
                        title="Open in Study Reader"
                      >
                        <Eye className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDownload(resource)}
                        title="Download file"
                      >
                        <Download className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:bg-destructive/10"
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
