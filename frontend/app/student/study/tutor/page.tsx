"use client";

import React, { Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { AISupportChat } from "@/components/mindexa/student/ai-support-chat";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Sparkles } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import Link from "next/link";

function TutorContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const topic = searchParams.get("topic") || "";
  const tab = (searchParams.get("tab") as "support" | "revision") || undefined;

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col -m-4 md:-m-6 overflow-hidden">
      {/* Top Breadcrumb Bar */}
      <div className="h-11 px-4 border-b border-border/40 bg-background flex items-center justify-between shrink-0 z-20">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/student/study" className="flex items-center gap-1 text-xs">
                  Study Planner
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Sparkles className="size-3.5 text-primary" />
                <span>AI Study Tutor</span>
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>

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
