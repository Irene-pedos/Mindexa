"use client";

import React from "react";
import { FileText } from "lucide-react";
import { SparklesIcon } from "@/components/ui/sparkles-icon";
import { cn } from "@/lib/utils";

export type StudyTool = "notes" | "tutor";

interface StudyToolsBarProps {
  /** The tool whose panel is open, if any. */
  active: StudyTool | null;
  onToggle: (tool: StudyTool) => void;
}

const TOOLS: Array<{ id: StudyTool; label: string; hint: string }> = [
  { id: "notes", label: "My notes", hint: "Write and save notes for this session" },
  { id: "tutor", label: "Ask tutor", hint: "Ask the AI tutor about this section" },
];

/**
 * One labelled control for both study tools, so students can see at a glance that notes and a
 * tutor exist (they used to be two unlabeled icons in opposite corners). Only one panel opens
 * at a time, so they never cover each other on a narrow screen.
 */
export function StudyToolsBar({ active, onToggle }: StudyToolsBarProps) {
  return (
    <div
      role="toolbar"
      aria-label="Study tools"
      className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-40 flex items-center gap-1 rounded-full border border-border/70 bg-card/95 p-1 shadow-md backdrop-blur"
    >
      {TOOLS.map(({ id, label, hint }) => {
        const isActive = active === id;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={isActive}
            title={hint}
            onClick={() => onToggle(id)}
            className={cn(
              "flex h-9 items-center gap-1.5 rounded-full px-3.5 text-xs font-semibold transition-colors cursor-pointer",
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-foreground hover:bg-muted",
            )}
          >
            {id === "notes" ? (
              <FileText className="size-4" />
            ) : (
              <SparklesIcon size={16} className={isActive ? "text-primary-foreground" : "text-primary"} />
            )}
            {label}
          </button>
        );
      })}
    </div>
  );
}
