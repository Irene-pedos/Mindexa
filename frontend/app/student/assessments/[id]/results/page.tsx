// app/(student)/assessments/[id]/results/page.tsx
"use client"

import React from "react"
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
  Download 
} from "lucide-react"
import { cn } from "@/lib/utils"

const mockResult = {
  id: "db-cat-301",
  title: "Mid-Semester CAT – Database Systems",
  type: "CAT",
  status: "graded", // "pending", "under-review", "released"
  score: 87,
  totalMarks: 100,
  grade: "A-",
  percentile: 92,
  submittedAt: "2026-03-25 14:35",
  timeTaken: "78 minutes",
  integrityWarnings: 1,
  feedback: "Excellent understanding of normalization and ACID properties. Minor improvement needed in query optimization examples.",
  releasedAt: "2026-03-27 09:00",
  canAppeal: true,
}

export default function StudentAssessmentResult() {
  const params = useParams()
  const router = useRouter()

  const percentage = Math.round((mockResult.score / mockResult.totalMarks) * 100)

  return (
    <div className="max-w-4xl mx-auto space-y-8 py-8 px-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => router.push("/student/dashboard")}>
          <ArrowLeft className="mr-2 size-4" /> Back to Dashboard
        </Button>
        <Badge variant="outline" className="text-sm">{mockResult.type}</Badge>
      </div>

      <Card>
        <CardHeader className="text-center pb-8">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-950">
            <CheckCircle className="size-12 text-emerald-500" />
          </div>
          <CardTitle className="text-4xl tracking-tight">{mockResult.title}</CardTitle>
          <CardDescription className="text-xl mt-2">
            Result Released • {mockResult.releasedAt}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-10">
          {/* Score Overview */}
          <div className="flex flex-col items-center">
            <div className="text-[92px] font-semibold leading-none text-foreground tabular-nums">
              {mockResult.score}
            </div>
            <div className="text-2xl text-muted-foreground -mt-3">/ {mockResult.totalMarks}</div>
            
            <div className="mt-6 flex items-center gap-8">
              <div>
                <div className="text-4xl font-semibold text-emerald-500">{mockResult.grade}</div>
                <div className="text-xs uppercase tracking-widest text-muted-foreground">Grade</div>
              </div>
              <Separator orientation="vertical" className="h-12" />
              <div>
                <div className="text-4xl font-semibold">{mockResult.percentile}th</div>
                <div className="text-xs uppercase tracking-widest text-muted-foreground">Percentile</div>
              </div>
            </div>

            <Progress value={percentage} className="mt-8 h-3 w-80" />
          </div>

          <Separator />

          {/* Details Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardContent className="p-6">
                <Clock className="size-8 text-muted-foreground mb-4" />
                <div className="font-medium">Time Taken</div>
                <div className="text-2xl font-semibold mt-1">{mockResult.timeTaken}</div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <Award className="size-8 text-muted-foreground mb-4" />
                <div className="font-medium">Submitted</div>
                <div className="text-lg font-medium mt-1">{mockResult.submittedAt}</div>
              </CardContent>
            </Card>

            <Card className={cn(mockResult.integrityWarnings > 0 && "border-amber-500")}>
              <CardContent className="p-6">
                <AlertTriangle className="size-8 text-amber-500 mb-4" />
                <div className="font-medium">Integrity Warnings</div>
                <div className="text-2xl font-semibold mt-1 text-amber-500">
                  {mockResult.integrityWarnings}
                </div>
                <div className="text-xs text-muted-foreground mt-1">Logged for lecturer review</div>
              </CardContent>
            </Card>
          </div>

          {/* Lecturer Feedback */}
          <Card>
            <CardHeader>
              <CardTitle>Lecturer Feedback</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground leading-relaxed">
                {mockResult.feedback}
              </p>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex flex-wrap gap-4">
            <Button size="lg" className="flex-1 md:flex-none">
              <Download className="mr-2 size-4" />
              Download PDF Report
            </Button>

            {mockResult.canAppeal && (
              <Button variant="outline" size="lg" className="flex-1 md:flex-none">
                Request Result Review / Appeal
              </Button>
            )}

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