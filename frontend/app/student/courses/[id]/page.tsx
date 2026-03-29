// app/(student)/courses/[id]/page.tsx
"use client"

import { useParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { BookOpen, Users, Calendar, Award, FileText } from "lucide-react"
import Link from "next/link"

interface Course {
  code: string
  title: string
  lecturer: string
  description: string
  progress: number
  enrolled: number
  nextAssessment: string
  materials: number
  assessments: number
}

const courseData: Record<string, Course> = {
  "cs301": {
    code: "CS301",
    title: "Database Systems",
    lecturer: "Dr. Elena Vasquez",
    description: "Advanced relational and non-relational database design, query optimization, and transaction management.",
    progress: 78,
    enrolled: 42,
    nextAssessment: "Mid-Semester CAT on March 29, 09:00",
    materials: 12,
    assessments: 5,
  },
  // Add more courses as needed
}

export default function CourseDetailPage() {
  const params = useParams()
  const courseId = params.id as string
  const course = courseData[courseId] || courseData["cs301"] // fallback

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
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border p-4">
                  <div className="flex items-center gap-3">
                    <FileText className="size-5 text-muted-foreground" />
                    <div>
                      <div className="font-medium">Module {i}: Advanced Topics</div>
                      <div className="text-xs text-muted-foreground">PDF • 45 pages</div>
                    </div>
                  </div>
                  <Button variant="outline" size="sm">Download</Button>
                </div>
              ))}
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
                <Link href="/assessments">View Course Assessments</Link>
              </Button>
              <Button asChild variant="outline" className="w-full" size="lg">
                <Link href="/study">Open Study Support AI</Link>
              </Button>
              <Button asChild variant="outline" className="w-full" size="lg">
                <Link href="/resources">Upload Notes</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}