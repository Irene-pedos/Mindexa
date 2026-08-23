// frontend/components/mindexa/study-reader/key-points-panel.tsx
"use client";

import React, { useState } from "react";
import {
  KeyPointConfidence,
  KeyPointTag,
  StudentKeyPoint,
} from "./types";
import {
  Bookmark,
  Plus,
  Trash2,
  Share2,
  FileDown,
  Copy,
  Check,
  Hash,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface KeyPointsPanelProps {
  keyPoints: StudentKeyPoint[];
  currentPage: number;
  onSelectPage: (page: number) => void;
  onAddKeyPoint: (payload: {
    title: string;
    quote?: string;
    page_number: number;
    tag?: KeyPointTag;
    confidence?: KeyPointConfidence;
  }) => void;
  onUpdateKeyPoint: (id: string, updates: { tag?: KeyPointTag; confidence?: KeyPointConfidence }) => void;
  onDeleteKeyPoint: (id: string) => void;
  onExportRevisionSheet: () => Promise<any>;
}

const CONFIDENCE_CONFIG: Record<
  KeyPointConfidence,
  { label: string; bg: string; text: string; dot: string }
> = {
  got_it: { label: "Got it", bg: "bg-emerald-500/10 border-emerald-500/30", text: "text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500" },
  fuzzy: { label: "Fuzzy", bg: "bg-amber-500/10 border-amber-500/30", text: "text-amber-600 dark:text-amber-400", dot: "bg-amber-500" },
  lost: { label: "Need review", bg: "bg-rose-500/10 border-rose-500/30", text: "text-rose-600 dark:text-rose-400", dot: "bg-rose-500" },
};

const TAG_LABELS: Record<KeyPointTag, string> = {
  definition: "Definition",
  formula: "Formula",
  process: "Process",
  exam_likely: "Exam Likely",
  other: "Concept",
};

export function KeyPointsPanel({
  keyPoints,
  currentPage,
  onSelectPage,
  onAddKeyPoint,
  onUpdateKeyPoint,
  onDeleteKeyPoint,
  onExportRevisionSheet,
}: KeyPointsPanelProps) {
  const [selectedTag, setSelectedTag] = useState<string>("all");
  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newTag, setNewTag] = useState<KeyPointTag>("other");
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);

  const filteredPoints = selectedTag === "all"
    ? keyPoints
    : keyPoints.filter((kp) => kp.tag === selectedTag);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    onAddKeyPoint({
      title: newTitle.trim(),
      page_number: currentPage,
      tag: newTag,
      confidence: "got_it",
    });

    setNewTitle("");
    setIsAdding(false);
  };

  const handleCopyMarkdown = async () => {
    try {
      setExporting(true);
      const res = await onExportRevisionSheet();
      if (res?.markdown) {
        await navigator.clipboard.writeText(res.markdown);
        setCopied(true);
        toast.success("Revision sheet copied to clipboard!");
        setTimeout(() => setCopied(false), 2500);
      }
    } catch {
      toast.error("Failed to export revision sheet");
    } finally {
      setExporting(false);
    }
  };

  const handleDownloadMarkdown = async () => {
    try {
      setExporting(true);
      const res = await onExportRevisionSheet();
      if (res?.markdown) {
        const blob = new Blob([res.markdown], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `revision-sheet-${res.title.toLowerCase().replace(/\s+/g, "-")}.md`;
        document.body.appendChild(a);
        a.click();
        URL.revokeObjectURL(url);
        document.body.removeChild(a);
        toast.success("Revision sheet downloaded!");
      }
    } catch {
      toast.error("Failed to download revision sheet");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex flex-col h-full select-none">
      {/* Header with Export & Add Actions */}
      <div className="p-3 border-b border-border/40 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Bookmark className="size-3.5 text-primary shrink-0" />
          <span className="text-xs font-semibold text-foreground truncate">
            Key Points ({keyPoints.length})
          </span>
        </div>

        <div className="flex items-center gap-1">
          {keyPoints.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-7 rounded-lg border-border/60"
                  title="Export revision sheet"
                  disabled={exporting}
                >
                  <Share2 className="size-3.5 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 p-1">
                <DropdownMenuItem onClick={handleCopyMarkdown} className="text-xs gap-2">
                  {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
                  <span>Copy Markdown</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleDownloadMarkdown} className="text-xs gap-2">
                  <FileDown className="size-3.5" />
                  <span>Download .MD File</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <Button
            size="sm"
            className="h-7 px-2 text-xs font-semibold rounded-lg gap-1"
            onClick={() => setIsAdding((prev) => !prev)}
          >
            <Plus className="size-3.5" />
            <span>Add</span>
          </Button>
        </div>
      </div>

      {/* Quick Add Form */}
      {isAdding && (
        <form onSubmit={handleCreate} className="p-3 bg-muted/30 border-b border-border/40 space-y-2">
          <Input
            autoFocus
            type="text"
            placeholder={`Key concept for page ${currentPage}…`}
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="h-8 text-xs bg-card rounded-lg"
          />
          <div className="flex items-center justify-between gap-1">
            <select
              value={newTag}
              onChange={(e) => setNewTag(e.target.value as KeyPointTag)}
              className="h-7 text-[11px] font-medium bg-card border border-border/60 rounded-md px-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="other">Concept</option>
              <option value="definition">Definition</option>
              <option value="formula">Formula</option>
              <option value="process">Process</option>
              <option value="exam_likely">Exam Likely</option>
            </select>

            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs rounded-lg"
                onClick={() => setIsAdding(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" className="h-7 text-xs font-semibold rounded-lg">
                Save
              </Button>
            </div>
          </div>
        </form>
      )}

      {/* Tag Filters */}
      <div className="px-3 py-2 border-b border-border/30 flex items-center gap-1 overflow-x-auto no-scrollbar">
        {["all", "definition", "formula", "process", "exam_likely"].map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setSelectedTag(t)}
            className={cn(
              "px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap transition-colors",
              selectedTag === t
                ? "bg-primary text-primary-foreground"
                : "bg-muted/60 text-muted-foreground hover:text-foreground"
            )}
          >
            {t === "all" ? "All" : TAG_LABELS[t as KeyPointTag]}
          </button>
        ))}
      </div>

      {/* Key Points List */}
      <ScrollArea className="flex-1 p-2">
        {filteredPoints.length > 0 ? (
          <div className="space-y-2 pb-4">
            {filteredPoints.map((kp) => {
              const conf = CONFIDENCE_CONFIG[kp.confidence] || CONFIDENCE_CONFIG.got_it;
              const isCurrent = kp.page_number === currentPage;

              return (
                <div
                  key={kp.id}
                  className={cn(
                    "p-3 rounded-xl border bg-card/60 transition-all hover:bg-card space-y-2 group shadow-xs",
                    isCurrent ? "border-primary/50 ring-1 ring-primary/20" : "border-border/50"
                  )}
                >
                  {/* Top: Title + Page Jump */}
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-semibold text-foreground leading-snug">
                      {kp.title}
                    </span>

                    <button
                      type="button"
                      onClick={() => onSelectPage(kp.page_number)}
                      className={cn(
                        "text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded shrink-0 flex items-center gap-0.5 transition-colors",
                        isCurrent
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:bg-primary/15 hover:text-primary"
                      )}
                      title={`Jump to Page ${kp.page_number}`}
                    >
                      <Hash className="size-2.5" />
                      <span>{kp.page_number}</span>
                    </button>
                  </div>

                  {/* Quote if present */}
                  {kp.quote && (
                    <p className="text-[11px] text-muted-foreground font-serif italic line-clamp-2 border-l-2 border-primary/30 pl-2">
                      &ldquo;{kp.quote}&rdquo;
                    </p>
                  )}

                  {/* Bottom: Tag + Confidence Dropdown + Delete */}
                  <div className="flex items-center justify-between pt-1 border-t border-border/30">
                    <Badge variant="outline" className="text-[9px] font-medium h-4 px-1.5">
                      {TAG_LABELS[kp.tag] || kp.tag}
                    </Badge>

                    <div className="flex items-center gap-1.5">
                      {/* Confidence Switcher Dropdown */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className={cn(
                              "text-[10px] font-semibold px-2 py-0.5 rounded-full border flex items-center gap-1 transition-all",
                              conf.bg,
                              conf.text
                            )}
                          >
                            <span className={cn("size-1.5 rounded-full", conf.dot)} />
                            <span>{conf.label}</span>
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-32 p-1">
                          {(Object.keys(CONFIDENCE_CONFIG) as KeyPointConfidence[]).map((c) => (
                            <DropdownMenuItem
                              key={c}
                              onClick={() => onUpdateKeyPoint(kp.id, { confidence: c })}
                              className="text-xs gap-2"
                            >
                              <span className={cn("size-2 rounded-full", CONFIDENCE_CONFIG[c].dot)} />
                              <span>{CONFIDENCE_CONFIG[c].label}</span>
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>

                      {/* Delete */}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-6 text-muted-foreground hover:text-destructive rounded opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => onDeleteKeyPoint(kp.id)}
                        title="Remove key point"
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-16 text-center text-xs text-muted-foreground space-y-2">
            <Bookmark className="size-8 mx-auto text-muted-foreground/30" />
            <p className="font-medium">No key points yet</p>
            <p className="text-[11px] text-muted-foreground/80 max-w-[200px] mx-auto">
              Select text in the PDF or click Add to record definitions, formulas, and takeaways.
            </p>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
