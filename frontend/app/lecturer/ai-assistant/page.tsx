// app/lecturer/ai-assistant/page.tsx
"use client";

import {
  useState,
  useEffect,
  useMemo,
  useRef,
  Suspense,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sparkles,
  BookOpen,
  BarChart2,
  Plus,
  Folder,
  Layers,
  Award,
  Maximize2,
  Minimize2,
  Copy,
  Check,
  Edit2,
  RotateCcw,
  AlertTriangle,
  FileText,
  ChevronDown,
  Share2,
  Download,
  Printer,
  FileCode,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  ArrowLeft,
  History,
} from "lucide-react";
import { AIChatInput, type Attachment } from "@/components/ui/ai-chat-input";
import { useLecturerSessions } from "@/hooks/use-lecturer-sessions";
import {
  sanitizeSessionModule,
  type AIModule,
  type ChatMessage,
} from "@/lib/lecturer-sessions";
import {
  lecturerApi,
  WorkspaceListItem,
  WorkspaceDetail,
  LecturerMaterialResponse,
} from "@/lib/api/lecturer";
import { buildAttachmentPrompt } from "@/lib/chat-attachments";
import { escapeHtml } from "@/lib/escape-html";
import { safeRemoveItem, safeSetItem } from "@/lib/safe-storage";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Tooltip as UITooltip,
  TooltipContent as UITooltipContent,
  TooltipProvider as UITooltipProvider,
  TooltipTrigger as UITooltipTrigger,
} from "@/components/ui/tooltip";

// UI Chat Primitives & Rich Components
import {
  MessageScrollerProvider,
  MessageScroller,
  MessageScrollerViewport,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerButton,
} from "@/components/ui/message-scroller";
import { Marker, MarkerIcon, MarkerContent } from "@/components/ui/marker";
import { Spinner } from "@/components/ui/spinner";
import { RichMessageRenderer } from "@/components/mindexa/common/rich-message-renderer";

// 5 Grounded Sub-components
import { QuestionGeneratorLauncher } from "@/components/mindexa/lecturer/question-generator-launcher";
import { SlideDeckGenerator } from "@/components/mindexa/lecturer/slide-deck-generator";
import { RubricAssistant } from "@/components/mindexa/lecturer/rubric-assistant";
import { ClassDigest } from "@/components/mindexa/lecturer/class-digest";
import { SessionList } from "@/components/mindexa/lecturer/session-list";

/** Wrapper for a tool pane: fills the main area like the tool itself used to, hidden when inactive. */
function toolPaneClass(isActive: boolean): string {
  return cn("flex min-h-0 flex-1 flex-col", !isActive && "hidden");
}

/** Plain-text transcript of a conversation, for pasting into an email or chat. */
function buildTranscript(turns: Array<{ role: string; content: string }>): string {
  return turns
    .map((t) => `${t.role === "user" ? "Lecturer" : "AI Assistant"}:\n${t.content.trim()}`)
    .join("\n\n");
}

function LecturerAIAssistantContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const containerRef = useRef<HTMLDivElement>(null);

  // Tab State with LocalStorage and URL synchronization. The initial values are fixed defaults
  // (so the server render and the first client render match); saved values are restored in the
  // mount effect further down.
  const [activeTab, setActiveTabState] = useState<AIModule>("chat");
  // Tabs opened at least once; their tools are kept mounted (see the tool panes below).
  const [visitedTabs, setVisitedTabs] = useState<ReadonlySet<AIModule>>(() => new Set<AIModule>(["chat"]));
  useEffect(() => {
    setVisitedTabs((prev) => (prev.has(activeTab) ? prev : new Set(prev).add(activeTab)));
  }, [activeTab]);

  const setActiveTab = (tab: AIModule) => {
    setActiveTabState(tab);
    if (typeof window !== "undefined") {
      safeSetItem("mindexa_lecturer_ai_module", tab);
      const params = new URLSearchParams(window.location.search);
      params.set("module", tab);
      router.replace(`?${params.toString()}`);
    }
  };

  const [isGenerating, setIsGenerating] = useState(false);
  // Cancels the in-flight assistant request when the lecturer presses Stop.
  const abortControllerRef = useRef<AbortController | null>(null);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  // The draft text lives inside the chat input, so typing does not re-render this whole page (and
  // every message in it). Bumping `nonce` replaces the draft from here ("edit message", or the
  // text coming back after a failed send).
  const [draftSeed, setDraftSeed] = useState({ text: "", nonce: 0 });
  const setDraft = (text: string) => setDraftSeed((seed) => ({ text, nonce: seed.nonce + 1 }));
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isContextSheetOpen, setIsContextSheetOpen] = useState(false);

  // Native Fullscreen Sync
  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      if (containerRef.current?.requestFullscreen) {
        containerRef.current.requestFullscreen().catch(() => {
          setIsFullScreen((prev) => !prev);
        });
      } else {
        setIsFullScreen((prev) => !prev);
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {
          setIsFullScreen(false);
        });
      } else {
        setIsFullScreen(false);
      }
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullScreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  // Workspaces list & active selection with persistence
  const [workspaces, setWorkspaces] = useState<WorkspaceListItem[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceIdState] = useState<string>("");

  const setSelectedWorkspaceId = (id: string) => {
    setSelectedWorkspaceIdState(id);
    if (typeof window !== "undefined") {
      if (id) {
        safeSetItem("mindexa_lecturer_ai_workspace", id);
      } else {
        safeRemoveItem("mindexa_lecturer_ai_workspace");
      }
      const params = new URLSearchParams(window.location.search);
      if (id) {
        params.set("workspace", id);
      } else {
        params.delete("workspace");
      }
      router.replace(`?${params.toString()}`);
    }
  };

  const [loadingWorkspaces, setLoadingWorkspaces] = useState(true);
  const [activeWorkspaceDetail, setActiveWorkspaceDetail] = useState<WorkspaceDetail | null>(null);
  const [loadingWorkspaceDetail, setLoadingWorkspaceDetail] = useState(false);

  // Resource / Materials Context Settings
  const [workspaceMaterials, setWorkspaceMaterials] = useState<LecturerMaterialResponse[]>([]);
  const [selectedMaterials, setSelectedMaterialsState] = useState<string[]>([]);
  const selectedMaterialsRef = useRef<string[]>([]);
  selectedMaterialsRef.current = selectedMaterials;

  const setSelectedMaterials = (materials: string[]) => {
    setSelectedMaterialsState(materials);
    try {
      localStorage.setItem("mindexa_lecturer_ai_materials", JSON.stringify(materials));
    } catch {
      // storage unavailable or full: the selection simply isn't remembered
    }
  };

  // Saved conversations: list, open one, pinning, deletion (state + persistence live in the hook).
  const {
    sortedSessions,
    currentSessionId,
    pinnedSessionIds,
    sessionToDelete,
    setSessionToDelete,
    saveCurrentSession,
    startNewSession,
    loadSession,
    togglePinSession,
    confirmDeleteSession,
  } = useLecturerSessions({
    setHistory,
    activeTab,
    selectedWorkspaceId,
    setActiveTab,
    setSelectedWorkspaceId,
  });

  // Restore everything remembered from a previous visit. Done after mount rather than in the
  // state initialisers above: those also run on the server, where there is no localStorage,
  // so reading it there made the first client render differ from the server HTML.
  useEffect(() => {
    try {
      const urlModule = searchParams.get("module");
      const savedModule = urlModule || localStorage.getItem("mindexa_lecturer_ai_module");
      if (savedModule) setActiveTabState(sanitizeSessionModule(savedModule));

      const savedWorkspace = searchParams.get("workspace") || localStorage.getItem("mindexa_lecturer_ai_workspace");
      if (savedWorkspace) setSelectedWorkspaceIdState(savedWorkspace);

      const savedMaterials = localStorage.getItem("mindexa_lecturer_ai_materials");
      if (savedMaterials) {
        const parsed = JSON.parse(savedMaterials);
        if (Array.isArray(parsed)) setSelectedMaterialsState(parsed.filter((id) => typeof id === "string"));
      }
    } catch {
      // unreadable or unavailable storage: start from the defaults
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  // Action states
  const [copiedActionId, setCopiedActionId] = useState<string | null>(null);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);

  // Load the lecturer's workspaces on mount
  useEffect(() => {
    async function loadData() {
      try {
        setLoadingWorkspaces(true);
        const wsData = await lecturerApi.getWorkspaces();
        setWorkspaces(wsData || []);
        if (wsData && wsData.length > 0) {
          setSelectedWorkspaceIdState((prev) => {
            // A remembered workspace that no longer exists (or isn't theirs) falls back to the
            // first one instead of silently failing every request afterwards.
            const finalId = prev && wsData.some((w) => w.id === prev) ? prev : wsData[0].id;
            try {
              localStorage.setItem("mindexa_lecturer_ai_workspace", finalId);
            } catch {
              // storage unavailable
            }
            return finalId;
          });
        }
      } catch (err) {
        console.error("Failed to load lecturer workspaces", err);
      } finally {
        setLoadingWorkspaces(false);
      }
    }
    loadData();
  }, []);

  // Fetch detailed Workspace data and materials when selection changes
  useEffect(() => {
    if (!selectedWorkspaceId) {
      setActiveWorkspaceDetail(null);
      setWorkspaceMaterials([]);
      return;
    }

    async function loadWorkspaceDetail() {
      try {
        setLoadingWorkspaceDetail(true);
        const detail = await lecturerApi.getWorkspaceDetail(selectedWorkspaceId);
        setActiveWorkspaceDetail(detail);

        const materials = await lecturerApi.getWorkspaceMaterials(selectedWorkspaceId);
        setWorkspaceMaterials(materials || []);

        // The remembered selection is global, but materials belong to one workspace: drop any
        // that are not in this one so another workspace's files are never sent as context.
        const available = new Set((materials || []).map((m) => m.id));
        const current = selectedMaterialsRef.current;
        const kept = current.filter((id) => available.has(id));
        if (kept.length !== current.length) setSelectedMaterials(kept);
      } catch (err) {
        console.error("Failed to load workspace details/materials", err);
      } finally {
        setLoadingWorkspaceDetail(false);
      }
    }
    loadWorkspaceDetail();
  }, [selectedWorkspaceId]);

  const activeWorkspace = useMemo(() => {
    return workspaces.find((w) => w.id === selectedWorkspaceId) || null;
  }, [workspaces, selectedWorkspaceId]);

  const isRwandaBlocked = useMemo(() => {
    return (
      activeWorkspace?.language === "RW" ||
      activeWorkspaceDetail?.language === "RW"
    );
  }, [activeWorkspace, activeWorkspaceDetail]);

  const activeWorkspaceName = useMemo(() => {
    return (
      activeWorkspaceDetail?.title ||
      activeWorkspace?.title ||
      "No Workspace Selected"
    );
  }, [activeWorkspaceDetail, activeWorkspace]);

  const handleCopyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedActionId(id);
    toast.success("Copied to clipboard!");
    setTimeout(() => setCopiedActionId(null), 2000);
  };

  const handleEditUserMessage = (text: string) => {
    setDraft(text);
    toast.info("Prompt loaded into composer.");
  };

  // Export Handlers. These export the chat conversation, whichever module is open: the other
  // modules have their own outputs (PPTX download, saved rubric, digest) and nothing for a
  // generic export to write.
  const handleExportMarkdown = () => {
    const title = `lecturer-ai-chat-${new Date().toISOString().slice(0, 10)}.md`;
    let content = `# Lecturer Academic AI — Chat\n\n`;
    content += `- **Workspace**: ${activeWorkspaceName}\n`;
    content += `- **Date**: ${new Date().toLocaleString()}\n\n`;
    content += `---\n\n`;

    if (history.length === 0) {
      content += `*No conversation history in this session.*\n`;
    } else {
      history.forEach((m) => {
        content += `### ${m.role === "user" ? "Lecturer Prompt" : "AI Academic Copilot"}\n\n${m.content}\n\n`;
      });
    }

    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = title;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Markdown file downloaded.");
  };

  const handleExportPlainText = () => {
    const title = `lecturer-ai-chat-${new Date().toISOString().slice(0, 10)}.txt`;
    let content = `LECTURER ACADEMIC AI — CHAT\n`;
    content += `Workspace: ${activeWorkspaceName}\n`;
    content += `Date: ${new Date().toLocaleString()}\n\n========================================\n\n`;

    if (history.length === 0) {
      content += `No conversation history in this session.\n`;
    } else {
      history.forEach((m) => {
        content += `[${m.role === "user" ? "LECTURER PROMPT" : "AI ACADEMIC COPILOT"}]:\n${m.content}\n\n----------------------------------------\n\n`;
      });
    }

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = title;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Plain text file downloaded.");
  };

  const handleExportPDF = () => {
    const title = "Lecturer Academic AI — Chat";
    let bodyHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 24px; color: #0f172a; line-height: 1.6;">
        <div style="border-bottom: 2px solid #e2e8f0; padding-bottom: 16px; margin-bottom: 24px;">
          <h1 style="font-size: 20px; font-weight: 700; margin: 0 0 6px 0; color: #0f172a;">${escapeHtml(title)}</h1>
          <p style="font-size: 12px; color: #64748b; margin: 0;">
            <strong>Course Workspace:</strong> ${escapeHtml(activeWorkspaceName)} &bull; <strong>Generated:</strong> ${new Date().toLocaleString()}
          </p>
        </div>
    `;

    if (history.length === 0) {
      bodyHtml += `<p style="font-size: 13px; color: #94a3b8; font-style: italic;">No conversation messages in this session.</p>`;
    } else {
      history.forEach((m) => {
        const isUser = m.role === "user";
        bodyHtml += `
          <div style="margin-bottom: 18px; padding: 14px 18px; border-radius: 10px; background-color: ${isUser ? "#f8fafc" : "#ffffff"}; border: 1px solid #e2e8f0;">
            <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; color: ${isUser ? "#475569" : "#2563eb"};">
              ${isUser ? "Lecturer Prompt" : "AI Academic Copilot"}
            </div>
            <div style="font-size: 13px; white-space: pre-wrap; word-break: break-word;">${escapeHtml(m.content)}</div>
          </div>
        `;
      });
    }

    bodyHtml += `
        <div style="margin-top: 32px; border-top: 1px solid #e2e8f0; padding-top: 12px; font-size: 10px; color: #94a3b8; text-align: center;">
          Mindexa Academic Assessment Operating System &bull; Confidential Faculty Record
        </div>
      </div>
    `;

    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>${title} - ${new Date().toISOString().slice(0, 10)}</title>
            <meta charset="utf-8" />
            <style>
              @media print {
                body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                @page { margin: 1.5cm; }
              }
            </style>
          </head>
          <body>
            ${bodyHtml}
            <script>
              window.onload = function() {
                window.focus();
                window.print();
              };
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
      toast.success("Print & PDF export ready.");
    } else {
      window.print();
    }
  };

  // AI Chat execution engine
  // Typed text plus the text of any attached files, as the backend expects it in `question`.
  const composeQuestion = (text: string, files: Attachment[] = []) => {
    if (files.length === 0) return text;
    const fileDetails = buildAttachmentPrompt(files);
    return text ? `${text}\n${fileDetails}` : fileDetails;
  };

  const executeAIChatRequest = async (
    userPrompt: string,
    chatUserDisplay?: string,
    chatAttachments?: Attachment[],
    options?: { replaceFromIndex?: number }
  ) => {
    if (!selectedWorkspaceId) {
      toast.error("Please select a Course Workspace from the Context panel.");
      setIsContextSheetOpen(true);
      return;
    }

    if (isRwandaBlocked) {
      toast.error("AI support is disabled for Kinyarwanda language workspaces.");
      return;
    }

    // One request at a time: a second send would interleave two replies into one history.
    if (isGenerating) return;

    // "Try Again" replaces the previous exchange instead of stacking a duplicate below it.
    const baseHistory =
      options?.replaceFromIndex !== undefined ? history.slice(0, options.replaceFromIndex) : history;

    setIsGenerating(true);

    const userMessage: ChatMessage = {
      role: "user",
      content: chatUserDisplay || userPrompt,
      attachments: chatAttachments,
    };

    const newHistory = [...baseHistory, userMessage];
    setHistory(newHistory);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await lecturerApi.getAISupport(
        {
          workspace_id: selectedWorkspaceId,
          question: userPrompt,
          mode: "chat",
          selected_material_ids: selectedMaterials.length > 0 ? selectedMaterials : undefined,
          conversation_history: baseHistory.map((h) => ({
            role: h.role,
            content: h.content,
          })),
        },
        { signal: controller.signal }
      );

      const aiText = response.answer || "No response received.";
      const aiMessage: ChatMessage = {
        role: "model",
        content: aiText,
        citations: response.citations,
        fallbackUsed: response.fallback_used,
      };

      const finalHistory = [...newHistory, aiMessage];
      setHistory(finalHistory);

      saveCurrentSession(finalHistory);
      toast.success("Response generated.");
    } catch (err: any) {
      // Stop was pressed: cancelled on purpose, the lecturer's message simply stays unanswered.
      if (err?.name === "AbortError") return;
      console.error("AI Error:", err);
      // Take the unanswered message back out and return its text to the composer, so
      // resending does not leave two copies of it in the conversation.
      setHistory(baseHistory);
      setDraft(chatUserDisplay || userPrompt);
      toast.error(err.message || "Failed to generate AI response.");
    } finally {
      // If Stop already released this request, the state is not ours to touch.
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
        setIsGenerating(false);
      }
    }
  };

  const handleStopGenerating = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsGenerating(false);
  };

  const handleChatSendMessage = async (
    params: string | { input: string; attachments?: Attachment[] }
  ) => {
    const rawInput = typeof params === "string" ? params : params?.input || "";
    const attachmentList = typeof params === "string" ? [] : params?.attachments || [];

    const userQuery = rawInput.trim();
    if (!userQuery && attachmentList.length === 0) return;

    executeAIChatRequest(composeQuestion(userQuery, attachmentList), userQuery, attachmentList);
  };

  // Regenerate the answer to the user message at `userIndex`, replacing that exchange.
  const handleRegenerateFrom = (userIndex: number) => {
    const userMsg = history[userIndex];
    if (!userMsg || userMsg.role !== "user") return;
    executeAIChatRequest(
      composeQuestion(userMsg.content, userMsg.attachments),
      userMsg.content,
      userMsg.attachments,
      { replaceFromIndex: userIndex }
    );
  };

  // 4 Essential Quick Actions
  const essentialQuickActions = [
    {
      title: "Draft Exam Questions",
      description: "Launch the audited question generator with blueprint constraints.",
      icon: Layers,
      onClick: () => setActiveTab("questions"),
    },
    {
      title: "Generate Slide Deck",
      description: "Build 8–15 pedagogical lecture slides from a Learning Unit.",
      icon: BookOpen,
      onClick: () => setActiveTab("slides"),
    },
    {
      title: "Draft Marking Rubric",
      description: "Create objective, criterion-referenced marking rubrics for a question.",
      icon: Award,
      onClick: () => setActiveTab("rubric"),
    },
    {
      title: "Cohort Class Digest",
      description: "Synthesize real statistical aggregates into actionable intervention insights.",
      icon: BarChart2,
      onClick: () => setActiveTab("digest"),
    },
  ];

  // 5 Grounded Module Tabs
  const moduleTabs = [
    { id: "chat", label: "Assistant Chat", icon: Sparkles },
    { id: "questions", label: "Question Generator", icon: Layers },
    { id: "slides", label: "Slide Deck (LU)", icon: BookOpen },
    { id: "rubric", label: "Rubric Assistant", icon: Award },
    { id: "digest", label: "Class Digest", icon: BarChart2 },
  ];

  const renderContextPanel = () => {
    return (
      <div className="space-y-4 p-4 text-left font-sans">
        {/* Active Workspace */}
        <div className="space-y-1.5">
          <Label htmlFor="ws-select" className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider">
            Course Workspace
          </Label>
          <select
            id="ws-select"
            value={selectedWorkspaceId}
            onChange={(e) => setSelectedWorkspaceId(e.target.value)}
            className="w-full h-9 rounded-lg border border-border text-xs px-2.5 bg-background text-foreground outline-none font-medium"
          >
            {loadingWorkspaces ? (
              <option>Loading workspaces...</option>
            ) : workspaces.length === 0 ? (
              <option>No workspaces found</option>
            ) : (
              workspaces.map((ws) => (
                <option key={ws.id} value={ws.id}>
                  {ws.code} - {ws.title}
                </option>
              ))
            )}
          </select>

          {loadingWorkspaceDetail ? (
            <div className="text-[10px] text-muted-foreground py-1.5 animate-pulse font-medium">Syncing course details...</div>
          ) : activeWorkspaceDetail ? (
            <div className="p-3 bg-muted/30 border border-border/60 rounded-xl text-[10px] font-medium space-y-1.5 text-muted-foreground">
              <div className="flex justify-between">
                <span>Institution:</span>
                <span className="text-foreground font-semibold truncate max-w-[160px]">
                  {activeWorkspaceDetail.institution_name}
                </span>
              </div>
              {activeWorkspaceDetail.department_name && (
                <div className="flex justify-between">
                  <span>Department:</span>
                  <span className="text-foreground font-semibold truncate max-w-[160px]">
                    {activeWorkspaceDetail.department_name}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Class Group:</span>
                <span className="text-foreground font-semibold">{activeWorkspaceDetail.class_name}</span>
              </div>
              <div className="flex justify-between">
                <span>Enrolled Students:</span>
                <span className="text-foreground font-semibold">{activeWorkspaceDetail.student_count}</span>
              </div>
              <div className="flex justify-between">
                <span>Performance Avg:</span>
                <span className="text-primary font-bold">{activeWorkspaceDetail.performance_avg}%</span>
              </div>
            </div>
          ) : null}
        </div>

        <Separator className="bg-border/50" />

        {/* Handout References */}
        {workspaceMaterials.length > 0 && (
          <div className="space-y-2">
            <Label className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider">
              Workspace Handouts ({workspaceMaterials.length})
            </Label>
            <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1 border border-border/60 rounded-xl p-2.5 bg-background narrow-scrollbar-dark">
              {workspaceMaterials.map((mat) => (
                <label
                  key={mat.id}
                  className="flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer truncate"
                  title={mat.display_name || mat.original_filename}
                >
                  <input
                    type="checkbox"
                    checked={selectedMaterials.includes(mat.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedMaterials([...selectedMaterials, mat.id]);
                      } else {
                        setSelectedMaterials(selectedMaterials.filter((id) => id !== mat.id));
                      }
                    }}
                    className="rounded border-border text-primary focus:ring-primary size-3.5"
                  />
                  <span className="truncate">{mat.display_name || mat.original_filename}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        <Separator className="bg-border/50" />

        {/* Session History */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider">Recent Sessions</Label>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md"
              onClick={() => startNewSession("chat")}
              title="New Session"
            >
              <Plus className="size-3.5" />
            </Button>
          </div>

          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1 narrow-scrollbar-dark">
            <SessionList
              sessions={sortedSessions}
              currentSessionId={currentSessionId}
              pinnedIds={pinnedSessionIds}
              onOpen={loadSession}
              onTogglePin={togglePinSession}
              onDelete={setSessionToDelete}
              emptyText="No saved sessions yet."
            />
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        "h-[calc(100vh-4rem)] flex flex-col -m-4 md:-m-6 overflow-hidden bg-background",
        isFullScreen && "fixed inset-0 z-[9999] h-screen w-screen p-0 m-0 bg-background"
      )}
    >
      {/* ── Mobile Floating Menu Trigger ── */}
      <button
        type="button"
        onClick={() => setIsMobileMenuOpen(true)}
        className="md:hidden absolute left-3 top-3 z-30 size-8 rounded-xl bg-card/90 backdrop-blur-md border border-border/80 shadow-md flex items-center justify-center text-foreground hover:bg-muted transition-all cursor-pointer"
        title="Open navigation modules"
      >
        <Menu className="size-4" />
      </button>

      {/* Main Viewport */}
      <div className="flex-1 flex flex-row overflow-hidden min-h-0 relative">
        {/* ── Desktop & Tablet Collapsible Rail ── */}
        <aside
          className={cn(
            "hidden md:flex flex-col border-r border-border/40 bg-muted/15 transition-all duration-300 ease-in-out shrink-0 z-20 h-full overflow-hidden",
            isSidebarCollapsed ? "w-14 lg:w-16" : "w-[260px] sm:w-[280px]"
          )}
        >
          {!isSidebarCollapsed ? (
            /* ── Expanded Sidebar Content ── */
            <div className="flex flex-col h-full w-[260px] sm:w-[280px]">
              {/* Rail Header with Back to Dashboard & Collapse */}
              <div className="p-2.5 sm:p-3 border-b border-border/40 flex items-center justify-between shrink-0">
                <Link
                  href="/lecturer/dashboard"
                  className="flex items-center gap-1.5 px-2 py-1 rounded-xl hover:bg-muted text-xs font-semibold text-muted-foreground hover:text-foreground transition-all group"
                  title="Back to Lecturer Dashboard"
                >
                  <ArrowLeft className="size-3.5 transition-transform group-hover:-translate-x-0.5" />
                  <span>Dashboard</span>
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsSidebarCollapsed(true)}
                  className="size-7 rounded-xl text-muted-foreground hover:text-foreground"
                  title="Collapse sidebar"
                >
                  <PanelLeftClose className="size-4" />
                </Button>
              </div>

              {/* New Session Action */}
              <div className="p-2 border-b border-border/30 shrink-0">
                <Button
                  onClick={() => startNewSession("chat")}
                  className="w-full h-8 gap-2 text-xs font-bold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 shadow-2xs"
                  type="button"
                >
                  <Plus className="size-3.5" />
                  <span>New Session</span>
                </Button>
              </div>

              {/* Active Course Workspace Picker Pill */}
              <div className="p-2 border-b border-border/30 shrink-0">
                <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-1 pb-1">
                  Active Course Workspace
                </div>
                <button
                  type="button"
                  onClick={() => setIsContextSheetOpen(true)}
                  className="w-full flex items-center justify-between p-2 rounded-lg border border-border/60 bg-background/60 hover:bg-muted/40 transition-colors text-left text-xs font-medium text-foreground group cursor-pointer"
                  title="Click to view course context or switch workspace"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Folder className="size-3.5 text-primary shrink-0" />
                    <span className="truncate text-xs font-semibold">{activeWorkspaceName}</span>
                  </div>
                  <ChevronDown className="size-3 text-muted-foreground shrink-0 group-hover:text-foreground transition-colors" />
                </button>
              </div>

              {/* Module Switcher Tabs */}
              <div className="p-2 border-b border-border/30 shrink-0 space-y-0.5">
                <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-1 pb-1">
                  AI Modules
                </div>
                {moduleTabs.map((tab) => {
                  const Icon = tab.icon;
                  const isTabActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => {
                        setActiveTab(tab.id as AIModule);
                      }}
                      className={cn(
                        "w-full flex items-center gap-2 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-all text-left cursor-pointer",
                        isTabActive
                          ? "bg-primary/10 text-primary font-bold border border-primary/20 shadow-2xs"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                      )}
                    >
                      <Icon className="size-3.5 shrink-0" />
                      <span className="truncate">{tab.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Recent Sessions History (with Pin & Delete) */}
              <div className="flex-1 overflow-y-auto p-2 space-y-1 min-h-0 narrow-scrollbar-dark">
                <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-2 py-1 flex items-center justify-between">
                  <span>Recent Sessions</span>
                  <History className="size-3" />
                </div>

                <SessionList
                  sessions={sortedSessions}
                  currentSessionId={currentSessionId}
                  pinnedIds={pinnedSessionIds}
                  onOpen={loadSession}
                  onTogglePin={togglePinSession}
                  onDelete={setSessionToDelete}
                  emptyText="No session history yet."
                />
              </div>

              {/* Sidebar Footer Action Tools */}
              <div className="p-2 border-t border-border/40 shrink-0 bg-background/50 flex items-center justify-between gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShareModalOpen(true)}
                  className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground gap-1 flex-1 cursor-pointer"
                  title="Share session"
                >
                  <Share2 className="size-3.5" />
                  <span>Share</span>
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setExportModalOpen(true)}
                  className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground gap-1 flex-1 cursor-pointer"
                  title="Export session"
                >
                  <Download className="size-3.5" />
                  <span>Export</span>
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsContextSheetOpen(true)}
                  className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0 rounded-lg cursor-pointer"
                  title="Course Context & Sources"
                >
                  <Folder className="size-3.5 text-primary" />
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0 rounded-lg cursor-pointer"
                  onClick={toggleFullScreen}
                  title={isFullScreen ? "Exit Fullscreen" : "Fullscreen"}
                >
                  {isFullScreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
                </Button>
              </div>
            </div>
          ) : (
            /* ── Collapsed Sidebar Icon Rail ── */
            <div className="flex flex-col h-full items-center py-2.5 justify-between w-full">
              {/* Top Icons */}
              <div className="flex flex-col items-center gap-2 w-full px-1">
                <UITooltipProvider delayDuration={0}>
                  <UITooltip>
                    <UITooltipTrigger asChild>
                      <Link
                        href="/lecturer/dashboard"
                        className="size-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
                      >
                        <ArrowLeft className="size-4" />
                      </Link>
                    </UITooltipTrigger>
                    <UITooltipContent side="right">Back to Dashboard</UITooltipContent>
                  </UITooltip>

                  <UITooltip>
                    <UITooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setIsSidebarCollapsed(false)}
                        className="size-8 rounded-lg text-primary hover:text-primary hover:bg-primary/10 transition-all cursor-pointer"
                      >
                        <PanelLeftOpen className="size-4" />
                      </Button>
                    </UITooltipTrigger>
                    <UITooltipContent side="right">Expand sidebar</UITooltipContent>
                  </UITooltip>

                  <UITooltip>
                    <UITooltipTrigger asChild>
                      <Button
                        size="icon"
                        onClick={() => startNewSession("chat")}
                        className="size-8 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-all cursor-pointer"
                      >
                        <Plus className="size-4" />
                      </Button>
                    </UITooltipTrigger>
                    <UITooltipContent side="right">New Session</UITooltipContent>
                  </UITooltip>

                  <UITooltip>
                    <UITooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setIsContextSheetOpen(true)}
                        className="size-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all cursor-pointer"
                      >
                        <Folder className="size-4 text-primary" />
                      </Button>
                    </UITooltipTrigger>
                    <UITooltipContent side="right">Course Context: {activeWorkspaceName}</UITooltipContent>
                  </UITooltip>
                </UITooltipProvider>

                <Separator className="w-8 my-1 bg-border/40" />

                {/* Module Icons */}
                <UITooltipProvider delayDuration={0}>
                  {moduleTabs.map((tab) => {
                    const Icon = tab.icon;
                    const isTabActive = activeTab === tab.id;
                    return (
                      <UITooltip key={tab.id}>
                        <UITooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => {
                              setActiveTab(tab.id as AIModule);
                            }}
                            className={cn(
                              "size-8 rounded-lg flex items-center justify-center transition-all cursor-pointer",
                              isTabActive
                                ? "bg-primary text-primary-foreground shadow-2xs"
                                : "text-muted-foreground hover:text-foreground hover:bg-muted"
                            )}
                          >
                            <Icon className="size-4" />
                          </button>
                        </UITooltipTrigger>
                        <UITooltipContent side="right">{tab.label}</UITooltipContent>
                      </UITooltip>
                    );
                  })}
                </UITooltipProvider>
              </div>

              {/* Bottom Action Icons */}
              <div className="flex flex-col items-center gap-1.5 w-full px-1">
                <Separator className="w-8 my-1 bg-border/40" />
                <UITooltipProvider delayDuration={0}>
                  <UITooltip>
                    <UITooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setShareModalOpen(true)}
                        className="size-8 rounded-lg text-muted-foreground hover:text-foreground cursor-pointer"
                      >
                        <Share2 className="size-4" />
                      </Button>
                    </UITooltipTrigger>
                    <UITooltipContent side="right">Share session</UITooltipContent>
                  </UITooltip>

                  <UITooltip>
                    <UITooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setExportModalOpen(true)}
                        className="size-8 rounded-lg text-muted-foreground hover:text-foreground cursor-pointer"
                      >
                        <Download className="size-4" />
                      </Button>
                    </UITooltipTrigger>
                    <UITooltipContent side="right">Export session</UITooltipContent>
                  </UITooltip>

                  <UITooltip>
                    <UITooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={toggleFullScreen}
                        className="size-8 rounded-lg text-muted-foreground hover:text-foreground cursor-pointer"
                      >
                        {isFullScreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
                      </Button>
                    </UITooltipTrigger>
                    <UITooltipContent side="right">{isFullScreen ? "Exit Fullscreen" : "Fullscreen"}</UITooltipContent>
                  </UITooltip>
                </UITooltipProvider>
              </div>
            </div>
          )}
        </aside>

        {/* Mobile Navigation Drawer */}
        <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
          <SheetContent side="left" portalContainer={containerRef.current} className="w-[280px] p-0 flex flex-col narrow-scrollbar-dark">
            <SheetHeader className="p-3 border-b border-border/40 text-left">
              <div className="flex items-center justify-between">
                <Link
                  href="/lecturer/dashboard"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-xl hover:bg-muted text-xs font-semibold text-muted-foreground hover:text-foreground transition-all group"
                >
                  <ArrowLeft className="size-3.5 transition-transform group-hover:-translate-x-0.5" />
                  <span>Dashboard</span>
                </Link>
                <div className="size-7 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Sparkles className="size-3.5 text-primary" />
                </div>
              </div>
              <SheetTitle className="text-sm font-semibold pt-1">
                Academic Copilot
              </SheetTitle>
              <SheetDescription className="text-xs text-muted-foreground">
                Grounded teaching and assessment assistant.
              </SheetDescription>
            </SheetHeader>

            {/* Mobile Actions */}
            <div className="p-2 border-b border-border/30">
              <Button
                onClick={() => {
                  startNewSession("chat");
                  setIsMobileMenuOpen(false);
                }}
                className="w-full h-8 gap-2 text-xs font-bold rounded-lg bg-primary text-primary-foreground"
                type="button"
              >
                <Plus className="size-3.5" />
                <span>New Session</span>
              </Button>
            </div>

            {/* Mobile Module list */}
            <div className="p-2 border-b border-border/30 space-y-0.5">
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-1 pb-1">
                Modules
              </div>
              {moduleTabs.map((tab) => {
                const Icon = tab.icon;
                const isTabActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setActiveTab(tab.id as AIModule);
                      setIsMobileMenuOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-lg transition-all text-left",
                      isTabActive
                        ? "bg-primary/10 text-primary font-bold border border-primary/20"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Mobile Recent Sessions */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1 min-h-0 narrow-scrollbar-dark">
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-2 py-1 flex items-center justify-between">
                <span>Recent Sessions</span>
                <History className="size-3" />
              </div>
              <SessionList
                sessions={sortedSessions}
                currentSessionId={currentSessionId}
                pinnedIds={pinnedSessionIds}
                onOpen={(session) => {
                  loadSession(session);
                  setIsMobileMenuOpen(false);
                }}
                onTogglePin={togglePinSession}
                onDelete={setSessionToDelete}
                emptyText="No session history yet."
              />
            </div>

            {/* Mobile Footer Tools */}
            <div className="p-2 border-t border-border/40 bg-background/50 flex items-center justify-between gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShareModalOpen(true);
                  setIsMobileMenuOpen(false);
                }}
                className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground gap-1 flex-1"
              >
                <Share2 className="size-3.5" />
                <span>Share</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setExportModalOpen(true);
                  setIsMobileMenuOpen(false);
                }}
                className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground gap-1 flex-1"
              >
                <Download className="size-3.5" />
                <span>Export</span>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setIsContextSheetOpen(true);
                  setIsMobileMenuOpen(false);
                }}
                className="size-8"
              >
                <Folder className="size-3.5 text-primary" />
              </Button>
            </div>
          </SheetContent>
        </Sheet>

        {/* Right Main Content Area (5 Grounded Tools) */}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-background">
          {/* TOOL 1: General Assistant Chat */}
          {activeTab === "chat" && (
            <div className="flex-1 flex flex-col min-h-0 relative overflow-hidden">
              <MessageScrollerProvider scrollPreviousItemPeek={64} scrollMargin={24}>
                <div className="flex-1 relative min-h-0 overflow-hidden flex flex-col">
                  {history.length === 0 && !isGenerating ? (
                    /* ── New Session View: Centered Input & Inspiring Teaching Reminder ── */
                    <div className="flex-1 overflow-y-auto flex flex-col justify-center items-center p-4 sm:p-6 md:p-8 narrow-scrollbar-dark">
                      <div className="w-full max-w-2xl lg:max-w-3xl flex flex-col items-center text-center space-y-4 my-auto animate-in fade-in-50 duration-300">
                        <div className="size-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-2xs border border-primary/20">
                          <Sparkles className="size-6" />
                        </div>
                        <div className="space-y-1.5 max-w-lg">
                          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight text-foreground">
                            What would you like to prepare today?
                          </h1>
                          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                            Your dedicated academic copilot to design curriculum assessments, generate pedagogical lecture slides, draft criterion-referenced rubrics, and synthesize student mastery.
                          </p>
                        </div>

                        {/* Floating Center AI Input */}
                        <div className="w-full pt-2">
                          <AIChatInput
                            key={draftSeed.nonce}
                            initialValue={draftSeed.text}
                            onSend={handleChatSendMessage}
                            isGenerating={isGenerating}
                            onStop={handleStopGenerating}
                            attachments={attachments}
                            setAttachments={setAttachments}
                            disabled={isRwandaBlocked}
                            placeholder={
                              isRwandaBlocked
                                ? "AI Assistant disabled for Kinyarwanda workspaces"
                                : "Ask about curriculum design, exam questions, teaching methods..."
                            }
                          />
                        </div>

                        {/* Suggested Start Buttons Directly Below Input */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full pt-1">
                          {essentialQuickActions.map((act, idx) => {
                            const Icon = act.icon;
                            return (
                              <button
                                key={idx}
                                onClick={act.onClick}
                                className="p-3 text-left border rounded-xl text-xs hover:bg-muted/40 transition-colors font-medium space-y-1 bg-card shadow-2xs border-border/60 group cursor-pointer"
                              >
                                <div className="flex items-center gap-1.5 text-primary font-bold text-[11px] uppercase tracking-wide group-hover:underline">
                                  <Icon className="size-3.5 shrink-0" />
                                  <span>{act.title}</span>
                                </div>
                                <div className="text-muted-foreground text-[11px] truncate">
                                  {act.description}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* ── Dialogue Mode: Full-Width Stream + Floating Bottom Composer ── */
                    <div className="flex-1 min-h-0 flex flex-col relative overflow-hidden">
                      <MessageScroller className="h-full">
                        <MessageScrollerViewport className="scroll-fade narrow-scrollbar-dark">
                          <MessageScrollerContent
                            aria-busy={isGenerating}
                            className="max-w-4xl lg:max-w-5xl 2xl:max-w-6xl mx-auto py-4 px-3 sm:px-6 md:px-8 space-y-4 pb-36"
                          >
                            {history.map((msg, index) => {
                              const isLatestUserTurn =
                                msg.role === "user" &&
                                (index === history.length - 1 || index === history.length - 2);

                              return (
                                <MessageScrollerItem
                                  key={index}
                                  scrollAnchor={isLatestUserTurn}
                                  className="w-full"
                                >
                                  {msg.role === "user" ? (
                                    <div className="flex flex-col items-end max-w-[85%] sm:max-w-[80%] ml-auto group space-y-1">
                                      <div className="bg-primary text-primary-foreground px-4 py-2.5 rounded-2xl rounded-tr-xs shadow-2xs text-xs sm:text-sm font-medium leading-relaxed">
                                        {msg.attachments && msg.attachments.length > 0 && (
                                          <div className="flex flex-wrap gap-1.5 pb-1.5">
                                            {msg.attachments.map((att: any, aIdx: number) => (
                                              <div
                                                key={aIdx}
                                                className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg border border-primary-foreground/30 bg-primary-foreground/15 text-primary-foreground text-[11px] font-medium"
                                              >
                                                <FileText className="size-3 shrink-0" />
                                                <span className="truncate max-w-[160px]">{att.name}</span>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                        {msg.content && <div className="whitespace-pre-wrap">{msg.content}</div>}
                                      </div>

                                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground pr-1">
                                        <button
                                          type="button"
                                          onClick={() => handleCopyText(msg.content, `user-copy-${index}`)}
                                          className="p-1 hover:text-foreground text-muted-foreground/80 hover:bg-muted/50 rounded transition-colors"
                                          title="Copy prompt"
                                        >
                                          {copiedActionId === `user-copy-${index}` ? (
                                            <Check className="size-3 text-emerald-500" />
                                          ) : (
                                            <Copy className="size-3" />
                                          )}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleEditUserMessage(msg.content)}
                                          className="p-1 hover:text-foreground text-muted-foreground/80 hover:bg-muted/50 rounded transition-colors"
                                          title="Edit prompt in composer"
                                        >
                                          <Edit2 className="size-3" />
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="group relative flex flex-col max-w-[92%] sm:max-w-[88%] space-y-2 p-3.5 sm:p-4 rounded-2xl bg-card border border-border/70 text-foreground mr-auto rounded-tl-xs text-left shadow-2xs leading-relaxed whitespace-pre-wrap animate-in fade-in slide-in-from-bottom-2 duration-300">
                                      <RichMessageRenderer content={msg.content} citations={msg.citations} />
                                      {msg.fallbackUsed && (
                                        <p className="text-[11px] text-muted-foreground italic">
                                          No matching course material was found, so this answer comes from general knowledge.
                                        </p>
                                      )}

                                      <div className="pt-2 border-t border-border/30 flex items-center justify-between text-muted-foreground">
                                        <div className="flex items-center gap-1">
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleCopyText(msg.content, `ai-copy-${index}`)}
                                            className="h-6 px-2 text-[10px] gap-1 text-muted-foreground hover:text-foreground rounded-lg"
                                          >
                                            {copiedActionId === `ai-copy-${index}` ? (
                                              <>
                                                <Check className="size-3 text-emerald-500" />
                                                <span>Copied</span>
                                              </>
                                            ) : (
                                              <>
                                                <Copy className="size-3" />
                                                <span>Copy</span>
                                              </>
                                            )}
                                          </Button>
                                          {index === history.length - 1 && (
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              onClick={() => handleRegenerateFrom(index - 1)}
                                              className="h-6 px-2 text-[10px] gap-1 text-muted-foreground hover:text-foreground rounded-lg"
                                              title="Regenerate explanation"
                                            >
                                              <RotateCcw className="size-3" />
                                              <span>Try Again</span>
                                            </Button>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </MessageScrollerItem>
                              );
                            })}

                            {isGenerating && (
                              <div className="py-2 mr-auto max-w-[95%] sm:max-w-[90%]">
                                <Marker role="status" className="bg-card border border-border/70 rounded-2xl p-3 shadow-2xs">
                                  <MarkerIcon>
                                    <Spinner />
                                  </MarkerIcon>
                                  <MarkerContent className="shimmer text-xs font-medium">
                                    AI Copilot is formulating curriculum explanation...
                                  </MarkerContent>
                                </Marker>
                              </div>
                            )}
                          </MessageScrollerContent>
                        </MessageScrollerViewport>
                        <MessageScrollerButton className="bottom-24 sm:bottom-28 right-4 sm:right-6 md:right-8" />
                      </MessageScroller>

                      {/* Gradient Scrim */}
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-background via-background/80 to-transparent z-10" />

                      {/* Floating Bottom Composer */}
                      <div className="absolute inset-x-0 bottom-0 pointer-events-none p-3 sm:p-4 md:p-5 z-20">
                        <div className="max-w-4xl lg:max-w-5xl 2xl:max-w-6xl mx-auto w-full pointer-events-auto space-y-1.5">
                          {isRwandaBlocked && (
                            <div className="p-3 mb-2 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200 text-xs flex items-start gap-2 shadow-lg backdrop-blur-md">
                              <AlertTriangle className="size-4 text-amber-600 shrink-0 mt-0.5" />
                              <div>
                                <strong className="block font-semibold">AI Assistant Disabled for Kinyarwanda</strong>
                                <span className="opacity-90">
                                  Per institutional policies, automated AI support is disabled for Kinyarwanda workspaces.
                                </span>
                              </div>
                            </div>
                          )}
                          <AIChatInput
                            key={draftSeed.nonce}
                            initialValue={draftSeed.text}
                            onSend={handleChatSendMessage}
                            isGenerating={isGenerating}
                            onStop={handleStopGenerating}
                            attachments={attachments}
                            setAttachments={setAttachments}
                            disabled={isRwandaBlocked}
                            placeholder={
                              isRwandaBlocked
                                ? "AI Assistant disabled for Kinyarwanda workspaces"
                                : "Ask about curriculum design, exam questions, teaching methods..."
                            }
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </MessageScrollerProvider>
            </div>
          )}
          {/*
            Tools stay mounted once opened and are only hidden while another tab is active, so a
            running generation, its polling and unsaved edits survive switching tabs.
          */}

          {/* TOOL 2: Question Generator */}
          {visitedTabs.has("questions") && (
            <div className={toolPaneClass(activeTab === "questions")}>
              <QuestionGeneratorLauncher
                workspaceId={selectedWorkspaceId}
                workspaceName={activeWorkspaceName}
                language={activeWorkspace?.language || activeWorkspaceDetail?.language || "EN"}
                isRwandaBlocked={isRwandaBlocked}
                onOpenChat={() => setActiveTab("chat")}
              />
            </div>
          )}

          {/* TOOL 3: Slide Deck Generator (From Learning Unit) */}
          {visitedTabs.has("slides") && (
            <div className={toolPaneClass(activeTab === "slides")}>
              <SlideDeckGenerator
                workspaceId={selectedWorkspaceId}
                workspaceName={activeWorkspaceName}
                isRwandaBlocked={isRwandaBlocked}
              />
            </div>
          )}

          {/* TOOL 4: Rubric Assistant */}
          {visitedTabs.has("rubric") && (
            <div className={toolPaneClass(activeTab === "rubric")}>
              <RubricAssistant
                workspaceId={selectedWorkspaceId}
                isRwandaBlocked={isRwandaBlocked}
              />
            </div>
          )}

          {/* TOOL 5: Class Digest */}
          {visitedTabs.has("digest") && (
            <div className={toolPaneClass(activeTab === "digest")}>
              <ClassDigest workspaceId={selectedWorkspaceId} />
            </div>
          )}
        </main>
      </div>

      {/* Context Panel Drawer */}
      <Sheet open={isContextSheetOpen} onOpenChange={setIsContextSheetOpen}>
        <SheetContent side="right" portalContainer={containerRef.current} className="w-full sm:max-w-md p-0 overflow-y-auto">
          <SheetHeader className="p-4 border-b border-border/40 text-left">
            <SheetTitle className="text-sm font-semibold flex items-center gap-1.5">
              <Folder className="size-4 text-primary" /> Course Context & Sources
            </SheetTitle>
            <SheetDescription className="text-xs text-muted-foreground">
              Select the active teaching workspace and choose reference handouts for RAG grounding.
            </SheetDescription>
          </SheetHeader>
          {renderContextPanel()}
        </SheetContent>
      </Sheet>

      {/* Delete Confirmation Modal */}
      <Dialog open={!!sessionToDelete} onOpenChange={(open) => !open && setSessionToDelete(null)}>
        <DialogContent portalContainer={containerRef.current} className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Delete AI Session</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Are you sure you want to delete this session? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => setSessionToDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" onClick={confirmDeleteSession}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Share Modal */}
      <Dialog open={shareModalOpen} onOpenChange={setShareModalOpen}>
        <DialogContent portalContainer={containerRef.current} className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold flex items-center gap-2">
              <Share2 className="size-4 text-primary" /> Share this conversation
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Conversations are stored in your own browser, so a link can&apos;t open them for someone else.
              Copy the text to send it to a colleague.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Button
              size="sm"
              disabled={history.length === 0}
              onClick={() => {
                navigator.clipboard.writeText(buildTranscript(history));
                toast.success("Conversation copied to clipboard!");
              }}
              className="h-8.5 w-full px-3 text-xs"
            >
              <Copy className="size-3.5 mr-1" />
              {history.length === 0 ? "Nothing to copy yet" : "Copy conversation as text"}
            </Button>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Page link (does not include the conversation)</Label>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={typeof window !== "undefined" ? window.location.href : ""}
                  className="h-8.5 text-xs bg-muted/30 select-all"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (typeof window !== "undefined") {
                      navigator.clipboard.writeText(window.location.href);
                      toast.success("Link copied to clipboard!");
                    }
                  }}
                  className="h-8.5 px-3 text-xs"
                >
                  <Copy className="size-3.5 mr-1" /> Copy
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShareModalOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Export Modal */}
      <Dialog open={exportModalOpen} onOpenChange={setExportModalOpen}>
        <DialogContent portalContainer={containerRef.current} className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold flex items-center gap-2">
              <Download className="size-4 text-primary" /> Export AI Output
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Save your generated assessment items, rubrics, or chat history in your preferred format.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-2.5 py-2">
            <Button
              variant="outline"
              className="justify-start h-12 px-3 gap-3 border-border/70 hover:bg-muted/50"
              onClick={handleExportMarkdown}
            >
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                <FileCode className="size-4" />
              </div>
              <div className="text-left">
                <div className="text-xs font-semibold">Markdown Document (.md)</div>
                <div className="text-[11px] text-muted-foreground">Formatted with markdown headings and code blocks</div>
              </div>
            </Button>
            <Button
              variant="outline"
              className="justify-start h-12 px-3 gap-3 border-border/70 hover:bg-muted/50"
              onClick={handleExportPlainText}
            >
              <div className="p-2 rounded-lg bg-muted text-foreground">
                <FileText className="size-4" />
              </div>
              <div className="text-left">
                <div className="text-xs font-semibold">Plain Text File (.txt)</div>
                <div className="text-[11px] text-muted-foreground">Clean, unformatted text for general notes</div>
              </div>
            </Button>
            <Button
              variant="outline"
              className="justify-start h-12 px-3 gap-3 border-border/70 hover:bg-muted/50"
              onClick={handleExportPDF}
            >
              <div className="p-2 rounded-lg bg-muted text-foreground">
                <Printer className="size-4" />
              </div>
              <div className="text-left">
                <div className="text-xs font-semibold">Print / Save as PDF (.pdf)</div>
                <div className="text-[11px] text-muted-foreground">Formatted document ready for print or saving as PDF</div>
              </div>
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setExportModalOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function LecturerAIAssistant() {
  return (
    <Suspense
      fallback={
        <div className="p-4 sm:p-6 space-y-4 max-w-4xl mx-auto">
          <div className="h-8 w-48 bg-muted rounded-lg animate-pulse" />
          <div className="h-[500px] w-full bg-muted/30 rounded-2xl animate-pulse" />
        </div>
      }
    >
      <LecturerAIAssistantContent />
    </Suspense>
  );
}
