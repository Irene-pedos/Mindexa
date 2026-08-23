// frontend/app/student/resources/[id]/read/page.tsx
"use client";

import React, { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { studentApi, StudentResourceResponse } from "@/lib/api/student";
import { StudyReader } from "@/components/mindexa/study-reader/study-reader";
import { ReaderSource } from "@/components/mindexa/study-reader/types";
import { Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

export default function PersonalResourceReaderPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const resourceId = resolvedParams.id;

  const router = useRouter();
  const [resource, setResource] = useState<StudentResourceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError(null);
        const resources = await studentApi.getPersonalResources();
        const found = resources.find((r) => r.id === resourceId);
        if (!found) {
          setError("Study resource not found.");
        } else {
          setResource(found);
        }
      } catch (err: any) {
        setError(err.message || "Failed to load study resource.");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [resourceId]);

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-center p-6 gap-3">
        <Loader2 className="size-8 animate-spin text-primary" />
        <p className="text-xs text-muted-foreground font-medium">Opening study resource…</p>
      </div>
    );
  }

  if (error || !resource) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-center p-6 text-center">
        <AlertCircle className="size-10 text-destructive mb-3" />
        <h2 className="text-sm font-semibold text-foreground mb-1">Unable to Open Resource</h2>
        <p className="text-xs text-muted-foreground mb-4 max-w-sm">
          {error || "The requested personal resource could not be found."}
        </p>
        <Button asChild variant="outline" size="sm">
          <Link href="/student/resources">Return to Resources</Link>
        </Button>
      </div>
    );
  }

  const source: ReaderSource = {
    kind: "student_resource",
    id: resource.id,
    title: resource.display_name || resource.original_filename,
    mimeType: resource.mime_type,
    extension: resource.file_extension,
    downloadFilename: resource.original_filename,
  };

  return (
    <StudyReader
      source={source}
      onBack={() => router.push("/student/resources")}
    />
  );
}
