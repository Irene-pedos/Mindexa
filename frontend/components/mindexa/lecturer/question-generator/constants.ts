import { BookOpen, CheckCircle2, FileText, HelpCircle, Layers } from "lucide-react";
import type { GenerateQuestionsRequest } from "@/lib/api/ai-generation";

export type QuestionFormatId = Extract<
  GenerateQuestionsRequest["question_type"],
  "mcq" | "short_answer" | "true_false" | "essay" | "computational" | "case_study"
>;

export const QUESTION_FORMATS: readonly {
  id: QuestionFormatId;
  title: string;
  shortLabel: string;
  description: string;
  icon: typeof CheckCircle2;
}[] = [
  {
    id: "mcq",
    title: "Multiple Choice",
    shortLabel: "MCQ",
    description: "4 options with 1 verified correct answer & plausible distractors",
    icon: CheckCircle2,
  },
  {
    id: "short_answer",
    title: "Short Answer",
    shortLabel: "Short Answer",
    description: "Direct response with model solution & grading criteria",
    icon: FileText,
  },
  {
    id: "true_false",
    title: "True / False",
    shortLabel: "True/False",
    description: "Binary conceptual statement testing core principles",
    icon: CheckCircle2,
  },
  {
    id: "essay",
    title: "Essay / Open",
    shortLabel: "Essay",
    description: "Comprehensive prompt with analytic rubric & expected arguments",
    icon: BookOpen,
  },
  {
    id: "computational",
    title: "Computational",
    shortLabel: "Problem",
    description: "Step-by-step mathematical, numerical, or algorithmic exercise",
    icon: Layers,
  },
  {
    id: "case_study",
    title: "Case Study",
    shortLabel: "Case Study",
    description: "Authentic scenario with contextual multi-part questions",
    icon: HelpCircle,
  },
];

export const BLOOM_LEVELS = [
  { value: "remember", label: "Remember", desc: "Recall definitions, terminology & facts" },
  { value: "understand", label: "Understand", desc: "Explain concepts & interpret ideas" },
  { value: "apply", label: "Apply", desc: "Execute in new or concrete situations" },
  { value: "analyze", label: "Analyze", desc: "Examine relationships & structure" },
  { value: "evaluate", label: "Evaluate", desc: "Justify, critique & assess validity" },
  { value: "create", label: "Create", desc: "Design, synthesize & produce solutions" },
] as const;

export const DIFFICULTIES = [
  { value: "easy", label: "Easy", color: "text-emerald-700 dark:text-emerald-300 border-emerald-500/60 bg-emerald-500/10" },
  { value: "medium", label: "Medium", color: "text-amber-700 dark:text-amber-300 border-amber-500/60 bg-amber-500/10" },
  { value: "hard", label: "Hard", color: "text-rose-700 dark:text-rose-300 border-rose-500/60 bg-rose-500/10" },
] as const;

export const SUGGESTED_TOPICS = [
  "Database Normalization (1NF, 2NF, BCNF)",
  "Data Structures & Big-O Complexity",
  "Software Architecture & Design Patterns",
  "Network Protocols & OSI Layers",
];

export const BATCH_SIZES = [3, 5, 10] as const;
export const MAX_BATCH_COUNT = 15;
