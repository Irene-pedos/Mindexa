// app/lecturer/question-bank/page.tsx
"use client"

import React, { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus, Search, Eye, Edit, Trash2 } from "lucide-react"

interface Question {
  id: string
  text: string
  type: "MCQ" | "TrueFalse" | "ShortAnswer" | "Essay" | "Matching"
  subject: string
  difficulty: "Easy" | "Medium" | "Hard"
  marks: number
  tags: string[]
  aiGenerated: boolean
}

const questions: Question[] = [
  {
    id: "q1",
    text: "What is the purpose of normalization in relational databases?",
    type: "ShortAnswer",
    subject: "Database Systems",
    difficulty: "Medium",
    marks: 5,
    tags: ["normalization", "theory"],
    aiGenerated: false,
  },
  {
    id: "q2",
    text: "Explain ACID properties with examples.",
    type: "Essay",
    subject: "Database Systems",
    difficulty: "Hard",
    marks: 12,
    tags: ["transactions", "acid"],
    aiGenerated: true,
  },
  {
    id: "q3",
    text: "Is a foreign key allowed to be NULL?",
    type: "TrueFalse",
    subject: "Database Systems",
    difficulty: "Easy",
    marks: 2,
    tags: ["constraints"],
    aiGenerated: false,
  },
  {
    id: "q4",
    text: "Match the following: Primary Key, Foreign Key, Index",
    type: "Matching",
    subject: "Database Systems",
    difficulty: "Medium",
    marks: 6,
    tags: ["keys"],
    aiGenerated: true,
  },
]

export default function LecturerQuestionBank() {
  const [searchTerm, setSearchTerm] = useState("")
  const [filterType, setFilterType] = useState("all")
  const [filterDifficulty, setFilterDifficulty] = useState("all")

  const filtered = questions.filter((q) => {
    const matchesSearch = q.text.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         q.subject.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesType = filterType === "all" || q.type === filterType
    const matchesDifficulty = filterDifficulty === "all" || q.difficulty === filterDifficulty
    return matchesSearch && matchesType && matchesDifficulty
  })

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Question Bank</h1>
          <p className="text-muted-foreground mt-1">Reusable, searchable, and AI-assisted question library</p>
        </div>
        <Button size="lg" asChild>
          <a href="/lecturer/question-bank/new">
            <Plus className="mr-2 size-5" /> Add New Question
          </a>
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
          <Input
            placeholder="Search questions or subjects..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Question Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="MCQ">MCQ</SelectItem>
            <SelectItem value="TrueFalse">True/False</SelectItem>
            <SelectItem value="ShortAnswer">Short Answer</SelectItem>
            <SelectItem value="Essay">Essay</SelectItem>
            <SelectItem value="Matching">Matching</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterDifficulty} onValueChange={setFilterDifficulty}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Difficulty" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Levels</SelectItem>
            <SelectItem value="Easy">Easy</SelectItem>
            <SelectItem value="Medium">Medium</SelectItem>
            <SelectItem value="Hard">Hard</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-6">
        {filtered.map((q) => (
          <Card key={q.id} className="hover:shadow-md transition-all">
            <CardHeader>
              <div className="flex items-start justify-between">
                <CardTitle className="text-lg leading-tight line-clamp-2">{q.text}</CardTitle>
                <div className="flex gap-2">
                  {q.aiGenerated && <Badge variant="secondary">AI Generated</Badge>}
                  <Badge variant="outline">{q.difficulty}</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-6">
                  <div>
                    <span className="text-muted-foreground">Type:</span> {q.type}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Subject:</span> {q.subject}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Marks:</span> {q.marks}
                  </div>
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" size="sm">
                    <Eye className="mr-2 size-4" /> Preview
                  </Button>
                  <Button variant="outline" size="sm">
                    <Edit className="mr-2 size-4" /> Edit
                  </Button>
                  <Button variant="ghost" size="sm" className="text-destructive">
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}