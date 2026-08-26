// components/mindexa/dashboard/quick-actions.tsx
"use client";

import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  FileText,
  Calendar,
  Sparkles,
  BookOpen,
} from "lucide-react";

export function QuickActions() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button asChild size="sm" className="h-8.5 text-xs font-semibold px-3.5 gap-2 rounded-xl shadow-xs">
        <Link href="/student/assessments">
          <FileText className="size-3.5" />
          Assessments
        </Link>
      </Button>

      <Button variant="outline" size="sm" className="h-8.5 text-xs font-medium px-3.5 gap-2 rounded-xl border-border/70 hover:bg-muted/50 hover:text-foreground" asChild>
        <Link href="/student/schedule">
          <Calendar className="size-3.5 text-muted-foreground" />
          Class Schedule
        </Link>
      </Button>

      <Button variant="outline" size="sm" className="h-8.5 text-xs font-medium px-3.5 gap-2 rounded-xl border-border/70 hover:bg-muted/50 hover:text-foreground" asChild>
        <Link href="/student/study">
          <Sparkles className="size-3.5 text-muted-foreground" />
          AI Study Tutor
        </Link>
      </Button>

      <Button variant="outline" size="sm" className="h-8.5 text-xs font-medium px-3.5 gap-2 rounded-xl border-border/70 hover:bg-muted/50 hover:text-foreground" asChild>
        <Link href="/student/courses">
          <BookOpen className="size-3.5 text-muted-foreground" />
          My Courses
        </Link>
      </Button>
    </div>
  );
}