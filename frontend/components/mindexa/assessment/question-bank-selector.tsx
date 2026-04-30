// components/mindexa/assessment/question-bank-selector.tsx
"use client";

import React, { useState, useEffect } from "react";
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
import { Search, Plus, BookOpen, Loader2, Filter } from "lucide-react";
import { questionApi, QuestionBankItem } from "@/lib/api/question";
import { toast } from "sonner";

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

  const fetchQuestions = async () => {
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
  };

  useEffect(() => {
    if (isOpen) {
      fetchQuestions();
    }
  }, [isOpen, search, type, difficulty]);

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button 
          variant="dashed" 
          className="flex-1 h-16 border-2 border-muted hover:border-primary/50 hover:bg-primary/5 rounded-2xl"
        >
          <BookOpen className="mr-2 size-4" /> Import from Bank
        </Button>
      </SheetTrigger>
      <SheetContent className="sm:max-w-[600px] flex flex-col h-full">
        <SheetHeader>
          <SheetTitle>Question Bank</SheetTitle>
          <SheetDescription>
            Browse and select questions to add to your assessment.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 my-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search questions..."
              className="pl-9 rounded-full"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="flex gap-4">
            <div className="flex-1 space-y-1.5">
              <Label className="text-xs uppercase text-muted-foreground">Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="MCQ">Multiple Choice</SelectItem>
                  <SelectItem value="SHORT_ANSWER">Short Answer</SelectItem>
                  <SelectItem value="ESSAY">Essay</SelectItem>
                  <SelectItem value="TRUE_FALSE">True/False</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 space-y-1.5">
              <Label className="text-xs uppercase text-muted-foreground">Difficulty</Label>
              <Select value={difficulty} onValueChange={setDifficulty}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="All" />
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

        <ScrollArea className="flex-1 pr-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
              <Loader2 className="size-8 animate-spin" />
              <p>Searching bank...</p>
            </div>
          ) : questions.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              <p>No questions found in the bank.</p>
            </div>
          ) : (
            <div className="space-y-4 pb-8">
              {questions.map((q) => {
                const isSelected = selectedIds.includes(q.id);
                return (
                  <div
                    key={q.id}
                    className="border rounded-2xl p-4 space-y-3 hover:bg-muted/30 transition-colors group relative"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex gap-2">
                        <Badge variant="outline" className="capitalize">
                          {q.question_type}
                        </Badge>
                        <Badge variant="secondary" className="capitalize">
                          {q.difficulty.toLowerCase()}
                        </Badge>
                      </div>
                      <Button
                        size="sm"
                        variant={isSelected ? "secondary" : "default"}
                        disabled={isSelected}
                        onClick={() => onSelect(q)}
                        className="rounded-full"
                      >
                        {isSelected ? "Added" : <><Plus className="mr-1 size-3" /> Add</>}
                      </Button>
                    </div>
                    <p className="text-sm line-clamp-3">{q.content}</p>
                    <div className="text-xs text-muted-foreground flex items-center gap-3">
                      <span>{q.marks} Marks</span>
                      {q.topic && <span>• {q.topic}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
        
        <SheetFooter className="pt-4 border-t mt-auto">
          <Button variant="ghost" onClick={() => setIsOpen(false)}>Done</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
