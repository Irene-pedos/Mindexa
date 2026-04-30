// app/lecturer/courses/page.tsx
"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Users, Calendar, Award, Plus } from "lucide-react"
import Link from "next/link"
import { lecturerApi, AdminCourseListItem } from "@/lib/api/lecturer"
import { Skeleton } from "@/components/ui/skeleton"

export default function LecturerCoursesPage() {
  const [courses, setCourses] = useState<AdminCourseListItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadCourses() {
      try {
        const data = await lecturerApi.getCourses()
        setCourses(data.items)
      } catch (err) {
        console.error("Failed to load courses", err)
      } finally {
        setLoading(false)
      }
    }
    loadCourses()
  }, [])

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
        {loading ? (
          [1, 2, 3].map(i => <Skeleton key={i} className="h-64 w-full" />)
        ) : courses.length === 0 ? (
           <Card className="col-span-full">
             <CardContent className="py-20 text-center">
               <p className="text-muted-foreground">No courses found. Create your first course to get started.</p>
             </CardContent>
           </Card>
        ) : (
          courses.map((course) => (
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
                  <span className="font-medium">{course.student_count}</span>
                </div>

                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-muted-foreground">Overall Performance</span>
                    <span>82%</span> {/* Mocked average for now */}
                  </div>
                  <div className="h-2 bg-muted rounded-full">
                    <div className="h-full bg-primary rounded-full" style={{ width: `82%` }} />
                  </div>
                </div>

                <div className="pt-4 border-t flex justify-between text-sm">
                  <span className="text-muted-foreground">Assigned Lecturer</span>
                  <span className="font-medium">{course.lecturer_name}</span>
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
          ))
        )}
      </div>
    </div>
  )
}