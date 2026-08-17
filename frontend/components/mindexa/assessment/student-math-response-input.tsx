"use client";

import React, { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { TableAnswerInput } from "@/components/mindexa/assessment/table-answer-input";
import { MathEditorDialog } from "@/components/mindexa/common/math-editor-dialog";
import { renderRichMathText } from "@/components/mindexa/common/math-renderer";
import { StructuredTableData } from "@/components/mindexa/common/table-context-viewer";
import {
  Sigma,
  Eye,
  Edit3,
  Table as TableIcon,
  HelpCircle,
  Sparkles,
  FileSpreadsheet,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface StudentMathResponseInputProps {
  questionId: string;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  minHeight?: string;
  requiresTableAnswer?: boolean;
  tableTemplate?: StructuredTableData | null;
  minWords?: number;
  maxWords?: number;
  disabled?: boolean;
  title?: string;
}

const QUICK_MATH_SYMBOLS = [
  { label: "x²", snippet: "x^{2}" },
  { label: "xₙ", snippet: "x_{n}" },
  { label: "a/b", snippet: "\\frac{a}{b}" },
  { label: "√x", snippet: "\\sqrt{x}" },
  { label: "±", snippet: "\\pm" },
  { label: "π", snippet: "\\pi" },
  { label: "θ", snippet: "\\theta" },
  { label: "α", snippet: "\\alpha" },
  { label: "β", snippet: "\\beta" },
  { label: "Δ", snippet: "\\Delta" },
  { label: "∑", snippet: "\\sum_{i=1}^{n}" },
  { label: "∫", snippet: "\\int_{a}^{b}" },
  { label: "lim", snippet: "\\lim_{x \\to 0}" },
  { label: "≤", snippet: "\\leq" },
  { label: "≥", snippet: "\\geq" },
  { label: "≠", snippet: "\\neq" },
  { label: "≈", snippet: "\\approx" },
  { label: "∞", snippet: "\\infty" },
  { label: "→", snippet: "\\to" },
];

export function StudentMathResponseInput({
  questionId,
  value,
  onChange,
  placeholder = "Type your response, calculations, or mathematical equations here...",
  minHeight = "min-h-[160px]",
  requiresTableAnswer = false,
  tableTemplate = null,
  minWords,
  maxWords,
  disabled = false,
  title,
}: StudentMathResponseInputProps) {
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [mathDialogOpen, setMathDialogOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Check if current value is structured table JSON
  const isTableValue = (() => {
    if (!value || typeof value !== "string") return false;
    try {
      const parsed = JSON.parse(value);
      return parsed && (parsed.type === "table" || (Array.isArray(parsed.headers) && Array.isArray(parsed.rows)));
    } catch {
      return false;
    }
  })();

  const [useTableMode, setUseTableMode] = useState<boolean>(
    requiresTableAnswer || isTableValue
  );

  const insertSnippetAtCursor = (snippet: string, isLatexEquation = true) => {
    const formatted = isLatexEquation ? `$${snippet}$` : snippet;
    const textarea = textareaRef.current;
    if (!textarea) {
      const newVal = value ? `${value} ${formatted}` : formatted;
      onChange(newVal);
      return;
    }

    const start = textarea.selectionStart ?? value.length;
    const end = textarea.selectionEnd ?? value.length;
    const textBefore = value.substring(0, start);
    const textAfter = value.substring(end);
    const updated = `${textBefore}${formatted}${textAfter}`;
    onChange(updated);

    setTimeout(() => {
      textarea.focus();
      const newPos = start + formatted.length;
      textarea.setSelectionRange(newPos, newPos);
    }, 50);
  };

  const handleInsertFromDialog = (formattedEquation: string) => {
    insertSnippetAtCursor(formattedEquation.replace(/^\$|\$$/g, ""), true);
    setMathDialogOpen(false);
  };

  // Word count helper for essay/long responses
  const wordCount = (value || "").trim().split(/\s+/).filter(Boolean).length;
  const isTooShort =
    minWords !== undefined &&
    minWords !== null &&
    minWords > 0 &&
    wordCount > 0 &&
    wordCount < minWords;
  const isTooLong =
    maxWords !== undefined &&
    maxWords !== null &&
    maxWords > 0 &&
    wordCount > maxWords;
  const isOutRange = isTooShort || isTooLong;

  let wordLabel = `${wordCount} words`;
  if (maxWords && minWords) {
    wordLabel = `${wordCount} / ${maxWords} words (min: ${minWords})`;
  } else if (maxWords) {
    wordLabel = `${wordCount} / ${maxWords} words`;
  } else if (minWords) {
    wordLabel = `${wordCount} words (min: ${minWords})`;
  }

  // If table mode is active
  if (useTableMode) {
    return (
      <div className="space-y-3">
        <TableAnswerInput
          template={tableTemplate}
          value={isTableValue ? value : undefined}
          onChange={onChange}
          disabled={disabled}
        />
        {!requiresTableAnswer && (
          <div className="flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setUseTableMode(false);
                onChange("");
              }}
              className="h-7 text-xs text-muted-foreground hover:text-foreground"
            >
              Switch to Text & Formula Response
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2 bg-muted/20 border border-border/70 rounded-xl">
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setMathDialogOpen(true)}
            disabled={disabled}
            className="h-7 text-xs rounded-lg gap-1.5 font-semibold bg-primary/5 text-primary border-primary/25 hover:bg-primary/10"
          >
            <Sigma className="size-3.5" />
            <span>Math / Equation Editor</span>
          </Button>

          {/* Quick Symbol Buttons */}
          <div className="hidden sm:flex items-center gap-1 overflow-x-auto py-0.5">
            {QUICK_MATH_SYMBOLS.slice(0, 10).map((sym) => (
              <Button
                key={sym.label}
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled}
                onClick={() => insertSnippetAtCursor(sym.snippet, true)}
                className="h-6 px-1.5 text-[11px] font-mono rounded hover:bg-muted font-medium text-foreground/80"
                title={`Insert ${sym.label}`}
              >
                {sym.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {!requiresTableAnswer && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setUseTableMode(true)}
              className="h-7 text-[11px] rounded-lg gap-1 text-muted-foreground hover:text-foreground"
              title="Answer using structured table"
            >
              <TableIcon className="size-3.5" /> + Response Table
            </Button>
          )}

          {/* Mode Switch: Write vs Preview */}
          <div className="flex items-center bg-muted/40 p-0.5 rounded-lg border border-border/40">
            <button
              type="button"
              onClick={() => setTab("write")}
              className={cn(
                "px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all flex items-center gap-1",
                tab === "write"
                  ? "bg-background text-foreground shadow-2xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Edit3 className="size-3" /> Write
            </button>
            <button
              type="button"
              onClick={() => setTab("preview")}
              className={cn(
                "px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all flex items-center gap-1",
                tab === "preview"
                  ? "bg-background text-foreground shadow-2xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Eye className="size-3" /> Preview Math
            </button>
          </div>
        </div>
      </div>

      {/* Editor or Preview Pane */}
      {tab === "write" ? (
        <div className="relative">
          <textarea
            ref={textareaRef}
            disabled={disabled}
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className={cn(
              "w-full p-4 rounded-xl border bg-background text-sm leading-relaxed outline-none transition-all resize-y font-sans",
              minHeight,
              isOutRange
                ? "border-destructive/60 focus:border-destructive"
                : "border-muted/70 focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
            )}
          />
          <div className="text-[10px] text-muted-foreground/70 px-1 mt-1 flex items-center justify-between">
            <span className="flex items-center gap-1">
              <Sparkles className="size-3 text-primary/70" />
              Tip: Wrap equations in <code className="bg-muted px-1 rounded font-mono text-primary">$x^2$</code> or click <span className="font-semibold text-primary">Math / Equation Editor</span> above.
            </span>
            {(minWords || maxWords) && (
              <span className={cn("font-semibold", isOutRange ? "text-destructive" : "text-muted-foreground")}>
                {wordLabel}
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className={cn("p-4 rounded-xl border border-border bg-card/60 overflow-y-auto", minHeight)}>
          {value && value.trim() ? (
            <div className="text-sm text-foreground leading-relaxed">
              {renderRichMathText(value)}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground italic flex items-center justify-center h-24">
              Nothing to preview yet. Type your answer or math equations in the Write tab.
            </div>
          )}
        </div>
      )}

      {/* Math Editor Modal */}
      {mathDialogOpen && (
        <MathEditorDialog
          open={mathDialogOpen}
          onOpenChange={setMathDialogOpen}
          onInsert={handleInsertFromDialog}
        />
      )}
    </div>
  );
}
