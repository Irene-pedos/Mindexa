"use client";

import React, { useMemo } from "react";
import { cn } from "@/lib/utils";
import { renderRichMathText } from "@/components/mindexa/common/math-renderer";
import { TableContextViewer } from "@/components/mindexa/common/table-context-viewer";
import { Badge } from "@/components/ui/badge";
import {
  Table as TableIcon,
  CheckCircle2,
  XCircle,
  Check,
  X,
  Layers,
  FileText,
  Download,
  AlertCircle,
  HelpCircle,
  Sparkles,
} from "lucide-react";

export type CanonicalQuestionType =
  | "mcq"
  | "true_false"
  | "matching"
  | "ordering"
  | "fill_blank"
  | "case_study"
  | "essay"
  | "short_answer"
  | "computational"
  | "file"
  | "unknown";

/**
 * Resolves a canonical question type with strict string normalization and explicit switch.
 * Checks question type first, then falls back to submission answer type if necessary.
 */
export function resolveCanonicalQuestionType(
  typeStr?: string | null,
  answerTypeStr?: string | null,
): CanonicalQuestionType {
  const norm = (typeStr || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const normSub = (answerTypeStr || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

  // Priority 1: Question Type
  switch (norm) {
    case "mcq":
    case "multiplechoice":
    case "singleoption":
    case "multioption":
    case "multiselect":
    case "checkbox":
      return "mcq";
    case "truefalse":
    case "tf":
      return "true_false";
    case "matching":
    case "matchpairs":
    case "match":
      return "matching";
    case "ordering":
    case "orderedlist":
    case "order":
      return "ordering";
    case "fillblank":
    case "fillblanks":
    case "fillintheblank":
    case "fillintheblanks":
    case "fillinblank":
    case "fillinblanks":
      return "fill_blank";
    case "casestudy":
      return "case_study";
    case "essay":
      return "essay";
    case "shortanswer":
      return "short_answer";
    case "computational":
    case "calculation":
      return "computational";
    case "file":
    case "fileupload":
      return "file";
  }

  // Priority 2: Submission Answer Type
  switch (normSub) {
    case "singleoption":
    case "multioption":
    case "choice":
      return "mcq";
    case "truefalse":
    case "tf":
      return "true_false";
    case "matchpairs":
    case "match":
      return "matching";
    case "orderedlist":
    case "order":
      return "ordering";
    case "fillblanks":
    case "fillblank":
    case "fillintheblank":
    case "fillintheblanks":
    case "fillinblank":
    case "fillinblanks":
      return "fill_blank";
    case "casestudy":
      return "case_study";
    case "file":
      return "file";
    case "text":
      return "short_answer";
  }

  return "unknown";
}

export interface StudentAnswerCanvasProps {
  currentQuestion?: any;
  currentSubmission?: any;
  maxMarks?: number;
  showCorrectAnswers?: boolean;
  className?: string;
}

/**
 * Robust, unified Student Answer Canvas supporting both Individual and Group Work submissions.
 * Renders per-type interactive visualizations for MCQ, True/False, Matching, Ordering,
 * Fill-in-the-Blank, Case Study, Structured Tables, Files, and Plain Text / Essay.
 */
export function StudentAnswerCanvas({
  currentQuestion,
  currentSubmission,
  maxMarks = 10,
  showCorrectAnswers = true,
  className,
}: StudentAnswerCanvasProps) {
  // If no submission is present or marked skipped
  const isSkipped =
    !currentSubmission ||
    currentSubmission.is_skipped === true ||
    currentSubmission.was_skipped === true;

  if (isSkipped) {
    return (
      <div
        className={cn(
          "p-4 rounded-xl border border-dashed border-border/60 bg-muted/5 text-center text-xs text-muted-foreground italic",
          className,
        )}
      >
        No response recorded for this question node.
      </div>
    );
  }

  const sub = currentSubmission || {};
  const q = currentQuestion || {};
  const answerContent =
    typeof sub.answer_content === "object" && sub.answer_content !== null
      ? sub.answer_content
      : {};

  const qType = resolveCanonicalQuestionType(
    q.type || q.question_type,
    sub.answer_type || answerContent.answer_type,
  );

  // ── 1. Structured Table Response ──────────────────────────────────────────
  const tableData = (() => {
    if (sub.table_data) return sub.table_data;
    if (sub.answer_table) return sub.answer_table;
    if (answerContent.table_data) return answerContent.table_data;
    if (answerContent.answer_table) return answerContent.answer_table;
    const text =
      sub.answer_text ||
      (typeof answerContent === "string"
        ? answerContent
        : answerContent.text) ||
      sub.student_answer;
    if (
      typeof text === "string" &&
      (text.trim().startsWith("{") || text.trim().startsWith("["))
    ) {
      try {
        const parsed = JSON.parse(text);
        if (
          parsed &&
          !Array.isArray(parsed) &&
          typeof parsed === "object" &&
          (parsed.headers || parsed.rows)
        ) {
          return parsed;
        }
      } catch {}
    }
    return null;
  })();

  if (tableData) {
    return (
      <div className={cn("space-y-2", className)}>
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-primary">
          <TableIcon className="size-3.5" />
          <span>Structured Response Table</span>
        </div>
        <TableContextViewer data={tableData} />
      </div>
    );
  }

  // ── 2. Switch on Canonical Question Type ──────────────────────────────────
  switch (qType) {
    case "mcq":
    case "true_false": {
      return (
        <McqTrueFalseRenderer
          question={q}
          submission={sub}
          answerContent={answerContent}
          isTrueFalse={qType === "true_false"}
          showCorrectAnswers={showCorrectAnswers}
          className={className}
        />
      );
    }

    case "matching": {
      return (
        <MatchingRenderer
          question={q}
          submission={sub}
          answerContent={answerContent}
          showCorrectAnswers={showCorrectAnswers}
          className={className}
        />
      );
    }

    case "ordering": {
      return (
        <OrderingRenderer
          question={q}
          submission={sub}
          answerContent={answerContent}
          showCorrectAnswers={showCorrectAnswers}
          className={className}
        />
      );
    }

    case "fill_blank": {
      return (
        <FillBlankRenderer
          question={q}
          submission={sub}
          answerContent={answerContent}
          showCorrectAnswers={showCorrectAnswers}
          className={className}
        />
      );
    }

    case "case_study": {
      return (
        <CaseStudyRenderer
          question={q}
          submission={sub}
          answerContent={answerContent}
          maxMarks={maxMarks}
          className={className}
        />
      );
    }

    case "file": {
      const fileUrl = sub.file_url || answerContent.file_url;
      if (fileUrl) {
        return (
          <div className={cn("space-y-2 text-xs", className)}>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Submitted File Attachment
            </p>
            <div className="flex items-center justify-between p-3 rounded-xl border bg-muted/20">
              <div className="flex items-center gap-2">
                <FileText className="size-4 text-primary" />
                <span className="font-medium text-foreground truncate max-w-[280px]">
                  {fileUrl.split("/").pop() || "Deliverable File"}
                </span>
              </div>
              <a
                href={fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
              >
                <Download className="size-3.5" />
                Download File
              </a>
            </div>
          </div>
        );
      }
      break;
    }

    case "essay":
    case "short_answer":
    case "computational":
    case "unknown":
    default:
      break;
  }

  // ── 3. Fallback to Plain Text / Essay / Open-Ended ────────────────────────
  const textVal =
    sub.answer_text ||
    (typeof answerContent === "string" ? answerContent : answerContent.text) ||
    (typeof sub.submitted_content === "string"
      ? sub.submitted_content
      : sub.submitted_content?.text) ||
    sub.student_answer;

  if (!textVal || String(textVal).trim() === "") {
    return (
      <span
        className={cn(
          "italic text-muted-foreground/60 font-sans font-normal text-xs",
          className,
        )}
      >
        No response recorded for this question node.
      </span>
    );
  }

  return (
    <div
      className={cn(
        "text-xs sm:text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap font-normal",
        className,
      )}
    >
      {renderRichMathText(String(textVal))}
    </div>
  );
}

// ── SUB-RENDERERS ──────────────────────────────────────────────────────────

function McqTrueFalseRenderer({
  question,
  submission,
  answerContent,
  isTrueFalse,
  showCorrectAnswers,
  className,
}: {
  question: any;
  submission: any;
  answerContent: any;
  isTrueFalse: boolean;
  showCorrectAnswers: boolean;
  className?: string;
}) {
  // Extract student selected option IDs across both individual and group data models
  let selected: string[] = [];
  if (
    Array.isArray(submission.selected_option_ids) &&
    submission.selected_option_ids.length > 0
  ) {
    selected = submission.selected_option_ids.map(String);
  } else if (
    Array.isArray(answerContent.selected_option_ids) &&
    answerContent.selected_option_ids.length > 0
  ) {
    selected = answerContent.selected_option_ids.map(String);
  } else if (answerContent.selected_option_id) {
    selected = [String(answerContent.selected_option_id)];
  } else if (submission.selected_option_id) {
    selected = [String(submission.selected_option_id)];
  } else if (submission.answer_text) {
    selected = [String(submission.answer_text)];
  } else if (submission.student_answer) {
    selected = [String(submission.student_answer)];
  }

  // Resolve options list
  let opts: any[] = question.options || [];
  if (isTrueFalse && opts.length === 0) {
    const isTrueExpected =
      String(question.correct_answer || "").toLowerCase() === "true";
    opts = [
      { id: "true", text: "True", content: "True", is_correct: isTrueExpected },
      {
        id: "false",
        text: "False",
        content: "False",
        is_correct: !isTrueExpected,
      },
    ];
  }

  if (opts.length === 0 && selected.length === 0) {
    return (
      <span className="italic text-muted-foreground/60 text-xs">
        No option chosen.
      </span>
    );
  }

  return (
    <div className={cn("space-y-2 text-xs", className)}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
        {isTrueFalse ? "True / False Choice" : "Option Selection(s)"}
      </p>
      <div className="space-y-1.5">
        {opts.map((opt: any) => {
          const optId = String(opt.id);
          const optLabel = opt.content || opt.text || opt.option_text || optId;
          const wasSelected = selected.some(
            (s) =>
              s.toLowerCase() === optId.toLowerCase() ||
              s.toLowerCase() === optLabel.toLowerCase(),
          );
          const isCorrect = showCorrectAnswers && !!opt.is_correct;

          return (
            <div
              key={optId}
              className={cn(
                "p-2.5 rounded-xl border flex items-center justify-between font-medium transition-colors",
                wasSelected && isCorrect
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-950 dark:text-emerald-200"
                  : wasSelected && !isCorrect && showCorrectAnswers
                    ? "bg-rose-500/10 border-rose-500/30 text-rose-950 dark:text-rose-200"
                    : wasSelected
                      ? "bg-primary/10 border-primary/30 text-foreground"
                      : isCorrect
                        ? "bg-emerald-500/5 border-emerald-500/20 text-muted-foreground"
                        : "bg-card/50 border-border/60 text-muted-foreground",
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "size-4 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0",
                    wasSelected
                      ? "bg-primary text-primary-foreground"
                      : "border border-border/80 bg-background text-muted-foreground",
                  )}
                >
                  {wasSelected ? "✓" : ""}
                </span>
                <span>{renderRichMathText(optLabel)}</span>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {wasSelected && (
                  <span className="rounded-md bg-primary/20 text-primary px-1.5 py-0.5 text-[9px] font-bold uppercase">
                    Selected
                  </span>
                )}
                {isCorrect && (
                  <span className="rounded-md bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 text-[9px] font-bold uppercase">
                    Correct
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MatchingRenderer({
  question,
  submission,
  answerContent,
  showCorrectAnswers,
  className,
}: {
  question: any;
  submission: any;
  answerContent: any;
  showCorrectAnswers: boolean;
  className?: string;
}) {
  const pairs: Record<string, any> =
    submission.match_pairs_json ||
    answerContent.match_pairs_json ||
    (() => {
      const raw =
        submission.answer_text ||
        answerContent.text ||
        submission.student_answer;
      if (typeof raw === "string" && raw.trim().startsWith("{")) {
        try {
          return JSON.parse(raw);
        } catch {}
      }
      return {};
    })();

  const options: any[] = question.options || [];
  const keys = Object.keys(pairs);

  if (keys.length === 0 && options.length === 0) {
    return (
      <span className="italic text-muted-foreground/60 text-xs">
        No matches submitted.
      </span>
    );
  }

  // If question defines explicit option pairs, render comprehensive comparison
  if (options.length > 0) {
    return (
      <div className={cn("space-y-2 text-xs", className)}>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
          Submitted Matches
        </p>
        <div className="space-y-2">
          {options.map((option) => {
            const promptText =
              option.content || option.text || option.option_text || option.id;
            const chosen =
              pairs[option.id] ??
              pairs[promptText] ??
              pairs[String(option.id)] ??
              "No match submitted";
            const expected = option.match_value || option.option_text_right;
            const isMatchCorrect =
              expected &&
              String(chosen).trim().toLowerCase() ===
                String(expected).trim().toLowerCase();

            return (
              <div
                key={option.id}
                className={cn(
                  "grid gap-2 rounded-xl border p-3 text-xs sm:grid-cols-3 transition-colors",
                  isMatchCorrect
                    ? "border-emerald-500/30 bg-emerald-50/40 dark:bg-emerald-950/20"
                    : "border-border/60 bg-muted/20",
                )}
              >
                <div>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">
                    Item Prompt
                  </span>
                  <div className="font-semibold text-foreground mt-0.5">
                    {renderRichMathText(promptText)}
                  </div>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">
                    Submitted Match
                  </span>
                  <div
                    className={cn(
                      "font-medium mt-0.5",
                      isMatchCorrect
                        ? "text-emerald-700 dark:text-emerald-300 font-semibold"
                        : "text-rose-700 dark:text-rose-300",
                    )}
                  >
                    {renderRichMathText(String(chosen))}
                  </div>
                </div>
                {expected && showCorrectAnswers && (
                  <div>
                    <span className="text-[10px] uppercase font-bold text-muted-foreground">
                      Expected Target
                    </span>
                    <div className="font-semibold text-emerald-700 dark:text-emerald-400 mt-0.5">
                      {renderRichMathText(String(expected))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Fallback: render raw pairs map
  return (
    <div className={cn("space-y-2 text-xs", className)}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
        Submitted Matches
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {keys.map((k) => (
          <div
            key={k}
            className="p-2.5 rounded-xl border bg-muted/20 flex items-center justify-between"
          >
            <span className="font-medium text-foreground">
              {renderRichMathText(k)}
            </span>
            <span className="text-primary font-medium">
              → {renderRichMathText(String(pairs[k]))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function OrderingRenderer({
  question,
  submission,
  answerContent,
  showCorrectAnswers,
  className,
}: {
  question: any;
  submission: any;
  answerContent: any;
  showCorrectAnswers: boolean;
  className?: string;
}) {
  const orderedIds: string[] =
    submission.ordered_option_ids ||
    answerContent.ordered_option_ids ||
    (() => {
      const raw =
        submission.answer_text ||
        answerContent.text ||
        submission.student_answer;
      if (Array.isArray(raw)) return raw.map(String);
      if (typeof raw === "string") {
        if (raw.trim().startsWith("[")) {
          try {
            const p = JSON.parse(raw);
            if (Array.isArray(p)) return p.map(String);
          } catch {}
        }
        return raw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      }
      return [];
    })();

  if (orderedIds.length === 0) {
    return (
      <span className="italic text-muted-foreground/60 text-xs">
        No ordering sequence submitted.
      </span>
    );
  }

  const opts: any[] = question.options || [];
  const expectedOpts = [...opts].sort(
    (a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0),
  );

  return (
    <div className={cn("space-y-2 text-xs", className)}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
        Submitted Sequence
      </p>
      <div className="space-y-2">
        {orderedIds.map((val: string, idx: number) => {
          const opt = opts.find(
            (o: any) =>
              String(o.id) === val ||
              (o.text &&
                o.text.trim().toLowerCase() === val.trim().toLowerCase()) ||
              (o.content &&
                o.content.trim().toLowerCase() === val.trim().toLowerCase()) ||
              (o.option_text &&
                o.option_text.trim().toLowerCase() ===
                  val.trim().toLowerCase()),
          );
          const label = opt ? opt.content || opt.text || opt.option_text : val;
          const expected = expectedOpts[idx];
          const expectedText = expected
            ? expected.content || expected.text || expected.option_text
            : "";
          const isCorrect =
            expected &&
            (String(expected.id) === val ||
              expectedText.trim().toLowerCase() === label.trim().toLowerCase());

          return (
            <div
              key={val || idx}
              className={cn(
                "p-2.5 rounded-xl border flex items-center justify-between font-sans transition-colors",
                isCorrect
                  ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-950 dark:text-emerald-200"
                  : "bg-amber-500/5 border-amber-500/20 text-amber-950 dark:text-amber-200",
              )}
            >
              <div className="flex items-center gap-2.5 font-medium">
                <span className="size-5 rounded-full bg-background border flex items-center justify-center text-[10px] font-mono font-medium shrink-0">
                  {idx + 1}
                </span>
                <span>{renderRichMathText(label)}</span>
              </div>
              {expected && showCorrectAnswers && (
                <span className="text-[10px] font-mono font-medium">
                  {isCorrect ? (
                    <span className="text-emerald-600 dark:text-emerald-400">
                      ✓ Correct Position
                    </span>
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400">
                      Expected: {expectedText}
                    </span>
                  )}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FillBlankRenderer({
  question,
  submission,
  answerContent,
  showCorrectAnswers,
  className,
}: {
  question: any;
  submission: any;
  answerContent: any;
  showCorrectAnswers: boolean;
  className?: string;
}) {
  // 1. Defensively resolve student blank answers from all possible payload shapes
  const studentBlanks: Record<string, string> = useMemo(() => {
    const rawMap: Record<string, any> = {};

    const sources = [
      submission?.fill_blank_answers,
      answerContent?.fill_blank_answers,
      submission?.student_answer_json,
      answerContent?.student_answer_json,
      submission?.blanks,
      answerContent?.blanks,
      typeof answerContent === "object" && !Array.isArray(answerContent) ? answerContent : null,
    ];

    for (const src of sources) {
      if (src && typeof src === "object") {
        if (Array.isArray(src)) {
          src.forEach((val, idx) => {
            if (val !== undefined && val !== null) {
              rawMap[String(idx)] = String(val);
            }
          });
        } else {
          Object.entries(src).forEach(([k, val]) => {
            if (val !== undefined && val !== null) {
              const numMatch = k.match(/\d+/);
              const normalizedKey = numMatch ? String(Number(numMatch[0])) : k;
              rawMap[normalizedKey] = String(val);
              rawMap[k] = String(val);
            }
          });
        }
      }
    }

    // Text parsing fallback
    const rawText =
      submission?.answer_text ||
      answerContent?.text ||
      submission?.student_answer ||
      (typeof answerContent === "string" ? answerContent : "");

    if (typeof rawText === "string" && rawText.trim().length > 0) {
      const trimmed = rawText.trim();
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) {
            parsed.forEach((val, idx) => {
              rawMap[String(idx)] = String(val);
            });
          } else if (typeof parsed === "object" && parsed !== null) {
            Object.entries(parsed).forEach(([k, val]) => {
              const numMatch = k.match(/\d+/);
              const normalizedKey = numMatch ? String(Number(numMatch[0])) : k;
              rawMap[normalizedKey] = String(val);
            });
          }
        } catch {}
      } else if (trimmed.includes(";") || trimmed.includes(",")) {
        const parts = trimmed.split(/[,;]/).map((p) => p.trim()).filter(Boolean);
        parts.forEach((val, idx) => {
          const clean = val.replace(/^blank\s*\d+\s*:\s*/i, "");
          if (!rawMap[String(idx)]) {
            rawMap[String(idx)] = clean;
          }
        });
      } else if (Object.keys(rawMap).length === 0) {
        rawMap["0"] = trimmed;
      }
    }

    return rawMap;
  }, [submission, answerContent]);

  const questionText =
    question?.question_text ||
    question?.text ||
    question?.content ||
    "";

  // Split question text on [blank] or ___ markers
  const textParts = useMemo(() => {
    if (!questionText) return [];
    return questionText.split(/(?:_{3,}|\[blank\]|\{\{blank\}\})/gi);
  }, [questionText]);

  const blankCount = Math.max(1, textParts.length > 1 ? textParts.length - 1 : 1);

  // 2. Resolve accepted / correct answers per blank index
  const acceptedAnswersPerBlank = useMemo(() => {
    const map: Record<number, string[]> = {};

    // Source A: question.blanks (from DB list_blanks)
    if (question?.blanks && Array.isArray(question.blanks)) {
      question.blanks.forEach((b: any, i: number) => {
        const idx = b.blank_index !== undefined && b.blank_index !== null ? Number(b.blank_index) : i;
        if (Array.isArray(b.accepted_answers) && b.accepted_answers.length > 0) {
          map[idx] = b.accepted_answers.map(String);
        }
      });
    }

    // Source B: question.options with is_correct: true
    if (question?.options && Array.isArray(question.options)) {
      const correctOpts = question.options.filter((o: any) => o.is_correct === true);
      correctOpts.forEach((o: any, i: number) => {
        const optText = o.content || o.text || o.option_text || "";
        const idx = o.order_index !== undefined && o.order_index !== null ? Number(o.order_index) : i;
        if (optText) {
          map[idx] = [...(map[idx] || []), optText];
        }
      });
    }

    // Source C: question.correct_answer or submission.correct_answer
    const rawCorrect = question?.correct_answer || submission?.correct_answer;
    if (typeof rawCorrect === "string" && rawCorrect.trim().length > 0) {
      if (rawCorrect.includes(";")) {
        const parts = rawCorrect.split(";").map((p) => p.trim()).filter(Boolean);
        parts.forEach((p, idx) => {
          const clean = p.replace(/^blank\s*\d+\s*:\s*/i, "");
          const subParts = clean.split("|").map((s) => s.trim()).filter(Boolean);
          map[idx] = Array.from(new Set([...(map[idx] || []), ...subParts]));
        });
      } else if (!map[0]) {
        map[0] = [rawCorrect.trim()];
      }
    }

    return map;
  }, [question, submission]);

  // Check correctness of a student answer for a specific blank index
  const getBlankStatus = (idx: number) => {
    const studentVal = (
      studentBlanks[String(idx)] ??
      studentBlanks[String(idx + 1)] ??
      studentBlanks[`blank_${idx}`] ??
      studentBlanks[`blank_${idx + 1}`] ??
      ""
    ).trim();

    if (!studentVal) {
      return { isAnswered: false, isCorrect: false, studentVal: "", expected: acceptedAnswersPerBlank[idx] || [] };
    }

    const accepted = acceptedAnswersPerBlank[idx] || [];
    if (accepted.length === 0) {
      return { isAnswered: true, isCorrect: true, studentVal, expected: [] };
    }

    const isCorrect = accepted.some(
      (acc) => acc.trim().toLowerCase() === studentVal.toLowerCase()
    );

    return { isAnswered: true, isCorrect, studentVal, expected: accepted };
  };

  const poolOptions = question?.options || [];

  return (
    <div className={cn("space-y-4 text-xs", className)}>
      {/* ── A. Inline Question Sentence with Styled Answer Pills ── */}
      {textParts.length > 1 && (
        <div className="p-4 rounded-xl border border-border/70 bg-muted/10 space-y-2 leading-relaxed text-foreground">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1.5">
            <Layers className="size-3 text-primary" />
            <span>Interactive Sentence Evaluation</span>
          </p>
          <div className="text-sm font-medium leading-loose text-foreground/90">
            {textParts.map((part: string, idx: number) => {
              const status = idx < blankCount ? getBlankStatus(idx) : null;
              const expectedLabel = status?.expected?.[0] || "";

              return (
                <React.Fragment key={idx}>
                  <span>{renderRichMathText(part)}</span>
                  {status && (
                    <span className="inline-flex items-center align-middle mx-1 my-0.5">
                      {status.isAnswered ? (
                        status.isCorrect ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-semibold text-xs shadow-2xs">
                            <CheckCircle2 className="size-3 text-emerald-600 shrink-0" />
                            <span>{renderRichMathText(status.studentVal)}</span>
                          </span>
                        ) : (
                          <span className="inline-flex flex-wrap items-center gap-1">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg border border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300 font-semibold text-xs shadow-2xs">
                              <XCircle className="size-3 text-rose-600 shrink-0" />
                              <span className="line-through opacity-85">{renderRichMathText(status.studentVal)}</span>
                            </span>
                            {showCorrectAnswers && expectedLabel && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300 font-medium text-[11px]">
                                <Check className="size-2.5 text-emerald-600" />
                                <span>{renderRichMathText(expectedLabel)}</span>
                              </span>
                            )}
                          </span>
                        )
                      ) : (
                        <span className="inline-flex flex-wrap items-center gap-1">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg border border-dashed border-muted-foreground/40 bg-muted/20 text-muted-foreground font-medium text-xs">
                            [Blank {idx + 1}: Unanswered]
                          </span>
                          {showCorrectAnswers && expectedLabel && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300 font-medium text-[11px]">
                              <Check className="size-2.5 text-emerald-600" />
                              <span>{renderRichMathText(expectedLabel)}</span>
                            </span>
                          )}
                        </span>
                      )}
                    </span>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}

      {/* ── B. Options Pool & Distractors Reference ── */}
      {poolOptions.length > 0 && (
        <div className="p-3.5 rounded-xl border border-border/60 bg-muted/5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Sparkles className="size-3 text-primary" />
              <span>Available Choices & Distractors Pool</span>
            </span>
            <Badge variant="outline" className="text-[9px] py-0 px-1.5 text-muted-foreground border-border/60">
              {poolOptions.length} total options
            </Badge>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            {poolOptions.map((opt: any, i: number) => {
              const optText = opt.content || opt.text || opt.option_text || "";
              const isSelected = Object.values(studentBlanks).some(
                (val) => val.trim().toLowerCase() === optText.trim().toLowerCase()
              );
              const isCorrectOpt = opt.is_correct === true;

              return (
                <div
                  key={opt.id || `opt-${i}`}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border font-medium transition-all",
                    isSelected
                      ? isCorrectOpt
                        ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-700 dark:text-emerald-300 font-semibold shadow-2xs"
                        : "bg-rose-500/10 border-rose-500/40 text-rose-700 dark:text-rose-300 font-semibold shadow-2xs"
                      : isCorrectOpt && showCorrectAnswers
                        ? "bg-emerald-500/5 border-emerald-500/25 text-emerald-600/90 border-dashed"
                        : "bg-background border-border/70 text-foreground/80"
                  )}
                >
                  <span>{renderRichMathText(optText)}</span>
                  {isSelected && (
                    <Badge
                      variant="secondary"
                      className={cn(
                        "text-[8px] h-3.5 px-1 py-0 font-bold uppercase",
                        isCorrectOpt ? "bg-emerald-500/20 text-emerald-700" : "bg-rose-500/20 text-rose-700"
                      )}
                    >
                      Selected
                    </Badge>
                  )}
                  {!isSelected && isCorrectOpt && showCorrectAnswers && (
                    <Badge variant="outline" className="text-[8px] h-3.5 px-1 py-0 text-emerald-600 border-emerald-500/30">
                      Key
                    </Badge>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function CaseStudyRenderer({
  question,
  submission,
  answerContent,
  maxMarks,
  className,
}: {
  question: any;
  submission: any;
  answerContent: any;
  maxMarks: number;
  className?: string;
}) {
  const prompts: any[] = question.sub_questions || question.options || [];
  const rawAnsStr =
    submission.answer_text ||
    (typeof answerContent === "string" ? answerContent : answerContent.text) ||
    submission.student_answer;

  const answerMap = useMemo<Record<string, string>>(() => {
    if (
      typeof answerContent === "object" &&
      answerContent !== null &&
      Object.keys(answerContent).length > 0
    ) {
      return answerContent;
    }
    if (typeof rawAnsStr === "string" && rawAnsStr.trim().startsWith("{")) {
      try {
        const parsed = JSON.parse(rawAnsStr);
        if (typeof parsed === "object" && parsed !== null) {
          return parsed;
        }
      } catch {}
    }
    return {};
  }, [answerContent, rawAnsStr]);

  const caseContext =
    question.caseStudyContext ||
    question.case_study_context ||
    question.context;

  const totalSubMarks = prompts.reduce(
    (acc: number, p: any) => acc + (p.marks || 0),
    0,
  );
  const promptCount = prompts.length > 0 ? prompts.length : 1;

  return (
    <div className={cn("space-y-4", className)}>
      {caseContext && (
        <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 space-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-primary">
            Case Study Scenario Context
          </p>
          <div className="text-xs sm:text-sm leading-relaxed text-foreground/90 font-sans">
            {renderRichMathText(caseContext)}
          </div>
        </div>
      )}

      <div className="space-y-3">
        {prompts.map((prompt: any, index: number) => {
          const subMark =
            prompt.marks !== undefined && prompt.marks > 0
              ? prompt.marks
              : totalSubMarks > 0
                ? prompt.marks
                : Math.round((maxMarks / promptCount) * 10) / 10;

          let subAnswerVal =
            answerMap[prompt.id] ??
            answerMap[String(prompt.id)] ??
            answerMap[index] ??
            answerMap[String(index)];

          if (subAnswerVal === undefined) {
            if (
              rawAnsStr &&
              typeof rawAnsStr === "string" &&
              !rawAnsStr.trim().startsWith("{") &&
              index === 0
            ) {
              subAnswerVal = rawAnsStr;
            } else if (
              Object.keys(answerMap).length > 0 &&
              Object.values(answerMap)[index] !== undefined
            ) {
              subAnswerVal = Object.values(answerMap)[index];
            }
          }

          const promptText =
            prompt.text ||
            prompt.option_text ||
            prompt.content ||
            `Sub-question ${index + 1}`;

          return (
            <div
              key={prompt.id || index}
              className="rounded-xl border border-border/60 bg-muted/10 p-3.5 space-y-2.5"
            >
              <div className="flex items-center justify-between border-b border-border/40 pb-2">
                <span className="text-[11px] font-semibold text-primary flex items-center gap-1.5">
                  <span className="size-4 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-mono font-medium">
                    {index + 1}
                  </span>
                  Sub-question {index + 1}
                </span>
                <Badge
                  variant="outline"
                  className="text-[10px] font-medium px-2 py-0 border-primary/30 text-primary bg-primary/5 font-mono"
                >
                  {subMark} {Number(subMark) === 1 ? "Mark" : "Marks"}
                </Badge>
              </div>

              <div className="text-xs font-medium text-foreground leading-relaxed">
                {renderRichMathText(promptText)}
              </div>

              <div className="p-3 rounded-lg bg-card border border-border/50 text-xs">
                <span className="text-[10px] font-semibold text-muted-foreground block mb-1.5">
                  Submitted Answer
                </span>
                {subAnswerVal !== undefined &&
                subAnswerVal !== null &&
                String(subAnswerVal).trim() !== "" ? (
                  <div className="text-xs sm:text-sm leading-relaxed text-foreground whitespace-pre-wrap font-sans font-normal">
                    {renderRichMathText(String(subAnswerVal))}
                  </div>
                ) : (
                  <span className="italic text-muted-foreground/60 text-xs">
                    No response recorded for this sub-question.
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Alias for backward compatibility
export const SpeedGraderStudentAnswerCanvas = StudentAnswerCanvas;
