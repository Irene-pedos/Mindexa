// app/student/study/page.tsx
"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Brain,
  FileText,
  Lightbulb,
  Target,
  BookOpen,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { studentApi, StudentResourceResponse } from "@/lib/api/student";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { AISupportChat } from "@/components/mindexa/student/ai-support-chat";

export default function StudentStudySupportPage() {
  const [resources, setResources] = useState<StudentResourceResponse[]>([]);
  const [selectedResource, setSelectedResource] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const resData = await studentApi.getPersonalResources();
        setResources(resData);
      } catch (err) {
        console.error("Failed to load study data", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Compute selected contexts based on the selected resource
  const selectedContexts = useMemo(() => {
    if (!selectedResource) return [];
    const resource = resources.find(r => r.id === selectedResource);
    if (!resource) return [];
    
    return [
      {
        title: resource.display_name || resource.original_filename,
        content: "Content from this resource will be retrieved via RAG.", // Real implementation relies on backend RAG fetching by id, but our prompt takes explicit contexts. Since Phase 1.5 RAG does its own embedding retrieval, we don't need to pass the full content here, but we can pass a hint or let RAG handle it. Actually, RAG handles it. We can just send an empty array or a pointer. Let's just send empty array for now since backend RAG gets ALL student chunks.
      }
    ];
  }, [selectedResource, resources]);

  if (loading) {
     return (
        <div className="space-y-10 max-w-7xl mx-auto p-4">
           <div className="space-y-2">
                <Skeleton className="h-8 w-64 rounded-md" />
                <Skeleton className="h-4 w-[500px] rounded-md opacity-60" />
           </div>
           <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                <div className="lg:col-span-7">
                    <Skeleton className="h-[400px] w-full rounded-xl" />
                </div>
                <div className="lg:col-span-5 space-y-6">
                    <Skeleton className="h-64 w-full rounded-xl" />
                    <Skeleton className="h-48 w-full rounded-xl" />
                </div>
           </div>
        </div>
     );
  }

  return (
    <div className="space-y-10 max-w-7xl mx-auto p-4">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Brain className="size-8 text-primary" />
          Study Support AI
        </h1>
        <p className="text-muted-foreground text-sm max-w-2xl font-medium leading-relaxed">
          Personalized revision guidance, concept explanations, and active recall support.
          <span className="text-emerald-600"> Strictly for learning and homework only.</span>
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        {/* Main AI Interaction Area */}
        <div className="lg:col-span-7 space-y-6">
          <AISupportChat selectedContexts={selectedContexts} />
        </div>

        {/* Sidebar – Resources & Rules */}
        <div className="lg:col-span-5 space-y-8">
          {/* Uploaded Resources */}
          <Card className="shadow-none border">
            <CardHeader className="py-4 border-b">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-muted-foreground">
                  <FileText className="size-4" /> Study Records
                </CardTitle>
                <Button size="sm" variant="ghost" className="h-7 text-[10px] font-bold uppercase" asChild>
                  <Link href="/student/resources">Manage All</Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-4 space-y-2">
              {resources.length === 0 ? (
                 <div className="py-10 text-center border-2 border-dashed rounded-xl px-4 bg-muted/10">
                    <p className="text-[11px] text-muted-foreground mb-4 font-bold uppercase tracking-wider">No study records uploaded yet.</p>
                    <Button variant="outline" size="sm" className="h-8 rounded-md" asChild>
                       <Link href="/student/resources">Upload Records</Link>
                    </Button>
                 </div>
              ) : (
                resources.slice(0, 4).map((file, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border p-3.5 hover:bg-muted/30 cursor-pointer transition-colors",
                      selectedResource === file.id && "border-primary bg-primary/5 ring-1 ring-primary/20",
                    )}
                    onClick={() => setSelectedResource(file.id)}
                  >
                    <div className="size-8 rounded bg-muted flex items-center justify-center">
                      <FileText className="size-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold truncate">
                        {file.display_name || file.original_filename}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5 uppercase font-bold tracking-tighter">
                        {file.file_extension} • {(file.file_size_bytes / 1024).toFixed(0)} KB
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Smart Study Tips */}
          <Card className="shadow-none border overflow-hidden">
            <CardHeader className="py-4 bg-muted/5 border-b">
              <CardTitle className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-muted-foreground">
                <Lightbulb className="size-4 text-amber-500" /> Cognitive Support
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-5">
              <div className="flex gap-4">
                <div className="size-6 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                  <Target className="size-3.5 text-emerald-700" />
                </div>
                <div className="text-xs font-medium text-foreground/70 leading-relaxed">
                  Analyze your performance: focus on Normalization and SQL optimization based on recent CAT results.
                </div>
              </div>
              <Separator />
              <div className="flex gap-4">
                <div className="size-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <BookOpen className="size-3.5 text-primary" />
                </div>
                <div className="text-xs font-medium text-foreground/70 leading-relaxed">
                  Use active recall: try explaining ACID properties out loud before consulting your digital notes.
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Strict Integrity Notice */}
          <div className="p-5 rounded-2xl border-2 border-red-600/20 bg-red-50/50 flex items-start gap-4">
            <ShieldCheck className="size-6 text-red-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-bold text-sm text-red-900">Integrity Lockdown</p>
              <p className="text-[11px] text-red-800/70 mt-1 font-medium leading-normal">
                Study Support AI is strictly disabled during active CATs and summative exams. Unauthorized use during assessments is tracked as a security violation.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
