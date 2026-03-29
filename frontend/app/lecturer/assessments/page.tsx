// app/lecturer/assessments/new/page.tsx
"use client"

import React, { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Plus, Trash2 } from "lucide-react"

export default function NewAssessmentBuilder() {
  const [basic, setBasic] = useState({
    title: "",
    type: "CAT",
    subject: "",
    targetClass: "",
    instructions: "",
    totalMarks: 100,
    duration: 90,
  })

  const [security, setSecurity] = useState({
    passwordProtected: false,
    aiAllowed: false,
    integrityMonitoring: true,
    fullscreenRequired: true,
    supervised: true,
    openBook: false,
  })

  const [blueprint, setBlueprint] = useState([
    { section: "Section A", topics: "Normalization, ER Diagrams", marks: 40, questions: 8, difficulty: "Medium" },
    { section: "Section B", topics: "SQL & Transactions", marks: 35, questions: 6, difficulty: "Hard" },
    { section: "Section C", topics: "NoSQL Concepts", marks: 25, questions: 4, difficulty: "Medium" },
  ])

  const addSection = () => {
    setBlueprint([...blueprint, { section: `Section ${String.fromCharCode(65 + blueprint.length)}`, topics: "", marks: 0, questions: 0, difficulty: "Medium" }])
  }

  const updateSection = (index: number, field: string, value: string | number) => {
    const updated = [...blueprint]
    updated[index] = { ...updated[index], [field]: value }
    setBlueprint(updated)
  }

  const removeSection = (index: number) => {
    setBlueprint(blueprint.filter((_, i) => i !== index))
  }

  const handlePublish = () => {
    alert("Assessment published successfully with blueprint. It is now visible to students.")
    // TODO: Send full payload to FastAPI Brain
  }

  return (
    <div className="max-w-5xl mx-auto space-y-10">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Assessment Builder</h1>
        <p className="text-muted-foreground mt-1">Create secure, structured, and blueprint-balanced assessments</p>
      </div>

      {/* Basic Information */}
      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label>Assessment Title</Label>
            <Input value={basic.title} onChange={(e) => setBasic({ ...basic, title: e.target.value })} placeholder="Mid-Semester CAT – Database Systems" />
          </div>
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={basic.type} onValueChange={(v) => setBasic({ ...basic, type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="CAT">CAT</SelectItem>
                <SelectItem value="Formative">Formative</SelectItem>
                <SelectItem value="Summative">Summative</SelectItem>
                <SelectItem value="Homework">Homework</SelectItem>
                <SelectItem value="Group Work">Group Work</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Subject</Label>
            <Input value={basic.subject} onChange={(e) => setBasic({ ...basic, subject: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Target Class</Label>
            <Input value={basic.targetClass} onChange={(e) => setBasic({ ...basic, targetClass: e.target.value })} />
          </div>
          <div className="md:col-span-2 space-y-2">
            <Label>Instructions for Students</Label>
            <Textarea value={basic.instructions} onChange={(e) => setBasic({ ...basic, instructions: e.target.value })} placeholder="Closed book. No AI assistance allowed." />
          </div>
        </CardContent>
      </Card>

      {/* Security & Integrity Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Security & Integrity Settings</CardTitle>
          <CardDescription>Zero-Trust configuration</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {Object.keys(security).map((key) => (
            <div key={key} className="flex items-center justify-between">
              <div>
                <div className="font-medium capitalize">{key.replace(/([A-Z])/g, " $1")}</div>
                <div className="text-sm text-muted-foreground">
                  {key === "integrityMonitoring" && "Tab, fullscreen, copy detection"}
                  {key === "fullscreenRequired" && "Force fullscreen mode"}
                  {key === "supervised" && "Enable live supervision panel"}
                </div>
              </div>
              <Switch 
                checked={security[key as keyof typeof security]} 
                onCheckedChange={(v) => setSecurity({ ...security, [key]: v })} 
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Assessment Blueprint Builder */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Assessment Blueprint</CardTitle>
            <CardDescription>Define sections, topic coverage, marks distribution and difficulty balance</CardDescription>
          </div>
          <Button onClick={addSection} variant="outline">
            <Plus className="mr-2 size-4" /> Add Section
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          {blueprint.map((section, index) => (
            <div key={index} className="border rounded-2xl p-6 space-y-4">
              <div className="flex justify-between items-center">
                <Input 
                  value={section.section} 
                  onChange={(e) => updateSection(index, "section", e.target.value)} 
                  className="font-medium w-48" 
                />
                <Button variant="ghost" size="icon" onClick={() => removeSection(index)}>
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <Label>Topics Covered</Label>
                  <Input value={section.topics} onChange={(e) => updateSection(index, "topics", e.target.value)} />
                </div>
                <div>
                  <Label>Marks</Label>
                  <Input type="number" value={section.marks} onChange={(e) => updateSection(index, "marks", parseInt(e.target.value))} />
                </div>
                <div>
                  <Label>Number of Questions</Label>
                  <Input type="number" value={section.questions} onChange={(e) => updateSection(index, "questions", parseInt(e.target.value))} />
                </div>
                <div>
                  <Label>Difficulty Balance</Label>
                  <Select value={section.difficulty} onValueChange={(v) => updateSection(index, "difficulty", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Easy">Easy</SelectItem>
                      <SelectItem value="Medium">Medium</SelectItem>
                      <SelectItem value="Hard">Hard</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-4">
        <Button variant="outline" size="lg">Save as Draft</Button>
        <Button onClick={handlePublish} size="lg">Publish Assessment</Button>
      </div>
    </div>
  )
}