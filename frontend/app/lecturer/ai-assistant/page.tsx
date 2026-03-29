// app/lecturer/ai-assistant/page.tsx
"use client"

import React, { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { 
  Bot, 
  Sparkles, 
  FileText, 
  CheckCircle, 
  Edit3, 
  ShieldCheck,
  AlertTriangle 
} from "lucide-react"
import { AdvancedChatInput, type FileAttachment } from "@/components/advanced-ai-chat-input"
import { cn } from "@/lib/utils"

export default function LecturerAIAssistant() {
  const [prompt, setPrompt] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedContent, setGeneratedContent] = useState("")
  const [selectedTask, setSelectedTask] = useState("")
  const [attachedFiles, setAttachedFiles] = useState<FileAttachment[]>([])

  const quickTasks = [
    "Generate a complete assessment draft from topic",
    "Create 10 high-quality MCQs on a specific topic",
    "Suggest a detailed rubric for an essay question",
    "Improve the quality and clarity of these questions",
    "Generate a complete answer key and marking scheme",
    "Draft personalized feedback templates",
    "Analyze topic coverage and difficulty balance",
    "Generate practice questions from uploaded lecture notes",
  ]

  const handleSend = () => {
    if (!prompt.trim() && !selectedTask) return

    setIsGenerating(true)
    setGeneratedContent("")

    // Simulate LangChain + FastAPI Brain call
    setTimeout(() => {
      let output = ""

      if (selectedTask.includes("MCQs")) {
        output = `10 High-Quality MCQs on Database Normalization (with answer key):\n\n` +
                 `1. What is the main goal of normalization?\n` +
                 `   A) Increase redundancy   B) Reduce redundancy   C) ... \n\n` +
                 `AI Confidence: 96% • Suggested difficulty: Balanced`
      } else if (selectedTask.includes("rubric")) {
        output = `Recommended Rubric for Essay Question (Total: 20 marks)\n\n` +
                 `• Depth of Understanding (8 marks)\n` +
                 `• Structure and Logical Flow (6 marks)\n` +
                 `• Use of Examples & References (6 marks)\n\n` +
                 `Descriptors for each level provided.`
      } else if (selectedTask.includes("assessment draft")) {
        output = `Assessment Draft: Mid-Semester CAT – Operating Systems\n\n` +
                 `Type: CAT | Duration: 90 min | Total Marks: 100\n` +
                 `Blueprint: 3 sections with balanced difficulty...\n\n` +
                 `Ready for your review and edits.`
      } else {
        output = `AI Draft for: "${prompt || selectedTask}"\n\n` +
                 `Professional academic content generated.\n` +
                 `Please review carefully, make any necessary edits, and approve before using in any live assessment.`
      }

      setGeneratedContent(output)
      setIsGenerating(false)
    }, 1600)
  }

  const handleFileRemove = (id: string | number) => {
    setAttachedFiles(prev => prev.filter(f => f.id !== id))
  }

  const actionIcons = [
    <Button key="upload" variant="ghost" size="icon" title="Attach lecture notes or past papers">
      <FileText className="size-5" />
    </Button>,
    <Button key="spark" variant="ghost" size="icon" title="Enhance prompt">
      <Sparkles className="size-5" />
    </Button>,
  ]

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight flex items-center gap-3">
          <Bot className="size-9 text-violet-500" />
          Lecturer AI Assistant
        </h1>
        <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
          AI-powered support for assessment creation, question improvement, rubric design, 
          and feedback drafting. <strong>You retain full control and final approval.</strong>
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
        {/* Task Selection & Input */}
        <div className="xl:col-span-7 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>What do you need help with today?</CardTitle>
              <CardDescription>
                Choose a quick task or describe your own requirement
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex flex-wrap gap-2">
                {quickTasks.map((task, index) => (
                  <Button
                    key={index}
                    variant={selectedTask === task ? "default" : "outline"}
                    size="sm"
                    className="text-left h-auto py-2 px-4"
                    onClick={() => {
                      setSelectedTask(task)
                      setPrompt("")
                    }}
                  >
                    {task}
                  </Button>
                ))}
              </div>

              <Separator />

              <AdvancedChatInput
                textareaProps={{
                  placeholder: "Describe your task in detail...\nExample: Generate a 60-mark summative assessment blueprint on Data Structures with 40% easy, 40% medium, 20% hard questions...",
                  value: prompt,
                  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => {
                    setPrompt(e.target.value)
                    if (e.target.value) setSelectedTask("")
                  },
                }}
                files={attachedFiles}
                onFileRemove={handleFileRemove}
                onSend={handleSend}
                actionIcons={actionIcons}
              />

              <Button
                onClick={handleSend}
                disabled={isGenerating || (!prompt.trim() && !selectedTask)}
                size="lg"
                className="w-full h-12"
              >
                {isGenerating ? "AI is working..." : "Generate with AI Assistant"}
                <Sparkles className="ml-3 size-5" />
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* AI Output & Approval Area */}
        <div className="xl:col-span-5">
          <Card className="h-full flex flex-col">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                AI Output 
                <Badge variant="secondary" className="ml-auto">Draft Only</Badge>
              </CardTitle>
              <CardDescription>
                Always review, edit, and approve before using in any assessment
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col">
              {generatedContent ? (
                <div className="flex-1 bg-card border rounded-2xl p-6 overflow-auto whitespace-pre-line text-sm leading-relaxed">
                  {generatedContent}
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center text-center text-muted-foreground border border-dashed rounded-2xl">
                  Your AI-generated draft will appear here.<br />
                  Review it carefully before approval.
                </div>
              )}

              {generatedContent && (
                <div className="mt-6 flex gap-3">
                  <Button className="flex-1" size="lg">
                    <CheckCircle className="mr-2 size-5" />
                    Approve &amp; Use
                  </Button>
                  <Button variant="outline" className="flex-1" size="lg">
                    <Edit3 className="mr-2 size-5" />
                    Edit Manually
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Human Oversight & Safety Banner */}
      <Card className="border-amber-500/30">
        <CardContent className=" flex gap-4">
          <ShieldCheck className="size-6 text-amber-500 mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            <strong>Important:</strong> This AI Assistant is designed to support your work, not replace it. 
            All generated content (assessments, questions, rubrics, feedback) must be carefully reviewed and 
            approved by you before being published to students. AI suggestions are never final.
          </div>
        </CardContent>
      </Card>
    </div>
  )
}