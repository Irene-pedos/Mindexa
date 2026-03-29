// app/(student)/assessments/[id]/take/page.tsx
"use client"

import React, { useState, useEffect, useCallback, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { 
  Timer, 
  AlertTriangle, 
  ArrowLeft, 
  ArrowRight, 
  CheckCircle, 
  ShieldCheck, 
  Lock, 
  Monitor, 
  BookOpen,
  Save,
  EyeOff
} from "lucide-react"
import { cn } from "@/lib/utils"

// ─────────────────────────────────────────────────────────────
// ASSESSMENT TAKE PAGE – PRODUCTION-READY STUDENT EXPERIENCE
// ─────────────────────────────────────────────────────────────
// Page Purpose (per product brief):
//   • Full end-to-end secure assessment participation flow for any mode
//   • Institutional-grade UX: calm, focused, zero-distraction, high-security
//   • Supports EVERY required question type with flexible rendering
//   • Enforces all assessment modes (Closed Book, Supervised, AI Blocked, Fullscreen, etc.)
//   • Real-time integrity monitoring + escalating warnings (serious, controlled tone)
//   • Autosave + visual feedback
//   • Section-aware ready (future-proofed)
//   • Uses new dark theme from globals.css (semantic Tailwind + shadcn vars)
//   • Type-safe, accessible, responsive, modular, ready for FastAPI Brain integration
//
// UX Logic & Flow (exactly as specified in the master prompt):
//   1. Intro screen → shows title, type, instructions, modes, duration, rules
//   2. Password screen (if protected)
//   3. Readiness confirmation (human oversight + explicit consent)
//   4. Enter fullscreen → begin timed attempt
//   5. In-progress interface with timer, progress, navigator, answer inputs, autosave
//   6. Integrity Guard live (fullscreen, visibility, blur, copy/paste detection)
//   7. Submit / Auto-submit → final confirmation + redirect to results
//
// Security-First / Zero-Trust:
//   • Fullscreen enforcement + live violation logging
//   • Escalating warnings (1 = mild, 2 = stronger, 3 = flagged + lecturer notified)
//   • Closed-book → copy/paste detection
//   • AI Blocked → explicit banner, no AI entry point
//   • Autosave to prevent data loss (future WebSocket → FastAPI)

type QuestionType = "mcq" | "truefalse" | "shortanswer" | "essay" | "matching" | "fillblank" | "ordering" | "computational" | "casestudy"

interface Question {
  id: number
  section: string
  type: QuestionType
  text: string
  marks: number
  options?: string[] | { left: string; right: string }[]
  items?: (string | { left: string; right: string })[]
  prompt?: string
  blanksCount?: number
}

const mockAssessment: {
  id: string
  title: string
  type: string
  durationMinutes: number
  totalMarks: number
  instructions: string
  passwordProtected: boolean
  mockPassword?: string
  isClosedBook: boolean
  isSupervised: boolean
  isAIAllowed: boolean
  isFullscreenRequired: boolean
  resultRelease: string
  questions: Question[]
} = {
  id: "db-cat-301",
  title: "Mid-Semester CAT – Database Systems",
  type: "CAT",
  durationMinutes: 90,
  totalMarks: 50,
  instructions: "Closed Book • Supervised Mode • AI Blocked • Fullscreen Required • No external resources",
  passwordProtected: true,
  mockPassword: "mindexa2026",
  isClosedBook: true,
  isSupervised: true,
  isAIAllowed: false,
  isFullscreenRequired: true,
  resultRelease: "delayed",
  questions: [
    {
      id: 1,
      section: "Section A – Fundamentals",
      type: "mcq",
      text: "What is the primary key constraint in relational databases?",
      options: ["A. Uniquely identifies each record", "B. Allows duplicate values", "C. Can be null", "D. Is optional"],
      marks: 4,
    },
    {
      id: 2,
      section: "Section A – Fundamentals",
      type: "truefalse",
      text: "Normalization is used to eliminate redundant data and ensure data integrity.",
      marks: 2,
    },
    {
      id: 3,
      section: "Section B – Theory",
      type: "shortanswer",
      text: "Explain the difference between SQL and NoSQL databases in one concise paragraph.",
      marks: 6,
    },
    {
      id: 4,
      section: "Section B – Theory",
      type: "essay",
      text: "Explain ACID properties with real-world examples from banking systems.",
      marks: 10,
    },
    {
      id: 5,
      section: "Section C – Application",
      type: "matching",
      text: "Match the following database terms with their definitions.",
      items: [
        { left: "Primary Key", right: "" },
        { left: "Foreign Key", right: "" },
        { left: "Index", right: "" },
      ],
      options: ["Uniquely identifies a record", "Links tables together", "Improves query performance"],
      marks: 6,
    },
    {
      id: 6,
      section: "Section C – Application",
      type: "fillblank",
      text: "Complete the sentence:",
      prompt: "In a relational database, data is stored in _____ and relationships are defined using _____.",
      blanksCount: 2,
      marks: 4,
    },
    {
      id: 7,
      section: "Section D – Advanced",
      type: "ordering",
      text: "Arrange the following steps in the correct order for a typical SQL query execution plan.",
      items: ["Parse", "Optimize", "Execute", "Fetch results"],
      marks: 8,
    },
    {
      id: 8,
      section: "Section D – Advanced",
      type: "computational",
      text: "Given the relation R(A,B,C) with functional dependencies A→B, B→C, compute the highest normal form and explain why.",
      marks: 10,
    },
  ],
}

type Stage = "intro" | "password" | "readiness" | "taking" | "submitted"

export default function StudentAssessmentTake() {
  const params = useParams()
  const router = useRouter()

  // ── Core state ─────────────────────────────────────────────────────
  const [stage, setStage] = useState<Stage>("intro")
  const [timeLeft, setTimeLeft] = useState(mockAssessment.durationMinutes * 60)
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string | number, string | string[] | Record<string, string>>>({})
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [warnings, setWarnings] = useState(0)
  const [showWarningModal, setShowWarningModal] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [passwordInput, setPasswordInput] = useState("")
  const [passwordError, setPasswordError] = useState(false)
  const [readinessChecked, setReadinessChecked] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  
  const [assessment] = useState(mockAssessment)
  const currentQ = assessment.questions[currentQuestionIndex]

  // ── Timer (only active during taking stage) ───────────────────────
  useEffect(() => {
    if (stage !== "taking" || timeLeft <= 0) return

    const timer = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          handleAutoSubmit()
          return 0
        }
        return t - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [stage, timeLeft])

  // ── Autosave simulation (debounced – ready for FastAPI Brain) ─────
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const triggerAutosave = useCallback(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(() => {
      // TODO: POST to /brain/assessments/{id}/save-attempt (WebSocket in future)
      setLastSaved(new Date())
    }, 1200)
  }, [])

  useEffect(() => {
    if (stage === "taking") triggerAutosave()
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    }
  }, [answers, stage, triggerAutosave])

  // ── Integrity Guard – real-time monitoring (Zero-Trust) ───────────
  const incrementWarning = useCallback((reason: string) => {
    setWarnings((w) => {
      const newCount = Math.min(w + 1, 3)
      if (newCount >= 3) {
        // In real system this would emit to WebSocket → Lecturer Live Supervision
        console.warn(`[INTEGRITY] Critical violation logged: ${reason}`)
      }
      return newCount
    })
    setShowWarningModal(true)
  }, [])

  // Fullscreen enforcement
  const enterFullscreen = useCallback(async () => {
    try {
      const elem = document.documentElement
      if (elem.requestFullscreen) await elem.requestFullscreen()
      setIsFullscreen(true)
    } catch {
      incrementWarning("fullscreen-request-failed")
    }
  }, [incrementWarning])

  useEffect(() => {
    if (stage !== "taking") return

    const handleFullscreenChange = () => {
      const isNowFullscreen = !!document.fullscreenElement
      setIsFullscreen(isNowFullscreen)
      if (!isNowFullscreen && !submitted) incrementWarning("fullscreen-exit")
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden" && !submitted) {
        incrementWarning("tab-switch-or-minimize")
      }
    }

    const handleBlur = () => {
      if (!submitted) incrementWarning("window-blur")
    }

    // Closed-book copy/paste protection
    const handleCopyPaste = (e: ClipboardEvent) => {
      if (assessment.isClosedBook && !submitted) {
        e.preventDefault()
        incrementWarning("copy-paste-attempt-closed-book")
      }
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange)
    document.addEventListener("visibilitychange", handleVisibilityChange)
    window.addEventListener("blur", handleBlur)
    document.addEventListener("copy", handleCopyPaste)
    document.addEventListener("paste", handleCopyPaste)

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      window.removeEventListener("blur", handleBlur)
      document.removeEventListener("copy", handleCopyPaste)
      document.removeEventListener("paste", handleCopyPaste)
    }
  }, [stage, submitted, incrementWarning])

  // ── Answer handlers (type-safe & flexible for all question types) ──
  const handleAnswer = useCallback((questionId: string | number, value: string | string[] | Record<string, string>) => {
    setAnswers((prev) => {
      const updated = { ...prev, [questionId]: value }
      return updated
    })
  }, [])

  // Ordering helper (mutates order array inside answers)
  const reorderItem = useCallback((questionId: number, fromIndex: number, toIndex: number) => {
    setAnswers((prev) => {
      const question = mockAssessment.questions.find(q => q.id === questionId)
      const currentOrder = (prev[questionId] as string[]) || (question?.items ? [...question.items] : [])
      const newOrder = [...currentOrder]
      const [moved] = newOrder.splice(fromIndex, 1)
      newOrder.splice(toIndex, 0, moved)
      return { ...prev, [questionId]: newOrder }
    })
  }, [])

  // ── Navigation & Submit ───────────────────────────────────────────
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, "0")}`
  }

  const handleAutoSubmit = () => {
    setSubmitted(true)
    // TODO: POST final attempt to FastAPI Brain
    router.push(`/student/assessments/${params.id}/results`)
  }

  const submitAssessment = () => {
    if (!confirm("Submit assessment? This action is final and cannot be undone.")) return
    setSubmitted(true)
    // TODO: POST to /brain/assessments/{id}/submit
    router.push(`/student/assessments/${params.id}/results`)
  }

  const progress = ((currentQuestionIndex + 1) / assessment.questions.length) * 100

  // ── Stage handlers ────────────────────────────────────────────────
  const handleStartAssessment = () => {
    if (assessment.passwordProtected) {
      setStage("password")
    } else {
      setStage("readiness")
    }
  }

  const handlePasswordSubmit = () => {
    if (passwordInput === assessment.mockPassword) {
      setPasswordError(false)
      setStage("readiness")
    } else {
      setPasswordError(true)
    }
  }

  const handleReadinessConfirm = async () => {
    if (!readinessChecked) return
    await enterFullscreen()
    setStage("taking")
    setTimeLeft(assessment.durationMinutes * 60)
  }

  // ── Question Renderer (modular – ready to extract to reusable component) ──
  const renderQuestion = (q: Question) => {
    const answer = answers[q.id] as string | string[] | Record<string, string> | undefined

    switch (q.type) {
      case "mcq":
        return (
          <RadioGroup
            value={String(answer || "")}
            onValueChange={(val) => handleAnswer(q.id, val)}
            className="space-y-4"
          >
            {(q.options as string[])?.map((option: string, idx: number) => (
              <div
                key={idx}
                className="flex items-center space-x-3 border border-border rounded-2xl p-5 hover:border-ring transition-colors"
              >
                <RadioGroupItem value={option} id={`mcq-${q.id}-${idx}`} />
                <Label htmlFor={`mcq-${q.id}-${idx}`} className="flex-1 cursor-pointer text-foreground">
                  {option}
                </Label>
              </div>
            ))}
          </RadioGroup>
        )

      case "truefalse":
        return (
          <RadioGroup
            value={String(answer || "")}
            onValueChange={(val) => handleAnswer(q.id, val)}
            className="flex gap-6"
          >
            {["True", "False"].map((val) => (
              <div
                key={val}
                className="flex-1 flex items-center space-x-3 border border-border rounded-2xl p-6 hover:border-ring transition-colors"
              >
                <RadioGroupItem value={val} id={`tf-${q.id}-${val}`} />
                <Label htmlFor={`tf-${q.id}-${val}`} className="cursor-pointer text-xl font-medium text-foreground">
                  {val}
                </Label>
              </div>
            ))}
          </RadioGroup>
        )

      case "shortanswer":
      case "essay":
      case "computational":
      case "casestudy":
        return (
          <Textarea
            className={cn(
              "w-full bg-card border-border focus:border-primary resize-y text-foreground",
              q.type === "shortanswer" && "h-40",
              q.type === "essay" && "h-80",
              (q.type === "computational" || q.type === "casestudy") && "h-96"
            )}
            placeholder={
              q.type === "shortanswer"
                ? "Type your concise answer here..."
                : q.type === "essay"
                ? "Write your detailed response..."
                : "Enter your solution / working here..."
            }
            value={typeof answer === "string" ? answer : ""}
            onChange={(e) => handleAnswer(q.id, e.target.value)}
          />
        )

      case "matching":
        return (
          <div className="space-y-6">
            {(q.items as { left: string; right: string }[])?.map((item, idx: number) => (
              <div key={idx} className="flex items-center gap-4">
                <div className="font-medium w-56 text-foreground">{item.left}</div>
                <select
                  className="flex-1 bg-card border border-border rounded-xl p-4 text-foreground focus:border-primary"
                  value={(typeof answer === 'object' && !Array.isArray(answer) ? answer?.[`match-${idx}`] : "") || ""}
                  onChange={(e) => {
                    const currentAnswers = (typeof answer === 'object' && !Array.isArray(answer) && answer !== null) 
                      ? answer : {};
                    handleAnswer(q.id, { ...currentAnswers, [`match-${idx}`]: e.target.value });
                  }}
                >
                  <option value="">Select matching definition...</option>
                  {(q.options as string[])?.map((opt: string, i: number) => (
                    <option key={i} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )

      case "fillblank":
        return (
          <div className="space-y-6">
            <p className="text-foreground text-lg">{q.prompt}</p>
            {Array.from({ length: q.blanksCount || 1 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Label className="font-medium text-muted-foreground">Blank {i + 1}:</Label>
                <Input
                  className="flex-1 bg-card border-border focus:border-primary"
                  value={(typeof answer === 'object' && !Array.isArray(answer) ? answer?.[`blank-${i}`] : "") || ""}
                  onChange={(e) => {
                    const currentBlanks = (typeof answer === 'object' && !Array.isArray(answer) && answer !== null) 
                      ? answer : {};
                    const newBlanks = { ...currentBlanks, [`blank-${i}`]: e.target.value }
                    handleAnswer(q.id, newBlanks)
                  }}
                  placeholder="Type here..."
                />
              </div>
            ))}
          </div>
        )

      case "ordering":
        const currentOrder = (answer as string[]) || [...((q.items as string[]) || [])]
        return (
          <div className="space-y-3">
            {currentOrder.map((item: string, idx: number) => (
              <div
                key={idx}
                className="flex items-center justify-between bg-card border border-border rounded-2xl p-5 text-foreground"
              >
                <div className="flex items-center gap-4">
                  <Badge variant="secondary" className="w-6 h-6 flex items-center justify-center rounded-full">
                    {idx + 1}
                  </Badge>
                  <span>{item}</span>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={idx === 0}
                    onClick={() => reorderItem(q.id, idx, idx - 1)}
                  >
                    ↑
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={idx === currentOrder.length - 1}
                    onClick={() => reorderItem(q.id, idx, idx + 1)}
                  >
                    ↓
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )

      default:
        return <div className="text-destructive">Unsupported question type – contact support.</div>
    }
  }

  // ── Render based on stage ─────────────────────────────────────────
  if (stage === "submitted") {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <Card className="max-w-md w-full">
          <CardContent className="p-10 text-center">
            <CheckCircle className="mx-auto size-16 text-emerald-500 mb-6" />
            <CardTitle className="text-3xl">Assessment Submitted</CardTitle>
            <CardDescription className="mt-3 text-lg">
              Your responses have been securely recorded.<br />
              Results will be released according to the lecturer policy.
            </CardDescription>
            <Button onClick={() => router.push("/student/dashboard")} className="mt-8 w-full">
              Return to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* SECURE TOP BAR – always visible */}
      <div className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur-md px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-x-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.back()}
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="mr-2 size-4" />
            Exit Assessment
          </Button>
          <div>
            <div className="font-semibold text-lg tracking-tight">{assessment.title}</div>
            <div className="flex items-center gap-x-2 text-xs text-muted-foreground">
              <Badge variant="secondary">{assessment.type}</Badge>
              {assessment.isClosedBook && <Badge variant="outline">Closed Book</Badge>}
              {assessment.isSupervised && <Badge variant="outline">Supervised</Badge>}
              {!assessment.isAIAllowed && (
                <Badge variant="destructive" className="gap-x-1">
                  <EyeOff className="size-3" />
                  AI BLOCKED
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-x-8">
          {/* Timer */}
          <div className="flex items-center gap-x-2 font-mono text-lg tabular-nums">
            <Timer className="size-5 text-primary" />
            <span className={cn(timeLeft < 300 && "text-destructive")}>
              {formatTime(timeLeft)}
            </span>
          </div>

          {/* Question counter */}
          <Badge variant="outline" className="px-4 py-2 text-sm font-medium">
            Q{currentQuestionIndex + 1} of {assessment.questions.length}
          </Badge>

          {/* Autosave indicator */}
          {lastSaved && (
            <div className="flex items-center gap-x-2 text-xs text-muted-foreground">
              <Save className="size-4" />
              <span>Saved just now</span>
            </div>
          )}

          <Button
            onClick={submitAssessment}
            variant="destructive"
            size="sm"
            disabled={stage !== "taking"}
          >
            Submit Assessment
          </Button>
        </div>
      </div>

      {/* INTEGRITY WARNING BANNER */}
      {warnings > 0 && (
        <div
          className={cn(
            "px-6 py-4 text-sm font-medium flex items-center gap-x-3 border-b",
            warnings === 1 && "bg-amber-950/80 border-amber-400 text-amber-400",
            warnings === 2 && "bg-orange-950/80 border-orange-400 text-orange-400",
            warnings >= 3 && "bg-destructive/80 border-destructive text-destructive-foreground"
          )}
        >
          <AlertTriangle className="size-5 flex-shrink-0" />
          <span>
            Integrity Warning {warnings}/3 — {warnings === 1 ? "Minor activity detected" : warnings === 2 ? "Stronger violation logged" : "Critical – attempt flagged for lecturer review"}
          </span>
          <ShieldCheck className="ml-auto size-4" />
        </div>
      )}

      {/* STAGE: INTRO */}
      {stage === "intro" && (
        <div className="flex-1 flex items-center justify-center p-6">
          <Card className="max-w-2xl w-full">
            <CardHeader className="text-center pb-8">
              <CardTitle className="text-4xl font-semibold tracking-tight">{assessment.title}</CardTitle>
              <CardDescription className="text-xl text-muted-foreground mt-3">
                {assessment.instructions}
              </CardDescription>
              <div className="flex justify-center gap-x-6 mt-8">
                <div className="text-center">
                  <div className="text-5xl font-semibold text-primary">{assessment.durationMinutes}</div>
                  <div className="text-xs tracking-widest uppercase text-muted-foreground">minutes</div>
                </div>
                <div className="text-center">
                  <div className="text-5xl font-semibold text-primary">{assessment.totalMarks}</div>
                  <div className="text-xs tracking-widest uppercase text-muted-foreground">total marks</div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-8">
              <div className="grid grid-cols-3 gap-4 text-center text-sm">
                <div className="border border-border rounded-2xl p-4">
                  <Monitor className="mx-auto size-6 mb-2 text-primary" />
                  Fullscreen Required
                </div>
                <div className="border border-border rounded-2xl p-4">
                  <Lock className="mx-auto size-6 mb-2 text-primary" />
                  Closed Book
                </div>
                <div className="border border-border rounded-2xl p-4">
                  <BookOpen className="mx-auto size-6 mb-2 text-primary" />
                  Supervised Mode
                </div>
              </div>

              <Button onClick={handleStartAssessment} size="lg" className="w-full h-14 text-lg">
                Begin Assessment
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* STAGE: PASSWORD */}
      {stage === "password" && (
        <div className="flex-1 flex items-center justify-center p-6">
          <Card className="max-w-md w-full">
            <CardHeader>
              <CardTitle>Assessment Password Required</CardTitle>
              <CardDescription>Enter the password provided by your lecturer to continue.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <Input
                type="password"
                placeholder="••••••••"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                className="text-center text-3xl tracking-[0.5em] font-mono"
              />
              {passwordError && <p className="text-destructive text-sm text-center">Incorrect password. Try again.</p>}
              <Button onClick={handlePasswordSubmit} className="w-full" size="lg">
                Verify &amp; Continue
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* STAGE: READINESS CONFIRMATION */}
      {stage === "readiness" && (
        <div className="flex-1 flex items-center justify-center p-6">
          <Card className="max-w-xl w-full">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">Ready to begin?</CardTitle>
              <CardDescription className="text-base">
                You are about to enter a secure, timed, proctored assessment.<br />
                All activity will be monitored.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-8">
              <div className="flex items-start gap-x-3">
                <Checkbox
                  id="readiness"
                  checked={readinessChecked}
                  onCheckedChange={(checked) => setReadinessChecked(!!checked)}
                />
                <Label htmlFor="readiness" className="text-sm leading-relaxed cursor-pointer">
                  I confirm that I understand the rules, will remain in fullscreen mode, will not use any external resources (closed-book), and accept that any integrity violations will be logged and reviewed by my lecturer.
                </Label>
              </div>

              <Button
                onClick={handleReadinessConfirm}
                disabled={!readinessChecked}
                size="lg"
                className="w-full h-14"
              >
                Enter Fullscreen &amp; Start Assessment
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* STAGE: TAKING – MAIN ASSESSMENT INTERFACE */}
      {stage === "taking" && (
        <div className="flex-1 flex">
          {/* Main content */}
          <div className="flex-1 p-8 max-w-4xl mx-auto">
            {/* Fullscreen required banner */}
            {!isFullscreen && (
              <Card className="mb-8 border-destructive bg-destructive/10">
                <CardContent className="p-8 text-center">
                  <p className="text-destructive mb-6 font-medium">
                    This assessment requires fullscreen mode to continue.
                  </p>
                  <Button onClick={enterFullscreen} variant="destructive">
                    Return to Fullscreen Mode
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Progress bar */}
            <Progress value={progress} className="h-2 mb-8 bg-muted" />

            <Card className="bg-card border-border">
              <CardContent className="p-10">
                {/* Question header */}
                <div className="flex justify-between items-baseline mb-8">
                  <div>
                    <span className="text-muted-foreground">Question {currentQuestionIndex + 1}</span>
                    <span className="ml-3 text-xs bg-secondary text-secondary-foreground px-3 py-1 rounded-full">
                      {currentQ.section}
                    </span>
                  </div>
                  <span className="font-medium text-emerald-500">{currentQ.marks} marks</span>
                </div>

                <h2 className="text-2xl leading-tight mb-10 text-foreground">{currentQ.text}</h2>

                {/* Dynamic question renderer */}
                {renderQuestion(currentQ)}
              </CardContent>
            </Card>

            {/* Navigation */}
            <div className="flex justify-between mt-8">
              <Button
                variant="outline"
                onClick={() => setCurrentQuestionIndex(Math.max(0, currentQuestionIndex - 1))}
                disabled={currentQuestionIndex === 0}
              >
                <ArrowLeft className="mr-2 size-4" /> Previous
              </Button>

              <Button
                onClick={() => {
                  if (currentQuestionIndex < mockAssessment.questions.length - 1) {
                    setCurrentQuestionIndex(currentQuestionIndex + 1)
                  } else {
                    submitAssessment()
                  }
                }}
              >
                {currentQuestionIndex === mockAssessment.questions.length - 1
                  ? "Finish & Submit"
                  : "Next Question"}
                <ArrowRight className="ml-2 size-4" />
              </Button>
            </div>
          </div>

          {/* Question navigator sidebar */}
          <div className="w-80 border-l border-border bg-card p-6 hidden xl:block">
            <div className="font-semibold mb-4 flex items-center gap-x-2">
              <span>Question Navigator</span>
              <Badge variant="secondary" className="ml-auto">
                {Object.keys(answers).length} answered
              </Badge>
            </div>
            <div className="grid grid-cols-6 gap-3">
              {assessment.questions.map((q, idx) => (
                <button
                  key={q.id}
                  onClick={() => setCurrentQuestionIndex(idx)}
                  className={cn(
                    "h-11 rounded-2xl border text-sm font-medium transition-all hover:border-primary",
                    idx === currentQuestionIndex && "border-primary bg-primary text-primary-foreground shadow-inner",
                    answers[q.id] && idx !== currentQuestionIndex && "border-emerald-500 bg-emerald-950/50 text-emerald-400"
                  )}
                >
                  {idx + 1}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* WARNING MODAL */}
      {showWarningModal && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[100]">
          <Card className="max-w-md bg-card border-destructive">
            <CardContent className="p-8 text-center">
              <AlertTriangle className="mx-auto size-12 text-destructive mb-4" />
              <CardTitle className="text-2xl">Security Violation Detected</CardTitle>
              <p className="text-muted-foreground mt-3 mb-8">
                Your action has been logged as a potential integrity breach.<br />
                Repeated violations may result in automatic flagging to your lecturer.
              </p>
              <Button
                onClick={() => {
                  setShowWarningModal(false)
                  if (!isFullscreen) enterFullscreen()
                }}
                className="w-full"
              >
                Return to Secure Assessment Mode
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}