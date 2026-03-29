// app/(student)/results/page.tsx
"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Trophy, Calendar, Award, Eye } from "lucide-react"
import Link from "next/link"

const results = [
  {
    id: "db-cat-301",
    title: "Mid-Semester CAT – Database Systems",
    type: "CAT",
    date: "March 27, 2026",
    score: 92,
    total: 100,
    status: "Graded",
    feedbackReleased: true,
    grade: "A-",
  },
  {
    id: "algo-quiz-201",
    title: "Formative Quiz – Algorithms",
    type: "Formative",
    date: "March 20, 2026",
    score: 28,
    total: 30,
    status: "Graded",
    feedbackReleased: true,
    grade: "A",
  },
  {
    id: "hw-networks-4",
    title: "Homework 4 – Computer Networks",
    type: "Homework",
    date: "March 25, 2026",
    score: 22,
    total: 25,
    status: "Graded",
    feedbackReleased: false,
    grade: "B+",
  },
  {
    id: "os-summative-202",
    title: "Summative Exam – Operating Systems",
    type: "Summative",
    date: "Pending",
    score: null,
    total: 100,
    status: "Submitted",
    feedbackReleased: false,
    grade: "Pending",
  },
]

export default function StudentResultsPage() {
  const overallGPA = 3.78
  const semesterProgress = 87

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Results & Feedback</h1>
        <p className="text-muted-foreground mt-1">Your academic performance and detailed feedback</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Current Semester GPA</CardTitle>
            <div className="text-5xl font-semibold tabular-nums tracking-tighter mt-2">{overallGPA}</div>
          </CardHeader>
          <CardContent>
            <Progress value={semesterProgress} className="h-2" />
            <p className="text-xs text-muted-foreground mt-2">87% toward target</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="size-5 text-amber-600" /> Best Performance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-medium">Database Systems CAT</p>
            <p className="text-2xl font-semibold text-emerald-600">92%</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pending Feedback</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">2</p>
            <p className="text-sm text-muted-foreground">Assessments awaiting lecturer review</p>
          </CardContent>
        </Card>
      </div>

      {/* Results List */}
      <Card>
        <CardHeader>
          <CardTitle>All Results</CardTitle>
          <CardDescription>Recent assessments and their outcomes</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {results.map((result) => (
              <div key={result.id} className="flex flex-col md:flex-row md:items-center gap-6 border-b last:border-0 pb-6 last:pb-0">
                <div className="flex-1">
                  <div className="font-medium text-lg">{result.title}</div>
                  <div className="text-sm text-muted-foreground flex items-center gap-4 mt-1">
                    <span>{result.type}</span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Calendar className="size-4" /> {result.date}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-8">
                  <div className="text-right">
                    {result.score !== null ? (
                      <>
                        <div className="text-3xl font-semibold tabular-nums">{result.score}<span className="text-base font-normal text-muted-foreground">/{result.total}</span></div>
                        <div className="text-sm text-emerald-600 font-medium">{result.grade}</div>
                      </>
                    ) : (
                      <Badge variant="outline">Pending</Badge>
                    )}
                  </div>

                  <div>
                    {result.feedbackReleased ? (
                      <Button asChild variant="default">
                        <Link href={`/student/results/${result.id}`}>
                          View Detailed Feedback
                        </Link>
                      </Button>
                    ) : result.status === "Submitted" ? (
                      <Badge variant="secondary">Awaiting Review</Badge>
                    ) : (
                      <Button variant="outline" disabled>Feedback Pending</Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Appeals Section */}
      <Card className="border-amber-500/30 bg-amber-50 dark:bg-amber-950/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Award className="size-5" /> Request Review / Appeal
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            You can request a manual review for any graded assessment within 7 days of result release.
          </p>
          <Button variant="outline">View Appealable Assessments</Button>
        </CardContent>
      </Card>
    </div>
  )
}