// app/lecturer/ai-assistant/page.tsx
"use client";

import React, { useState } from "react";
import {
  Card,
  CardDescription,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle,
  Edit3,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import {
  PureMultimodalInput,
  type Attachment,
} from "@/components/ui/multimodal-ai-chat-input";
import { geminiApi, ChatMessage } from "@/lib/api/gemini";
import { toast } from "sonner";

export default function LecturerAIAssistant() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState("");
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const suggestedActions = [
    {
      title: "Assessment Draft",
      label: "from a topic",
      action: "Generate a complete assessment draft from topic: ",
    },
    {
      title: "Create MCQs",
      label: "10 high-quality MCQs",
      action: "Create 10 high-quality MCQs on a specific topic: ",
    },
    {
      title: "Suggest Rubric",
      label: "for an essay question",
      action: "Suggest a detailed rubric for an essay question: ",
    },
    {
      title: "Improve Questions",
      label: "clarity and quality",
      action: "Improve the quality and clarity of these questions: ",
    },
  ];

  const handleSendMessage = async (params: { input: string; attachments: Attachment[] }) => {
    let userMessage = params.input.trim();
    if (!userMessage) return;

    if (params.attachments.length > 0) {
      const fileNames = params.attachments.map((a) => a.name).join(", ");
      userMessage = `${userMessage}\n\n[Attached Files: ${fileNames}]`;
    }

    setIsGenerating(true);

    try {
      const response = await geminiApi.chat({
        message: userMessage,
        system_prompt:
          "You are an expert academic assistant helping a lecturer create high-quality assessments. Be precise, professional, and follow best pedagogical practices.",
        history: history.slice(-10), // Keep last 10 turns
      });

      setGeneratedContent(response.reply);
      setHistory((prev) => [
        ...prev,
        { role: "user", content: userMessage },
        { role: "model", content: response.reply },
      ]);
    } catch (e) {
      toast.error("AI assistant failed to respond. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="w-full h-[calc(100vh-100px)] min-h-[500px]">
      <Card className="shadow-none border w-full flex flex-col h-full relative overflow-hidden bg-zinc-50/20 animate-in fade-in duration-300">
        {/* Top Header */}
        <div className="border-b bg-muted/5 px-4 py-3 flex items-center justify-between shrink-0 z-30">
          <div>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              Ask Your Assistant
            </CardTitle>
            <CardDescription className="text-xs">
              Create assessment blueprints, rubrics, question sets, or grading feedback
            </CardDescription>
          </div>
          {generatedContent && (
            <Badge variant="secondary" className="text-[10px] uppercase font-bold tracking-wider">
              Draft Ready
            </Badge>
          )}
        </div>

        {/* Scrollable Output Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-white/50">
          
          {/* Welcome Hero when no generated content */}
          {!generatedContent && !isGenerating && (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 max-w-xl mx-auto space-y-6">
              <div className="size-16 rounded-full bg-primary/10 flex items-center justify-center animate-pulse">
                <Sparkles className="size-8 text-primary" />
              </div>
              <div className="space-y-2">
                <h2 className="text-lg font-semibold tracking-tight font-medium animate-in slide-in-from-top-2 duration-300">Lecturer AI Assistant</h2>
                <p className="text-xs text-muted-foreground leading-relaxed max-w-md font-medium">
                  Draft high-quality exams and tests, generate rubrics, refine questions, or construct answer schemes. You retain full control and final approval.
                </p>
              </div>

              {/* Oversight Notice inside the flow */}
              <div className="p-4 rounded-xl border bg-amber-50/50 border-amber-500/20 flex gap-3 text-left max-w-md animate-in slide-in-from-bottom-2 duration-350">
                <ShieldCheck className="size-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-[11px] text-amber-900 leading-normal font-medium">
                  <strong>Review Policy:</strong> This assistant is designed to support your work. All generated content must be reviewed and approved by you before publishing.
                </div>
              </div>
            </div>
          )}

          {/* Loading/Generating State */}
          {isGenerating && (
            <div className="space-y-6 max-w-3xl mx-auto py-4">
              <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-widest animate-pulse">
                <Sparkles className="size-4 animate-spin text-primary" />
                AI Agent is drafting content...
              </div>
              <div className="space-y-3">
                <div className="h-4 bg-zinc-200 animate-pulse rounded-md w-3/4" />
                <div className="h-4 bg-zinc-200 animate-pulse rounded-md w-5/6" />
                <div className="h-4 bg-zinc-200 animate-pulse rounded-md w-1/2" />
              </div>
            </div>
          )}

          {/* Generated Content Output */}
          {generatedContent && (
            <div className="space-y-6 max-w-3xl mx-auto animate-in fade-in duration-300">
              <div className="space-y-2.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  Draft Content
                </h3>
                <div className="bg-white border rounded-2xl p-6 overflow-auto whitespace-pre-line text-sm leading-relaxed shadow-sm border-zinc-200/60">
                  {generatedContent}
                </div>
              </div>

              {/* Approval Action Buttons */}
              <div className="flex gap-3 pt-2 max-w-md">
                <Button className="flex-1 rounded-xl h-11 text-xs font-bold shadow-sm" size="default">
                  <CheckCircle className="mr-2 size-4" />
                  Approve &amp; Use
                </Button>
                <Button variant="outline" className="flex-1 rounded-xl h-11 text-zinc-700 text-xs font-bold shadow-sm" size="default">
                  <Edit3 className="mr-2 size-4" />
                  Edit Manually
                </Button>
              </div>
            </div>
          )}

        </div>

        {/* Input bar at the bottom */}
        <div className="p-4 border-t bg-white shrink-0 z-20">
          <div className="max-w-3xl mx-auto">
            <PureMultimodalInput
              chatId="lecturer-assistant"
              messages={history.map((h, i) => ({
                id: String(i),
                role: h.role,
                content: h.content,
              }))}
              attachments={attachments}
              setAttachments={setAttachments}
              onSendMessage={handleSendMessage}
              onStopGenerating={() => setIsGenerating(false)}
              isGenerating={isGenerating}
              canSend={!isGenerating}
              selectedVisibilityType="public"
              suggestedActions={suggestedActions}
              placeholder="Describe your task in detail... (e.g. Generate 10 MCQs on SQL Normalization)"
            />
          </div>
        </div>
      </Card>
    </div>
  );
}
