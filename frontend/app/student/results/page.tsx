// app/(student)/results/page.tsx
"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Trophy, Calendar, Award, Eye } from "lucide-react"
import Link from "next/link"
import { studentApi, StudentRecentResult } from "@/lib/api/student"
import { Skeleton } from "@/components/ui/skeleton"

export default function StudentResultsPage() {
  const [results, setResults] = useState<StudentRecentResult[]>([])
  const [loading, setLoading] = useState(true)
  const [overallGPA, setOverallGPA] = useState(0)

  useEffect(() => {
    async function loadResults() {
      try {
        const data = await studentApi.getDashboard()
        setResults(data.recent_results)
        setOverallGPA(data.summary.cgpa)
      } catch (err) {
        console.error("Failed to load results", err)
      } finally {
        setLoading(false)
      }
    }
    loadResults()
  }, [])

  if (loading) {
    return (
      <div className="space-y-8">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 w-full" />)}
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  const bestPerformance = results.length > 0 
    ? results.reduce((prev, current) => (prev.percentage > current.percentage) ? prev : current)
    : null

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
            <div className="text-5xl font-semibold tabular-nums tracking-tighter mt-2">{overallGPA.toFixed(2)}</div>
          </CardHeader>
          <CardContent>
            <Progress value={(overallGPA / 4.0) * 100} className="h-2" />
            <p className="text-xs text-muted-foreground mt-2">Target: 4.0</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="size-5 text-amber-600" /> Best Performance
            </CardTitle>
          </CardHeader>
          <CardContent>
            {bestPerformance ? (
              <>
                <p className="font-medium truncate">{bestPerformance.assessment_title}</p>
                <p className="text-2xl font-semibold text-emerald-600">{bestPerformance.percentage}%</p>
              </>
            ) : (
              <p className="text-muted-foreground">No results yet</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Total Assessments</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-semibold">{results.length}</p>
            <p className="text-sm text-muted-foreground">Released results</p>
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
            {results.length === 0 ? (
              <p className="text-center py-10 text-muted-foreground">No released results found.</p>
            ) : (
              results.map((result) => (
                <div key={result.id} className="flex flex-col md:flex-row md:items-center gap-6 border-b last:border-0 pb-6 last:pb-0">
                  <div className="flex-1">
                    <div className="font-medium text-lg">{result.assessment_title}</div>
                    <div className="text-sm text-muted-foreground flex items-center gap-4 mt-1">
                      <Badge variant="outline" className="uppercase text-[10px]">{result.assessment_type}</Badge>
                      <span className="flex items-center gap-1">
                        <Calendar className="size-4" /> {new Date(result.released_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-8">
                    <div className="text-right">
                      <div className="text-3xl font-semibold tabular-nums">{result.score}<span className="text-base font-normal text-muted-foreground">/{result.total_marks}</span></div>
                      <div className="text-sm text-emerald-600 font-medium">{result.letter_grade || "RELEASED"}</div>
                    </div>

                    <div>
                      <Button asChild variant="default">
                        <Link href={`/student/assessments/${result.id}/results`}>
                          View Detailed Feedback
                        </Link>
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
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