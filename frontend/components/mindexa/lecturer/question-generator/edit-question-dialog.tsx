"use client";

import { useState } from "react";
import { CheckCircle2, Edit3, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { QuestionEdits } from "@/hooks/use-question-generation";
import type { AIGeneratedQuestionResponse, GeneratedQuestionOptionResponse } from "@/lib/api/ai-generation";

interface EditQuestionDialogProps {
  /** The candidate being edited; null keeps the dialog closed. */
  question: AIGeneratedQuestionResponse | null;
  onClose: () => void;
  /** Save and approve; resolves true when it worked (the dialog then closes). */
  onSave: (question: AIGeneratedQuestionResponse, edits: QuestionEdits) => Promise<boolean>;
}

const cloneOptions = (options: GeneratedQuestionOptionResponse[] | undefined) =>
  (options ?? []).map((option) => ({ ...option }));

function EditForm({
  question,
  onClose,
  onSave,
}: {
  question: AIGeneratedQuestionResponse;
  onClose: () => void;
  onSave: EditQuestionDialogProps["onSave"];
}) {
  const [text, setText] = useState(question.parsed_question_text || "");
  const [explanation, setExplanation] = useState(question.parsed_explanation || "");
  const [options, setOptions] = useState(() => cloneOptions(question._options));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      if (await onSave(question, { text, explanation, options })) onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="space-y-3.5 py-2">
        <div className="space-y-1">
          <Label htmlFor="edit-question-text" className="text-xs font-semibold">
            Question Prompt Text
          </Label>
          <Textarea
            id="edit-question-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="min-h-[80px] rounded-lg p-2.5 text-xs"
            placeholder="Enter question text..."
          />
        </div>

        {options.length > 0 && (
          <fieldset className="space-y-2">
            <div className="flex items-center justify-between">
              <legend className="text-xs font-semibold">Multiple Choice Options</legend>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setOptions((prev) => [...prev, { text: `Option ${prev.length + 1}`, is_correct: false }])}
                className="h-6 cursor-pointer gap-1 px-2 text-[11px] text-primary"
              >
                <Plus className="size-3" /> Add Choice
              </Button>
            </div>
            <div className="space-y-1.5">
              {options.map((option, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="correct-option"
                    checked={option.is_correct}
                    onChange={() => setOptions((prev) => prev.map((o, i) => ({ ...o, is_correct: i === index })))}
                    className="size-3.5 cursor-pointer accent-emerald-600"
                    aria-label={`Mark choice ${index + 1} as the correct answer`}
                    title="Mark as correct answer"
                  />
                  <Input
                    value={option.text}
                    aria-label={`Choice ${index + 1}`}
                    onChange={(e) => {
                      const value = e.target.value;
                      setOptions((prev) => prev.map((o, i) => (i === index ? { ...o, text: value } : o)));
                    }}
                    className="h-8 flex-1 rounded-lg px-2.5 text-xs"
                  />
                  {options.length > 2 && (
                    <button
                      type="button"
                      onClick={() => setOptions((prev) => prev.filter((_, i) => i !== index))}
                      aria-label={`Remove choice ${index + 1}`}
                      className="cursor-pointer rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </fieldset>
        )}

        <div className="space-y-1">
          <Label htmlFor="edit-question-explanation" className="text-xs font-semibold">
            Model Answer &amp; Rubric Criteria
          </Label>
          <Textarea
            id="edit-question-explanation"
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
            className="min-h-[80px] rounded-lg p-2.5 text-xs"
            placeholder="Model response and grading points..."
          />
        </div>
      </div>

      <DialogFooter className="gap-2 border-t border-border/50 pt-2">
        <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={saving} className="h-8 cursor-pointer rounded-lg px-3 text-xs">
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={save}
          disabled={saving}
          className="h-8 cursor-pointer rounded-lg bg-emerald-600 px-4 text-xs font-bold text-white shadow-2xs hover:bg-emerald-700"
        >
          {saving ? <Loader2 className="mr-1 size-3 animate-spin" /> : <CheckCircle2 className="mr-1 size-3" />}
          <span>Save &amp; Approve</span>
        </Button>
      </DialogFooter>
    </>
  );
}

/** Edit a candidate's stem, choices and model answer, then approve it in one step. */
export function EditQuestionDialog({ question, onClose, onSave }: EditQuestionDialogProps) {
  return (
    <Dialog open={!!question} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto rounded-2xl p-5 sm:max-w-xl">
        <DialogHeader className="space-y-0.5">
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <Edit3 className="size-4 text-primary" />
            <span>Edit Candidate Question</span>
          </DialogTitle>
          <DialogDescription className="text-xs">
            Modify the question stem, answer choices, or model solution before approving.
          </DialogDescription>
        </DialogHeader>
        {/* Keyed by question so each edit starts from that question's own text. */}
        {question && <EditForm key={question.id} question={question} onClose={onClose} onSave={onSave} />}
      </DialogContent>
    </Dialog>
  );
}
