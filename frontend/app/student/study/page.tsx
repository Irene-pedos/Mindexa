// app/(student)/study/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Brain,
  Upload,
  FileText,
  Lightbulb,
  Target,
  BookOpen,
  ArrowRight,
  ShieldCheck,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { studentApi, StudentResourceResponse } from "@/lib/api/student";
import Link from "next/link";

export default function StudentStudySupportPage() {
  const [prompt, setPrompt] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [response, setResponse] = useState("");
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

  const handleAskAI = async () => {
    if (!prompt.trim()) return;
    setIsThinking(true);

    // TODO: Replace with real LangChain + FastAPI call (Student Study Support AI)
    setTimeout(() => {
      setResponse(
        `Based on your query "${prompt}":\n\n` +
          `• Core concept: ... (clear explanation)\n` +
          `• Common pitfalls: ...\n` +
          `• Revision priority: High – this appears frequently in CATs and summative exams.\n\n` +
          `Would you like me to:\n` +
          `• Generate 5 practice questions\n` +
          `• Create a mind map / summary\n` +
          `• Identify related weak topics from your uploaded resources?`,
      );
      setIsThinking(false);
    }, 1350);
  };

  if (loading) {
     return (
        <div className="flex h-[60vh] items-center justify-center">
           <Loader2 className="size-10 animate-spin text-muted-foreground" />
        </div>
     );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight flex items-center gap-3">
          <Brain className="size-8 text-violet-600" />
          Study Support AI
        </h1>
        <p className="text-muted-foreground mt-1 max-w-2xl">
          Personalized revision guidance, concept explanations, learning gap
          analysis, and active recall support.
          <span className="text-emerald-600 font-small">
            {" "}
            This tool is strictly for revision and homework only.
          </span>
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Main AI Interaction Area */}
        <div className="lg:col-span-7">
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="text-lg">
                Ask Your Personal Study Assistant
              </CardTitle>
              <CardDescription>
                Explain concepts • Identify weak areas • Suggest revision
                priorities • Generate practice questions
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <Textarea
                placeholder="Explain ACID properties with real banking examples... or Suggest a revision plan for Normalization..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="min-h-[120px] resize-y text-sm"
              />

              <Button
                onClick={handleAskAI}
                disabled={isThinking || !prompt.trim()}
                className="w-full"
                size="lg"
              >
                {isThinking ? "AI is thinking..." : "Get Study Guidance"}
                <ArrowRight className="ml-2 size-5" />
              </Button>

              {response && (
                <Card className="bg-muted/50 border-violet-500/30">
                  <CardContent className="p-6 whitespace-pre-line text-sm text-foreground leading-relaxed">
                    {response}
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar – Resources & Rules */}
        <div className="lg:col-span-5 space-y-6">
          {/* Uploaded Resources */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <FileText className="size-5" /> My Personal Study Resources
                </CardTitle>
                <Button size="sm" variant="outline" asChild>
                  <Link href="/student/resources">
                    Manage
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {resources.length === 0 ? (
                 <div className="py-8 text-center border-2 border-dashed rounded-xl px-4">
                    <p className="text-sm text-muted-foreground mb-4">No study resources uploaded yet. Upload files to improve AI context.</p>
                    <Button variant="outline" size="sm" asChild>
                       <Link href="/student/resources">Upload Now</Link>
                    </Button>
                 </div>
              ) : (
                resources.slice(0, 4).map((file, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border p-4 hover:bg-muted/50 cursor-pointer transition-colors",
                      selectedResource === file.id &&
                        "border-violet-500 bg-violet-950/30",
                    )}
                    onClick={() => setSelectedResource(file.id)}
                  >
                    <FileText className="size-5 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {file.display_name || file.original_filename}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {file.file_extension} • {(file.file_size_bytes / 1024).toFixed(0)} KB
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Smart Study Tips */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Lightbulb className="size-5 text-amber-500" /> AI-Powered Study
                Tips
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5 text-sm">
              <div className="flex gap-3">
                <Target className="size-5 text-emerald-500 mt-0.5 flex-shrink-0" />
                <div>
                  No weak areas identified yet. Complete more assessments to get personalized tips.
                </div>
              </div>
              <div className="flex gap-3">
                <BookOpen className="size-5 text-violet-500 mt-0.5 flex-shrink-0" />
                <div>
                  Use active recall: explain concepts out loud before checking
                  your notes.
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Strict Integrity Notice */}
          <Card className="border-amber-500/30 bg-amber-50 dark:bg-amber-950/30">
            <CardContent className="p-6 flex items-start gap-4">
              <ShieldCheck className="size-6 text-amber-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium">
                  This AI is for revision and learning only.
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  It is disabled during all CATs, summative exams, and any
                  supervised or restricted assessments.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
