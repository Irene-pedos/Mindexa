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
  Layers,
  MonitorPlay,
  TrendingUp
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
    <div className="max-w-7xl mx-auto space-y-4 p-4 pb-8">
      {/* Dense Command Header */}
      <div className="flex items-center justify-between gap-4 border-b border-border/40 pb-3">
        <div className="space-y-0.5">
          <h1 className="text-lg font-bold tracking-tight text-foreground/90 uppercase flex items-center gap-2">
            <Layers className="size-4 text-primary/60" /> Workspaces
          </h1>
          <p className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider">Node management ledger.</p>
        </div>
        <Button size="sm" asChild className="h-7 px-3 font-bold text-[10px] uppercase rounded-md bg-primary hover:bg-primary/90 shadow-none">
          <Link href="/lecturer/courses/new"><Plus className="mr-1 size-3" /> Initialize</Link>
        </Button>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {loading ? (
          [1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} variant="media" className="h-56 w-full rounded-lg" />
          ))
        ) : workspaces.length === 0 ? (
          <div className="col-span-full py-20 text-center border border-dashed rounded-lg bg-muted/5 border-border/40">
             <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">No active nodes.</p>
          </div>
        ) : (
          workspaces.map((ws) => (
            <Card key={ws.id} className="hover:border-primary/30 transition-all group shadow-none border border-border/60 rounded-lg overflow-hidden flex flex-col bg-card/30">
              <CardHeader className="p-3 border-b border-border/40 bg-muted/5">
                <div className="flex justify-between items-start gap-3">
                  <div className="min-w-0">
                    <CardTitle className="text-sm font-bold truncate uppercase text-foreground/80 group-hover:text-primary transition-colors">{ws.title}</CardTitle>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant="outline" className="h-3.5 px-1 text-[8px] font-bold bg-primary/5 border-primary/20 text-primary/70 uppercase rounded-sm">{ws.code}</Badge>
                      <span className="text-[9px] font-bold text-muted-foreground/50 uppercase tracking-tighter">{ws.academic_year}</span>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[8px] font-bold h-4 px-1.5 rounded-full border-emerald-200/50 text-emerald-700 bg-emerald-50/50 shrink-0 uppercase">Active</Badge>
                </div>
              </CardHeader>

              <CardContent className="p-3 flex-1 flex flex-col space-y-3">
                <div className="grid grid-cols-2 gap-3 pb-3 border-b border-border/10">
                  <div className="space-y-0.5">
                    <span className="text-muted-foreground font-bold uppercase text-[8px] tracking-tighter opacity-60">Node Count</span>
                    <span className="font-bold tabular-nums text-[13px] text-foreground/80 block">{ws.student_count} Students</span>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-muted-foreground font-bold uppercase text-[8px] tracking-tighter opacity-60">Target</span>
                    <span className="font-bold truncate block text-[10px] text-foreground/70 uppercase">{ws.class_name}</span>
                  </div>
                </div>

                <div className="space-y-1.5 py-1">
                  <div className="flex justify-between text-[8px] font-bold uppercase tracking-widest">
                    <span className="text-muted-foreground/60">Performance index</span>
                    <span className={cn("font-bold", ws.performance_avg >= 50 ? "text-emerald-600" : "text-amber-600")}>{ws.performance_avg}%</span>
                  </div>
                  <div className="h-1 bg-muted/40 rounded-full overflow-hidden">
                    <div className={cn("h-full transition-all duration-700", ws.performance_avg >= 50 ? "bg-emerald-500/60" : "bg-amber-500/60")} style={{ width: `${ws.performance_avg}%` }} />
                  </div>
                </div>

                <div className="flex gap-1.5 pt-1 mt-auto">
                    <Button asChild size="sm" className="flex-1 h-7 text-[10px] font-bold uppercase rounded-md bg-primary hover:bg-primary/90 shadow-none">
                        <Link href={`/lecturer/courses/${ws.id}`}>Enter Portal</Link>
                    </Button>
                    <Button variant="outline" asChild size="sm" className="h-7 w-7 p-0 rounded-md border-border/60 hover:bg-muted/50">
                        <Link href={`/lecturer/assessments`} title="Evaluations"><FileText className="size-3 text-muted-foreground" /></Link>
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
