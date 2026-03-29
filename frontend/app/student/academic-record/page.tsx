// app/(student)/academic-record/page.tsx
"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Award, Download } from "lucide-react"

const semesterRecords = [
  {
    semester: "2025/2026 Semester 2",
    gpa: "3.78",
    credits: "18",
    status: "In Progress",
  },
  {
    semester: "2025/2026 Semester 1",
    gpa: "3.65",
    credits: "16",
    status: "Completed",
  },
  {
    semester: "2024/2025 Semester 2",
    gpa: "3.82",
    credits: "17",
    status: "Completed",
  },
]

const courseHistory = [
  { code: "CS301", name: "Database Systems", grade: "A-", points: "4.0", credits: "4" },
  { code: "CS201", name: "Algorithms", grade: "A", points: "4.0", credits: "4" },
  { code: "CS401", name: "Software Engineering", grade: "B+", points: "3.3", credits: "3" },
  { code: "CS250", name: "Operating Systems", grade: "A", points: "4.0", credits: "4" },
]

export default function AcademicRecordPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Academic Record</h1>
        <p className="text-muted-foreground mt-1">Complete history of your academic performance</p>
      </div>

      {/* Cumulative Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Cumulative Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div>
              <div className="text-5xl font-semibold tabular-nums">3.78</div>
              <div className="text-sm text-muted-foreground">Current CGPA</div>
            </div>
            <div>
              <div className="text-5xl font-semibold tabular-nums">68</div>
              <div className="text-sm text-muted-foreground">Total Credits Earned</div>
            </div>
            <div>
              <div className="text-5xl font-semibold tabular-nums text-emerald-600">92%</div>
              <div className="text-sm text-muted-foreground">Attendance Rate</div>
            </div>
            <div>
              <div className="text-5xl font-semibold tabular-nums">4</div>
              <div className="text-sm text-muted-foreground">Semesters Completed</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Semester Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Semester Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {semesterRecords.map((sem, i) => (
              <div key={i} className="flex justify-between items-center border-b last:border-0 pb-6">
                <div>
                  <div className="font-medium">{sem.semester}</div>
                  <div className="text-sm text-muted-foreground">{sem.credits} credits</div>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-semibold">{sem.gpa}</div>
                  <Badge variant={sem.status === "Completed" ? "secondary" : "default"}>{sem.status}</Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Course History Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Course History</CardTitle>
            <Button variant="outline" size="sm">
              <Download className="mr-2 size-4" /> Download Transcript
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Course Code</TableHead>
                <TableHead>Course Name</TableHead>
                <TableHead>Grade</TableHead>
                <TableHead>Grade Points</TableHead>
                <TableHead>Credits</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {courseHistory.map((course, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">{course.code}</TableCell>
                  <TableCell>{course.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{course.grade}</Badge>
                  </TableCell>
                  <TableCell>{course.points}</TableCell>
                  <TableCell>{course.credits}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}