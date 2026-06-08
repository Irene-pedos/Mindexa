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
  ArrowLeft, 
  XCircle, 
  Info,
  HelpCircle,
  RefreshCcw,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { resultApi } from "@/lib/api/result"
import { Skeleton } from "@/components/ui/interfaces-skeleton"
import { toast } from "sonner"
import { format } from "date-fns"
import { getResultLifecycleSummary } from "@/lib/grading-architecture"

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
        if (!err.message?.toLowerCase().includes("available")) {
          console.error("Failed to load results", err)
          toast.error("Results registry trace failure.")
        }
      } finally {
        setLoading(false);
      }
    }
    loadResult()
  }, [attemptId])

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-4 py-4 px-4">
        <Skeleton variant="title" className="h-6 w-32" />
        <Card className="shadow-none border rounded-lg">
          <CardHeader className="text-center py-6">
            <Skeleton variant="avatar" className="mx-auto size-12" />
            <Skeleton variant="title" className="h-6 w-48 mx-auto mt-3" />
          </CardHeader>
          <CardContent className="space-y-4 p-4">
            <div className="grid grid-cols-3 gap-2">
                <Skeleton variant="media" className="h-16 w-full" />
                <Skeleton variant="media" className="h-16 w-full" />
                <Skeleton variant="media" className="h-16 w-full" />
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!result) {
    return (
      <div className="py-20 text-center space-y-3 px-4">
        <div className="mx-auto size-10 bg-muted rounded-full flex items-center justify-center">
          <HelpCircle className="size-5 text-muted-foreground/40" />
        </div>
        <h2 className="text-lg font-bold uppercase tracking-tight">Result Pending</h2>
        <div className="flex gap-2 justify-center">
            <Button onClick={() => window.location.reload()} size="sm" className="h-8 gap-1.5 font-bold text-[10px] uppercase">
                <RefreshCcw className="size-3" /> Sync
            </Button>
            <Button onClick={() => router.push("/student/dashboard")} variant="outline" size="sm" className="h-8 font-bold text-[10px] uppercase border-border/60">
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
    <div className="max-w-4xl mx-auto space-y-3 py-4 px-4 pb-20">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => router.push("/student/results")} className="h-7 px-2 font-bold text-[10px] uppercase tracking-widest gap-1.5">
          <ArrowLeft className="size-3" /> Registry
        </Button>
        <div className="flex gap-2">
          <Badge variant="outline" className="text-[9px] uppercase font-bold h-7 px-2 border-muted-foreground/20 rounded-md">{result.letter_grade || lifecycle.label}</Badge>
          {isPending && <Badge variant="secondary" className="bg-amber-50 text-amber-700 border-amber-100 text-[9px] uppercase font-bold h-7 px-2 rounded-md">Reviewing</Badge>}
        </div>
      </div>

      <Card className="shadow-none border overflow-hidden rounded-lg">
        <CardHeader className={cn("text-center py-6 border-b", result.is_passing ? "bg-emerald-50/10" : "bg-red-50/10")}>
          <div className={cn("mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border-2 border-background shadow-sm", result.is_passing ? "bg-emerald-500 text-white" : "bg-red-500 text-white")}>
            {result.is_passing ? <CheckCircle className="size-6" /> : <XCircle className="size-6" />}
          </div>
          <CardTitle className="text-xl font-bold tracking-tight px-4 uppercase">{result.assessment_title}</CardTitle>
          <CardDescription className="text-[9px] font-bold mt-1 uppercase tracking-widest text-muted-foreground/60 leading-relaxed uppercase">
            {result.is_passing ? "Proficiency achieved." : "Threshold not reached."}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6 p-5 md:p-8">
          <div className="flex flex-col items-center">
            <div className="flex items-baseline gap-1 tabular-nums">
              <span className="text-5xl font-bold tracking-tighter text-foreground">{score}</span>
              <span className="text-lg font-bold text-muted-foreground/30">/ {maxScore}</span>
            </div>
            <div className="mt-4 w-full max-w-xs space-y-1">
                <div className="flex justify-between text-[8px] font-bold uppercase tracking-[0.2em] text-muted-foreground px-0.5">
                  <span>Performance</span>
                  <span className="text-foreground/80">{percentage}%</span>
                </div>
                <Progress value={percentage} className="h-1 rounded-full bg-muted/40" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {[
                { icon: Clock, label: "Status", val: lifecycle.label },
                { icon: Award, label: "Recorded", val: result.released_at ? format(new Date(result.released_at), "MMM d, yyyy") : "LIVE" },
                { icon: Info, label: "Nodes", val: `${result.graded_question_count} / ${result.total_question_count}` }
            ].map((item, i) => (
                <div key={i} className="p-3 rounded-lg border bg-muted/5 flex flex-col items-center text-center space-y-0.5 hover:border-primary/10 transition-all">
                    <item.icon className="size-3.5 text-muted-foreground/40 mb-1" />
                    <span className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground/50">{item.label}</span>
                    <span className="text-[10px] font-bold uppercase tracking-tight text-foreground/80">{item.val}</span>
                </div>
            ))}
          </div>

          <Separator className="bg-border/40" />

          <div className="space-y-4">
            <div className="flex items-center justify-between px-0.5">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60">Audit Matrix</h3>
              <Badge variant="outline" className="text-[8px] font-bold uppercase tracking-widest border-muted-foreground/10 text-muted-foreground/40 h-4 rounded-sm">Registry Breakdown</Badge>
            </div>

            <div className="space-y-2">
              {result.breakdowns?.map((item: any, idx: number) => (
                <div key={item.id} className={cn("p-4 rounded-lg border transition-all", item.is_correct === true ? "bg-emerald-50/[0.02] border-emerald-100/30" : item.is_correct === false ? "bg-red-50/[0.02] border-red-100/30" : "bg-muted/[0.02] border-border/60")}>
                  <div className="flex items-start justify-between gap-4 mb-2.5">
                    <div className="flex items-center gap-2">
                      <div className={cn("size-5 rounded flex items-center justify-center text-[9px] font-bold", item.is_correct === true ? "bg-emerald-500 text-white" : item.is_correct === false ? "bg-red-500 text-white" : "bg-muted-foreground/20 text-muted-foreground")}>{idx + 1}</div>
                      <Badge variant="outline" className="text-[8px] uppercase font-bold h-4 px-1.5 border-muted-foreground/10 bg-white/50 rounded-sm">{item.question_type}</Badge>
                    </div>
                    <div className="text-[10px] font-bold tabular-nums text-foreground/60">{item.score || 0} / {item.max_score}</div>
                  </div>
                  <h4 className="text-[12px] font-semibold leading-relaxed mb-3 text-foreground/80">{item.question_text}</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t border-border/10">
                    <div className="space-y-1">
                      <div className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground/40">Input Trace</div>
                      <div className="p-2.5 rounded border bg-background/30 text-[10px] font-medium leading-relaxed text-foreground/70 truncate">
                        {item.student_answer || (item.was_skipped ? "Trace skipped." : "Null response.")}
                      </div>
                    </div>
                    {!isPending && item.correct_answer && (
                      <div className="space-y-1">
                        <div className="text-[8px] font-bold uppercase tracking-widest text-emerald-600/40">Key Vector</div>
                        <div className="p-2.5 rounded border border-emerald-100/50 bg-emerald-500/[0.01] text-[10px] font-medium italic text-emerald-900/50 truncate">{item.correct_answer}</div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2.5 pt-4">
            <Button className="flex-1 h-9 rounded-md font-bold text-[10px] uppercase tracking-widest bg-primary hover:bg-primary/90 shadow-none" onClick={() => window.print()}>Download Record</Button>
            <Button variant="outline" onClick={() => router.push("/student/dashboard")} className="flex-1 h-9 rounded-md font-bold text-[10px] uppercase tracking-widest border-border/60">Dashboard</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
