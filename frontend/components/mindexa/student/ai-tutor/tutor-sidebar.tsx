"use client";

import Link from "next/link";
import {
  ArrowLeft,
  BookOpen,
  Download,
  FileText,
  History,
  Maximize2,
  Minimize2,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Share2,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type TutorTab = "support" | "revision";

interface TutorSidebarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeTab: TutorTab;
  onTabChange: (tab: TutorTab) => void;
  onNewChat: () => void;
  /** The scope dropdown and conversation list, shown when the sidebar is expanded. */
  scopePicker: React.ReactNode;
  history: React.ReactNode;
  hasScope: boolean;
  scopeLabel: string | null;
  /** Collapsed rail: open the sidebar with the scope dropdown showing. */
  onOpenScope: () => void;
  canShareOrExport: boolean;
  onShare: () => void;
  onExport: () => void;
  isFullScreen: boolean;
  onToggleFullScreen: () => void;
}

const tabButton = (active: boolean) =>
  cn(
    "flex items-center justify-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold transition-all",
    active ? "bg-background font-bold text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
  );

const railTab = (active: boolean) =>
  cn(
    "size-8 rounded-xl transition-all",
    active ? "bg-primary/10 font-bold text-primary shadow-xs" : "text-muted-foreground hover:text-foreground"
  );

