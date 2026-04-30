import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { ArrowLeft, Award, MessageSquare, Loader2 } from "lucide-react"
import Link from "next/link"
import { resultApi } from "@/lib/api/result"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"

export default function ResultDetailPage() {
  const params = useParams()
  const router = useRouter()
  const attemptId = params.id as string
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadResult() {
      try {
        const data = await resultApi.getResultByAttempt(attemptId)
        setResult(data)
      } catch (err) {
        console.error("Failed to load result details", err)
        toast.error("Failed to load result details")
      } finally {
        setLoading(false)
      }
    }
    loadResult()
  }, [attemptId])

  if (loading) {
    return (
      <div className="space-y-8 max-w-4xl mx-auto">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div>
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-32 mt-2" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 md:col-span-2 w-full" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    )
  }

  if (!result) {
    return (
      <div className="py-20 text-center">
        <h2 className="text-2xl font-semibold">Result not found</h2>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/student/results">Back to Results</Link>
        </Button>
      </div>
    )
  }

  // Aggregate strengths and improvements from breakdown feedback
  const strengths = result.breakdowns
    ?.filter((b: any) => b.is_correct && b.feedback)
    .map((b: any) => b.feedback)
    .slice(0, 3) || []

  const improvements = result.breakdowns
    ?.filter((b: any) => !b.is_correct && b.feedback)
    .map((b: any) => b.feedback)
    .slice(0, 3) || []

  const releasedDate = result.released_at 
    ? new Date(result.released_at).toLocaleDateString("en-US", { 
        month: "long", day: "numeric", year: "numeric" 
      }) 
    : "Date not available"

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="ghost" asChild>
          <Link href="/student/results">
            <ArrowLeft className="mr-2 size-4" /> Back to Results
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            {result.assessment_title || "Assessment Result"}
          </h1>
          <p className="text-muted-foreground">{releasedDate}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-muted-foreground">Your Score</CardTitle>
            <div className="text-6xl font-semibold tabular-nums tracking-tighter mt-2">
              {result.total_score}<span className="text-2xl text-muted-foreground">/{result.max_score}</span>
            </div>
          </CardHeader>
          <CardContent>
            <Badge className="text-lg px-4 py-1">{result.letter_grade}</Badge>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Overall Performance</CardTitle>
          </CardHeader>
          <CardContent className="leading-relaxed text-lg">
            {result.percentage >= 80 
              ? "Excellent work overall. You demonstrated strong understanding of the core concepts." 
              : result.percentage >= 50 
                ? "Good effort. You have a solid grasp of many topics, but there are areas where deeper understanding is needed."
                : "Your performance shows that you might need to review some fundamental concepts. Consider using AI Study Support for revision."}
          </CardContent>
        </Card>
      </div>

      {(strengths.length > 0 || improvements.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Award className="size-5 text-emerald-600" /> Strengths
              </CardTitle>
            </CardHeader>
            <CardContent>
              {strengths.length > 0 ? (
                <ul className="space-y-3">
                  {strengths.map((item: string, i: number) => (
                    <li key={i} className="flex items-start gap-3">
                      <div className="mt-1.5 h-2 w-2 rounded-full bg-emerald-600 flex-shrink-0" />
                      <span className="text-sm">{item}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Review your correct answers for detailed feedback.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-amber-600">
                Areas for Improvement
              </CardTitle>
            </CardHeader>
            <CardContent>
              {improvements.length > 0 ? (
                <ul className="space-y-3">
                  {improvements.map((item: string, i: number) => (
                    <li key={i} className="flex items-start gap-3">
                      <div className="mt-1.5 h-2 w-2 rounded-full bg-amber-600 flex-shrink-0" />
                      <span className="text-sm">{item}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">All areas demonstrated satisfactory performance.</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Lecturer Summary</CardTitle>
        </CardHeader>
        <CardContent className="italic text-muted-foreground">
          {result.is_passing 
            ? "“Well done on passing this assessment. Continue your consistent effort for the final exams.”"
            : "“Please schedule a session with the tutor or use AI Study Support to clarify the concepts you found challenging.”"}
        </CardContent>
      </Card>

      <div className="flex gap-4">
        <Button asChild>
          <Link href="/student/study">Continue Revision with AI</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/student/results">Back to All Results</Link>
        </Button>
      </div>
    </div>
  )
}