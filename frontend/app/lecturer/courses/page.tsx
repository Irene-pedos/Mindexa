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
  Building2,
  Calendar,
  Layers
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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-0.5">
          <h1 className="text-2xl font-semibold tracking-tight text-primary flex items-center gap-2">
            <Layers className="size-6" /> My Teaching Workspaces
          </h1>
          <p className="text-muted-foreground text-[11px] font-semibold uppercase tracking-widest mt-0.5">
            Manage active classes, students, and operational content
          </p>
        </div>
        <Button
          size="sm"
          asChild
          className="h-9 px-5 font-semibold text-[10px] uppercase tracking-widest rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground shadow-none"
        >
          <Link href="/lecturer/courses/new">
            <Plus className="mr-1.5 size-3.5" /> Initialize Workspace
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          [1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton
              key={i}
              variant="media"
              className="h-64 w-full rounded-xl"
            />
          ))
        ) : workspaces.length === 0 ? (
          <Card className="col-span-full border-dashed bg-muted/5 rounded-2xl border-muted/20 shadow-none">
            <CardContent className="py-24 text-center">
              <div className="size-12 rounded-full bg-muted/30 flex items-center justify-center mx-auto mb-4 text-muted-foreground/30 border border-muted/40">
                <BookOpen className="size-6" />
              </div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
                No workspaces found.
              </p>
              <p className="text-xs text-muted-foreground/60 mt-1.5 mb-8">
                Initialize a workspace from your official teaching assignments to get started.
              </p>
              <Button
                asChild
                variant="outline"
                className="h-9 px-8 rounded-lg font-semibold uppercase text-[10px] tracking-widest border-primary/20 hover:bg-primary/5 hover:text-primary transition-all"
              >
                <Link href="/lecturer/courses/new">Open Registry</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          workspaces.map((ws) => (
            <Card
              key={ws.id}
              className="hover:border-primary/20 transition-all group overflow-hidden shadow-none border border-muted/20 rounded-2xl flex flex-col bg-white"
            >
              <CardHeader className="pb-3 px-5 pt-4 border-b border-muted/10 bg-primary/[0.01]">
                <div className="flex justify-between items-start gap-3">
                  <div className="min-w-0">
                    <CardTitle className="text-[14px] font-semibold truncate leading-tight text-foreground/90 group-hover:text-primary transition-colors uppercase tracking-tight">
                      {ws.title}
                    </CardTitle>
                    <CardDescription className="font-mono text-[10px] font-bold text-primary/60 mt-1 flex items-center gap-1.5 uppercase tracking-wider">
                      <Badge variant="outline" className="h-4 px-1.5 text-[8px] bg-primary/5 border-primary/20">{ws.code}</Badge>
                      {ws.academic_year}
                    </CardDescription>
                  </div>
                  <Badge
                    variant="outline"
                    className="rounded-full h-5 px-2.5 text-[9px] font-semibold uppercase bg-emerald-50 text-emerald-700 border-none shrink-0"
                  >
                    {ws.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-5 pt-4 flex-1 flex flex-col space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <span className="text-muted-foreground font-semibold uppercase text-[9px] tracking-widest flex items-center gap-1.5">
                      <Users className="size-3" /> Nodes
                    </span>
                    <span className="font-semibold tabular-nums text-sm text-foreground/80">
                      {ws.student_count} Students
                    </span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-muted-foreground font-semibold uppercase text-[9px] tracking-widest flex items-center gap-1.5">
                      <GraduationCap className="size-3" /> Target
                    </span>
                    <span className="font-semibold truncate block text-sm text-foreground/80">
                      {ws.class_name}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-[9px] font-semibold uppercase tracking-widest">
                    <span className="text-muted-foreground/60">Syllabus Coverage</span>
                    <span className={cn(
                        "font-bold",
                        ws.performance_avg >= 50 ? "text-emerald-600" : "text-amber-600"
                    )}>
                      {ws.performance_avg}%
                    </span>
                  </div>
                  <div className="h-1 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full transition-all duration-500",
                        ws.performance_avg >= 50 ? "bg-emerald-500" : "bg-amber-500"
                      )}
                      style={{ width: `${ws.performance_avg}%` }}
                    />
                  </div>
                </div>

                <div className="flex flex-col pt-4 border-t border-muted/10 gap-2 mt-auto">
                  <div className="flex items-center gap-2 mb-1">
                    <Building2 className="size-3 text-muted-foreground/50" />
                    <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/60 truncate">
                      {ws.institution_name}
                    </p>
                  </div>
                  <Button
                    asChild
                    size="sm"
                    className="w-full h-9 text-[10px] font-semibold uppercase tracking-widest rounded-lg shadow-none justify-between px-4 bg-primary hover:bg-primary/90"
                  >
                    <Link href={`/lecturer/courses/${ws.id}`}>
                      <div className="flex items-center gap-2">
                        <BookOpen className="size-4 opacity-70" />
                        Enter Portal
                      </div>
                      <ArrowRight className="size-4 opacity-40" />
                    </Link>
                  </Button>
                  <Button
                    variant="outline"
                    asChild
                    size="sm"
                    className="w-full h-9 text-[10px] font-semibold uppercase tracking-widest rounded-lg hover:bg-muted/50 border-muted/30 justify-start px-4"
                  >
                    <Link href={`/lecturer/assessments`} className="flex items-center gap-2">
                      <FileText className="size-4 text-muted-foreground/60" />
                      Evaluations
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
