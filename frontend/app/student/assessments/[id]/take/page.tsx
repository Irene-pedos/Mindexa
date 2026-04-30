// app/student/assessments/[id]/take/page.tsx
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
  Timer, AlertTriangle, ArrowLeft, ArrowRight, CheckCircle, 
  ShieldCheck, Lock, Monitor, BookOpen, Save, EyeOff
} from "lucide-react"
import { cn } from "@/lib/utils"
import { assessmentApi } from "@/lib/api/assessment"
import { attemptApi } from "@/lib/api/attempt"
import { submissionApi } from "@/lib/api/submission"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"

type Stage = "intro" | "password" | "readiness" | "taking" | "submitted"

export default function StudentAssessmentTake() {
  const params = useParams()
  const router = useRouter()
  const assessmentId = params.id as string

  // ── Core state ─────────────────────────────────────────────────────
  const [assessment, setAssessment] = useState<any>(null)
  const [attemptId, setAttemptId] = useState<string | null>(null)
  const [attemptToken, setAttemptToken] = useState<string | null>(null)
  const [questions, setQuestions] = useState<any[]>([])
  const [stage, setStage] = useState<Stage>("intro")
  const [timeLeft, setTimeLeft] = useState(0)
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string | number, any>>({})
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [warnings, setWarnings] = useState(0)
  const [showWarningModal, setShowWarningModal] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [passwordInput, setPasswordInput] = useState("")
  const [passwordError, setPasswordError] = useState(false)
  const [readinessChecked, setReadinessChecked] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadAssessment() {
      try {
        const data = await assessmentApi.getAssessmentById(assessmentId)
        setAssessment(data)
        setTimeLeft((data.duration_minutes || 90) * 60)
        // If there are blueprints/questions, load them here if returned by the API
      } catch (err: any) {
        toast.error("Failed to load assessment")
        router.push("/student/assessments")
      } finally {
        setLoading(false)
      }
    }
    loadAssessment()
  }, [assessmentId, router])

  const currentQ = questions[currentQuestionIndex]

  // ── Timer (only active during taking stage) ───────────────────────
  useEffect(() => {
    if (stage !== "taking" || timeLeft <= 0 || submitted) return

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
  }, [stage, timeLeft, submitted])

  // ── Autosave simulation ───────────────────────────────────────────
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const triggerAutosave = useCallback(async (qId: string, answerVal: any) => {
    if (!attemptId || !attemptToken) return
    try {
      await submissionApi.saveAnswer({
        attempt_id: attemptId,
        question_id: qId,
        access_token: attemptToken,
        answer_type: "text",
        text_answer: typeof answerVal === "string" ? answerVal : JSON.stringify(answerVal),
        change_type: "autosave"
      })
      setLastSaved(new Date())
    } catch (err) {
      console.error("Autosave failed", err)
    }
  }, [attemptId, attemptToken])

  // ── Answer handlers ───────────────────────────────────────────────
  const handleAnswer = useCallback((questionId: string | number, value: any) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }))
    
    // Clear existing timeout to debounce
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(() => {
      triggerAutosave(String(questionId), value)
    }, 1500)
  }, [triggerAutosave])

  // ── Integrity Guard – real-time monitoring ────────────────────────
  const incrementWarning = useCallback((reason: string) => {
    setWarnings((w) => {
      const newCount = Math.min(w + 1, 3)
      if (newCount >= 3) {
        console.warn(`[INTEGRITY] Critical violation logged: ${reason}`)
      }
      return newCount
    })
    setShowWarningModal(true)
  }, [])

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
    const handleCopyPaste = (e: ClipboardEvent) => {
      if (assessment?.is_closed_book && !submitted) {
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
  }, [stage, submitted, incrementWarning, assessment])

  // ── Navigation & Submit ───────────────────────────────────────────
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, "0")}`
  }

  const handleAutoSubmit = async () => {
    setSubmitted(true)
    if (attemptId && attemptToken) {
      try {
        await attemptApi.submitAttempt(attemptId, attemptToken)
        toast.success("Assessment auto-submitted")
      } catch (err) {
        toast.error("Failed to submit automatically")
      }
    }
    router.push(`/student/assessments/${assessmentId}/results`)
  }

  const submitAssessment = async () => {
    if (!confirm("Submit assessment? This action is final and cannot be undone.")) return
    setSubmitted(true)
    if (attemptId && attemptToken) {
      try {
        await attemptApi.submitAttempt(attemptId, attemptToken)
        toast.success("Assessment submitted successfully")
        router.push(`/student/assessments/${assessmentId}/results`)
      } catch (err) {
        toast.error("Failed to submit assessment")
        setSubmitted(false)
      }
    }
  }

  // ── Stage handlers ────────────────────────────────────────────────
  const handleStartAssessment = () => {
    if (assessment?.requires_password) {
      setStage("password")
    } else {
      setStage("readiness")
    }
  }

  const handlePasswordSubmit = () => {
    setStage("readiness")
  }

  const handleReadinessConfirm = async () => {
    if (!readinessChecked) return
    
    // Call backend to start attempt
    try {
      const data = await attemptApi.startAttempt({ 
        assessment_id: assessmentId,
        password: passwordInput || undefined
      })
      setAttemptId(data.id)
      setAttemptToken(data.access_token)
      
      // Fetch the actual questions for the attempt
      const attemptData = await attemptApi.getAttempt(data.id)
      setQuestions(attemptData.questions || [])
      
      await enterFullscreen()
      setStage("taking")
      setTimeLeft(assessment.duration_minutes * 60)
    } catch (err: any) {
      toast.error(err.message || "Failed to start attempt")
    }
  }

  // ── Question Renderer ───────────────────────────────────────────
  const renderQuestion = (q: any) => {
    if (!q) return <div className="text-muted-foreground py-8">Loading question...</div>

    const answer = answers[q.id] || ""
    const qType = (q.type || "").toLowerCase()

    switch (qType) {
      case "mcq":
      case "multiple_choice":
        return (
          <RadioGroup
            value={String(answer)}
            onValueChange={(val) => handleAnswer(q.id, val)}
            className="space-y-4"
          >
            {(q.options || []).map((option: any, idx: number) => {
              const optText = typeof option === "string" ? option : option.text || `Option ${idx + 1}`
              return (
                <div key={idx} className="flex items-center space-x-3 border border-border rounded-2xl p-5 hover:border-ring transition-colors">
                  <RadioGroupItem value={optText} id={`mcq-${q.id}-${idx}`} />
                  <Label htmlFor={`mcq-${q.id}-${idx}`} className="flex-1 cursor-pointer text-foreground">
                    {optText}
                  </Label>
                </div>
              )
            })}
          </RadioGroup>
        )

      case "truefalse":
      case "true_false":
        return (
          <RadioGroup
            value={String(answer)}
            onValueChange={(val) => handleAnswer(q.id, val)}
            className="flex gap-6"
          >
            {["True", "False"].map((val) => (
              <div key={val} className="flex-1 flex items-center space-x-3 border border-border rounded-2xl p-6 hover:border-ring transition-colors">
                <RadioGroupItem value={val} id={`tf-${q.id}-${val}`} />
                <Label htmlFor={`tf-${q.id}-${val}`} className="cursor-pointer text-xl font-medium text-foreground">
                  {val}
                </Label>
              </div>
            ))}
          </RadioGroup>
        )

      case "shortanswer":
      case "short_answer":
      case "essay":
        return (
          <Textarea
            className={cn(
              "w-full bg-card border-border focus:border-primary resize-y text-foreground",
              qType === "essay" ? "h-80" : "h-40"
            )}
            placeholder="Type your answer here..."
            value={typeof answer === "string" ? answer : ""}
            onChange={(e) => handleAnswer(q.id, e.target.value)}
          />
        )

      default:
        return (
          <Textarea
            className="w-full h-40 bg-card border-border focus:border-primary resize-y text-foreground"
            placeholder="Answer here..."
            value={typeof answer === "string" ? answer : JSON.stringify(answer)}
            onChange={(e) => handleAnswer(q.id, e.target.value)}
          />
        )
    }
  }

  // ── Render ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="space-y-4 w-96 text-center">
          <Skeleton className="h-10 w-3/4 mx-auto" />
          <Skeleton className="h-4 w-1/2 mx-auto" />
        </div>
      </div>
    )
  }

  if (!assessment) return <div className="p-8 text-center text-destructive">Assessment not found.</div>

  const progress = questions.length > 0 ? ((currentQuestionIndex + 1) / questions.length) * 100 : 0

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
      {/* SECURE TOP BAR */}
      <div className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur-md px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-x-4">
          <Button variant="ghost" size="sm" onClick={() => router.back()} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="mr-2 size-4" /> Exit
          </Button>
          <div>
            <div className="font-semibold text-lg tracking-tight">{assessment.title}</div>
            <div className="flex items-center gap-x-2 text-xs text-muted-foreground">
              <Badge variant="secondary">{assessment.type}</Badge>
              {assessment.is_closed_book && <Badge variant="outline">Closed Book</Badge>}
              {assessment.is_supervised && <Badge variant="outline">Supervised</Badge>}
              {!assessment.ai_allowed && (
                <Badge variant="destructive" className="gap-x-1">
                  <EyeOff className="size-3" /> AI BLOCKED
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-x-8">
          <div className="flex items-center gap-x-2 font-mono text-lg tabular-nums">
            <Timer className="size-5 text-primary" />
            <span className={cn(timeLeft < 300 && "text-destructive")}>{formatTime(timeLeft)}</span>
          </div>

          {questions.length > 0 && (
            <Badge variant="outline" className="px-4 py-2 text-sm font-medium">
              Q{currentQuestionIndex + 1} of {questions.length}
            </Badge>
          )}

          {lastSaved && (
            <div className="flex items-center gap-x-2 text-xs text-muted-foreground">
              <Save className="size-4" />
              <span>Saved just now</span>
            </div>
          )}

          <Button onClick={submitAssessment} variant="destructive" size="sm" disabled={stage !== "taking"}>
            Submit Assessment
          </Button>
        </div>
      </div>

      {/* WARNING BANNER */}
      {warnings > 0 && (
        <div className={cn(
          "px-6 py-4 text-sm font-medium flex items-center gap-x-3 border-b",
          warnings === 1 && "bg-amber-950/80 border-amber-400 text-amber-400",
          warnings === 2 && "bg-orange-950/80 border-orange-400 text-orange-400",
          warnings >= 3 && "bg-destructive/80 border-destructive text-destructive-foreground"
        )}>
          <AlertTriangle className="size-5 flex-shrink-0" />
          <span>Integrity Warning {warnings}/3 — {warnings >= 3 ? "Critical flag" : "Suspicious activity detected"}</span>
          <ShieldCheck className="ml-auto size-4" />
        </div>
      )}

      {/* STAGES */}
      {stage === "intro" && (
        <div className="flex-1 flex items-center justify-center p-6">
          <Card className="max-w-2xl w-full">
            <CardHeader className="text-center pb-8">
              <CardTitle className="text-4xl font-semibold tracking-tight">{assessment.title}</CardTitle>
              <CardDescription className="text-xl text-muted-foreground mt-3">
                {assessment.description || "Review instructions before beginning."}
              </CardDescription>
              <div className="flex justify-center gap-x-6 mt-8">
                <div className="text-center">
                  <div className="text-5xl font-semibold text-primary">{assessment.duration_minutes || 90}</div>
                  <div className="text-xs tracking-widest uppercase text-muted-foreground">minutes</div>
                </div>
                <div className="text-center">
                  <div className="text-5xl font-semibold text-primary">{assessment.total_marks || 100}</div>
                  <div className="text-xs tracking-widest uppercase text-muted-foreground">marks</div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-8">
              <div className="grid grid-cols-3 gap-4 text-center text-sm">
                <div className="border border-border rounded-2xl p-4">
                  <Monitor className="mx-auto size-6 mb-2 text-primary" /> Fullscreen Req.
                </div>
                <div className="border border-border rounded-2xl p-4">
                  <Lock className="mx-auto size-6 mb-2 text-primary" /> Closed Book
                </div>
                <div className="border border-border rounded-2xl p-4">
                  <BookOpen className="mx-auto size-6 mb-2 text-primary" /> Supervised
                </div>
              </div>
              <Button onClick={handleStartAssessment} size="lg" className="w-full h-14 text-lg">Begin Assessment</Button>
            </CardContent>
          </Card>
        </div>
      )}

      {stage === "password" && (
        <div className="flex-1 flex items-center justify-center p-6">
          <Card className="max-w-md w-full">
            <CardHeader>
              <CardTitle>Password Required</CardTitle>
              <CardDescription>Enter the access code provided by your lecturer.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <Input
                type="password"
                placeholder="••••••••"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                className="text-center text-3xl tracking-[0.5em] font-mono"
              />
              <Button onClick={handlePasswordSubmit} className="w-full" size="lg">Verify &amp; Continue</Button>
            </CardContent>
          </Card>
        </div>
      )}

      {stage === "readiness" && (
        <div className="flex-1 flex items-center justify-center p-6">
          <Card className="max-w-xl w-full">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">Ready to begin?</CardTitle>
              <CardDescription className="text-base">You are about to enter a secure, timed assessment.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-8">
              <div className="flex items-start gap-x-3">
                <Checkbox id="readiness" checked={readinessChecked} onCheckedChange={(c) => setReadinessChecked(!!c)} />
                <Label htmlFor="readiness" className="text-sm leading-relaxed cursor-pointer">
                  I confirm that I understand the rules, will remain in fullscreen mode, and accept that any violations will be logged.
                </Label>
              </div>
              <Button onClick={handleReadinessConfirm} disabled={!readinessChecked} size="lg" className="w-full h-14">
                Enter Fullscreen &amp; Start
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {stage === "taking" && (
        <div className="flex-1 flex">
          <div className="flex-1 p-8 max-w-4xl mx-auto">
            {!isFullscreen && (
              <Card className="mb-8 border-destructive bg-destructive/10">
                <CardContent className="p-8 text-center">
                  <p className="text-destructive mb-6 font-medium">Fullscreen mode required.</p>
                  <Button onClick={enterFullscreen} variant="destructive">Return to Fullscreen</Button>
                </CardContent>
              </Card>
            )}

            <Progress value={progress} className="h-2 mb-8 bg-muted" />

            <Card className="bg-card border-border">
              <CardContent className="p-10">
                <div className="flex justify-between items-baseline mb-8">
                  <div>
                    <span className="text-muted-foreground">Question {currentQuestionIndex + 1}</span>
                    {currentQ?.section_id && (
                      <span className="ml-3 text-xs bg-secondary px-3 py-1 rounded-full">Sec {currentQ.section_id}</span>
                    )}
                  </div>
                  <span className="font-medium text-emerald-500">{currentQ?.marks || 0} marks</span>
                </div>

                <h2 className="text-2xl leading-tight mb-10 text-foreground">{currentQ?.text || currentQ?.content || "Question text missing"}</h2>
                {renderQuestion(currentQ)}
              </CardContent>
            </Card>

            <div className="flex justify-between mt-8">
              <Button variant="outline" onClick={() => setCurrentQuestionIndex(Math.max(0, currentQuestionIndex - 1))} disabled={currentQuestionIndex === 0}>
                <ArrowLeft className="mr-2 size-4" /> Previous
              </Button>

              <Button onClick={() => {
                if (currentQuestionIndex < questions.length - 1) {
                  setCurrentQuestionIndex(currentQuestionIndex + 1)
                } else {
                  submitAssessment()
                }
              }}>
                {currentQuestionIndex === questions.length - 1 ? "Finish & Submit" : "Next Question"}
                <ArrowRight className="ml-2 size-4" />
              </Button>
            </div>
          </div>

          <div className="w-80 border-l border-border bg-card p-6 hidden xl:block">
            <div className="font-semibold mb-4 flex items-center gap-x-2">
              <span>Navigator</span>
              <Badge variant="secondary" className="ml-auto">{Object.keys(answers).length} answered</Badge>
            </div>
            <div className="grid grid-cols-6 gap-3">
              {questions.map((q, idx) => (
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

      {showWarningModal && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[100]">
          <Card className="max-w-md bg-card border-destructive">
            <CardContent className="p-8 text-center">
              <AlertTriangle className="mx-auto size-12 text-destructive mb-4" />
              <CardTitle className="text-2xl">Security Violation Detected</CardTitle>
              <p className="text-muted-foreground mt-3 mb-8">Your action has been logged. Please return to secure mode.</p>
              <Button onClick={() => { setShowWarningModal(false); if (!isFullscreen) enterFullscreen() }} className="w-full">
                Return
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
