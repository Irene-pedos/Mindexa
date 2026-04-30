// app/student/assessments/[id]/results/page.tsx
"use client"

import React, { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { CheckCircle, Clock, Award, AlertTriangle, ArrowLeft, Download } from "lucide-react"
import { cn } from "@/lib/utils"
import { submissionApi } from "@/lib/api/submission"
import { Skeleton } from "@/components/ui/skeleton"

export default function StudentAssessmentResult() {
  const params = useParams()
  const router = useRouter()
  const assessmentId = params.id as string

  const [loading, setLoading] = useState(true)
  const [result, setResult] = useState<any>(null)

  useEffect(() => {
    async function loadResult() {
      try {
        const submissions = await submissionApi.getSubmissionsForAssessment(assessmentId)
        // Assuming the backend returns a list of submissions for this assessment
        // or a single submission context
        if (submissions && submissions.length > 0) {
          setResult(submissions[0])
        }
      } catch (err) {
        console.error("Failed to load results", err)
      } finally {
        setLoading(false)
      }
    }
    loadResult()
  }, [assessmentId])

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Skeleton className="h-40 w-1/2" />
      </div>
    )
  }

  if (!result) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-xl font-medium">Result not found</h2>
        <Button onClick={() => router.push("/student/dashboard")} className="mt-4">Back to Dashboard</Button>
      </div>
    )
  }

  const score = result.total_score || 0
  const totalMarks = result.total_marks || 100
  const percentage = Math.round((score / totalMarks) * 100)

  return (
    <div className="max-w-4xl mx-auto space-y-8 py-8 px-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => router.push("/student/dashboard")}>
          <ArrowLeft className="mr-2 size-4" /> Back to Dashboard
        </Button>
        <Badge variant="outline" className="text-sm">{result.assessment?.type || "Assessment"}</Badge>
      </div>

      <Card>
        <CardHeader className="text-center pb-8">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-950">
            <CheckCircle className="size-12 text-emerald-500" />
          </div>
          <CardTitle className="text-4xl tracking-tight">{result.assessment?.title || "Assessment Result"}</CardTitle>
          <CardDescription className="text-xl mt-2">
            Status: <span className="capitalize">{result.status || "Pending Review"}</span>
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-10">
          {/* Score Overview */}
          <div className="flex flex-col items-center">
            <div className="text-[92px] font-semibold leading-none text-foreground tabular-nums">
              {score}
            </div>
            <div className="text-2xl text-muted-foreground -mt-3">/ {totalMarks}</div>
            
            <div className="mt-6 flex items-center gap-8">
              <div>
                <div className="text-4xl font-semibold text-emerald-500">{result.grade || "N/A"}</div>
                <div className="text-xs uppercase tracking-widest text-muted-foreground">Grade</div>
              </div>
            </div>

            <Progress value={percentage} className="mt-8 h-3 w-80" />
          </div>

          <Separator />

          {/* Details Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardContent className="p-6">
                <Clock className="size-8 text-muted-foreground mb-4" />
                <div className="font-medium">Time Taken</div>
                <div className="text-2xl font-semibold mt-1">{result.duration_seconds ? Math.round(result.duration_seconds / 60) + " minutes" : "N/A"}</div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <Award className="size-8 text-muted-foreground mb-4" />
                <div className="font-medium">Submitted At</div>
                <div className="text-lg font-medium mt-1">{result.submitted_at ? new Date(result.submitted_at).toLocaleString() : "N/A"}</div>
              </CardContent>
            </Card>
          </div>

          {/* Lecturer Feedback */}
          {result.feedback && (
            <Card>
              <CardHeader>
                <CardTitle>Lecturer Feedback</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground leading-relaxed">
                  {result.feedback}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-4">
            <Button size="lg" className="flex-1 md:flex-none">
              <Download className="mr-2 size-4" />
              Download PDF Report
            </Button>
            <Button 
              variant="secondary" 
              size="lg" 
              onClick={() => router.push("/student/study-support")}
              className="flex-1 md:flex-none"
            >
              Open Study Support AI
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
