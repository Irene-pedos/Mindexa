"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AISupportChat } from "@/components/mindexa/student/ai-support-chat";
import { Skeleton } from "@/components/ui/skeleton";

function TutorContent() {
  const searchParams = useSearchParams();
  const topic = searchParams.get("topic") || "";
  const tab = (searchParams.get("tab") as "support" | "revision") || undefined;

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col -m-4 md:-m-6 overflow-hidden">
      {/* Main Full-Page AI Study Tutor Container */}
      <div className="flex-1 overflow-hidden">
        <AISupportChat initialTopicContext={topic} initialTab={tab} isFullPage={true} />
      </div>
    </div>
  );
}

export default function StudentAITutorPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 space-y-4 max-w-4xl mx-auto">
          <Skeleton className="h-8 w-48 rounded-lg" />
          <Skeleton className="h-[600px] w-full rounded-2xl" />
        </div>
      }
    >
      <TutorContent />
    </Suspense>
  );
}
