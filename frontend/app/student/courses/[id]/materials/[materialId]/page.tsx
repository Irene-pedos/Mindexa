// frontend/app/student/courses/[id]/materials/[materialId]/page.tsx
"use client";

import React, { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { studentApi, StudentCourseDetail } from "@/lib/api/student";
import { LecturerMaterialResponse } from "@/lib/api/lecturer";
import { StudyReader } from "@/components/mindexa/study-reader/study-reader";
import { ReaderSource } from "@/components/mindexa/study-reader/types";
import { Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface PageProps {
  params: Promise<{
    id: string;
    materialId: string;
  }>;
}

export default function CourseMaterialReaderPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const workspaceId = resolvedParams.id;
  const materialId = resolvedParams.materialId;

  const router = useRouter();
  const [workspace, setWorkspace] = useState<StudentCourseDetail | null>(null);
  const [material, setMaterial] = useState<LecturerMaterialResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError(null);
        const [wsData, mats] = await Promise.all([
          studentApi.getWorkspaceDetail(workspaceId),
          studentApi.getWorkspaceMaterials(workspaceId),
        ]);

        setWorkspace(wsData);
        const found = mats.find((m) => m.id === materialId);
        if (!found) {
          setError("Material not found in this course.");
        } else {
          setMaterial(found);
        }
      } catch (err: any) {
        setError(err.message || "Failed to load material details.");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [workspaceId, materialId]);

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-center p-6 gap-3">
        <Loader2 className="size-8 animate-spin text-primary" />
        <p className="text-xs text-muted-foreground font-medium">Opening course material…</p>
      </div>
    );
  }

  if (error || !material || !workspace) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-center p-6 text-center">
        <AlertCircle className="size-10 text-destructive mb-3" />
        <h2 className="text-sm font-semibold text-foreground mb-1">Unable to Open Material</h2>
        <p className="text-xs text-muted-foreground mb-4 max-w-sm">
          {error || "The requested course material could not be found."}
        </p>
        <Button asChild variant="outline" size="sm">
          <Link href={`/student/courses/${workspaceId}`}>Return to Course</Link>
        </Button>
      </div>
    );
  }

  const source: ReaderSource = {
    kind: "lecturer_material",
    id: material.id,
    workspaceId: workspaceId,
    title: material.display_name || material.original_filename,
    mimeType: material.mime_type,
    extension: material.file_extension,
    academicResourceId: material.id,
    downloadFilename: material.display_name || material.original_filename,
    courseCode: workspace.code,
    courseTitle: workspace.title,
  };

  return (
    <StudyReader
      source={source}
      onBack={() => router.push(`/student/courses/${workspaceId}`)}
    />
  );
}
