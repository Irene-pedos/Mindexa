"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Sparkles,
  ShieldAlert,
  ListChecks,
  CheckCircle2,
  FileText,
  Lightbulb,
  Brain,
  BookOpen,
  ChevronDown,
  RefreshCw,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { studentAiApi } from "@/lib/api/student-ai";
import {
  studentApi,
  StudentResourceResponse,
  StudentCourseListItem,
} from "@/lib/api/student";
import { assessmentApi } from "@/lib/api/assessment";
import { apiClient } from "@/lib/api/client";
import { AIChatInput, type Attachment } from "@/components/ui/ai-chat-input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// Vertical and horizontal tabs primitives
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip as UITooltip,
  TooltipContent as UITooltipContent,
  TooltipProvider as UITooltipProvider,
  TooltipTrigger as UITooltipTrigger,
} from "@/components/ui/tooltip";

// Chat improvements
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker";
import { Spinner } from "@/components/ui/spinner";
import {
  Attachment as UIAttachment,
  AttachmentMedia as UIAttachmentMedia,
  AttachmentContent as UIAttachmentContent,
  AttachmentTitle as UIAttachmentTitle,
  AttachmentDescription as UIAttachmentDescription,
} from "@/components/ui/attachment";
import { RichMessageRenderer } from "@/components/mindexa/common/rich-message-renderer";
import { MessageActionBar } from "@/components/mindexa/common/message-action-bar";

interface Message {
  id: string;
  sender: "student" | "ai";
  text: string;
  attachments?: Attachment[];
  timestamp: Date;
  citations?: Array<{
    resource_name: string;
    resource_id: string;
    page_number: number | null;
    chunk_index: number;
    excerpt: string;
  }>;
  fallback_used?: boolean;
  revision_plan?: string[];
  follow_up_questions?: string[];
  safety_notice?: string | null;
}

interface AISupportChatProps {
  initialTopicContext?: string;
}

