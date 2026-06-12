"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Card,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Sparkles,
  ArrowRight,
  ShieldAlert,
  ListChecks,
  CheckCircle2,
  FileText,
  Lightbulb,
  Brain,
  BookOpen,
  Target,
  ChevronDown,
} from "lucide-react";
import { studentAiApi, StudentSupportResponse } from "@/lib/api/student-ai";
import { studentApi, StudentResourceResponse } from "@/lib/api/student";
import {
  PureMultimodalInput,
  type Attachment,
} from "@/components/ui/multimodal-ai-chat-input";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function AISupportChat() {
  const [prompt, setPrompt] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [response, setResponse] = useState<StudentSupportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [resources, setResources] = useState<StudentResourceResponse[]>([]);
  const [selectedResource, setSelectedResource] = useState<string | null>(null);
  const [loadingResources, setLoadingResources] = useState(true);

  const [resourcesDropdownOpen, setResourcesDropdownOpen] = useState(false);
  const [tipsDropdownOpen, setTipsDropdownOpen] = useState(false);
  const [integrityDropdownOpen, setIntegrityDropdownOpen] = useState(false);

  const resourcesRef = useRef<HTMLDivElement>(null);
  const tipsRef = useRef<HTMLDivElement>(null);
  const integrityRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const resData = await studentApi.getPersonalResources();
        setResources(resData);
      } catch (err) {
        console.error("Failed to load study data", err);
      } finally {
        setLoadingResources(false);
      }
    }
    loadData();
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (resourcesRef.current && !resourcesRef.current.contains(event.target as Node)) {
        setResourcesDropdownOpen(false);
      }
      if (tipsRef.current && !tipsRef.current.contains(event.target as Node)) {
        setTipsDropdownOpen(false);
      }
      if (integrityRef.current && !integrityRef.current.contains(event.target as Node)) {
        setIntegrityDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedContexts = useMemo(() => {
    if (!selectedResource) return [];
    const resource = resources.find((r) => r.id === selectedResource);
    if (!resource) return [];

    return [
      {
        title: resource.display_name || resource.original_filename,
        content: "Content from this resource will be retrieved via RAG.",
      },
    ];
  }, [selectedResource, resources]);

  const studySuggestedActions = [
    {
      title: "Explain Concept",
      label: "ACID properties with banking example",
      action: "Explain ACID properties with banking examples",
    },
    {
      title: "Revision Plan",
      label: "Database Normalization guide",
      action: "Suggest a revision plan for Database Normalization",
    },
    {
      title: "Active Recall",
      label: "SQL joins practice questions",
      action: "Provide active recall questions to test my knowledge of SQL Joins",
    },
    {
      title: "Clarify Topic",
      label: "Index performance trade-offs",
      action: "What are the performance trade-offs of using indexes in PostgreSQL?",
    },
  ];

  const handleSendMessage = async (params: { input: string; attachments: Attachment[] }) => {
    const query = params.input.trim();
    if (!query) return;

    let userQuestion = query;
    if (params.attachments.length > 0) {
      const fileNames = params.attachments.map((a) => a.name).join(", ");
      userQuestion = `${userQuestion}\n\n[Reference File: ${fileNames}]`;
    }

    setIsThinking(true);
    setError(null);
    setResponse(null);

    try {
      const res = await studentAiApi.getSupport({
        question: userQuestion,
        contexts: selectedContexts,
      });
      setResponse(res);
    } catch (err: any) {
      console.error("[studentAiApi] Error:", err);
      // We directly display the detailed error message thrown from apiClient
      setError(err.message || "Failed to connect to the AI service. Please check your network.");
    } finally {
      setIsThinking(false);
    }
  };

  return (
    <Card className="shadow-none border w-full flex flex-col h-full relative overflow-hidden bg-zinc-50/20">
      {/* Top Navigation Bar with Dropdowns */}
      <div className="border-b bg-muted/5 px-4 py-3 flex flex-wrap gap-3 items-center justify-between shrink-0 z-30">
        <div className="flex items-center gap-3">
          {/* Study Records / Materials Dropdown */}
          <div className="relative" ref={resourcesRef}>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "h-8 gap-1.5 rounded-lg border-zinc-200 text-xs font-semibold bg-white",
                selectedResource && "border-primary text-primary bg-primary/5"
              )}
              onClick={() => {
                setResourcesDropdownOpen(!resourcesDropdownOpen);
                setTipsDropdownOpen(false);
                setIntegrityDropdownOpen(false);
              }}
            >
              <FileText className="size-3.5 shrink-0" />
              <span className="max-w-[200px] truncate">
                {selectedResource
                  ? resources.find((r) => r.id === selectedResource)?.display_name ||
                    resources.find((r) => r.id === selectedResource)?.original_filename ||
                    "Context Selected"
                  : "Select Study Record (RAG)"}
              </span>
              <ChevronDown className="size-3 ml-0.5 opacity-60" />
            </Button>
            {resourcesDropdownOpen && (
              <div className="absolute left-0 mt-2 w-72 bg-white text-zinc-950 border rounded-xl shadow-lg p-4 z-40 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">
                  Teaching Materials & Records
                </div>
                <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                  {loadingResources ? (
                    <div className="text-xs text-muted-foreground py-2">Loading materials...</div>
                  ) : resources.length === 0 ? (
                    <div className="text-xs text-muted-foreground py-2">No files uploaded yet.</div>
                  ) : (
                    resources.map((file) => (
                      <div
                        key={file.id}
                        className={cn(
                          "flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer hover:bg-zinc-50 transition-colors",
                          selectedResource === file.id && "border-primary bg-primary/5 text-primary"
                        )}
                        onClick={() => {
                          setSelectedResource(selectedResource === file.id ? null : file.id);
                          setResourcesDropdownOpen(false);
                        }}
                      >
                        <FileText className="size-3.5 shrink-0" />
                        <span className="truncate flex-1 font-medium">{file.display_name || file.original_filename}</span>
                        {selectedResource === file.id && <CheckCircle2 className="size-3.5 text-primary shrink-0" />}
                      </div>
                    ))
                  )}
                </div>
                <div className="border-t mt-3 pt-2 text-center">
                  <Link
                    href="/student/resources"
                    onClick={() => setResourcesDropdownOpen(false)}
                    className="text-[10px] font-bold uppercase tracking-wider text-primary hover:underline"
                  >
                    Manage All Records
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* Cognitive Support Tips Dropdown */}
          <div className="relative" ref={tipsRef}>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 rounded-lg border-zinc-200 text-xs font-semibold bg-white"
              onClick={() => {
                setTipsDropdownOpen(!tipsDropdownOpen);
                setResourcesDropdownOpen(false);
                setIntegrityDropdownOpen(false);
              }}
            >
              <Lightbulb className="size-3.5 text-amber-500 shrink-0" />
              <span>Cognitive Support</span>
              <ChevronDown className="size-3 ml-0.5 opacity-60" />
            </Button>
            {tipsDropdownOpen && (
              <div className="absolute left-0 mt-2 w-80 bg-white text-zinc-950 border rounded-xl shadow-lg p-5 z-40 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                  <Lightbulb className="size-4 text-amber-500" /> Cognitive Study Tips
                </div>
                <div className="space-y-4">
                  <div className="flex gap-3">
                    <div className="size-6 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
                      <Target className="size-3.5 text-emerald-700" />
                    </div>
                    <div className="text-xs font-medium text-zinc-600 leading-relaxed">
                      Analyze performance: focus on Normalization and SQL optimization based on recent tests.
                    </div>
                  </div>
                  <div className="border-t my-2" />
                  <div className="flex gap-3">
                    <div className="size-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <BookOpen className="size-3.5 text-primary" />
                    </div>
                    <div className="text-xs font-medium text-zinc-600 leading-relaxed">
                      Use active recall: try explaining ACID properties out loud before consulting your digital notes.
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Integrity Warning Dropdown */}
        <div className="relative" ref={integrityRef}>
          <Badge
            variant="outline"
            className="cursor-pointer border-red-600/20 bg-red-50 text-red-700 hover:bg-red-100/50 py-1 px-2.5 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1"
            onClick={() => {
              setIntegrityDropdownOpen(!integrityDropdownOpen);
              setResourcesDropdownOpen(false);
              setTipsDropdownOpen(false);
            }}
          >
            <ShieldAlert className="size-3" />
            Lockdown Policy
          </Badge>
          {integrityDropdownOpen && (
            <div className="absolute right-0 mt-2 w-72 bg-white text-zinc-950 border border-red-100 rounded-xl shadow-lg p-4 z-40 animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="text-xs font-bold text-red-700 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <ShieldAlert className="size-4" /> Integrity Lockdown
              </div>
              <p className="text-[11px] text-zinc-600 leading-relaxed font-medium">
                Study Support AI is strictly disabled during active CATs and summative exams. Unauthorized use during assessments is tracked as a security violation.
              </p>
            </div>
          )}
        </div>
      </div>
      
      {/* Scrollable Conversation / Output Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-white/50">
        
        {error && (
          <Alert variant="destructive" className="animate-in fade-in slide-in-from-top-4 rounded-xl">
            <ShieldAlert className="size-4" />
            <AlertTitle className="text-sm font-semibold">AI Assistant Request Error</AlertTitle>
            <AlertDescription className="text-xs mt-1 font-medium">{error}</AlertDescription>
          </Alert>
        )}

        {/* Welcome Screen */}
        {!response && !isThinking && (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 max-w-xl mx-auto space-y-6">
            <div className="size-16 rounded-full bg-primary/10 flex items-center justify-center animate-pulse">
              <Brain className="size-8 text-primary" />
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-semibold tracking-tight">Revision & Study Support AI</h2>
              <p className="text-xs text-muted-foreground leading-relaxed max-w-md font-medium">
                Ask questions to revise course material, clarify academic concepts, and prepare for exams. AI can use your uploaded study records to personalize answers.
              </p>
            </div>
            
            {/* Suggested start queries */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full pt-4">
              {studySuggestedActions.map((act, idx) => (
                <button
                  key={idx}
                  onClick={() => setPrompt(act.action)}
                  className="p-3 text-left border rounded-xl text-xs hover:bg-zinc-50 transition-colors font-medium space-y-1 bg-white shadow-sm"
                >
                  <div className="text-primary font-bold text-[10px] uppercase tracking-wide">{act.title}</div>
                  <div className="text-muted-foreground truncate">{act.label}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Thinking State */}
        {isThinking && (
          <div className="space-y-6 max-w-3xl mx-auto py-4">
            <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-widest animate-pulse">
              <Sparkles className="size-4 animate-spin text-primary" />
              AI Agent is analyzing database & notes...
            </div>
            <div className="space-y-3">
              <div className="h-4 bg-zinc-200 animate-pulse rounded-md w-3/4" />
              <div className="h-4 bg-zinc-200 animate-pulse rounded-md w-5/6" />
              <div className="h-4 bg-zinc-200 animate-pulse rounded-md w-1/2" />
            </div>
          </div>
        )}

        {/* AI Output Content */}
        {response && (
          <div className="space-y-6 max-w-3xl mx-auto animate-in fade-in duration-300">
            {/* Safety Notice */}
            {response.safety_notice && (
              <Alert className="bg-muted/30 border-muted rounded-xl">
                <ShieldAlert className="size-4 text-muted-foreground" />
                <AlertTitle className="text-sm font-semibold text-muted-foreground">AI Safety Notice</AlertTitle>
                <AlertDescription className="text-xs text-muted-foreground">
                  {response.safety_notice}
                </AlertDescription>
              </Alert>
            )}

            {/* Explanation */}
            <div className="space-y-2.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Sparkles className="size-3.5 text-primary" /> Explanation
              </h3>
              <div className="p-6 rounded-2xl border bg-white text-sm text-foreground leading-relaxed whitespace-pre-line shadow-sm border-zinc-200/60">
                {response.explanation}
              </div>
            </div>

            {/* Revision Plan */}
            {response.revision_plan && response.revision_plan.length > 0 && (
              <div className="space-y-2.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <ListChecks className="size-3.5 text-primary" /> Revision Plan
                </h3>
                <ul className="space-y-2.5 p-6 rounded-2xl border bg-white text-sm text-foreground/80 leading-relaxed shadow-sm border-zinc-200/60">
                  {response.revision_plan.map((step, idx) => (
                    <li key={idx} className="flex gap-3 items-start">
                      <CheckCircle2 className="size-4 text-primary shrink-0 mt-0.5" />
                      <span>{step}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Follow-up Suggestions */}
            {response.follow_up_questions && response.follow_up_questions.length > 0 && (
              <div className="space-y-2.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <ArrowRight className="size-3.5 text-primary" /> Follow-up Suggestions
                </h3>
                <div className="flex flex-wrap gap-2">
                  {response.follow_up_questions.map((q, idx) => (
                    <Badge 
                      key={idx} 
                      variant="secondary" 
                      className="cursor-pointer hover:bg-secondary/80 px-3 py-1.5 text-xs font-medium border bg-white text-zinc-700"
                      onClick={() => setPrompt(q)}
                    >
                      {q}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input bar at the bottom */}
      <div className="p-4 border-t bg-white shrink-0 z-20">
        <div className="max-w-3xl mx-auto">
          <PureMultimodalInput
            chatId="student-study-ai"
            messages={response ? [{ id: "1", role: "model", content: response.explanation }] : []}
            attachments={attachments}
            setAttachments={setAttachments}
            onSendMessage={handleSendMessage}
            onStopGenerating={() => setIsThinking(false)}
            isGenerating={isThinking}
            canSend={!isThinking}
            selectedVisibilityType="private"
            suggestedActions={null} // Disable standard suggestions inside the input component since we display them in the center hero
            placeholder="Ask AI support... (e.g. explain normal forms)"
            value={prompt}
            onChange={setPrompt}
          />
        </div>
      </div>
    </Card>
  );
}
