// components/mindexa/assessment/question-bank-selector.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Plus, BookOpen, Loader2, Database } from "lucide-react";
import { questionApi, QuestionBankItem } from "@/lib/api/question";
import { toast } from "sonner";
import { Separator } from "@/components/ui/separator";

interface QuestionBankSelectorProps {
  onSelect: (question: QuestionBankItem) => void;
  selectedIds: string[];
}

export function QuestionBankSelector({ onSelect, selectedIds }: QuestionBankSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [questions, setQuestions] = useState<QuestionBankItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [type, setType] = useState<string>("all");
  const [difficulty, setDifficulty] = useState<string>("all");

  const fetchQuestions = useCallback(async () => {
    setLoading(true);
    try {
      const response = await questionApi.getQuestions({
        q: search,
        type: type === "all" ? undefined : type,
        difficulty: difficulty === "all" ? undefined : difficulty,
        page_size: 50,
      });
      setQuestions(response.items);
    } catch (error) {
      console.error("Failed to fetch questions", error);
      toast.error("Could not load question bank");
    } finally {
      setLoading(false);
    }
  }, [search, type, difficulty]);

  useEffect(() => {
    if (isOpen) {
      fetchQuestions();
    }
  }, [isOpen, fetchQuestions]);

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button 
          variant="outline" 
          className="flex-1 h-20 border-2 border-dashed hover:border-primary/50 hover:bg-primary/5 transition-all flex flex-col gap-1.5"
        >
          <Database className="size-5 text-primary" />
          <span className="font-bold uppercase text-[10px] tracking-wider">Import from Bank</span>
        </Button>
      </SheetTrigger>
      <SheetContent className="sm:max-w-[540px] flex flex-col h-full p-0">
        <SheetHeader className="p-6 pb-0">
          <SheetTitle className="text-xl">Institutional Question Bank</SheetTitle>
          <SheetDescription>
            Search and select high-integrity items for your assessment.
          </SheetDescription>
        </SheetHeader>

        <div className="px-6 space-y-4 my-6">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <Input
              placeholder="Search library..."
              className="pl-9 h-10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="flex gap-3">
            <div className="flex-1 space-y-1.5">
              <Label className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider px-1">Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="MCQ">Multiple Choice</SelectItem>
                  <SelectItem value="SHORT_ANSWER">Short Answer</SelectItem>
                  <SelectItem value="ESSAY">Essay</SelectItem>
                  <SelectItem value="TRUE_FALSE">True/False</SelectItem>
                  <SelectItem value="MATCHING">Matching</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 space-y-1.5">
              <Label className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider px-1">Difficulty</Label>
              <Select value={difficulty} onValueChange={setDifficulty}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Levels</SelectItem>
                  <SelectItem value="EASY">Easy</SelectItem>
                  <SelectItem value="MEDIUM">Medium</SelectItem>
                  <SelectItem value="HARD">Hard</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <Separator />

        <ScrollArea className="flex-1 px-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
              <Loader2 className="size-8 animate-spin text-primary" />
              <p className="text-xs font-medium uppercase tracking-widest">Searching records...</p>
            </div>
          ) : questions.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              <Database className="size-10 mx-auto opacity-20 mb-3" />
              <p className="text-sm font-medium">No matching items in your library.</p>
            </div>
          ) : (
            <div className="space-y-3 py-6 pb-12">
              {questions.map((q) => {
                const isSelected = selectedIds.includes(q.id);
                return (
                  <div
                    key={q.id}
                    className="border rounded-lg p-4 space-y-3 hover:bg-muted/30 transition-colors group relative"
                  >
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex flex-wrap gap-1.5">
                        <Badge variant="outline" className="capitalize text-[10px] font-bold">
                          {q.question_type.toLowerCase().replace("_", " ")}
                        </Badge>
                        <Badge variant="secondary" className="capitalize text-[10px] font-bold">
                          {q.difficulty.toLowerCase()}
                        </Badge>
                      </div>
                      <Button
                        size="sm"
                        variant={isSelected ? "secondary" : "default"}
                        disabled={isSelected}
                        onClick={() => onSelect(q)}
                        className="h-7 px-3 text-[11px] font-bold uppercase tracking-tight"
                      >
                        {isSelected ? "Added" : <><Plus className="mr-1.5 size-3" /> Add</>}
                      </Button>
                    </div>
                    <p className="text-sm leading-snug font-medium line-clamp-3 text-foreground/80">{q.content}</p>
                    <div className="text-[10px] font-bold uppercase text-muted-foreground flex items-center gap-3 pt-1">
                      <span className="flex items-center gap-1.5">
                        <span className="size-1 rounded-full bg-primary" />
                        {q.marks} Marks
                      </span>
                      {q.topic && (
                        <span className="flex items-center gap-1.5 border-l pl-3 italic">
                          {q.topic}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
        
        <SheetFooter className="p-6 pt-2 border-t bg-muted/10">
          <Button variant="ghost" onClick={() => setIsOpen(false)} className="font-semibold w-full sm:w-auto">Finish Selection</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
