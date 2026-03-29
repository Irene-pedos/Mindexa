// app/(student)/courses/page.tsx
"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { BookOpen, Users, Calendar, Award } from "lucide-react"
import Link from "next/link"

const enrolledCourses = [
  {
    id: "cs301",
    code: "CS301",
    title: "Database Systems",
    lecturer: "Dr. Elena Vasquez",
    progress: 78,
    nextAssessment: "CAT on Mar 29",
    students: 42,
    color: "bg-blue-600",
  },
  {
    id: "cs201",
    code: "CS201",
    title: "Algorithms & Data Structures",
    lecturer: "Prof. Marcus Chen",
    progress: 65,
    nextAssessment: "Formative Quiz on Apr 2",
    students: 38,
    color: "bg-emerald-600",
  },
  {
    id: "cs401",
    code: "CS401",
    title: "Software Engineering",
    lecturer: "Dr. Aisha Patel",
    progress: 45,
    nextAssessment: "Group Project on Mar 31",
    students: 24,
    color: "bg-amber-600",
  },
  {
    id: "cs250",
    code: "CS250",
    title: "Operating Systems",
    lecturer: "Prof. James Okoro",
    progress: 92,
    nextAssessment: "Summative on Apr 15",
    students: 35,
    color: "bg-violet-600",
  },
]

export default function StudentCoursesPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">My Courses</h1>
        <p className="text-muted-foreground mt-1">Current semester enrolled modules and progress</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {enrolledCourses.map((course) => (
          <Card key={course.id} className="hover:shadow-md transition-all group">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 rounded-xl ${course.color} flex items-center justify-center text-white`}>
                      <BookOpen className="size-5" />
                    </div>
                    <div>
                      <CardTitle>{course.title}</CardTitle>
                      <CardDescription>{course.code}</CardDescription>
                    </div>
                  </div>
                </div>
                <Badge variant="outline">{course.lecturer}</Badge>
              </div>
            </CardHeader>

            <CardContent className="space-y-6">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span>Progress</span>
                  <span className="font-medium">{course.progress}%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-primary rounded-full transition-all" 
                    style={{ width: `${course.progress}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-muted-foreground flex items-center gap-1">
                    <Calendar className="size-4" /> Next Assessment
                  </div>
                  <div className="font-medium mt-1">{course.nextAssessment}</div>
                </div>
                <div>
                  <div className="text-muted-foreground flex items-center gap-1">
                    <Users className="size-4" /> Class Size
                  </div>
                  <div className="font-medium mt-1">{course.students} students</div>
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t">
                <Button asChild variant="default" className="flex-1">
                  <Link href={`/student/courses/${course.id}`}>
                    Open Course
                  </Link>
                </Button>
                <Button asChild variant="outline" className="flex-1">
                  <Link href="/student/assessments">
                    View Assessments
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Stats */}
      <Card>
        <CardHeader>
          <CardTitle>Semester Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="text-center">
              <div className="text-4xl font-semibold">4</div>
              <div className="text-sm text-muted-foreground">Active Courses</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-semibold text-emerald-600">82%</div>
              <div className="text-sm text-muted-foreground">Average Progress</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-semibold">7</div>
              <div className="text-sm text-muted-foreground">Assessments Due</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-semibold text-amber-600">3.78</div>
              <div className="text-sm text-muted-foreground">Current GPA</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}