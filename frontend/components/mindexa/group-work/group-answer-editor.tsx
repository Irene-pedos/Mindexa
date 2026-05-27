// components/mindexa/group-work/group-answer-editor.tsx
"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { 
  FileEdit, 
  Save, 
  User as UserIcon, 
  Clock, 
  Check, 
  AlertTriangle,
  Info,
  Layers,
  Sparkles,
  ArrowRight
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

interface GroupAnswer {
  question_id: string;
  answer_content: any;
  notes_content?: any;
  last_modified_at: string;
  last_modified_by_id: string;
  last_modified_by_name: string;
}

interface Question {
  id: string;
  text: string;
  type: string;
  marks: number;
  options?: any[];
}

interface GroupAnswerEditorProps {
  question: Question;
  answer?: GroupAnswer;
  onSave: (questionId: string, content: any, notes?: any) => Promise<void>;
  currentUserId: string;
}

export function GroupAnswerEditor({ 
  question, 
  answer, 
  onSave, 
  currentUserId 
}: GroupAnswerEditorProps) {
  const [localContent, setLocalContent] = useState<any>(answer?.answer_content || "");
  const [localNotes, setLocalNotes] = useState<any>(answer?.notes_content || "");
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (answer?.answer_content !== undefined) {
      setLocalContent(answer.answer_content);
    }
    if (answer?.notes_content !== undefined) {
      setLocalNotes(answer.notes_content);
    }
  }, [answer]);

  const handleContentChange = (val: any) => {
    setLocalContent(val);
    setIsDirty(true);
    
    // Auto-save logic for large text fields
    if (["essay", "shortanswer", "short_answer"].includes(question.type.toLowerCase())) {
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(() => {
            handleManualSave();
        }, 5000);
    }
  };

  const handleManualSave = async () => {
    if (!isDirty && !isSaving) return;
    setIsSaving(true);
    try {
      await onSave(question.id, localContent, localNotes);
      setIsDirty(false);
    } catch (err) {
      console.error("Failed to save shared answer", err);
    } finally {
      setIsSaving(false);
    }
  };

  const renderInput = () => {
    const qType = question.type.toLowerCase();
    
    switch (qType) {
      case "mcq":
      case "multiple_choice":
      case "truefalse":
      case "true_false":
        return (
          <RadioGroup 
            value={String(localContent)} 
            onValueChange={(v) => {
              setLocalContent(v);
              setIsDirty(true);
              // Save immediately for MCQ
              onSave(question.id, v, localNotes);
              setIsDirty(false);
            }}
            className="space-y-3"
          >
            {(question.options || []).map((opt: any, idx: number) => (
              <div key={idx} className="flex items-center space-x-2 border rounded-xl p-4 hover:bg-muted/30 transition-all cursor-pointer">
                <RadioGroupItem value={String(opt.id)} id={`shared-opt-${question.id}-${idx}`} />
                <Label htmlFor={`shared-opt-${question.id}-${idx}`} className="flex-1 cursor-pointer text-[13px] font-medium leading-relaxed">
                  {opt.text || opt.option_text}
                </Label>
              </div>
            ))}
          </RadioGroup>
        );

      case "shortanswer":
      case "short_answer":
        return (
          <Input 
            value={String(localContent)} 
            onChange={(e) => handleContentChange(e.target.value)}
            className="h-12 text-base font-medium px-4 bg-muted/5 border-2 focus:border-primary/50 rounded-xl"
            placeholder="Type group answer here..."
          />
        );

      case "essay":
      case "casestudy":
      case "computational":
        return (
          <Textarea 
            value={String(localContent)} 
            onChange={(e) => handleContentChange(e.target.value)}
            className="min-h-[200px] text-[15px] leading-relaxed p-6 bg-muted/5 border-2 focus:border-primary/50 rounded-2xl resize-none"
            placeholder="Collaborate on a comprehensive response here..."
          />
        );

      default:
        return (
          <div className="p-10 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center text-center gap-3 bg-muted/5">
            <AlertTriangle className="size-8 text-amber-500 opacity-50" />
            <div className="space-y-1">
              <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Unsupported Preview</p>
              <p className="text-xs text-muted-foreground max-w-xs">This question type requires specialized input. Please use the individual take page for complex inputs if needed, though they are synced here.</p>
            </div>
          </div>
        );
    }
  };

  const wasModifiedByMe = answer?.last_modified_by_id === currentUserId;

  return (
    <Card className="border shadow-none overflow-hidden group">
      <CardHeader className="py-4 px-6 border-b bg-muted/5">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="size-6 rounded-lg bg-primary/10 flex items-center justify-center">
                <FileEdit className="size-3.5 text-primary" />
              </div>
              <CardTitle className="text-base font-bold tracking-tight">Question Workspace</CardTitle>
            </div>
            <p className="text-[13px] leading-relaxed font-semibold text-foreground/90">
              {question.text}
            </p>
          </div>
          <Badge variant="outline" className="h-6 text-[10px] font-black uppercase tracking-widest bg-background">
            {question.marks} Marks
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-6 space-y-6">
        <div className="space-y-3">
           <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground block">Collective Response</Label>
           {renderInput()}
        </div>

        <div className="pt-6 border-t space-y-4">
           <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground block">Shared Draft / Notes</Label>
           <Textarea 
             value={localNotes}
             onChange={(e) => {
                setLocalNotes(e.target.value);
                setIsDirty(true);
             }}
             className="min-h-[100px] text-xs leading-relaxed bg-amber-50/20 border-amber-200/50 rounded-xl"
             placeholder="Jot down ideas or rough drafts here. Visible to all members."
           />
        </div>
      </CardContent>
      <CardFooter className="py-3 px-6 border-t bg-muted/10 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {answer ? (
            <div className="flex items-center gap-2">
               <div className={cn(
                 "size-7 rounded-full flex items-center justify-center border shadow-none",
                 wasModifiedByMe ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
               )}>
                 <UserIcon className="size-3.5" />
               </div>
               <div className="flex flex-col">
                 <span className="text-[10px] font-bold text-foreground leading-none">
                    {wasModifiedByMe ? "You" : answer.last_modified_by_name}
                 </span>
                 <span className="text-[9px] text-muted-foreground mt-0.5">
                    Edited {formatDistanceToNow(new Date(answer.last_modified_at), { addSuffix: true })}
                 </span>
               </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-muted-foreground italic text-[10px]">
              <Clock className="size-3" /> No edits yet
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {isDirty && !isSaving && (
            <span className="text-[10px] font-bold text-amber-600 flex items-center gap-1 uppercase tracking-wider">
              <Info className="size-3" /> Unsaved Changes
            </span>
          )}
          {isSaving ? (
             <Button disabled size="sm" className="h-8 rounded-lg text-[10px] uppercase font-black tracking-widest gap-2 bg-primary/80">
               <Sparkles className="size-3.5 animate-spin" /> Saving...
             </Button>
          ) : (
            <Button 
              onClick={handleManualSave} 
              disabled={!isDirty}
              size="sm" 
              className={cn(
                "h-8 rounded-lg text-[10px] uppercase font-black tracking-widest gap-2 shadow-sm transition-all",
                isDirty ? "bg-primary text-primary-foreground scale-105" : "bg-muted text-muted-foreground opacity-50"
              )}
            >
              <Save className="size-3.5" /> Save to Group
            </Button>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}
