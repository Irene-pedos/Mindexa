// app/lecturer/grading/page.tsx
"use client"

import React from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { 
  CheckCircle, 
  Clock, 
  AlertTriangle, 
  Users, 
  Eye, 
  ThumbsUp, 
  ThumbsDown 
} from "lucide-react"
import { cn } from "@/lib/utils"

const pendingItems = [
  {
    id: 1,
    assessment: "Mid-Semester CAT – Database Systems",
    type: "AI Suggested Grade",
    studentCount: 18,
    pendingCount: 18,
    status: "Pending Review",
    urgency: "high",
    dueIn: "4 hours",
  },
  {
    id: 2,
    assessment: "Algorithms Formative Quiz",
    type: "Manual Grading Required",
    studentCount: 24,
    pendingCount: 9,
    status: "In Progress",
    urgency: "medium",
    dueIn: "2 days",
  },
  {
    id: 3,
    assessment: "Software Engineering Group Work",
    type: "Rubric-Based Grading",
    studentCount: 12,
    pendingCount: 12,
    status: "Pending Review",
    urgency: "low",
    dueIn: "5 days",
  },
]

const aiSuggestions = [
  {
    id: 101,
    assessment: "Database Systems CAT – Essay Question #3",
    student: "Jordan Lee (S3921)",
    suggestedGrade: "87/100",
    confidence: "92%",
    flagged: false,
    aiReason: "Strong explanation of ACID properties with relevant banking examples.",
  },
  {
    id: 102,
    assessment: "Operating Systems Short Answer",
    student: "Taylor Kim (S2847)",
    suggestedGrade: "64/100",
    confidence: "78%",
    flagged: true,
    aiReason: "Answer misses key concepts of process scheduling. Potential integrity flag.",
  },
]

export default function LecturerGradingQueue() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Grading & Review Queue</h1>
        <p className="text-muted-foreground mt-1">
          Review AI suggestions, perform manual grading, handle appeals, and release results with full human oversight
        </p>
      </div>

      <Tabs defaultValue="queue" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="queue">Pending Queue</TabsTrigger>
          <TabsTrigger value="ai">AI Suggestions</TabsTrigger>
          <TabsTrigger value="appeals">Appeals & Reviews</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
        </TabsList>

        {/* Pending Queue */}
        <TabsContent value="queue" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Items Requiring Your Attention ({pendingItems.reduce((sum, i) => sum + i.pendingCount, 0)})</CardTitle>
              <CardDescription>AI-assisted and manual grading tasks</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Assessment</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Students</TableHead>
                    <TableHead>Pending</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.assessment}</TableCell>
                      <TableCell>{item.type}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Users className="size-4" /> {item.studentCount}
                        </div>
                      </TableCell>
                      <TableCell className="font-semibold">{item.pendingCount}</TableCell>
                      <TableCell>
                        <Badge variant={item.urgency === "high" ? "destructive" : item.urgency === "medium" ? "default" : "secondary"}>
                          {item.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{item.dueIn}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm">Open Grading Interface</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* AI Suggestions */}
        <TabsContent value="ai" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>AI Grading Suggestions (Human Review Required)</CardTitle>
              <CardDescription>
                AI provides suggestions only. You must review, edit if needed, and approve before results are released.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {aiSuggestions.map((item) => (
                <div key={item.id} className="border rounded-2xl p-6 hover:bg-muted/50 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="font-semibold">{item.assessment}</div>
                      <div className="text-sm text-muted-foreground mt-1">{item.student}</div>
                      <div className="mt-3 text-sm">
                        AI Suggestion: <span className="font-semibold text-emerald-600">{item.suggestedGrade}</span> 
                        <span className="text-muted-foreground"> (Confidence: {item.confidence})</span>
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground italic">
                        “{item.aiReason}”
                      </div>
                    </div>

                    <div className="flex flex-col gap-3 items-end">
                      {item.flagged && <Badge variant="destructive">Integrity Flagged</Badge>}
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm">
                          <Eye className="mr-2 size-4" /> Review Full Answer
                        </Button>
                        <Button size="sm" variant="default">
                          <ThumbsUp className="mr-2 size-4" /> Approve
                        </Button>
                        <Button size="sm" variant="destructive">
                          <ThumbsDown className="mr-2 size-4" /> Reject & Edit
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Appeals & Reviews + Completed tabs can be expanded later */}
        <TabsContent value="appeals" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Student Appeals & Result Review Requests</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground py-12 text-center">No active appeals at this time.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="completed" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Recently Completed Grading</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground py-12 text-center">All graded assessments will appear here.</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}