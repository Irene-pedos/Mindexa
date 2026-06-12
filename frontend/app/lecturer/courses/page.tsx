// app/lecturer/courses/page.tsx
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
import { Progress } from "@/components/ui/progress";
import {
  Users,
  Plus,
  BookOpen,
  FileText,
  Layers
} from "lucide-react";
import Link from "next/link";
import { lecturerApi, WorkspaceListItem } from "@/lib/api/lecturer";
import { Skeleton } from "@/components/ui/skeleton";
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

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-96 opacity-60" />
          </div>
          <Skeleton className="h-10 w-32 rounded-lg" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-48 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Layers className="size-6 text-muted-foreground" /> Workspaces
          </h1>
          <p className="text-muted-foreground mt-1">Manage your active academic courses, students, and curriculum metrics</p>
        </div>
        <Button size="sm" asChild>
          <Link href="/lecturer/courses/new">
            <Plus className="mr-2 size-4" /> Initialize Workspace
          </Link>
        </Button>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {workspaces.length === 0 ? (
          <div className="col-span-full py-20 text-center border-2 border-dashed rounded-xl">
            <Layers className="size-12 text-muted-foreground mx-auto mb-4 opacity-20" />
            <p className="text-muted-foreground">No active workspaces found.</p>
          </div>
        ) : (
          workspaces.map((ws) => (
            <Card key={ws.id} className="hover:bg-muted/50 transition-colors flex flex-col">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start gap-3">
                  <div className="space-y-1 min-w-0">
                    <CardTitle className="text-base font-semibold truncate hover:text-primary transition-colors">
                      {ws.title}
                    </CardTitle>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-[10px] font-medium px-1.5 h-5">{ws.code}</Badge>
                      <span className="text-xs text-muted-foreground">{ws.academic_year}</span>
                    </div>
                  </div>
                  <Badge variant="secondary" className="px-2 py-0.5 text-[10px] text-emerald-700 bg-emerald-50 border-emerald-200">Active</Badge>
                </div>
              </CardHeader>

              <CardContent className="space-y-4 flex-1 flex flex-col justify-between">
                <div className="grid grid-cols-2 gap-4 pt-2 border-t text-xs">
                  <div>
                    <span className="text-muted-foreground block">Enrolled Students</span>
                    <span className="font-semibold text-foreground/80 block mt-0.5">{ws.student_count} Students</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Target Class</span>
                    <span className="font-semibold text-foreground/80 block mt-0.5 truncate">{ws.class_name}</span>
                  </div>
                </div>

                <div className="space-y-2 py-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Performance Avg</span>
                    <span className={cn("font-semibold", ws.performance_avg >= 50 ? "text-emerald-600" : "text-amber-600")}>
                      {ws.performance_avg}%
                    </span>
                  </div>
                  <Progress value={ws.performance_avg} className="h-1.5" />
                </div>

                <div className="flex gap-2 pt-2 mt-auto">
                  <Button asChild size="sm" className="flex-1">
                    <Link href={`/lecturer/courses/${ws.id}`}>View Workspace</Link>
                  </Button>
                  <Button variant="outline" asChild size="sm" className="w-9 h-9 p-0">
                    <Link href={`/lecturer/assessments`} title="Assessments">
                      <FileText className="size-4 text-muted-foreground" />
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
