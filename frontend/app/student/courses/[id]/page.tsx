import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { BookOpen, Users, Calendar, Award, FileText, Loader2 } from "lucide-react"
import Link from "next/link"
import { studentApi, StudentCourseDetail } from "@/lib/api/student"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"

export default function CourseDetailPage() {
  const params = useParams()
  const courseId = params.id as string
  const [course, setCourse] = useState<StudentCourseDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadCourse() {
      try {
        const data = await studentApi.getCourseDetail(courseId)
        setCourse(data)
      } catch (err) {
        console.error("Failed to load course details", err)
        toast.error("Failed to load course details")
      } finally {
        setLoading(false)
      }
    }
    loadCourse()
  }, [courseId])

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="h-12 w-12 rounded-2xl" />
            <div>
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-4 w-48 mt-2" />
            </div>
          </div>
          <Skeleton className="h-8 w-24" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-8 space-y-8">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
          <div className="lg:col-span-4 space-y-6">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        </div>
      </div>
    )
  }

  if (!course) {
    return (
      <div className="py-20 text-center">
        <h2 className="text-2xl font-semibold">Course not found</h2>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/student/courses">Back to My Courses</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-blue-600 flex items-center justify-center text-white">
              <BookOpen className="size-6" />
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">{course.title}</h1>
              <p className="text-muted-foreground">{course.code} • {course.lecturer}</p>
            </div>
          </div>
        </div>
        <Badge variant="outline" className="text-base px-4 py-1">In Progress</Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Main Content */}
        <div className="lg:col-span-8 space-y-8">
          <Card>
            <CardHeader>
              <CardTitle>Course Progress</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-2 flex justify-between text-sm">
                <span>Overall Progress</span>
                <span className="font-semibold">{course.progress}%</span>
              </div>
              <Progress value={course.progress} className="h-3" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Course Description</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground leading-relaxed">{course.description}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Learning Materials ({course.materials})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {course.materials > 0 ? (
                Array.from({ length: course.materials }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg border p-4">
                    <div className="flex items-center gap-3">
                      <FileText className="size-5 text-muted-foreground" />
                      <div>
                        <div className="font-medium">Module {i + 1}: Advanced Topics</div>
                        <div className="text-xs text-muted-foreground">PDF • 45 pages</div>
                      </div>
                    </div>
                    <Button variant="outline" size="sm">Download</Button>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground py-4 text-center">No materials available yet.</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar Info */}
        <div className="lg:col-span-4 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Quick Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Enrolled Students</span>
                <span className="font-medium flex items-center gap-1">
                  <Users className="size-4" /> {course.enrolled}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Next Assessment</span>
                <span className="font-medium text-right">{course.nextAssessment}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Assessments</span>
                <span className="font-medium">{course.assessments}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button asChild className="w-full" size="lg">
                <Link href="/student/assessments">View Course Assessments</Link>
              </Button>
              <Button asChild variant="outline" className="w-full" size="lg">
                <Link href="/student/study">Open Study Support AI</Link>
              </Button>
              <Button asChild variant="outline" className="w-full" size="lg">
                <Link href="/student/resources">Upload Notes</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}