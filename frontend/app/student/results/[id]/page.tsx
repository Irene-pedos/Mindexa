// app/(student)/results/[id]/page.tsx
"use client"

import { useParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { ArrowLeft, Award, MessageSquare } from "lucide-react"
import Link from "next/link"

interface FeedbackResult {
  title: string
  score: number
  total: number
  grade: string
  date: string
  feedback: string
  strengths: string[]
  improvements: string[]
  lecturerComment: string
}

const feedbackData: Record<string, FeedbackResult> = {
  "db-cat-301": {
    title: "Mid-Semester CAT – Database Systems",
    score: 92,
    total: 100,
    grade: "A-",
    date: "March 27, 2026",
    feedback: "Excellent work overall. You demonstrated strong understanding of normalization and transaction management. Minor deductions for not fully explaining the trade-offs in indexing strategies. Very good structure and clarity.",
    strengths: ["Normalization concepts", "ACID properties explanation", "Query optimization"],
    improvements: ["Elaborate more on indexing trade-offs", "Include one more real-world example"],
    lecturerComment: "Well done, Alex. Keep this level for the final summative.",
  },
}

export default function ResultDetailPage() {
  const params = useParams()
  const id = params.id as string
  const result = feedbackData[id] || feedbackData["db-cat-301"]

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="ghost" asChild>
          <Link href="/results">
            <ArrowLeft className="mr-2 size-4" /> Back to Results
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{result.title}</h1>
          <p className="text-muted-foreground">{result.date}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-muted-foreground">Your Score</CardTitle>
            <div className="text-6xl font-semibold tabular-nums tracking-tighter mt-2">
              {result.score}<span className="text-2xl text-muted-foreground">/{result.total}</span>
            </div>
          </CardHeader>
          <CardContent>
            <Badge className="text-lg px-4 py-1">{result.grade}</Badge>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Lecturer Feedback</CardTitle>
          </CardHeader>
          <CardContent className="leading-relaxed text-lg">
            {result.feedback}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="size-5 text-emerald-600" /> Strengths
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {result.strengths.map((item: string, i: number) => (
                <li key={i} className="flex items-start gap-3">
                  <div className="mt-1.5 h-2 w-2 rounded-full bg-emerald-600" />
                  {item}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-600">
              Areas for Improvement
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {result.improvements.map((item: string, i: number) => (
                <li key={i} className="flex items-start gap-3">
                  <div className="mt-1.5 h-2 w-2 rounded-full bg-amber-600" />
                  {item}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lecturer Personal Comment</CardTitle>
        </CardHeader>
        <CardContent className="italic text-muted-foreground">
          “{result.lecturerComment}”
        </CardContent>
      </Card>

      <div className="flex gap-4">
        <Button asChild>
          <Link href="/study">Continue Revision with AI</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/results">Back to All Results</Link>
        </Button>
      </div>
    </div>
  )
}