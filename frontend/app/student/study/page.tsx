// app/(student)/study/page.tsx
"use client"

import React, { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { 
  Brain, 
  Upload, 
  FileText, 
  Lightbulb, 
  Target, 
  BookOpen, 
  ArrowRight, 
  ShieldCheck 
} from "lucide-react"
import { cn } from "@/lib/utils"

const recentTopics = [
  "ACID Properties in Databases",
  "Time Complexity Analysis",
  "Normalization Techniques",
  "OSI Model Layers",
  "Query Optimization Strategies",
]

const uploadedResources = [
  { name: "Lecture Notes - Week 7.pdf", size: "2.4 MB", date: "Mar 25" },
  { name: "Past Papers - Algorithms 2025.pdf", size: "1.8 MB", date: "Mar 20" },
  { name: "Summary - Operating Systems.pdf", size: "890 KB", date: "Mar 18" },
  { name: "Weak Topics Analysis - Mar 2026.docx", size: "340 KB", date: "Mar 26" },
]

export default function StudentStudySupportPage() {
  const [prompt, setPrompt] = useState("")
  const [isThinking, setIsThinking] = useState(false)
  const [response, setResponse] = useState("")
  const [selectedResource, setSelectedResource] = useState<string | null>(null)

  const handleAskAI = async () => {
    if (!prompt.trim()) return
    setIsThinking(true)

    // TODO: Replace with real LangChain + FastAPI call (Student Study Support AI)
    setTimeout(() => {
      setResponse(
        `Based on your query "${prompt}":\n\n` +
        `• Core concept: ... (clear explanation)\n` +
        `• Common pitfalls: ...\n` +
        `• Revision priority: High – this appears frequently in CATs and summative exams.\n\n` +
        `Would you like me to:\n` +
        `• Generate 5 practice questions\n` +
        `• Create a mind map / summary\n` +
        `• Identify related weak topics from your uploaded resources?`
      )
      setIsThinking(false)
    }, 1350)
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight flex items-center gap-3">
          <Brain className="size-8 text-violet-600" />
          Study Support AI
        </h1>
        <p className="text-muted-foreground mt-1 max-w-3xl">
          Personalized revision guidance, concept explanations, learning gap analysis, 
          and active recall support. 
          <span className="text-emerald-600 font-medium"> This tool is strictly for revision and homework only.</span>
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Main AI Interaction Area */}
        <div className="lg:col-span-7">
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="text-lg">Ask Your Personal Study Assistant</CardTitle>
              <CardDescription>
                Explain concepts • Identify weak areas • Suggest revision priorities • Generate practice questions
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <Textarea
                placeholder="Explain ACID properties with real banking examples... or Suggest a revision plan for Normalization..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="min-h-[120px] resize-y text-sm"
              />

              <Button 
                onClick={handleAskAI} 
                disabled={isThinking || !prompt.trim()} 
                className="w-full"
                size="lg"
              >
                {isThinking ? "AI is thinking..." : "Get Study Guidance"}
                <ArrowRight className="ml-2 size-5" />
              </Button>

              {response && (
                <Card className="bg-muted/50 border-violet-500/30">
                  <CardContent className="p-6 whitespace-pre-line text-sm text-foreground leading-relaxed">
                    {response}
                  </CardContent>
                </Card>
              )}

              {/* Quick Prompts */}
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-3">Quick starters:</p>
                <div className="flex flex-wrap gap-2">
                  {recentTopics.map((topic, i) => (
                    <Button 
                      key={i} 
                      variant="outline" 
                      size="sm"
                      onClick={() => setPrompt(`Help me revise and understand ${topic}`)}
                    >
                      {topic}
                    </Button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar – Resources & Rules */}
        <div className="lg:col-span-5 space-y-6">
          {/* Uploaded Resources */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Upload className="size-5" /> My Personal Study Resources
                </CardTitle>
                <Button size="sm" variant="outline">
                  <Upload className="mr-2 size-4" /> Upload
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {uploadedResources.map((file, i) => (
                <div 
                  key={i} 
                  className={cn(
                    "flex items-center gap-3 rounded-xl border p-4 hover:bg-muted/50 cursor-pointer transition-colors",
                    selectedResource === file.name && "border-violet-500 bg-violet-950/30"
                  )}
                  onClick={() => setSelectedResource(file.name)}
                >
                  <FileText className="size-5 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{file.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{file.size} • {file.date}</div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Smart Study Tips */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Lightbulb className="size-5 text-amber-500" /> AI-Powered Study Tips
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5 text-sm">
              <div className="flex gap-3">
                <Target className="size-5 text-emerald-500 mt-0.5 flex-shrink-0" />
                <div>Normalization shows as a recurring weak area. Focus here before the next CAT.</div>
              </div>
              <div className="flex gap-3">
                <BookOpen className="size-5 text-violet-500 mt-0.5 flex-shrink-0" />
                <div>Use active recall: explain concepts out loud before checking your notes.</div>
              </div>
            </CardContent>
          </Card>

          {/* Strict Integrity Notice */}
          <Card className="border-amber-500/30 bg-amber-50 dark:bg-amber-950/30">
            <CardContent className="p-6 flex items-start gap-4">
              <ShieldCheck className="size-6 text-amber-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium">This AI is for revision and learning only.</p>
                <p className="text-sm text-muted-foreground mt-1">
                  It is disabled during all CATs, summative exams, 
                  and any supervised or restricted assessments.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}