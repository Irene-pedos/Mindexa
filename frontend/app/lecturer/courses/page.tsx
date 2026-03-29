// app/lecturer/courses/page.tsx
"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Users, Calendar, Award, Plus } from "lucide-react"
import Link from "next/link"

const courses = [
  {
    id: "cs301",
    code: "CS301",
    title: "Database Systems",
    students: 84,
    progress: 82,
    nextAssessment: "CAT on Mar 29",
    status: "Active",
  },
  {
    id: "cs201",
    code: "CS201",
    title: "Algorithms & Data Structures",
    students: 62,
    progress: 68,
    nextAssessment: "Quiz on Apr 2",
    status: "Active",
  },
  {
    id: "cs401",
    code: "CS401",
    title: "Software Engineering",
    students: 24,
    progress: 55,
    nextAssessment: "Group Project on Mar 31",
    status: "Active",
  },
]

export default function LecturerCoursesPage() {
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">My Courses</h1>
          <p className="text-muted-foreground mt-1">Manage classes, students, and academic content</p>
        </div>
        <Button size="lg" asChild>
          <Link href="/lecturer/courses/new">
            <Plus className="mr-2 size-5" /> Add New Course
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {courses.map((course) => (
          <Card key={course.id} className="hover:shadow-md transition-all">
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle>{course.title}</CardTitle>
                  <CardDescription className="font-mono">{course.code}</CardDescription>
                </div>
                <Badge variant="secondary">{course.status}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-1">
                  <Users className="size-4" /> Students
                </span>
                <span className="font-medium">{course.students}</span>
              </div>

              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-muted-foreground">Progress</span>
                  <span>{course.progress}%</span>
                </div>
                <div className="h-2 bg-muted rounded-full">
                  <div className="h-full bg-primary rounded-full" style={{ width: `${course.progress}%` }} />
                </div>
              </div>

              <div className="pt-4 border-t flex justify-between text-sm">
                <span className="text-muted-foreground">Next Assessment</span>
                <span className="font-medium">{course.nextAssessment}</span>
              </div>

              <div className="flex gap-3">
                <Button asChild className="flex-1">
                  <Link href={`/lecturer/courses/${course.id}`}>Manage Course</Link>
                </Button>
                <Button variant="outline" asChild className="flex-1">
                  <Link href="/lecturer/assessments">Assessments</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}