export function AISupportChat({ initialTopicContext }: AISupportChatProps = {}) {
  const [activeTab, setActiveTab] = useState<"support" | "revision">("support");
  const [prompt, setPrompt] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialTopicContext && initialTopicContext.trim()) {
      setPrompt(`I am reviewing "${initialTopicContext}". Can you explain the core concepts and test my understanding?`);
    }
  }, [initialTopicContext]);

  const handleApiError = (err: any, fallbackMessage: string) => {
    const rawMessage = err?.message || "";
    const isInternetIssue =
      rawMessage.toLowerCase().includes("internet issue") ||
      rawMessage.toLowerCase().includes("timeout") ||
      rawMessage.toLowerCase().includes("could not reach the api") ||
      rawMessage.toLowerCase().includes("failed to fetch") ||
      rawMessage.toLowerCase().includes("networkerror");

    const userFriendlyMessage = isInternetIssue
      ? "Internet issue: Connection to external service failed. Please check your network connection."
      : rawMessage || fallbackMessage;

    setError(userFriendlyMessage);

    if (isInternetIssue) {
      toast.error("Internet issue");
    } else {
      toast.error(userFriendlyMessage);
    }
  };

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);

  // Chat Conversation
  const [messages, setMessages] = useState<Message[]>([]);

  // Approved Resources
  const [resources, setResources] = useState<StudentResourceResponse[]>([]);
  const [workspaces, setWorkspaces] = useState<StudentCourseListItem[]>([]);
  const [lecturerMaterials, setLecturerMaterials] = useState<any[]>([]);
  const [selectedResource, setSelectedResource] = useState<string | null>(null);
  const [loadingResources, setLoadingResources] = useState(true);

  // Dropdowns
  const [resourcesDropdownOpen, setResourcesDropdownOpen] = useState(false);
  const [tipsDropdownOpen, setTipsDropdownOpen] = useState(false);
  const [integrityDropdownOpen, setIntegrityDropdownOpen] = useState(false);

  // Blocker State
  const [isBlockedByActiveExam, setIsBlockedByActiveExam] = useState(false);
  const [blockingExamTitle, setBlockingExamTitle] = useState("");

  // Fullscreen State
  const [isFullScreen, setIsFullScreen] = useState(false);

  // Revision State
  const [revisionTopic, setRevisionTopic] = useState("");
  const [revisionResult, setRevisionResult] = useState<{
    summary: string;
    checklist: string[];
    readings: string[];
  } | null>(null);
  const [isGeneratingRevision, setIsGeneratingRevision] = useState(false);

  const resourcesRef = useRef<HTMLDivElement>(null);
  const tipsRef = useRef<HTMLDivElement>(null);
  const integrityRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll chat messages to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking]);

  useEffect(() => {
    async function loadData() {
      try {
        setLoadingResources(true);
        const [personalResData, attemptsData, workspacesData] =
          await Promise.all([
            studentApi.getPersonalResources(),
            apiClient("/attempts/me"),
            studentApi.getWorkspaces().catch(() => []),
          ]);

        setResources(personalResData);
        setWorkspaces(workspacesData);

        // Load materials for all workspaces
        const workspaceMaterialsPromises = workspacesData.map(async (ws) => {
          try {
            const mats = await studentApi.getWorkspaceMaterials(ws.id);
            return mats.map((m) => ({
              ...m,
              course_code: ws.code,
              course_name: ws.title,
            }));
          } catch (e) {
            return [];
          }
        });
        const allWorkspaceMaterials = (
          await Promise.all(workspaceMaterialsPromises)
        ).flat();
        setLecturerMaterials(allWorkspaceMaterials);

        // Active assessment blocking check
        const activeAttempts = (attemptsData.items || []).filter(
          (a: any) => a.status === "IN_PROGRESS" || a.status === "PAUSED",
        );
        if (activeAttempts.length > 0) {
          for (const attempt of activeAttempts) {
            const assessment = await assessmentApi.getAssessmentById(
              attempt.assessment_id,
            );
            const isExamStyle =
              assessment.assessment_type === "CAT" ||
              assessment.assessment_type === "SUMMATIVE" ||
              assessment.is_supervised === true;
            const isAiDisallowed = !assessment.ai_assistance_allowed;

            if (isExamStyle || isAiDisallowed) {
              setIsBlockedByActiveExam(true);
              setBlockingExamTitle(assessment.title);
              break;
            }
          }
        }
      } catch (err) {
        console.error(
          "Failed to load study data or check active attempts",
          err,
        );
      } finally {
        setLoadingResources(false);
      }
    }
    loadData();
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        resourcesRef.current &&
        !resourcesRef.current.contains(event.target as Node)
      ) {
        setResourcesDropdownOpen(false);
      }
      if (tipsRef.current && !tipsRef.current.contains(event.target as Node)) {
        setTipsDropdownOpen(false);
      }
      if (
        integrityRef.current &&
        !integrityRef.current.contains(event.target as Node)
      ) {
        setIntegrityDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedResourceName = useMemo(() => {
    if (!selectedResource) return null;
    const personal = resources.find((r) => r.id === selectedResource);
    if (personal) return personal.display_name || personal.original_filename;

    const lecturerMat = lecturerMaterials.find(
      (m) => m.id === selectedResource,
    );
    if (lecturerMat)
      return lecturerMat.display_name || lecturerMat.original_filename;

    return "Context Selected";
  }, [selectedResource, resources, lecturerMaterials]);

  // Student Resource Management
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
      setIsUploading(true);
      await studentApi.uploadPersonalResource(formData);
      toast.success("File uploaded successfully! Processing started.");
      // Refresh resources
      const personalResData = await studentApi.getPersonalResources();
      setResources(personalResData);
    } catch (err: any) {
      toast.error(err.message || "Failed to upload file.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDeleteResource = async (id: string) => {
    try {
      await studentApi.deletePersonalResource(id);
      toast.success("Resource deleted.");
      setResources((prev) => prev.filter((r) => r.id !== id));
    } catch (err: any) {
      toast.error(err.message || "Failed to delete resource.");
    }
  };

  const studySuggestedActions = [
    {
      title: "Explain Concept",
      label: "Database Normalization in simple terms",
      action: "Explain Database Normalization with step-by-step examples",
    },
    {
      title: "Active Recall",
      label: "SQL Joins practice scenario",
      action:
        "Provide scenarios to test my understanding of SQL Outer and Inner Joins",
    },
    {
      title: "Academic Material Study",
      label: "Summarize selected context",
      action:
        "Summarize the key takeaways and learning outcomes from the selected resource",
    },
    {
      title: "Lecturer Feedback",
      label: "Explain my grade on assessments",
      action:
        "Explain standard database assessment rubrics and how to improve design marks",
    },
  ];

  // Core Chat Support Handlers
  const handleSendMessage = async (
    params: string | { input: string; attachments?: Attachment[]; isThinking?: boolean; isDeepSearch?: boolean },
  ) => {
    const rawInput = typeof params === "string" ? params : params?.input || "";
    const attachmentList = typeof params === "string" ? [] : params?.attachments || [];
    const isThinkingMode = typeof params === "object" ? params?.isThinking : false;
    const isDeepSearchMode = typeof params === "object" ? params?.isDeepSearch : false;

    const userQuery = rawInput.trim();
    let promptWithContext = userQuery;

    if (isThinkingMode) {
      promptWithContext = `[THINKING & DEEP REASONING MODE ACTIVE]\n${promptWithContext}`;
      toast.info("Deep Reasoning mode active");
    }
    if (isDeepSearchMode) {
      promptWithContext = `[DEEP RAG SEARCH ACTIVE]\n${promptWithContext}`;
      toast.info("Deep Document RAG Search active");
    }

    if (attachmentList.length > 0) {
      const fileDetails = attachmentList
        .map((a) => {
          if (a.extractedText) {
            return `\n--- ATTACHED STUDY FILE: ${a.name} ---\n${a.extractedText.slice(0, 15000)}\n--- END FILE ---`;
          }
          return `\n[Attached Study File: ${a.name}]`;
        })
        .join("\n");

      promptWithContext = userQuery ? `${promptWithContext}\n${fileDetails}` : fileDetails;

      // Automatically upload file to student personal resources in background if file exists
      for (const att of attachmentList) {
        if ((att as any).file) {
          try {
            const formData = new FormData();
            formData.append("file", (att as any).file);
            await studentApi.uploadPersonalResource(formData);
            toast.success(`Uploaded ${att.name} to personal study resources.`);
          } catch (uploadErr) {
            console.warn("Auto-upload error:", uploadErr);
          }
        }
      }
    }

    if (!userQuery && attachmentList.length === 0) return;

    const newStudentMessage: Message = {
      id: Date.now().toString(),
      sender: "student",
      text: userQuery,
      attachments: attachmentList,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, newStudentMessage]);
    setIsThinking(true);
    setError(null);
    setPrompt("");

    try {
      const history = messages.map((m) => ({
        role: m.sender === "student" ? "user" : "assistant",
        content: m.text,
      }));

      const res = await studentAiApi.getSupport({
        question: promptWithContext,
        conversation_history: history,
        selected_resource_id: selectedResource || undefined,
      });

      const newAiMessage: Message = {
        id: (Date.now() + 1).toString(),
        sender: "ai",
        text: res.explanation,
        timestamp: new Date(),
        citations: res.citations,
        fallback_used: res.fallback_used,
      };

      setMessages((prev) => [...prev, newAiMessage]);
    } catch (err: any) {
      handleApiError(err, "Failed to retrieve AI explanation.");
    } finally {
      setIsThinking(false);
    }
  };

  // Revision Center Handler
  const handleGenerateRevision = async () => {
    if (!revisionTopic.trim()) {
      toast.error("Please enter a topic or concept name.");
      return;
    }
    setIsGeneratingRevision(true);
    setRevisionResult(null);
    setError(null);

    const questionText = `Generate a structured, comprehensive revision note for the topic: "${revisionTopic}".
Format your response exactly as follows in clean markdown:
### Summary
[Detailed concept summary, rules, formulas, examples in clear educational language]

### Key Checklist
- [Important point to master 1]
- [Important point to master 2]

### Recommended Readings
- [Reference book/chapter/article 1]
- [Reference book/chapter/article 2]`;

    try {
      const res = await studentAiApi.getSupport({
        question: questionText,
        selected_resource_id: selectedResource || undefined,
      });

      const text = res.explanation;
      let summary = "";
      const checklist: string[] = [];
      const readings: string[] = [];

      const lines = text.split("\n");
      let currentSection: "summary" | "checklist" | "readings" | null = null;

      for (const line of lines) {
        const cleanLine = line.trim();
        const lower = cleanLine.toLowerCase();
        if (lower.startsWith("### summary") || lower.startsWith("**summary**") || lower.startsWith("## summary")) {
          currentSection = "summary";
          continue;
        } else if (lower.startsWith("### key checklist") || lower.startsWith("**key checklist**") || lower.startsWith("## key checklist") || lower.startsWith("### checklist") || lower.startsWith("**checklist**")) {
          currentSection = "checklist";
          continue;
        } else if (lower.startsWith("### recommended readings") || lower.startsWith("**recommended readings**") || lower.startsWith("## recommended readings") || lower.startsWith("### readings") || lower.startsWith("**readings**")) {
          currentSection = "readings";
          continue;
        }

        if (currentSection === "summary") {
          summary += line + "\n";
        } else if (currentSection === "checklist") {
          if (cleanLine.startsWith("-") || cleanLine.startsWith("*") || /^\d+[\s:.)]+/.test(cleanLine)) {
            checklist.push(cleanLine.replace(/^[-*\s\d.]+/, ""));
          } else if (cleanLine) {
            checklist.push(cleanLine);
          }
        } else if (currentSection === "readings") {
          if (cleanLine.startsWith("-") || cleanLine.startsWith("*") || /^\d+[\s:.)]+/.test(cleanLine)) {
            readings.push(cleanLine.replace(/^[-*\s\d.]+/, ""));
          } else if (cleanLine) {
            readings.push(cleanLine);
          }
        }
      }

      if (!summary.trim()) {
        summary = text;
      }

      setRevisionResult({
        summary: summary.trim(),
        checklist,
        readings,
      });
      toast.success("Revision guide generated!");
    } catch (err: any) {
      handleApiError(err, "Failed to generate revision guide.");
    } finally {
      setIsGeneratingRevision(false);
    }
  };

  if (isBlockedByActiveExam) {
    return (
      <Card className="shadow-none border w-full flex flex-col h-full justify-center items-center bg-zinc-50/20 p-8 min-h-[400px]">
        <div className="flex flex-col items-center text-center max-w-md space-y-4">
          <div className="size-12 rounded-full bg-red-100 flex items-center justify-center">
            <ShieldAlert className="size-6 text-red-600" />
          </div>
          <div className="space-y-2">
            <h3 className="text-base font-medium text-red-600">
              AI Support Unavailable
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed font-medium">
              AI assistance is disabled for this assessment to maintain academic
              integrity.
            </p>
            {blockingExamTitle && (
              <p className="text-xs font-medium text-foreground bg-zinc-100 py-1.5 px-3 rounded-lg border border-zinc-200">
                Active Assessment: {blockingExamTitle}
              </p>
            )}
            <p className="text-[11px] text-muted-foreground font-medium">
              Please finalize your attempt and submit your assessment to restore
              access.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <MessageScrollerProvider>
      <Card
        className={cn(
          "shadow-none border w-full flex flex-col relative overflow-hidden bg-zinc-50/20",
          isFullScreen
            ? "fixed inset-0 z-50 h-screen w-screen rounded-none border-none p-4 md:p-4 bg-white"
            : "h-full",
        )}
      >
        {/* Top Navigation Bar */}
        <div className="border-b bg-muted/5 px-4 py-3 flex flex-wrap gap-3 items-center justify-between shrink-0 z-30">
          <div className="flex items-center gap-3">
            {/* Approved Resource Selectors */}
            <div className="relative" ref={resourcesRef}>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "h-8 gap-1.5 rounded-lg border-zinc-200 text-xs font-semibold bg-white",
                  selectedResource && "border-primary text-primary bg-primary/5",
                )}
                onClick={() => {
                  setResourcesDropdownOpen(!resourcesDropdownOpen);
                  setTipsDropdownOpen(false);
                  setIntegrityDropdownOpen(false);
                }}
              >
                <FileText className="size-3.5 shrink-0" />
                <span className="max-w-[200px] truncate">
                  {selectedResourceName || "Select Learning Material (RAG)"}
                </span>
                <ChevronDown className="size-3 ml-0.5 opacity-60" />
              </Button>
              {resourcesDropdownOpen && (
                <div className="absolute left-0 mt-2 w-80 bg-white text-zinc-950 border rounded-xl shadow-lg p-4 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                  <div className="space-y-4 max-h-80 overflow-y-auto pr-1 text-left">
                    {/* Lecturer Materials section */}
                    <div>
                      <div className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">
                        Lecturer Course Materials
                      </div>
                      {loadingResources ? (
                        <div className="text-xs text-muted-foreground py-1 pl-2">
                          Loading materials...
                        </div>
                      ) : lecturerMaterials.length === 0 ? (
                        <div className="text-xs text-muted-foreground py-1 pl-2">
                          No course materials available.
                        </div>
                      ) : (
                        <div className="space-y-1">
                          {lecturerMaterials.map((file) => (
                            <div
                              key={file.id}
                              className={cn(
                                "flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer hover:bg-zinc-50 transition-colors",
                                selectedResource === file.id &&
                                  "border-primary bg-primary/5 text-primary",
                              )}
                              onClick={() => {
                                setSelectedResource(
                                  selectedResource === file.id ? null : file.id,
                                );
                                setResourcesDropdownOpen(false);
                              }}
                            >
                              <FileText className="size-3.5 shrink-0 text-blue-500" />
                              <div className="truncate flex-1 font-medium text-left">
                                <div className="truncate">
                                  {file.display_name || file.original_filename}
                                </div>
                                <div className="text-[10px] text-muted-foreground">
                                  {file.course_code} • Lecturer Material
                                </div>
                              </div>
                              {selectedResource === file.id && (
                                <CheckCircle2 className="size-3.5 text-primary shrink-0" />
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Personal Resources section */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-xs font-bold text-zinc-500 uppercase tracking-widest">
                          Personal Study Files
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[10px] text-primary hover:bg-primary/5"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={isUploading}
                        >
                          {isUploading ? (
                            <RefreshCw className="size-2.5 animate-spin mr-1" />
                          ) : (
                            <Sparkles className="size-2.5 mr-1" />
                          )}
                          Upload
                        </Button>
                        <input
                          type="file"
                          ref={fileInputRef}
                          className="hidden"
                          accept=".pdf,.docx,.txt"
                          onChange={handleFileUpload}
                        />
                      </div>
                      {loadingResources ? (
                        <div className="text-xs text-muted-foreground py-1 pl-2">
                          Loading files...
                        </div>
                      ) : resources.length === 0 ? (
                        <div className="text-xs text-muted-foreground py-1 pl-2 text-center bg-zinc-50 rounded-lg border border-dashed p-3">
                          No personal files uploaded.
                        </div>
                      ) : (
                        <div className="space-y-1">
                          {resources.map((file) => (
                            <div
                              key={file.id}
                              className={cn(
                                "group flex items-center gap-2 p-2 rounded-lg border text-xs hover:bg-zinc-50 transition-colors",
                                selectedResource === file.id &&
                                  "border-primary bg-primary/5 text-primary",
                              )}
                            >
                              <div
                                className="flex-1 flex items-center gap-2 cursor-pointer"
                                onClick={() => {
                                  setSelectedResource(
                                    selectedResource === file.id ? null : file.id,
                                  );
                                  setResourcesDropdownOpen(false);
                                }}
                              >
                                <FileText className="size-3.5 shrink-0 text-emerald-500" />
                                <div className="truncate flex-1 font-medium text-left">
                                  <div className="truncate">
                                    {file.display_name || file.original_filename}
                                  </div>
                                  <div className="flex items-center gap-1.5 mt-0.5">
                                    <Badge
                                      variant="outline"
                                      className={cn(
                                        "px-1.5 py-0 text-[8px] font-bold uppercase",
                                        file.processing_status === "COMPLETED"
                                          ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                                          : file.processing_status === "FAILED"
                                            ? "bg-red-50 text-red-600 border-red-200"
                                            : "bg-amber-50 text-amber-600 border-amber-200 animate-pulse",
                                      )}
                                    >
                                      {file.processing_status}
                                    </Badge>
                                    <span className="text-[10px] text-muted-foreground">
                                      Personal File
                                    </span>
                                  </div>
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-6 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-600 hover:bg-red-50"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteResource(file.id);
                                }}
                              >
                                <ShieldAlert className="size-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Tips Dropdown */}
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
                <span>Study Tips</span>
                <ChevronDown className="size-3 ml-0.5 opacity-60" />
              </Button>
              {tipsDropdownOpen && (
                <div className="absolute left-0 mt-2 w-80 bg-white text-zinc-950 border rounded-xl shadow-lg p-5 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                  <div className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                    <Lightbulb className="size-4 text-amber-500" /> Active Recall Tips
                  </div>
                  <div className="space-y-4">
                    <div className="flex gap-3">
                      <div className="size-6 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
                        <CheckCircle2 className="size-3.5 text-emerald-700" />
                      </div>
                      <div className="text-xs font-medium text-zinc-600 leading-relaxed">
                        Always try to formulate explanations in your own words before consulting solutions.
                      </div>
                    </div>
                    <div className="border-t my-2" />
                    <div className="flex gap-3">
                      <div className="size-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <BookOpen className="size-3.5 text-primary" />
                      </div>
                      <div className="text-xs font-medium text-zinc-600 leading-relaxed">
                        Use the Revision Center to generate concept summaries and key learning checklists.
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Policies & Fullscreen */}
          <div className="flex items-center gap-2">
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
                Integrity Rules
              </Badge>
              {integrityDropdownOpen && (
                <div className="absolute right-0 mt-2 w-72 bg-white text-zinc-950 border border-red-100 rounded-xl shadow-lg p-4 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                  <div className="text-xs font-bold text-red-700 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                    <ShieldAlert className="size-4" /> Academic Policy
                  </div>
                  <p className="text-[11px] text-zinc-600 leading-relaxed font-medium">
                    Student AI only supports study and learning. Generating cheat
                    notes, accessing hidden assessments, or bypassing integrity
                    checks is strictly prohibited.
                  </p>
                </div>
              )}
            </div>

            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 hover:bg-zinc-100 border-zinc-200"
              onClick={() => setIsFullScreen(!isFullScreen)}
              title={isFullScreen ? "Exit Fullscreen" : "Enter Fullscreen"}
            >
              {isFullScreen ? (
                <Minimize2 className="size-4 text-zinc-600" />
              ) : (
                <Maximize2 className="size-4 text-zinc-600" />
              )}
            </Button>
          </div>
        </div>

        {/* Tabs Switcher & Content Wrapper */}
        <Tabs
          value={activeTab}
          onValueChange={(v) => {
            setActiveTab(v as any);
            setError(null);
          }}
          className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden p-3 md:p-4 gap-4 bg-zinc-50/20"
        >
          {/* Horizontal Navigation on Mobile */}
          <TabsList className="flex md:hidden flex-row bg-muted/30 p-1 rounded-xl w-full overflow-x-auto gap-1 border shadow-none shrink-0 scrollbar-none mb-2">
            {[
              { id: "support", label: "Support", icon: Brain },
              { id: "revision", label: "Revision", icon: BookOpen },
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className="flex-1 py-1.5 text-[11px] font-semibold rounded-lg text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground"
                >
                  <Icon className="size-3.5 mr-1" />
                  {tab.label}
                </TabsTrigger>
              );
            })}
          </TabsList>

          {/* Vertical Navigation Sidebar on Desktop */}
          <TabsList
            className={cn(
              "hidden md:flex flex-col bg-muted/30 p-1.5 rounded-xl border border-border/40 gap-1.5 h-fit shrink-0 text-start transition-all duration-300 relative",
              isSidebarCollapsed ? "w-[54px]" : "w-[180px]",
            )}
          >
            {[
              { id: "support", label: "Study Support", icon: Brain },
              { id: "revision", label: "Revision Center", icon: BookOpen },
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <UITooltipProvider key={tab.id} delayDuration={0}>
                  <UITooltip>
                    <UITooltipTrigger asChild>
                      <TabsTrigger
                        value={tab.id}
                        className={cn(
                          "w-full justify-start gap-2.5 px-3 py-2 text-xs font-semibold rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm transition-all",
                          isSidebarCollapsed && "justify-center px-0 gap-0",
                        )}
                      >
                        <Icon className="size-4 shrink-0" />
                        {!isSidebarCollapsed && (
                          <span className="truncate">{tab.label}</span>
                        )}
                      </TabsTrigger>
                    </UITooltipTrigger>
                    <UITooltipContent
                      side="right"
                      className="px-2 py-1 text-xs font-medium"
                    >
                      {tab.label}
                    </UITooltipContent>
                  </UITooltip>
                </UITooltipProvider>
              );
            })}

            <Separator className="my-1 bg-border/25" />

            {/* Collapse/Expand Toggle Button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              className="w-full h-8 text-xs font-semibold rounded-lg text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 flex items-center justify-center p-0"
              title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
              type="button"
            >
              <ChevronDown
                className={cn(
                  "size-4 transition-transform duration-300",
                  isSidebarCollapsed ? "-rotate-90" : "rotate-90",
                )}
              />
            </Button>
          </TabsList>

          {/* Main Content Area */}
          <div className="flex-1 grow rounded-xl border border-border/40 bg-card/25 backdrop-blur-sm shadow-sm p-3.5 md:p-4 flex flex-col min-h-0 overflow-y-auto relative">
            {error && (
              <Alert variant="destructive" className="mb-4 rounded-xl">
                <ShieldAlert className="size-4" />
                <AlertTitle className="text-sm font-semibold">
                  Study Assistant Error
                </AlertTitle>
                <AlertDescription className="text-xs mt-1 font-medium">
                  {error}
                </AlertDescription>
              </Alert>
            )}

            {/* Tab 1: STUDY SUPPORT CHAT */}
            <TabsContent
              value="support"
              className="flex-1 flex flex-col min-h-0 mt-0 data-[state=inactive]:hidden focus-visible:outline-none"
            >
              <div className="flex-1 min-h-[300px] flex flex-col relative overflow-hidden">
                {messages.length === 0 && !isThinking ? (
                  <div className="flex-1 overflow-y-auto">
                    <div className="h-full flex flex-col items-center justify-center text-center p-8 max-w-xl mx-auto space-y-6">
                      <div className="size-16 rounded-full bg-primary/10 flex items-center justify-center animate-pulse">
                        <Brain className="size-8 text-primary" />
                      </div>
                      <div className="space-y-2">
                        <h2 className="text-lg font-semibold tracking-tight">
                          Revision & Study Support AI
                        </h2>
                        <p className="text-xs text-muted-foreground leading-relaxed max-w-md font-medium">
                          Ask questions to clarify academic concepts, get revision
                          advice, and prepare for exams. Select a study record above
                          to add specific context.
                        </p>
                      </div>

                      {/* Suggested Start Buttons */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full pt-4">
                        {studySuggestedActions.map((act, idx) => (
                          <button
                            key={idx}
                            onClick={() => setPrompt(act.action)}
                            className="p-3 text-left border rounded-xl text-xs hover:bg-zinc-50 transition-colors font-medium space-y-1 bg-white shadow-sm border-zinc-200/60"
                          >
                            <div className="text-primary font-bold text-[10px] uppercase tracking-wide">
                              {act.title}
                            </div>
                            <div className="text-muted-foreground truncate">
                              {act.label}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <MessageScroller className="h-full">
                    <MessageScrollerViewport className="scroll-fade">
                      <MessageScrollerContent
                        aria-busy={isThinking}
                        className="max-w-3xl mx-auto py-2"
                      >
                        {messages.map((msg) => (
                          <div
                            key={msg.id}
                            className={cn(
                              "flex flex-col max-w-[85%] space-y-2 p-4 rounded-2xl text-xs font-medium shadow-2xs leading-relaxed whitespace-pre-wrap animate-in fade-in slide-in-from-bottom-2 duration-300",
                              msg.sender === "student"
                                ? "bg-primary text-primary-foreground ml-auto rounded-tr-none"
                                : "bg-card border border-border/80 text-foreground mr-auto rounded-tl-none text-left",
                            )}
                          >
                            <div className="font-semibold text-[9px] uppercase tracking-wider opacity-65 flex items-center justify-between">
                              <span>
                                {msg.sender === "student" ? "You" : "Study AI"}
                              </span>
                            </div>

                            {msg.sender === "student" ? (
                              <div className="space-y-2">
                                {msg.attachments &&
                                  msg.attachments.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                                      {msg.attachments.map(
                                        (att: any, aIdx: number) => (
                                          <div
                                            key={aIdx}
                                            className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-primary-foreground/30 bg-primary-foreground/15 text-primary-foreground text-xs font-medium"
                                          >
                                            <FileText className="size-3.5 shrink-0" />
                                            <span className="truncate max-w-[160px] text-[11px]">
                                              {att.name}
                                            </span>
                                          </div>
                                        ),
                                      )}
                                    </div>
                                  )}
                                {msg.text && (
                                  <div className="whitespace-pre-wrap leading-relaxed">
                                    {msg.text}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <RichMessageRenderer
                                content={msg.text}
                                citations={msg.citations}
                              />
                            )}

                            {msg.fallback_used && (
                              <Marker className="mt-2" role="status">
                                <MarkerIcon className="bg-amber-500/10 text-amber-600 border-amber-500/20">
                                  <ShieldAlert className="size-3" />
                                </MarkerIcon>
                                <MarkerContent className="text-[10px] text-amber-700">
                                  No matching course materials found — answering
                                  from general knowledge.
                                </MarkerContent>
                              </Marker>
                            )}

                            {msg.sender === "ai" && (
                              <div className="pt-2.5 flex justify-end border-t border-border/30">
                                <MessageActionBar
                                  content={msg.text}
                                  onRegenerate={() =>
                                    handleSendMessage({
                                      input:
                                        messages[messages.length - 2]?.text ||
                                        "",
                                      attachments: [],
                                    })
                                  }
                                  isStreaming={
                                    isThinking &&
                                    msg.id === messages[messages.length - 1]?.id
                                  }
                                  onStop={() => setIsThinking(false)}
                                />
                              </div>
                            )}
                          </div>
                        ))}

                        {isThinking && (
                          <div className="max-w-[85%] mr-auto py-1">
                            <Marker
                              role="status"
                              className="bg-card border border-border/80 rounded-2xl p-3.5 space-y-1"
                            >
                              <div className="flex items-center gap-2">
                                <MarkerIcon>
                                  <Spinner className="size-3" />
                                </MarkerIcon>
                                <MarkerContent className="shimmer text-xs font-semibold text-primary">
                                  Analyzing course materials & assessment
                                  records...
                                </MarkerContent>
                              </div>
                            </Marker>
                          </div>
                        )}
                        <div ref={messagesEndRef} />
                      </MessageScrollerContent>
                    </MessageScrollerViewport>
                    <MessageScrollerButton />
                  </MessageScroller>
                )}
              </div>

              {/* Input Bar with Attachment & Thinking support */}
              <div className="pt-2">
                <AIChatInput
                  value={prompt}
                  onChange={setPrompt}
                  onSend={handleSendMessage}
                  isGenerating={isThinking}
                  onStop={() => setIsThinking(false)}
                  attachments={attachments}
                  setAttachments={setAttachments}
                  onUploadFile={async (file: File) => {
                    const formData = new FormData();
                    formData.append("file", file);
                    const res =
                      await studentApi.uploadPersonalResource(formData);
                    return { id: res.id };
                  }}
                />
              </div>
            </TabsContent>

            {/* Tab 2: REVISION CENTER */}
            <TabsContent
              value="revision"
              className="flex-1 flex flex-col min-h-0 mt-0 data-[state=inactive]:hidden focus-visible:outline-none"
            >
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                <Card className="shadow-none border border-zinc-200/60 lg:col-span-4 bg-white rounded-xl">
                  <CardHeader className="py-4">
                    <CardTitle className="text-sm font-semibold">
                      Generate Revision Guide
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Summarize materials and create checklists.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label
                        htmlFor="rev-topic"
                        className="text-xs font-semibold text-zinc-700"
                      >
                        Topic or Concept Name
                      </Label>
                      <Input
                        id="rev-topic"
                        placeholder="e.g. Database Normalization"
                        value={revisionTopic}
                        onChange={(e) => setRevisionTopic(e.target.value)}
                        className="h-9 text-xs"
                      />
                    </div>
                    <Button
                      onClick={handleGenerateRevision}
                      disabled={isGeneratingRevision || !revisionTopic}
                      className="w-full h-9 text-xs font-semibold"
                    >
                      {isGeneratingRevision && (
                        <RefreshCw className="size-3.5 animate-spin mr-1.5" />
                      )}
                      Generate Study Note
                    </Button>
                  </CardContent>
                </Card>

                <div className="lg:col-span-8 space-y-4">
                  {isGeneratingRevision && (
                    <div className="py-2">
                      <Marker
                        role="status"
                        className="bg-card border border-border/80 rounded-xl p-3"
                      >
                        <MarkerIcon>
                          <Spinner />
                        </MarkerIcon>
                        <MarkerContent className="shimmer text-xs">
                          Study AI is thinking & compiling revision guide...
                        </MarkerContent>
                      </Marker>
                    </div>
                  )}

                  {revisionResult && (
                    <div className="space-y-6 animate-in fade-in duration-300">
                      <Card className="shadow-none border border-zinc-200/60 bg-white rounded-xl">
                        <CardHeader className="py-4 border-b bg-zinc-50/50">
                          <div className="flex justify-between items-center">
                            <CardTitle className="text-sm font-semibold text-primary">
                              {revisionTopic}
                            </CardTitle>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-[10px] font-bold uppercase tracking-wider"
                              onClick={() => {
                                navigator.clipboard.writeText(
                                  `${revisionTopic} Revision Summary\n\n${revisionResult.summary}`,
                                );
                                toast.success("Revision summary copied!");
                              }}
                            >
                              Copy Guide
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent className="p-6 space-y-6">
                          <div className="space-y-2">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                              <BookOpen className="size-3.5 text-primary" /> Concept
                              Summary
                            </h4>
                            <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-200/40">
                              <RichMessageRenderer
                                content={revisionResult.summary}
                              />
                            </div>
                          </div>

                          {revisionResult.checklist &&
                            revisionResult.checklist.length > 0 && (
                              <div className="space-y-2">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                  <ListChecks className="size-3.5 text-primary" />{" "}
                                  Key Learning Checklist
                                </h4>
                                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-medium text-foreground/75 pl-1">
                                  {revisionResult.checklist.map((item, idx) => (
                                    <li
                                      key={idx}
                                      className="flex items-start gap-2 bg-emerald-500/5 p-2.5 border border-emerald-500/15 rounded-xl transition-all hover:bg-emerald-500/10"
                                    >
                                      <CheckCircle2 className="size-4 text-emerald-600 shrink-0 mt-0.5" />
                                      <span>{item}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                          {revisionResult.readings &&
                            revisionResult.readings.length > 0 && (
                              <div className="space-y-2">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                  <BookOpen className="size-3.5 text-primary" />{" "}
                                  Recommended Readings
                                </h4>
                                <div className="grid grid-cols-1 gap-2 pl-1">
                                  {revisionResult.readings.map((item, idx) => (
                                    <UIAttachment
                                      key={idx}
                                      className="bg-card/20 border-border/40 hover:border-primary/20"
                                    >
                                      <UIAttachmentMedia>
                                        <FileText className="size-4 text-primary" />
                                      </UIAttachmentMedia>
                                      <UIAttachmentContent>
                                        <UIAttachmentTitle className="text-xs">
                                          {item}
                                        </UIAttachmentTitle>
                                        <UIAttachmentDescription className="text-[10px]">
                                          Academic Reference
                                        </UIAttachmentDescription>
                                      </UIAttachmentContent>
                                    </UIAttachment>
                                  ))}
                                </div>
                              </div>
                            )}
                        </CardContent>
                      </Card>
                    </div>
                  )}

                  {!revisionResult && !isGeneratingRevision && (
                    <div className="border border-dashed border-zinc-200 rounded-xl p-12 text-center text-xs text-muted-foreground bg-white/40">
                      <BookOpen className="size-8 mx-auto mb-2 opacity-40 text-muted-foreground" />
                      Your generated revision guide and checklists will appear
                      here.
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </Card>
    </MessageScrollerProvider>
  );
}