/** Left rail of the tutor: expanded (modes, scope, history, actions) or a collapsed icon rail. */
export function TutorSidebar({
  open,
  onOpenChange,
  activeTab,
  onTabChange,
  onNewChat,
  scopePicker,
  history,
  hasScope,
  scopeLabel,
  onOpenScope,
  canShareOrExport,
  onShare,
  onExport,
  isFullScreen,
  onToggleFullScreen,
}: TutorSidebarProps) {
  const FullScreenIcon = isFullScreen ? Minimize2 : Maximize2;
  const fullScreenTitle = isFullScreen ? "Exit Fullscreen" : "Fullscreen";

  return (
    <aside
      className={cn(
        "z-20 flex h-full shrink-0 flex-col overflow-hidden border-r border-border/40 bg-muted/15 transition-all duration-300 ease-in-out",
        open ? "w-[260px] sm:w-[280px]" : "w-0 border-r-0 sm:w-14 sm:border-r md:w-16"
      )}
    >
      {open ? (
        <div className="flex h-full w-[260px] flex-col sm:w-[280px]">
          <div className="flex shrink-0 items-center justify-between border-b border-border/40 p-2.5 sm:p-3">
            <Link
              href="/student/study"
              className="group flex items-center gap-1.5 rounded-xl px-2 py-1 text-xs font-semibold text-muted-foreground transition-all hover:bg-muted hover:text-foreground"
              title="Back to Study Planner"
            >
              <ArrowLeft className="size-3.5 transition-transform group-hover:-translate-x-0.5" />
              <span>Study Planner</span>
            </Link>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
              className="size-7 rounded-xl text-muted-foreground hover:text-foreground"
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
            >
              <PanelLeftClose className="size-4" />
            </Button>
          </div>

          <div className="shrink-0 border-b border-border/30 p-2">
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted/50 p-1" role="tablist" aria-label="Tutor mode">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "support"}
                onClick={() => onTabChange("support")}
                className={tabButton(activeTab === "support")}
              >
                <Sparkles className="size-3" />
                Study Chat
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "revision"}
                onClick={() => onTabChange("revision")}
                className={tabButton(activeTab === "revision")}
              >
                <BookOpen className="size-3" />
                Revision
              </button>
            </div>
          </div>

          <div className="shrink-0 border-b border-border/30 p-2">
            <Button
              onClick={onNewChat}
              className="h-8 w-full gap-2 rounded-lg bg-primary text-xs font-bold text-primary-foreground shadow-2xs hover:bg-primary/90"
              type="button"
            >
              <Plus className="size-3.5" />
              <span>New Chat</span>
            </Button>
          </div>

          {scopePicker}

          <div className="narrow-scrollbar-dark min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
            <div className="flex items-center justify-between px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              <span>Recent Conversations</span>
              <History className="size-3" />
            </div>
            {history}
          </div>

          <div className="shrink-0 border-t border-border/40 bg-muted/10 p-2 sm:p-2.5">
            <div className="flex items-center justify-between gap-1">
              <Button
                variant="ghost"
                size="sm"
                disabled={!canShareOrExport}
                onClick={onShare}
                className="h-8 flex-1 justify-center gap-1.5 rounded-xl px-2 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
              >
                <Share2 className="size-3.5 text-primary" />
                <span className="text-[11px] font-medium">Share</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={!canShareOrExport}
                onClick={onExport}
                className="h-8 flex-1 justify-center gap-1.5 rounded-xl px-2 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
              >
                <Download className="size-3.5" />
                <span className="text-[11px] font-medium">Export</span>
              </Button>
              <Button
                variant={isFullScreen ? "default" : "ghost"}
                size="icon"
                onClick={onToggleFullScreen}
                className="size-8 shrink-0 rounded-xl text-muted-foreground hover:text-foreground"
                aria-label={fullScreenTitle}
                title={fullScreenTitle}
              >
                <FullScreenIcon className="size-3.5" />
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="hidden h-full w-14 shrink-0 flex-col items-center justify-between py-2.5 sm:flex md:w-16">
          <div className="flex flex-col items-center gap-1.5">
            <Link
              href="/student/study"
              className="flex size-8 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Back to Study Planner"
              title="Back to Study Planner"
            >
              <ArrowLeft className="size-4" />
            </Link>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(true)}
              className="size-8 rounded-xl text-muted-foreground hover:text-foreground"
              aria-label="Expand sidebar"
              title="Expand sidebar"
            >
              <PanelLeftOpen className="size-4" />
            </Button>
          </div>

          <div className="flex flex-col items-center gap-2">
            <Button
              onClick={onNewChat}
              size="icon"
              className="size-8 rounded-xl bg-primary text-primary-foreground shadow-2xs hover:bg-primary/90"
              aria-label="New Chat"
              title="New Chat"
            >
              <Plus className="size-4" />
            </Button>

            <div className="flex w-8 flex-col items-center gap-1 border-t border-border/40 pt-1">
              <Button
                variant={activeTab === "support" ? "secondary" : "ghost"}
                size="icon"
                onClick={() => onTabChange("support")}
                className={railTab(activeTab === "support")}
                aria-label="Study Support Chat"
                title="Study Support Chat"
              >
                <Sparkles className="size-4" />
              </Button>
              <Button
                variant={activeTab === "revision" ? "secondary" : "ghost"}
                size="icon"
                onClick={() => onTabChange("revision")}
                className={railTab(activeTab === "revision")}
                aria-label="Curriculum Revision Center"
                title="Curriculum Revision Center"
              >
                <BookOpen className="size-4" />
              </Button>
            </div>

            <Button
              variant="ghost"
              size="icon"
              onClick={onOpenScope}
              className={cn(
                "mt-1 size-8 rounded-xl",
                hasScope ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
              )}
              aria-label={`Active scope: ${scopeLabel || "General Knowledge"}`}
              title={`Active Scope: ${scopeLabel || "General Knowledge"}`}
            >
              <FileText className="size-4" />
            </Button>
          </div>

          <div className="flex w-full flex-col items-center gap-1.5 border-t border-border/40 px-2 pt-2">
            <Button
              variant="ghost"
              size="icon"
              disabled={!canShareOrExport}
              onClick={onShare}
              className="size-8 rounded-xl text-muted-foreground hover:text-foreground disabled:opacity-40"
              aria-label="Share conversation"
              title="Share conversation"
            >
              <Share2 className="size-3.5 text-primary" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              disabled={!canShareOrExport}
              onClick={onExport}
              className="size-8 rounded-xl text-muted-foreground hover:text-foreground disabled:opacity-40"
              aria-label="Export conversation"
              title="Export conversation"
            >
              <Download className="size-3.5" />
            </Button>
            <Button
              variant={isFullScreen ? "default" : "ghost"}
              size="icon"
              onClick={onToggleFullScreen}
              className="size-8 rounded-xl text-muted-foreground hover:text-foreground"
              aria-label={fullScreenTitle}
              title={fullScreenTitle}
            >
              <FullScreenIcon className="size-3.5" />
            </Button>
          </div>
        </div>
      )}
    </aside>
  );
}
