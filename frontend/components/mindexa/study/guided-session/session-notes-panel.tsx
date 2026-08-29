"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  FileText,
  Save,
  Check,
  Copy,
  ChevronDown,
  ChevronUp,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { studyPlannerApi } from "@/lib/api/study-planner";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface SessionNotesPanelProps {
  sessionId: string;
  initialNotes?: string | null;
  currentSectionTitle?: string;
}

export function SessionNotesPanel({
  sessionId,
  initialNotes = "",
  currentSectionTitle,
}: SessionNotesPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [notes, setNotes] = useState(initialNotes || "");
  const [saving, setSaving] = useState(false);
  const [lastSavedNotes, setLastSavedNotes] = useState(initialNotes || "");
  const [copied, setCopied] = useState(false);

  // Sync initial notes when session loads
  useEffect(() => {
    if (initialNotes !== undefined && initialNotes !== null) {
      setNotes(initialNotes);
      setLastSavedNotes(initialNotes);
    }
  }, [initialNotes]);

  // Debounced auto-save timer
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleNotesChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setNotes(val);

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = setTimeout(() => {
      saveNotesToBackend(val, true);
    }, 2500);
  };

  // Keep mutable refs to latest notes and lastSavedNotes to flush safely on unmount
  const notesRef = useRef(notes);
  const lastSavedNotesRef = useRef(lastSavedNotes);

  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  useEffect(() => {
    lastSavedNotesRef.current = lastSavedNotes;
  }, [lastSavedNotes]);

  // Flush unsaved notes strictly on true component unmount (or sessionId change)
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
      if (notesRef.current !== lastSavedNotesRef.current) {
        studyPlannerApi.saveSessionNotes(sessionId, notesRef.current).catch(() => {});
      }
    };
  }, [sessionId]);

  const saveNotesToBackend = async (textToSave: string, isAutoSave = false) => {
    if (textToSave === lastSavedNotes) return;
    setSaving(true);
    try {
      await studyPlannerApi.saveSessionNotes(sessionId, textToSave);
      setLastSavedNotes(textToSave);
      if (!isAutoSave) {
        toast.success("Study notes saved successfully");
      }
    } catch (err: any) {
      if (!isAutoSave) {
        toast.error(err?.message || "Failed to save study notes");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleCopyNotes = () => {
    if (!notes.trim()) return;
    navigator.clipboard.writeText(notes);
    setCopied(true);
    toast.success("Notes copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const isDirty = notes !== lastSavedNotes;
  const wordCount = notes.trim() ? notes.trim().split(/\s+/).length : 0;

  return (
    <>
      {/* Icon-Only Floating Trigger Button */}
      {!isOpen && (
        <Button
          onClick={() => setIsOpen(true)}
          size="icon"
          className="fixed bottom-6 left-6 z-40 rounded-full size-11 bg-card border border-border/60 shadow-xs text-primary hover:bg-muted transition-all"
          title="My Session Notes"
        >
          <FileText className="size-5 text-primary" />
        </Button>
      )}

      {/* Floating Notes Card Panel */}
      {isOpen && (
        <div className="fixed bottom-6 left-6 z-40 max-w-sm w-full md:w-80 transition-all">
          <Card className="border border-border/60 bg-card rounded-xl overflow-hidden shadow-none">
            <CardHeader
              onClick={() => setIsOpen(false)}
              className="p-3 px-3.5 border-b border-border/60 bg-muted/20 cursor-pointer flex flex-row items-center justify-between hover:bg-muted/40 transition-colors space-y-0"
            >
              <div className="flex items-center gap-2">
                <FileText className="size-4 text-primary shrink-0" />
                <CardTitle className="text-xs font-semibold text-foreground">
                  My Session Notes
                </CardTitle>
                {saving ? (
                  <span className="text-[10px] text-amber-500 flex items-center gap-1 font-medium ml-auto">
                    <Loader2 className="size-3 animate-spin" /> Saving
                  </span>
                ) : isDirty ? (
                  <span className="text-[10px] text-amber-500 font-medium ml-auto">Unsaved</span>
                ) : (
                  <span className="text-[10px] text-emerald-600 font-medium flex items-center gap-0.5 ml-auto">
                    <Check className="size-3" /> Saved
                  </span>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsOpen(false);
                }}
                className="size-6 text-muted-foreground hover:bg-muted rounded-md"
              >
                <ChevronDown className="size-3.5" />
              </Button>
            </CardHeader>

            <CardContent className="p-4 space-y-3 animate-in slide-in-from-bottom-2 duration-200">
              {currentSectionTitle && (
                <Badge
                  variant="outline"
                  className="text-[10px] truncate max-w-full text-muted-foreground font-medium border-border/50"
                >
                  Context: {currentSectionTitle}
                </Badge>
              )}

              <textarea
                value={notes}
                onChange={handleNotesChange}
                placeholder="Write your notes, formulas, key definitions, or personal reflections here..."
                className="w-full min-h-[160px] p-3 text-xs leading-relaxed font-sans rounded-xl border border-border/60 bg-background/90 text-foreground focus:outline-none focus:border-primary/40 resize-y"
              />

              <div className="flex items-center justify-between gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopyNotes}
                  disabled={!notes.trim()}
                  className="text-[11px] h-8 px-2.5 font-semibold gap-1 text-muted-foreground hover:text-foreground"
                >
                  {copied ? (
                    <Check className="size-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                  {copied ? "Copied" : "Copy Notes"}
                </Button>

                <Button
                  size="sm"
                  onClick={() => saveNotesToBackend(notes, false)}
                  disabled={saving || !isDirty}
                  className="text-[11px] h-8 px-3 font-semibold gap-1.5"
                >
                  {saving ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Save className="size-3.5" />
                  )}
                  Save Notes
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
