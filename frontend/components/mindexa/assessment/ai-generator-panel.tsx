"use client";

import React, { useState, useRef, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, BrainCircuit, AlertCircle, Sparkles, CheckCircle2, XCircle, Clock } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import { aiGenerationApi, AIGenerationBatchDetailResponse, GenerateQuestionsRequest, ReviewAIQuestionRequest } from "@/lib/api/ai-generation";

export function AIGeneratorPanel({ onQuestionPromoted }: { onQuestionPromoted?: () => void }) {
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [batch, setBatch] = useState<AIGenerationBatchDetailResponse | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [formData, setFormData] = useState<GenerateQuestionsRequest>({
    subject: "",
    topic: "",
    question_type: "mcq",
    difficulty: "medium",
    count: 3,
    bloom_level: "understand",
    additional_context: "",
  });

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setPolling(false);
  }, []);

  const startPolling = useCallback((batchId: string) => {
    setPolling(true);
    let attempts = 0;
    const MAX_ATTEMPTS = 40; // ~2 minutes at 3s intervals

    pollRef.current = setInterval(async () => {
      attempts++;
      try {
        const updated = await aiGenerationApi.getBatch(batchId);
        setBatch(updated);

        const isDone = updated.status === "completed" || updated.status === "failed";
        if (isDone || attempts >= MAX_ATTEMPTS) {
          stopPolling();
          if (updated.status === "completed") {
            const count = (updated.questions ?? []).length;
            toast.success(`${count} question${count !== 1 ? "s" : ""} generated. Review required.`);
          } else if (updated.status === "failed") {
            setError(updated.error_message || "Generation failed on the server.");
          } else if (attempts >= MAX_ATTEMPTS) {
            setError("Generation is taking too long. Please refresh and check back later.");
          }
        }
      } catch (err) {
        stopPolling();
        setError("Could not check generation status. Please refresh.");
      }
    }, 3000);
  }, [stopPolling]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    stopPolling();
    setLoading(true);
    setError(null);
    setBatch(null);

    try {
      const res = await aiGenerationApi.generateQuestions(formData);
      setBatch(res);
      // If still pending/processing, start polling for completion
      if (res.status === "pending" || res.status === "processing") {
        toast.info("Generation started. Waiting for AI to complete…");
        startPolling(res.id);
      } else {
        const count = (res.questions ?? []).length;
        toast.success(`${count} question${count !== 1 ? "s" : ""} generated. Review required.`);
      }
    } catch (err: any) {
      setError(err.message || "Failed to generate questions.");
      toast.error("Generation failed");
    } finally {
      setLoading(false);
    }
  };

  const handleReview = async (questionId: string, decision: ReviewAIQuestionRequest["decision"]) => {
    setReviewingId(questionId);
    try {
      await aiGenerationApi.reviewQuestion(questionId, { decision });
      
      // Update local state to remove the reviewed question
      if (batch) {
        setBatch({
          ...batch,
          questions: (batch.questions ?? []).filter(q => q.id !== questionId)
        });
      }
      
      if (decision === "approved" || decision === "edited") {
        toast.success("Question promoted to Question Bank");
        if (onQuestionPromoted) onQuestionPromoted();
      } else {
        toast.info(`Question marked as ${decision}`);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to submit review decision");
    } finally {
      setReviewingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="shadow-none border border-dashed border-primary/20 bg-muted/5">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <BrainCircuit className="size-5 text-primary" />
            <CardTitle className="text-lg">AI Assessment Generator</CardTitle>
          </div>
          <CardDescription>
            Generate draft questions. All AI output must be reviewed by a lecturer before entering the question bank.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleGenerate} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Subject</Label>
                <Input 
                  placeholder="e.g., Computer Science" 
                  value={formData.subject}
                  onChange={e => setFormData({...formData, subject: e.target.value})}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Topic</Label>
                <Input 
                  placeholder="e.g., Database Normalization" 
                  value={formData.topic}
                  onChange={e => setFormData({...formData, topic: e.target.value})}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Question Type</Label>
                <Select value={formData.question_type} onValueChange={(v: any) => setFormData({...formData, question_type: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mcq">Multiple Choice</SelectItem>
                    <SelectItem value="true_false">True / False</SelectItem>
                    <SelectItem value="short_answer">Short Answer</SelectItem>
                    <SelectItem value="essay">Essay</SelectItem>
                    <SelectItem value="fill_blank">Fill in the Blanks</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Bloom&apos;s Taxonomy Level</Label>
                <Select value={formData.bloom_level} onValueChange={(v: any) => setFormData({...formData, bloom_level: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="remember">Remember (Knowledge)</SelectItem>
                    <SelectItem value="understand">Understand (Comprehension)</SelectItem>
                    <SelectItem value="apply">Apply (Application)</SelectItem>
                    <SelectItem value="analyze">Analyze (Analysis)</SelectItem>
                    <SelectItem value="evaluate">Evaluate (Evaluation)</SelectItem>
                    <SelectItem value="create">Create (Synthesis)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Difficulty</Label>
                <Select value={formData.difficulty} onValueChange={(v: any) => setFormData({...formData, difficulty: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="easy">Easy</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="hard">Hard</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Count (Max 10)</Label>
                <Input 
                  type="number" 
                  min="1" 
                  max="10" 
                  value={formData.count}
                  onChange={e => setFormData({...formData, count: parseInt(e.target.value)})}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Additional Context (Optional)</Label>
              <Textarea 
                placeholder="Paste learning objectives or specific syllabus requirements..." 
                value={formData.additional_context}
                onChange={e => setFormData({...formData, additional_context: e.target.value})}
                className="h-20"
              />
            </div>

            <Button type="submit" disabled={loading || polling} className="w-full">
              {loading ? <><Loader2 className="mr-2 size-4 animate-spin"/>Submitting…</> 
               : polling ? <><Loader2 className="mr-2 size-4 animate-spin"/>Waiting for AI…</>
               : <><Sparkles className="mr-2 size-4"/>Generate Drafts</>}
            </Button>
          </form>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Generation Failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Polling status */}
      {polling && batch && (batch.status === "pending" || batch.status === "processing") && (
        <Alert>
          <Clock className="size-4" />
          <AlertTitle>AI is generating questions…</AlertTitle>
          <AlertDescription>
            This may take up to 60 seconds. The results will appear automatically below.
          </AlertDescription>
        </Alert>
      )}

      {/* Review Queue */}
      {batch && (batch.questions ?? []).length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Pending Review ({(batch.questions ?? []).length})</h3>
          
          <div className="space-y-4">
            {(batch.questions ?? []).map((q) => (
              <Card key={q.id} className="border-warning/50 shadow-sm relative overflow-hidden">
                {/* Visual indicator for draft status */}
                <div className="absolute top-0 left-0 w-1 h-full bg-amber-500/50" />
                
                <CardHeader className="pb-3 border-b bg-muted/20">
                  <div className="flex items-start justify-between">
                    <div className="flex gap-2 items-center">
                      <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-200 bg-amber-50">
                        AI Draft
                      </Badge>
                      <Badge variant="secondary" className="text-[10px]">
                        {q.bloom_level || "Unknown Bloom"}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-4 space-y-4">
                  <div>
                    <h4 className="font-semibold text-sm mb-2 text-foreground/80">Generated Question:</h4>
                    <p className="text-base">{q.parsed_question_text}</p>
                  </div>
                  
                  {q._options && q._options.length > 0 && (
                    <div className="space-y-2 mt-4 pl-4 border-l-2 border-muted">
                      {q._options.map((opt, idx) => (
                        <div key={idx} className={`flex items-start gap-2 text-sm ${opt.is_correct ? 'text-emerald-700 font-medium' : 'text-muted-foreground'}`}>
                          <div className="mt-0.5">{opt.is_correct ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4 opacity-50" />}</div>
                          <span>{opt.text}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {q.parsed_explanation && (
                    <div className="mt-4 p-3 bg-muted/30 rounded-md text-sm text-muted-foreground">
                      <span className="font-bold text-xs uppercase tracking-wider">Explanation / Rubric: </span>
                      <br/>{q.parsed_explanation}
                    </div>
                  )}
                </CardContent>
                <CardFooter className="bg-muted/10 border-t flex justify-end gap-2 py-3">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    disabled={reviewingId === q.id}
                    onClick={() => handleReview(q.id, "rejected")}
                  >
                    Reject
                  </Button>
                  <Button 
                    size="sm" 
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    disabled={reviewingId === q.id}
                    onClick={() => handleReview(q.id, "approved")}
                  >
                    {reviewingId === q.id ? <Loader2 className="size-4 animate-spin" /> : "Approve & Promote"}
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
