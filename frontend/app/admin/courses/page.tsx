// app/admin/courses/page.tsx
"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { BookOpen, Plus } from "lucide-react"

const courses = [
  { code: "CS301", title: "Database Systems", lecturer: "Dr. Elena Vasquez", students: 84, status: "Active" },
  { code: "CS201", title: "Algorithms", lecturer: "Prof. Marcus Chen", students: 62, status: "Active" },
  { code: "CS401", title: "Software Engineering", lecturer: "Dr. Aisha Patel", students: 24, status: "Active" },
]

export default function AdminCoursesPage() {
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Courses & Classes</h1>
          <p className="text-muted-foreground mt-1">Platform-wide course management</p>
        </div>
        <Button>
          <Plus className="mr-2 size-5" /> Create New Course
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Courses ({courses.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Lecturer</TableHead>
                <TableHead>Students</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {courses.map((course) => (
                <TableRow key={course.code}>
                  <TableCell className="font-mono">{course.code}</TableCell>
                  <TableCell>{course.title}</TableCell>
                  <TableCell>{course.lecturer}</TableCell>
                  <TableCell>{course.students}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{course.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <Button variant="outline" size="sm">Manage</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}