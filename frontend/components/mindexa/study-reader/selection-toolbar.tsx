// frontend/components/mindexa/study-reader/selection-toolbar.tsx
"use client";

import React, { useState } from "react";
import {
  AnnotationColor,
  SelectionRangeInfo,
} from "./types";
import {
  Sparkles,
  BookmarkPlus,
  StickyNote,
  X,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface SelectionToolbarProps {
  selection: SelectionRangeInfo;
  onHighlight: (color: AnnotationColor, noteText?: string) => void;
  onAddKeyPoint: (title: string, quote: string, pageNumber: number) => void;
  onAskAi: (selectedText: string, pageNumber: number) => void;
  onClose: () => void;
}

const HIGHLIGHT_COLORS: Array<{
  color: AnnotationColor;
  label: string;
  dotClass: string;
  bgClass: string;
}> = [
  { color: "key_idea", label: "Key Idea", dotClass: "bg-amber-400", bgClass: "hover:bg-amber-400/20" },
  { color: "definition", label: "Definition", dotClass: "bg-sky-400", bgClass: "hover:bg-sky-400/20" },
  { color: "example", label: "Example", dotClass: "bg-emerald-400", bgClass: "hover:bg-emerald-400/20" },
  { color: "confused", label: "Unclear / Confused", dotClass: "bg-rose-400", bgClass: "hover:bg-rose-400/20" },
];

export function SelectionToolbar({
  selection,
  onHighlight,
  onAddKeyPoint,
  onAskAi,
  onClose,
}: SelectionToolbarProps) {
  const [isNoteInputOpen, setIsNoteInputOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [selectedColor, setSelectedColor] = useState<AnnotationColor>("key_idea");

  const [isKeyPointInputOpen, setIsKeyPointInputOpen] = useState(false);
  const [keyPointTitle, setKeyPointTitle] = useState(
    selection.text.slice(0, 40) + (selection.text.length > 40 ? "…" : "")
  );

  const handleColorClick = (color: AnnotationColor) => {
    setSelectedColor(color);
    if (!isNoteInputOpen) {
      onHighlight(color);
    }
  };

  const handleSaveNote = (e: React.FormEvent) => {
    e.preventDefault();
    onHighlight(selectedColor, noteText);
  };

  const handleSaveKeyPoint = (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyPointTitle.trim()) return;
    onAddKeyPoint(keyPointTitle.trim(), selection.text, selection.pageNumber);
    onClose();
  };

  // Auto-dismiss toolbar on window resize or orientation change
  React.useEffect(() => {
    const handleDismiss = () => {
      onClose();
    };

    window.addEventListener("resize", handleDismiss, { passive: true });
    window.addEventListener("orientationchange", handleDismiss, {
      passive: true,
    });
    return () => {
      window.removeEventListener("resize", handleDismiss);
      window.removeEventListener("orientationchange", handleDismiss);
    };
  }, [onClose]);

  // Position toolbar right above selection (or below if near top of window)
  const isNearTop = selection.boundingRect.top < 120;
  const topPos = isNearTop
    ? Math.min(
        window.innerHeight - 100,
        selection.boundingRect.top + selection.boundingRect.height + 8,
      )
    : Math.max(12, selection.boundingRect.top - 48);

  const leftPos = Math.max(
    16,
    Math.min(
      window.innerWidth - 340,
      selection.boundingRect.left + selection.boundingRect.width / 2 - 160,
    ),
  );

  return (
    <div
      className="selection-toolbar fixed z-50 animate-in fade-in zoom-in-95 duration-150"
      style={{ top: `${topPos}px`, left: `${leftPos}px` }}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="bg-card/95 backdrop-blur-md border border-border/70 shadow-2xl rounded-xl p-1.5 flex flex-col gap-1.5 min-w-72">
        {/* Inline Note Drawer Form */}
        {isNoteInputOpen ? (
          <form onSubmit={handleSaveNote} className="flex flex-col gap-2 p-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-muted-foreground">
                Add Note to Highlight
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-5 rounded"
                onClick={() => setIsNoteInputOpen(false)}
              >
                <X className="size-3" />
              </Button>
            </div>
            <Input
              autoFocus
              type="text"
              placeholder="Type your notes or question…"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              className="h-8 text-xs bg-muted/40 rounded-lg"
            />
            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-1">
                {HIGHLIGHT_COLORS.map((c) => (
                  <button
                    key={c.color}
                    type="button"
                    onClick={() => setSelectedColor(c.color)}
                    className={cn(
                      "size-5 rounded-full flex items-center justify-center transition-transform",
                      c.dotClass,
                      selectedColor === c.color && "ring-2 ring-foreground scale-110"
                    )}
                    title={c.label}
                  >
                    {selectedColor === c.color && <Check className="size-3 text-black" />}
                  </button>
                ))}
              </div>
              <Button type="submit" size="sm" className="h-7 text-xs font-semibold px-3 rounded-lg">
                Save
              </Button>
            </div>
          </form>
        ) : isKeyPointInputOpen ? (
          /* Inline Key Point Drawer Form */
          <form onSubmit={handleSaveKeyPoint} className="flex flex-col gap-2 p-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-muted-foreground">
                New Key Takeaway (p. {selection.pageNumber})
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-5 rounded"
                onClick={() => setIsKeyPointInputOpen(false)}
              >
                <X className="size-3" />
              </Button>
            </div>
            <Input
              autoFocus
              type="text"
              placeholder="Key concept title in your words…"
              value={keyPointTitle}
              onChange={(e) => setKeyPointTitle(e.target.value)}
              className="h-8 text-xs bg-muted/40 rounded-lg"
            />
            <div className="flex justify-end pt-1">
              <Button type="submit" size="sm" className="h-7 text-xs font-semibold px-3 rounded-lg">
                Save Key Point
              </Button>
            </div>
          </form>
        ) : (
          /* Primary Toolbar Bar */
          <div className="flex items-center gap-1">
            {/* Highlight color bubbles */}
            <div className="flex items-center gap-1 pr-1.5 border-r border-border/50">
              {HIGHLIGHT_COLORS.map((c) => (
                <button
                  key={c.color}
                  type="button"
                  onClick={() => handleColorClick(c.color)}
                  className={cn(
                    "size-6 rounded-full flex items-center justify-center transition-all hover:scale-115 active:scale-95 shadow-xs",
                    c.dotClass
                  )}
                  title={`Highlight as ${c.label}`}
                />
              ))}
            </div>

            {/* Note action */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs gap-1 text-foreground/80 hover:text-foreground rounded-lg"
              onClick={() => setIsNoteInputOpen(true)}
              title="Add note"
            >
              <StickyNote className="size-3.5" />
              <span className="hidden sm:inline">Note</span>
            </Button>

            {/* Key point action */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs gap-1 text-foreground/80 hover:text-foreground rounded-lg"
              onClick={() => setIsKeyPointInputOpen(true)}
              title="Save as Key Point"
            >
              <BookmarkPlus className="size-3.5" />
              <span className="hidden sm:inline">Key Point</span>
            </Button>

            {/* Ask AI action */}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-7 px-2.5 text-xs font-semibold gap-1.5 text-primary bg-primary/10 hover:bg-primary/20 rounded-lg shadow-none"
              onClick={() => onAskAi(selection.text, selection.pageNumber)}
              title="Ask AI Tutor about this excerpt"
            >
              <Sparkles className="size-3.5" />
              <span>Ask AI</span>
            </Button>

            <div className="w-px h-4 bg-border/50 mx-0.5" />

            {/* Close */}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-6 text-muted-foreground hover:text-foreground rounded-md"
              onClick={onClose}
              title="Dismiss"
            >
              <X className="size-3.5" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
