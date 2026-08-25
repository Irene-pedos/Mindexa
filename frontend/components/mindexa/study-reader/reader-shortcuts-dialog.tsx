// frontend/components/mindexa/study-reader/reader-shortcuts-dialog.tsx
"use client";

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Keyboard,
  Navigation,
  ZoomIn,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface ReaderShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ReaderShortcutsDialog({
  open,
  onOpenChange,
}: ReaderShortcutsDialogProps) {
  const shortcutSections = [
    {
      category: "Navigation & Layout",
      icon: Navigation,
      shortcuts: [
        { label: "Next Page / Spread", keys: ["→", "or", "l", "or", "PageDown"] },
        { label: "Previous Page / Spread", keys: ["←", "or", "h", "or", "PageUp"] },
        { label: "Rotate 90° Clockwise", keys: ["r"] },
        { label: "Distraction-Free Focus Mode", keys: ["f"] },
        { label: "Toggle Fullscreen", keys: ["Shift", "F"] },
      ],
    },
    {
      category: "Zoom & Display",
      icon: ZoomIn,
      shortcuts: [
        { label: "Zoom In (+15%)", keys: ["+"] },
        { label: "Zoom Out (-15%)", keys: ["-"] },
        { label: "Reset Zoom to 100%", keys: ["0"] },
      ],
    },
    {
      category: "Study Rail & AI Tools",
      icon: Sparkles,
      shortcuts: [
        { label: "Weakness Focus Engine", keys: ["1"] },
        { label: "Page Comprehension Quiz", keys: ["2"] },
        { label: "Key Takeaways & Points", keys: ["3"] },
        { label: "Ask AI Study Tutor", keys: ["4"] },
        { label: "Table of Contents Outline", keys: ["5"] },
        { label: "In-Document Text Search", keys: ["6", "or", "Ctrl/Cmd", "F"] },
      ],
    },
    {
      category: "General",
      icon: Keyboard,
      shortcuts: [
        { label: "Show Keyboard Shortcuts", keys: ["?"] },
        { label: "Close Panel / Dialog / Focus", keys: ["Esc"] },
      ],
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-background border border-border/60 rounded-2xl shadow-2xl p-6 text-left font-sans">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Keyboard className="size-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold text-foreground">
                Study Reader Shortcuts
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5 font-normal">
                Speed up your reading, study workflow, and active recall with key bindings.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 my-2 text-xs max-h-[60vh] overflow-y-auto pr-1">
          {shortcutSections.map((sec) => {
            const Icon = sec.icon;
            return (
              <div key={sec.category} className="space-y-2">
                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Icon className="size-3.5 text-primary" />
                  <span>{sec.category}</span>
                </h4>
                <div className="rounded-xl border border-border/50 divide-y divide-border/30 bg-muted/10 overflow-hidden">
                  {sec.shortcuts.map((sc, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-2.5 px-3 hover:bg-muted/20 transition-colors"
                    >
                      <span className="font-medium text-foreground text-xs">
                        {sc.label}
                      </span>
                      <div className="flex items-center gap-1">
                        {sc.keys.map((k, kIdx) =>
                          k === "or" ? (
                            <span
                              key={kIdx}
                              className="text-[10px] text-muted-foreground font-mono px-0.5"
                            >
                              or
                            </span>
                          ) : (
                            <kbd
                              key={kIdx}
                              className="px-1.5 py-0.5 rounded bg-card border border-border/60 font-mono text-[10px] font-semibold text-foreground shadow-2xs"
                            >
                              {k}
                            </kbd>
                          ),
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-border/40">
          <span className="text-[11px] text-muted-foreground">
            Press <kbd className="px-1.5 py-0.5 rounded bg-muted border font-mono text-[10px]">?</kbd> anytime to open
          </span>
          <Button
            size="sm"
            variant="outline"
            className="text-xs h-8 rounded-lg"
            onClick={() => onOpenChange(false)}
          >
            Got it
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
