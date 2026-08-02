"use client";

import React, { useState, useEffect, useRef } from "react";
import { FileText, Save, Check, Copy, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { studyPlannerApi } from "@/lib/api/study-planner";

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
    <div className="fixed bottom-6 left-6 z-40 max-w-sm w-full md:w-80 shadow-2xl transition-all">
      <Card className="border-border/80 bg-card/95 backdrop-blur-md rounded-2xl overflow-hidden shadow-xl">
        <CardHeader
          onClick={() => setIsOpen(!isOpen)}
          className="p-3.5 px-4 border-b border-border/50 bg-muted/30 cursor-pointer flex flex-row items-center justify-between hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <div className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <FileText className="size-4" />
            </div>
            <div>
              <CardTitle className="text-xs font-bold text-foreground">
                My Session Notes
              </CardTitle>
              <div className="text-[10px] text-muted-foreground font-medium flex items-center gap-1.5">
                <span>{wordCount} words</span>
                <span>&bull;</span>
                {saving ? (
                  <span className="text-amber-500 flex items-center gap-1">
                    <Loader2 className="size-3 animate-spin" /> Saving...
                  </span>
                ) : isDirty ? (
                  <span className="text-amber-500">Unsaved changes</span>
                ) : (
                  <span className="text-emerald-500 flex items-center gap-0.5">
                    <Check className="size-3" /> Saved
                  </span>
                )}
              </div>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="size-7 text-muted-foreground">
            {isOpen ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
          </Button>
        </CardHeader>

        {isOpen && (
          <CardContent className="p-4 space-y-3 animate-in slide-in-from-bottom-2 duration-200">
            {currentSectionTitle && (
              <Badge variant="outline" className="text-[10px] truncate max-w-full text-muted-foreground font-medium border-border/50">
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
                {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
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
        )}
      </Card>
    </div>
  );
}
