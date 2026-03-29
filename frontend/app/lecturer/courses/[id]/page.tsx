// app/lecturer/courses/[id]/page.tsx
"use client"

import { useParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Users, Award, Plus } from "lucide-react"

const course = {
  code: "CS301",
  title: "Database Systems",
  students: 84,
  progress: 82,
}

const roster = [
  { id: "S3921", name: "Jordan Lee", email: "jordan.lee@university.edu", progress: 92, lastSubmission: "2 days ago" },
  { id: "S2847", name: "Taylor Kim", email: "taylor.kim@university.edu", progress: 67, lastSubmission: "1 week ago" },
  { id: "S1759", name: "Sam Rivera", email: "sam.rivera@university.edu", progress: 88, lastSubmission: "Yesterday" },
]

export default function LecturerCourseDetail() {
  const params = useParams()
  const id = params.id

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{course.title}</h1>
          <p className="text-muted-foreground">{course.code} • {course.students} students enrolled</p>
        </div>
        <Button>
          <Plus className="mr-2 size-5" /> Add Student
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <Card className="lg:col-span-8">
          <CardHeader>
            <CardTitle>Student Roster</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Last Submission</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roster.map((student) => (
                  <TableRow key={student.id}>
                    <TableCell className="font-mono">{student.id}</TableCell>
                    <TableCell>{student.name}</TableCell>
                    <TableCell>{student.email}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-2 bg-muted rounded-full">
                          <div className="h-full bg-emerald-600 rounded-full" style={{ width: `${student.progress}%` }} />
                        </div>
                        <span>{student.progress}%</span>
                      </div>
                    </TableCell>
                    <TableCell>{student.lastSubmission}</TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm">View Record</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="lg:col-span-4 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Course Overview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Enrolled Students</span>
                <span className="font-semibold">{course.students}</span>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-muted-foreground">Overall Progress</span>
                  <span>{course.progress}%</span>
                </div>
                <div className="h-2 bg-muted rounded-full">
                  <div className="h-full bg-primary rounded-full" style={{ width: `${course.progress}%` }} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quick Links</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button asChild className="w-full" size="lg">
                <a href="/lecturer/assessments">Create Assessment</a>
              </Button>
              <Button asChild variant="outline" className="w-full" size="lg">
                <a href="/lecturer/question-bank">Question Bank</a>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}