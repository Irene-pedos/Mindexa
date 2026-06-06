// app/student/assessments/[id]/results/page.tsx
"use client"

import React, { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { 
  CheckCircle, 
  Clock, 
  Award, 
  AlertTriangle, 
  ArrowLeft, 
  Download, 
  XCircle, 
  Info,
  HelpCircle,
  BrainCircuit,
  MessageSquare,
  Users,
  RefreshCcw,
  ChevronRight
} from "lucide-react"
import { cn } from "@/lib/utils"
import { resultApi } from "@/lib/api/result"
import { Skeleton } from "@/components/ui/interfaces-skeleton"
import { toast } from "sonner"
import Link from "next/link"
import { format } from "date-fns"
import { getResultLifecycleSummary, isOpenQuestionType } from "@/lib/grading-architecture"

export default function StudentAssessmentResult() {
  const params = useParams()
  const router = useRouter()
  const attemptId = params.id as string

  const [loading, setLoading] = useState(true)
  const [result, setResult] = useState<any>(null)

  useEffect(() => {
    async function loadResult() {
      try {
        const data = await resultApi.getResultByAttempt(attemptId)
        setResult(data)
      } catch (err: any) {
        if (err.message?.toLowerCase().includes("available")) {
          // Result not released yet - this is expected behavior
          console.debug("Result pending release:", attemptId)
        } else {
          console.error("Failed to load results", err)
          toast.error("Results not yet available or attempt not found")
        }
      } finally {
        setLoading(false);
      }
    }
    loadResult()
  }, [attemptId])

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6 py-8 px-4">
        <Skeleton variant="title" className="h-8 w-40" />
        <Card className="shadow-none border">
          <CardHeader className="text-center py-10">
            <Skeleton variant="avatar" className="mx-auto size-16" />
            <Skeleton variant="title" className="h-8 w-64 mx-auto mt-4" />
          </CardHeader>
          <CardContent className="space-y-8 p-6">
            <Skeleton variant="media" className="h-20 w-1/3 mx-auto" />
            <div className="grid grid-cols-3 gap-4">
                <Skeleton variant="media" className="h-24 w-full" />
                <Skeleton variant="media" className="h-24 w-full" />
                <Skeleton variant="media" className="h-24 w-full" />
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!result) {
    return (
      <div className="p-20 text-center space-y-4">
        <div className="mx-auto w-12 h-12 bg-muted rounded-full flex items-center justify-center">
          <HelpCircle className="size-6 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-bold tracking-tight">Result Pending</h2>
        <p className="text-muted-foreground text-sm max-w-xs mx-auto">
          Your attempt is being processed or awaits lecturer validation.
        </p>
        <div className="flex gap-3 justify-center pt-2">
            <Button onClick={() => window.location.reload()} size="sm" className="h-9 gap-2">
                <RefreshCcw className="size-3.5" /> Sync
            </Button>
            <Button onClick={() => router.push("/student/dashboard")} variant="outline" size="sm" className="h-9">
                Dashboard
            </Button>
        </div>
      </div>
    )
  }

  const score = result.total_score || 0
  const maxScore = result.max_score || 100
  const percentage = result.percentage || Math.round((score / maxScore) * 100)
  const isPending = result.graded_question_count < result.total_question_count
  const lifecycle = getResultLifecycleSummary(result)

  return (
    <div className="max-w-4xl mx-auto space-y-6 py-8 px-4 pb-24">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => router.push("/student/results")} className="h-8 px-2 rounded-lg">
          <ArrowLeft className="mr-1.5 size-3.5" /> Back to Registry
        </Button>
        <div className="flex gap-2">
          <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-wider">{result.letter_grade || lifecycle.label}</Badge>
          {isPending && <Badge variant="secondary" className="bg-amber-50 text-amber-700 border-amber-100 text-[10px] uppercase font-bold">In Review</Badge>}
        </div>
      </div>

      <Card className="shadow-none border overflow-hidden rounded-2xl">
        <CardHeader className={cn(
          "text-center py-10 relative",
          result.is_passing ? "bg-emerald-50/20" : "bg-red-50/20"
        )}>
          <div className={cn(
            "mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border-2 border-background shadow-sm",
            result.is_passing ? "bg-emerald-500 text-white" : "bg-red-500 text-white"
          )}>
            {result.is_passing ? <CheckCircle className="size-7" /> : <XCircle className="size-7" />}
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight px-4">{result.assessment_title}</CardTitle>
          <CardDescription className="text-sm font-medium mt-1">
            {result.academic_year} • {result.is_passing ? "Session completed successfully." : "Session completed. Review areas for growth."}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-10 p-6 md:p-10">
          <div className="rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground leading-relaxed">
            {lifecycle.description}
          </div>

          <div className="flex flex-col items-center">
            <div className="flex items-baseline gap-1.5 tabular-nums">
              <span className="text-6xl font-bold tracking-tighter text-foreground">
                {score}
              </span>
              <span className="text-xl font-medium text-muted-foreground opacity-60">/ {maxScore}</span>
            </div>
            
            <div className="mt-6 flex items-center justify-center w-full max-w-sm gap-4">
              <div className="flex-1 space-y-1.5">
                <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  <span>Performance</span>
                  <span className="text-foreground">{percentage}%</span>
                </div>
                <Progress value={percentage} className="h-1.5" />
              </div>
            </div>
          </div>

          <Separator className="opacity-50" />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl border bg-muted/10 flex flex-col items-center text-center space-y-1">
              <Clock className="size-4 text-muted-foreground mb-1" />
              <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Status</div>
              <div className="text-sm font-semibold">{lifecycle.label}</div>
            </div>

            <div className="p-4 rounded-xl border bg-muted/10 flex flex-col items-center text-center space-y-1">
              <Award className="size-4 text-muted-foreground mb-1" />
              <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Recorded</div>
              <div className="text-sm font-semibold">{result.released_at ? format(new Date(result.released_at), "MMM d, yyyy") : "Today"}</div>
            </div>

            <div className="p-4 rounded-xl border bg-muted/10 flex flex-col items-center text-center space-y-1">
              <Info className="size-4 text-muted-foreground mb-1" />
              <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Graded Questions</div>
              <div className="text-sm font-semibold">{result.graded_question_count}/{result.total_question_count} Finalized</div>
            </div>
          </div>

          <div className="space-y-6 pt-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-lg font-bold tracking-tight">Audit Breakdown</h3>
              <Badge variant="outline" className="h-6 px-2 text-[9px] font-black uppercase tracking-tighter">Registry Format</Badge>
            </div>

            <div className="space-y-4">
              {result.breakdowns?.map((item: any, idx: number) => {
                const openQuestion = isOpenQuestionType(item.question_type)
                return (
                <div key={item.id} className={cn(
                  "p-5 rounded-2xl border transition-all duration-200",
                  item.is_correct === true ? "bg-emerald-50/10 border-emerald-100" : 
                  item.is_correct === false ? "bg-red-50/10 border-red-100" :
                  "bg-muted/10 border-border"
                )}>
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "size-6 rounded-lg flex items-center justify-center text-[10px] font-black",
                        item.is_correct === true ? "bg-emerald-500 text-white" : 
                        item.is_correct === false ? "bg-red-500 text-white" :
                        "bg-muted-foreground/20 text-muted-foreground"
                      )}>
                        {idx + 1}
                      </div>
                      {item.section_title && (
                        <Badge variant="secondary" className="text-[9px] uppercase font-bold h-4 px-1.5 bg-muted/50 border-none">
                            {item.section_title}
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-[9px] uppercase font-bold h-4 px-1.5">{item.question_type}</Badge>
                      <Badge variant="secondary" className="text-[9px] uppercase font-bold h-4 px-1.5">
                        {openQuestion ? "Open Review" : "Auto-Graded"}
                      </Badge>
                    </div>
                    <div className="text-[10px] font-bold text-muted-foreground uppercase">
                      {item.score || 0}/{item.max_score} PTS
                    </div>
                  </div>

                  <h4 className="text-sm font-semibold leading-relaxed mb-4">{item.question_text}</h4>

                  {item.imageUrl && (
                    <div className="mb-4 p-1.5 border border-muted/30 rounded-xl bg-muted/5 inline-block">
                        <img src={item.imageUrl} alt="Context Media" className="max-h-[240px] rounded-lg object-contain" />
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-dashed">
                    <div className="space-y-1">
                      <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Student Input</div>
                      <div className="text-xs font-medium text-foreground/80 leading-relaxed italic truncate">
                        &quot;{item.student_answer || (item.was_skipped ? "Skipped" : "None")}&quot;
                      </div>
                    </div>

                    {!isPending && item.correct_answer && (
                      <div className="space-y-1">
                        <div className="text-[9px] font-bold uppercase tracking-widest text-emerald-600">Institutional Key</div>
                        <div className="text-xs font-medium text-emerald-900/60 leading-relaxed truncate">
                          {item.correct_answer}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                )
              })}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-6">
            <Button size="lg" className="flex-1 h-12 rounded-xl font-bold text-sm shadow-sm">
              <Download className="mr-2 size-4" />
              Download Record (PDF)
            </Button>
            <Button 
              variant="secondary" 
              size="lg" 
              onClick={() => router.push("/student/study")}
              className="flex-1 h-12 rounded-xl font-bold text-sm"
            >
              <BrainCircuit className="mr-2 size-4" />
              Continue Revision
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
