// app/(lecturer)/courses/page.tsx
"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Users,
  Plus,
  BookOpen,
  GraduationCap,
  ArrowRight,
  FileText,
} from "lucide-react";
import Link from "next/link";
import { lecturerApi, WorkspaceListItem } from "@/lib/api/lecturer";
import { Skeleton } from "@/components/ui/interfaces-skeleton";
import { cn } from "@/lib/utils";

export default function LecturerWorkspacesPage() {
  const [workspaces, setWorkspaces] = useState<WorkspaceListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadWorkspaces = useCallback(async () => {
    setLoading(true);
    try {
      const data = await lecturerApi.getWorkspaces();
      setWorkspaces(data);
    } catch (err) {
      console.error("Failed to load workspaces", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWorkspaces();
  }, [loadWorkspaces]);

  return (
    <div className="max-w-7xl mx-auto space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground/90">
            My Teaching Workspaces
          </h1>
          <p className="text-muted-foreground text-[11px] font-semibold uppercase tracking-widest">
            Manage active classes, students, and operational content
          </p>
        </div>
        <Button
          size="sm"
          asChild
          className="h-10 px-5 font-semibold text-sm rounded-lg shadow-none"
        >
          <Link href="/lecturer/courses/new">
            <Plus className="mr-1.5 size-4" /> Initialize Workspace
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          [1, 2, 3].map((i) => (
            <Skeleton
              key={i}
              variant="media"
              className="h-64 w-full rounded-xl"
            />
          ))
        ) : workspaces.length === 0 ? (
          <Card className="col-span-full border-dashed bg-muted/5 rounded-xl border-muted/20 shadow-none">
            <CardContent className="py-24 text-center">
              <div className="size-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-4 text-muted-foreground/30">
                <BookOpen className="size-6" />
              </div>
              <p className="text-sm font-semibold text-muted-foreground uppercase tracking-widest opacity-60">
                No workspaces found.
              </p>
              <p className="text-xs text-muted-foreground/60 mt-1.5 mb-8">
                Initialize a workspace from your official teaching assignments
                to get started.
              </p>
              <Button
                asChild
                variant="outline"
                className="h-10 px-8 rounded-lg font-semibold uppercase text-xs"
              >
                <Link href="/lecturer/courses/new">Open Registry</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          workspaces.map((ws) => (
            <Card
              key={ws.id}
              className="hover:border-primary/20 transition-all group overflow-hidden shadow-none border rounded-xl flex flex-col bg-background"
            >
              <CardHeader className="pb-3 px-5 pt-4">
                <div className="flex justify-between items-start gap-3">
                  <div className="min-w-0">
                    <CardTitle className="text-[14px] font-semibold truncate leading-tight text-foreground/90 group-hover:text-primary transition-colors">
                      {ws.title}
                    </CardTitle>
                    <CardDescription className="font-mono text-[11px] uppercase font-medium text-primary/60 mt-0.5">
                      {ws.code} • {ws.academic_year}
                    </CardDescription>
                  </div>
                  <Badge
                    variant="secondary"
                    className="rounded-full h-5 px-2.5 text-[9px] font-semibold uppercase bg-muted/50 border-none shrink-0"
                  >
                    {ws.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-5 pt-0 flex-1 flex flex-col space-y-5">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="space-y-0.5">
                    <span className="text-muted-foreground font-semibold uppercase text-[10px] tracking-tight flex items-center gap-1.5">
                      <Users className="size-3.5" /> Students
                    </span>
                    <span className="font-semibold tabular-nums text-sm">
                      {ws.student_count}
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-muted-foreground font-semibold uppercase text-[10px] tracking-tight flex items-center gap-1.5">
                      <GraduationCap className="size-3.5" /> Class
                    </span>
                    <span className="font-semibold truncate block text-sm">
                      {ws.class_name}
                    </span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between text-[10px] font-semibold uppercase tracking-tight">
                    <span className="text-muted-foreground/80">
                      Class Average
                    </span>
                    <span
                      className={cn(
                        "font-semibold",
                        ws.performance_avg >= 50
                          ? "text-emerald-600"
                          : "text-amber-600",
                      )}
                    >
                      {ws.performance_avg}%
                    </span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full transition-all",
                        ws.performance_avg >= 50
                          ? "bg-emerald-500"
                          : "bg-amber-500",
                      )}
                      style={{ width: `${ws.performance_avg}%` }}
                    />
                  </div>
                </div>

                <div className="flex flex-col pt-4 border-t border-muted/10 gap-2 mt-auto">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40 mb-0.5">
                    {ws.institution_name}
                  </p>
                  <Button
                    asChild
                    size="sm"
                    className="w-full h-9 text-[11px] font-semibold rounded-lg shadow-none justify-between px-4"
                  >
                    <Link href={`/lecturer/courses/${ws.id}`}>
                      <div className="flex items-center gap-2">
                        <BookOpen className="size-4" />
                        Manage Workspace
                      </div>
                      <ArrowRight className="size-4 opacity-40" />
                    </Link>
                  </Button>
                  <Button
                    variant="outline"
                    asChild
                    size="sm"
                    className="w-full h-9 text-[11px] font-semibold rounded-lg hover:bg-muted/50 justify-start px-4"
                  >
                    <Link
                      href={`/lecturer/assessments`}
                      className="flex items-center gap-2"
                    >
                      <FileText className="size-4 text-muted-foreground" />
                      Assessments
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
