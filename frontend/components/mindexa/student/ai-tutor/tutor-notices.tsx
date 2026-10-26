"use client";

import { AlertTriangle, FileText, ShieldAlert, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function ExamBlockedCard({ assessmentTitle }: { assessmentTitle: string }) {
  return (
    <Card className="flex h-full min-h-[400px] w-full flex-col items-center justify-center border bg-zinc-50/20 p-8 shadow-none">
      <div className="flex max-w-md flex-col items-center space-y-4 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-red-100">
          <ShieldAlert className="size-6 text-red-600" />
        </div>
        <div className="space-y-2">
          <h3 className="text-base font-medium text-red-600">AI Support Unavailable</h3>
          <p className="text-xs font-medium leading-relaxed text-muted-foreground">
            AI assistance is disabled for this assessment to maintain academic integrity.
          </p>
          {assessmentTitle && (
            <p className="rounded-lg border border-zinc-200 bg-zinc-100 px-3 py-1.5 text-xs font-medium text-foreground">
              Active Assessment: {assessmentTitle}
            </p>
          )}
          <p className="text-[11px] font-medium text-muted-foreground">
            Please finalize your attempt and submit your assessment to restore access.
          </p>
        </div>
      </div>
    </Card>
  );
}

export function ErrorNotice({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div role="alert" className="mx-3 mb-1 mt-3 animate-in fade-in slide-in-from-top-2 duration-200 sm:mx-6 md:mx-8">
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-destructive/25 bg-destructive/10 p-3 text-destructive-foreground shadow-xs backdrop-blur-md sm:p-3.5 dark:bg-rose-950/25 dark:text-rose-200">
        <div className="flex min-w-0 items-start gap-2.5 sm:items-center">
          <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-destructive/15 text-destructive sm:mt-0 dark:text-rose-400">
            <ShieldAlert className="size-4" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-foreground">Study Tutor Notice</div>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              {message === "Internal Server Error"
                ? "The AI study service encountered a temporary error. Please try again or ask a different question."
                : message}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDismiss}
          className="h-7 shrink-0 rounded-lg px-2.5 text-xs text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-foreground"
        >
          Dismiss
        </Button>
      </div>
    </div>
  );
}

export function LanguagePolicyNotice() {
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 shadow-lg backdrop-blur-md dark:text-amber-200"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
      <div>
        <strong className="block font-semibold">AI Study Tutor Disabled for Course</strong>
        <span className="opacity-90">
          The selected course has Kinyarwanda set as its instruction language. AI assistance is deactivated for
          Kinyarwanda modules according to institutional academic policy.
        </span>
      </div>
    </div>
  );
}

/** The floating pill naming the active knowledge scope, with a button to clear it. */
export function ScopePill({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <div className="pointer-events-auto absolute left-1/2 top-3 z-10 -translate-x-1/2">
      <div className="flex items-center gap-1.5 rounded-full border border-primary/20 bg-background/80 px-3 py-1 text-xs font-medium text-primary shadow-xs backdrop-blur-md animate-in fade-in slide-in-from-top-1 duration-200">
        <FileText className="size-3 shrink-0 text-primary" />
        <span className="max-w-[200px] truncate sm:max-w-xs">{label}</span>
        <button
          type="button"
          onClick={onClear}
          className="ml-0.5 flex size-3.5 items-center justify-center rounded-full text-primary/70 transition-colors hover:bg-primary/10 hover:text-primary"
          aria-label="Clear knowledge scope"
          title="Clear knowledge scope"
        >
          <X className="size-2.5" />
        </button>
      </div>
    </div>
  );
}

const SUGGESTIONS = [
  {
    title: "Explain Concept",
    label: "Database Normalization in simple terms",
    action: "Explain Database Normalization with step-by-step examples",
  },
  {
    title: "Active Recall",
    label: "SQL Joins practice scenarios",
    action: "Provide scenarios to test my understanding of SQL Outer and Inner Joins",
  },
  {
    title: "Academic Material Study",
    label: "Summarize selected context",
    action: "Summarize the key takeaways and learning outcomes from the selected resource",
  },
  {
    title: "Exam Preparation",
    label: "Common pitfalls and exam tips",
    action: "What are the most common exam mistakes and pitfalls for this topic?",
  },
];

/** Empty-chat hero: a greeting, the composer (as `children`), and starter prompts. */
export function TutorWelcome({
  children,
  onPick,
}: {
  children: React.ReactNode;
  onPick: (prompt: string) => void;
}) {
  return (
    <div className="narrow-scrollbar-dark flex flex-1 flex-col items-center justify-center overflow-y-auto p-4 sm:p-6 md:p-8">
      <div className="my-auto flex w-full max-w-2xl flex-col items-center space-y-4 text-center animate-in fade-in-50 duration-300 lg:max-w-3xl">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-2xs">
          <Sparkles className="size-6" />
        </div>
        <div className="max-w-lg space-y-1.5">
          <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl md:text-3xl">
            What would you like to study today?
          </h1>
          <p className="text-xs leading-relaxed text-muted-foreground sm:text-sm">
            This is your personal space to learn, master complex topics, and grow your skills. Ask anything, test your
            retention, or work through course materials.
          </p>
        </div>

        <div className="w-full pt-2">{children}</div>

        <div className="grid w-full grid-cols-1 gap-2.5 pt-1 sm:grid-cols-2">
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion.title}
              type="button"
              onClick={() => onPick(suggestion.action)}
              className="group space-y-1 rounded-xl border border-border/60 bg-card p-3 text-left text-xs font-medium shadow-2xs transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <div className="text-[10px] font-bold uppercase tracking-wide text-primary group-hover:underline">
                {suggestion.title}
              </div>
              <div className="truncate text-[11px] text-muted-foreground">{suggestion.label}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
