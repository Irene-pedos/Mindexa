// app/(student)/academic-record/page.tsx
"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Award, Download, Loader2 } from "lucide-react"
import { studentApi } from "@/lib/api/student"
import { resultApi } from "@/lib/api/result"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"

interface CourseRecord {
  code: string
  name: string
  grade: string
  percentage: number
  academic_year: string
  assessment_type: string
}

interface SemesterRecord {
  semester: string
  avgPercentage: number
  assessmentCount: number
  status: "Completed" | "In Progress"
}

function getLetterGrade(percentage: number): string {
  if (percentage >= 90) return "A+"
  if (percentage >= 80) return "A"
  if (percentage >= 75) return "A-"
  if (percentage >= 70) return "B+"
  if (percentage >= 65) return "B"
  if (percentage >= 60) return "B-"
  if (percentage >= 55) return "C+"
  if (percentage >= 50) return "C"
  if (percentage >= 45) return "C-"
  if (percentage >= 40) return "D"
  return "F"
}

export default function AcademicRecordPage() {
  const [loading, setLoading] = useState(true)
  const [cgpa, setCgpa] = useState<number>(0)
  const [completedAssessments, setCompletedAssessments] = useState<number>(0)
  const [courseRecords, setCourseRecords] = useState<CourseRecord[]>([])
  const [semesterRecords, setSemesterRecords] = useState<SemesterRecord[]>([])

  useEffect(() => {
    async function loadData() {
      try {
        const [dashData, resultsData] = await Promise.all([
          studentApi.getDashboard(),
          resultApi.getMyResults({ page: 1, page_size: 200 }),
        ])

        setCgpa(dashData.summary.cgpa.value)
        setCompletedAssessments(dashData.summary.completed_assessments_count.value)

        const items: any[] = resultsData.items || []

        // Build course record list from results
        const records: CourseRecord[] = items.map((r: any) => ({
          code: r.course_code || "—",
          name: r.assessment_title || "Assessment",
          grade: r.letter_grade || getLetterGrade(r.percentage ?? 0),
          percentage: r.percentage ?? 0,
          academic_year: r.academic_year || "N/A",
          assessment_type: (r.assessment_type || "").replace(/_/g, " "),
        }))
        setCourseRecords(records)

        // Group by academic_year to build semester summary
        const yearMap: Record<string, { total: number; count: number; latest: string }> = {}
        items.forEach((r: any) => {
          const year = r.academic_year || "Unknown"
          if (!yearMap[year]) yearMap[year] = { total: 0, count: 0, latest: r.released_at || "" }
          yearMap[year].total += r.percentage ?? 0
          yearMap[year].count += 1
          if ((r.released_at || "") > yearMap[year].latest) {
            yearMap[year].latest = r.released_at || ""
          }
        })

        const currentYear = new Date().getFullYear()
        const semesters: SemesterRecord[] = Object.entries(yearMap)
          .sort(([a], [b]) => b.localeCompare(a))
          .map(([year, data]) => ({
            semester: year,
            avgPercentage: data.count > 0 ? Math.round(data.total / data.count) : 0,
            assessmentCount: data.count,
            status: year.includes(String(currentYear)) ? "In Progress" : "Completed",
          }))
        setSemesterRecords(semesters)
      } catch (err) {
        console.error("Failed to load academic record", err)
        toast.error("Failed to load academic record data.")
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  const handleDownloadTranscript = () => {
    // BUG-30 fix: inform the user that transcript download is handled by the institution
    toast.info("Official transcripts are issued by the Academic Registry. Please contact your institution's records office.")
  }

  if (loading) {
    return (
      <div className="space-y-8">
        <div>
          <Skeleton className="h-8 w-56 mb-2" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-36 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-80 w-full rounded-xl" />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Academic Record</h1>
        <p className="text-muted-foreground mt-1">Your released assessment results and performance history</p>
      </div>

      {/* Cumulative Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Award className="size-5 text-primary" />
            Cumulative Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <div className="text-5xl font-semibold tabular-nums">
                {cgpa > 0 ? cgpa.toFixed(2) : "—"}
              </div>
              <div className="text-sm text-muted-foreground">Current CGPA</div>
            </div>
            <div>
              <div className="text-5xl font-semibold tabular-nums text-emerald-600">
                {completedAssessments}
              </div>
              <div className="text-sm text-muted-foreground">Assessments Completed</div>
            </div>
            <div>
              <div className="text-5xl font-semibold tabular-nums">
                {courseRecords.length > 0
                  ? Math.round(courseRecords.reduce((a, r) => a + r.percentage, 0) / courseRecords.length)
                  : "—"}
                {courseRecords.length > 0 ? "%" : ""}
              </div>
              <div className="text-sm text-muted-foreground">Average Score</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Semester Breakdown */}
      {semesterRecords.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Academic Year Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {semesterRecords.map((sem, i) => (
                <div key={i} className="flex justify-between items-center border-b last:border-0 pb-6">
                  <div>
                    <div className="font-medium">{sem.semester}</div>
                    <div className="text-sm text-muted-foreground">{sem.assessmentCount} assessments</div>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-semibold">{sem.avgPercentage}%</div>
                    <Badge variant={sem.status === "Completed" ? "secondary" : "default"}>{sem.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Assessment History Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Assessment History</CardTitle>
            {/* BUG-30 fix: handler now shows an informational toast */}
            <Button variant="outline" size="sm" onClick={handleDownloadTranscript}>
              <Download className="mr-2 size-4" /> Download Transcript
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {courseRecords.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground text-sm">
              No released results yet. Check back after your assessments are graded.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Course</TableHead>
                  <TableHead>Assessment</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Grade</TableHead>
                  <TableHead>Year</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {courseRecords.map((course, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{course.code}</TableCell>
                    <TableCell className="max-w-xs truncate">{course.name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs capitalize">{course.assessment_type || "—"}</Badge>
                    </TableCell>
                    <TableCell>{course.percentage.toFixed(1)}%</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={
                        course.percentage >= 70 ? "border-emerald-500/30 text-emerald-700 bg-emerald-50" :
                        course.percentage >= 50 ? "border-amber-500/30 text-amber-700 bg-amber-50" :
                        "border-destructive/30 text-destructive bg-destructive/5"
                      }>
                        {course.grade}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">{course.academic_year}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}