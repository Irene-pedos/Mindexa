// app/lecturer/grading/page.tsx
"use client"

import React, { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { Label } from "@/components/ui/label"
import { 
  Eye, 
  ThumbsUp, 
  Search,
  CheckCircle2,
  MoreHorizontal,
  Flag,
  BrainCircuit,
  MessageSquareWarning,
  Filter
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"

const mockGradingData = [
  {
    id: "S3921",
    student: "Jordan Lee",
    score: null,
    aiScore: 87,
    status: "AI Suggested",
    confidence: 92,
    lastAction: "2 hours ago",
    flagged: false,
    openQuestionAnswer: "Normalization is the process of organizing data in a database. This includes creating tables and establishing relationships between those tables according to rules designed both to protect the data and to make the database more flexible by eliminating redundancy.",
    aiExplanation: "The student correctly identified the core purpose of normalization (organizing data, reducing redundancy, establishing relationships). However, they missed mentioning specific normal forms (1NF, 2NF, 3NF).",
    questionText: "Explain the concept of database normalization and its primary goals.",
    maxScore: 10
  },
  {
    id: "S2847",
    student: "Taylor Kim",
    score: null,
    aiScore: 64,
    status: "AI Suggested",
    confidence: 58,
    lastAction: "3 hours ago",
    flagged: false,
    openQuestionAnswer: "It makes the database faster by removing things.",
    aiExplanation: "The answer is too brief and conceptually imprecise. Normalization doesn't inherently make a database 'faster' (it often requires more JOINs), and 'removing things' is an oversimplification of eliminating redundancy.",
    questionText: "Explain the concept of database normalization and its primary goals.",
    maxScore: 10
  },
  {
    id: "S1055",
    student: "Alex Rivera",
    score: 92,
    aiScore: 90,
    status: "Approved",
    confidence: 98,
    lastAction: "1 hour ago",
    flagged: false,
    openQuestionAnswer: "Normalization is a systematic approach of decomposing tables to eliminate data redundancy and undesirable characteristics like Insertion, Update and Deletion Anomalies. It is a multi-step process that puts data into tabular form, removing duplicated data from the relation tables.",
    aiExplanation: "Excellent answer. Correctly identifies the elimination of redundancy and explicitly mentions the prevention of insertion, update, and deletion anomalies.",
    questionText: "Explain the concept of database normalization and its primary goals.",
    maxScore: 10
  },
]

export default function LecturerGradingQueue() {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedStudent, setSelectedStudent] = useState<any | null>(null)
  const [overrideScore, setOverrideScore] = useState<string>("")

  useEffect(() => {
    fetchSubmissions()
  }, [])

  const fetchSubmissions = async () => {
    try {
      const response = await fetch('/api/v1/grading/submissions')
      if (response.ok) {
        const result = await response.json()
        setData(result)
      } else {
        // Fallback to mock data if endpoint is not ready
        setData(mockGradingData)
      }
    } catch (error) {
      console.error("Failed to fetch submissions, using mock data", error)
      setData(mockGradingData)
    } finally {
      setLoading(false)
    }
  }

  const handleApproveAll = async () => {
    try {
      await fetch('/api/v1/grading/submissions/bulk-approve', { method: 'POST' })
      setData(data.map(item => item.status === "AI Suggested" ? { ...item, status: "Approved", score: item.aiScore } : item))
      toast.success("All AI suggestions approved")
    } catch (e) {
      toast.error("Failed to approve all. Please try again.")
    }
  }

  const handleFlagLowConfidence = async () => {
    try {
      await fetch('/api/v1/grading/submissions/bulk-flag', { method: 'POST' })
      setData(data.map(item => item.confidence < 75 && item.status === "AI Suggested" ? { ...item, status: "Flagged", flagged: true } : item))
      toast.success("Flagged all low-confidence AI grades for review")
    } catch (e) {
      toast.error("Failed to flag submissions.")
    }
  }

  const handleApproveSingle = async (id: string, score: number) => {
    try {
      await fetch(`/api/v1/grading/submissions/${id}/review`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve', score })
      })
      setData(data.map(item => item.id === id ? { ...item, status: "Approved", score: score, flagged: false } : item))
      toast.success(`Approved for student ${id}`)
      setSelectedStudent(null)
    } catch (e) {
      toast.error("Failed to approve score.")
    }
  }

  const handleOverrideScore = async () => {
    if (!selectedStudent || !overrideScore) return
    const scoreNum = parseFloat(overrideScore)
    try {
      await fetch(`/api/v1/grading/submissions/${selectedStudent.id}/review`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'override', score: scoreNum })
      })
      setData(data.map(item => item.id === selectedStudent.id ? { ...item, status: "Approved", score: scoreNum, flagged: false } : item))
      toast.success(`Score manually updated to ${scoreNum}`)
      setSelectedStudent(null)
      setOverrideScore("")
    } catch (e) {
      toast.error("Failed to update score.")
    }
  }

  return (
    <div className="space-y-8 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Grading & Review Queue</h1>
          <p className="text-muted-foreground mt-1">
            Analyze AI-graded submissions, review open questions, and finalize academic results
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={handleFlagLowConfidence}>
            <Flag className="mr-2 size-4" /> Flag Low Confidence
          </Button>
          <Button onClick={handleApproveAll} className="bg-emerald-600 hover:bg-emerald-700">
            <CheckCircle2 className="mr-2 size-4" /> Approve All AI Scores
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-emerald-50/50 border-emerald-100">
          <CardHeader className="pb-2">
            <CardDescription className="text-emerald-700 font-medium">Auto-Graded</CardDescription>
            <CardTitle className="text-3xl">18</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-emerald-600">Closed questions finalized</p>
          </CardContent>
        </Card>
        <Card className="bg-amber-50/50 border-amber-100">
          <CardHeader className="pb-2">
            <CardDescription className="text-amber-700 font-medium">Pending Review</CardDescription>
            <CardTitle className="text-3xl">{data.filter(d => d.status === "AI Suggested" || d.status === "Flagged").length}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-amber-600">Open questions require manual oversight</p>
          </CardContent>
        </Card>
        <Card className="bg-blue-50/50 border-blue-100">
          <CardHeader className="pb-2">
            <CardDescription className="text-blue-700 font-medium">Appeals</CardDescription>
            <CardTitle className="text-3xl">2</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-blue-600">Student review requests</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Submission Overview</CardTitle>
              <CardDescription>Database Systems CAT – Mid-Semester 2026</CardDescription>
            </div>
            <div className="relative w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input placeholder="Search student or ID..." className="pl-10" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">Reg Number</TableHead>
                <TableHead>Student Name</TableHead>
                <TableHead>Final Score</TableHead>
                <TableHead>AI Proposed</TableHead>
                <TableHead>AI Confidence</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8">Loading submissions...</TableCell></TableRow>
              ) : data.map((item) => (
                <TableRow key={item.id} className={cn(item.flagged && "bg-red-50/30")}>
                  <TableCell className="font-medium text-xs">{item.id}</TableCell>
                  <TableCell>
                    <div className="font-medium">{item.student}</div>
                    <div className="text-[10px] text-muted-foreground">{item.lastAction}</div>
                  </TableCell>
                  <TableCell>
                    {item.score !== null ? (
                      <span className="font-bold text-lg">{item.score}%</span>
                    ) : (
                      <span className="text-muted-foreground">Pending</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="bg-primary/10 text-primary font-mono">
                      {item.aiScore}%
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div 
                          className={cn(
                            "h-full rounded-full",
                            item.confidence > 90 ? "bg-emerald-500" : 
                            item.confidence > 70 ? "bg-amber-500" : "bg-red-500"
                          )} 
                          style={{ width: `${item.confidence}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground">{item.confidence}%</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge 
                      variant={
                        item.status === "Approved" ? "default" : 
                        item.status === "Flagged" ? "destructive" : "outline"
                      }
                      className={cn(item.status === "AI Suggested" && "text-amber-600 border-amber-200 bg-amber-50")}
                    >
                      {item.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        title="Review Submission"
                        onClick={() => {
                          setSelectedStudent(item)
                          setOverrideScore(item.score !== null ? item.score.toString() : item.aiScore.toString())
                        }}
                      >
                        <Eye className="size-4" />
                      </Button>
                      {item.status !== "Approved" && (
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="text-emerald-600"
                          onClick={() => handleApproveSingle(item.id, item.aiScore)}
                          title="Quick Approve AI Score"
                        >
                          <ThumbsUp className="size-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Detailed View Modal (Sheet) */}
      <Sheet open={!!selectedStudent} onOpenChange={(open) => !open && setSelectedStudent(null)}>
        <SheetContent className="sm:max-w-xl overflow-y-auto w-[90vw]">
          {selectedStudent && (
            <>
              <SheetHeader className="mb-6">
                <SheetTitle className="text-2xl">Submission Review</SheetTitle>
                <SheetDescription>
                  {selectedStudent.student} ({selectedStudent.id}) - Database Systems
                </SheetDescription>
              </SheetHeader>

              <div className="space-y-8">
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-primary/20 text-primary hover:bg-primary/30">Question 1</Badge>
                    <span className="text-sm text-muted-foreground">{selectedStudent.maxScore} Marks</span>
                  </div>
                  <p className="font-medium text-lg leading-relaxed">{selectedStudent.questionText}</p>
                </div>

                <div className="space-y-3 bg-muted/30 p-4 rounded-xl border">
                  <Label className="text-xs uppercase text-muted-foreground font-bold tracking-wider">Student's Answer</Label>
                  <p className="text-sm leading-relaxed">{selectedStudent.openQuestionAnswer}</p>
                </div>

                <div className="space-y-4 border rounded-xl p-5 bg-blue-50/50 border-blue-100">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-blue-700">
                      <BrainCircuit className="size-5" />
                      <h3 className="font-semibold">AI Grading Analysis</h3>
                    </div>
                    <Badge variant="outline" className="bg-white border-blue-200 text-blue-700">
                      Proposed: {selectedStudent.aiScore}% ({selectedStudent.confidence}% Conf.)
                    </Badge>
                  </div>
                  <p className="text-sm text-blue-900/80 leading-relaxed">
                    {selectedStudent.aiExplanation}
                  </p>
                  {selectedStudent.confidence < 75 && (
                    <div className="flex items-center gap-2 text-amber-600 bg-amber-50 p-2 rounded-md text-xs font-medium">
                      <MessageSquareWarning className="size-4" />
                      Low confidence. Manual review highly recommended.
                    </div>
                  )}
                </div>

                <div className="space-y-4 pt-4 border-t">
                  <Label className="text-sm font-semibold">Final Lecturer Score</Label>
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      <Input 
                        type="number" 
                        value={overrideScore} 
                        onChange={(e) => setOverrideScore(e.target.value)}
                        className="w-24 text-lg font-bold pl-3 pr-8 h-12"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                        %
                      </span>
                    </div>
                    <Button onClick={handleOverrideScore} size="lg" className="h-12">
                      Save & Confirm Score
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    By saving, you confirm this score. The AI grade is discarded if overridden.
                  </p>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}