// app/lecturer/assessments/new/page.tsx
"use client"

import React, { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Plus, Trash2, Save, Eye, Calendar as CalendarIcon, Clock, Shield, Users, Clock2Icon } from "lucide-react"
import { Calendar } from "@/components/ui/calendar"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { cn } from "@/lib/utils"

type AssessmentType = "CAT" | "Formative" | "Summative" | "Homework" | "Group Work" | "Reassessment"

export default function NewAssessmentBuilder() {
  const [step, setStep] = useState<"basic" | "settings" | "blueprint" | "review">("basic")

  const [basic, setBasic] = useState({
    title: "",
    type: "CAT" as AssessmentType,
    subject: "",
    targetClass: "",
    instructions: "",
    totalMarks: 100,
    durationMinutes: 90,
    date: new Date() as Date | undefined,
    startTime: "10:30:00",
    endTime: "12:30:00",
    numberOfAttempts: 1,
    resultReleaseMode: "delayed" as "immediate" | "delayed",
  })

  const [security, setSecurity] = useState({
    passwordProtected: true,
    aiAllowed: false,
    integrityMonitoring: true,
    fullscreenRequired: true,
    supervised: true,
    openBook: false,
    randomization: true,
    shuffleQuestions: true,
  })

  const [blueprint, setBlueprint] = useState([
    { 
      section: "Section A", 
      topics: "Normalization, ER Diagrams", 
      marks: 40, 
      questions: 8, 
      difficulty: "Medium" as "Easy" | "Medium" | "Hard",
      questionTypes: ["mcq", "truefalse"] 
    },
    { 
      section: "Section B", 
      topics: "SQL Queries & Transactions", 
      marks: 35, 
      questions: 6, 
      difficulty: "Hard" as "Easy" | "Medium" | "Hard",
      questionTypes: ["shortanswer", "essay"] 
    },
    { 
      section: "Section C", 
      topics: "NoSQL Concepts", 
      marks: 25, 
      questions: 4, 
      difficulty: "Medium" as "Easy" | "Medium" | "Hard",
      questionTypes: ["matching", "computational"] 
    },
  ])

  const totalMarksCalculated = blueprint.reduce((sum, sec) => sum + sec.marks, 0)

  const addSection = () => {
    const nextLetter = String.fromCharCode(65 + blueprint.length)
    setBlueprint([...blueprint, { 
      section: `Section ${nextLetter}`, 
      topics: "", 
      marks: 0, 
      questions: 0, 
      difficulty: "Medium",
      questionTypes: ["mcq"]
    }])
  }

  const updateSection = (
    index: number,
    field: keyof typeof blueprint[0],
    value: string | number | string[]
  ) => {
    const updated = [...blueprint]
    updated[index] = { ...updated[index], [field]: value }
    setBlueprint(updated)
  }

  const removeSection = (index: number) => {
    if (blueprint.length === 1) return
    setBlueprint(blueprint.filter((_, i) => i !== index))
  }

  const handlePublish = () => {
    const payload = {
      basic,
      security,
      blueprint,
      totalMarks: totalMarksCalculated,
      status: "published",
      createdBy: "Lecturer",
      // Will be sent to FastAPI Brain endpoint: /brain/assessments/create
    }
    console.log("Publishing to Brain:", payload)
    alert("Assessment published successfully. Students can now access it according to the schedule.")
    // TODO: router.push("/lecturer/assessments")
  }

  return (
    <div className="max-w-6xl mx-auto space-y-10 pb-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Assessment Builder</h1>
          <p className="text-muted-foreground mt-1">
            Create secure, blueprint-driven academic assessments with full human oversight
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="px-4 py-1">Step {step === "basic" ? 1 : step === "settings" ? 2 : step === "blueprint" ? 3 : 4} of 4</Badge>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="flex gap-2">
        {(["basic", "settings", "blueprint", "review"] as const).map((s, i) => (
          <Button
            key={s}
            variant={step === s ? "default" : "outline"}
            className="flex-1"
            onClick={() => setStep(s)}
          >
            {i + 1}. {s.charAt(0).toUpperCase() + s.slice(1)}
          </Button>
        ))}
      </div>

      {/* STEP 1: Basic Information */}
      {step === "basic" && (
        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
            <CardDescription>Core details of the assessment</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2 md:col-span-2">
              <Label>Assessment Title</Label>
              <Input 
                value={basic.title} 
                onChange={(e) => setBasic({ ...basic, title: e.target.value })} 
                placeholder="Mid-Semester CAT – Database Systems" 
              />
            </div>

            <div className="space-y-2">
              <Label>Assessment Type</Label>
              <Select value={basic.type} onValueChange={(v: AssessmentType) => setBasic({ ...basic, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Formative">Formative Assessment</SelectItem>
                  <SelectItem value="CAT">Continuous Assessment Test (CAT)</SelectItem>
                  <SelectItem value="Summative">Summative Assessment</SelectItem>
                  <SelectItem value="Homework">Homework</SelectItem>
                  <SelectItem value="Group Work">Group Work</SelectItem>
                  <SelectItem value="Reassessment">Reassessment</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Subject / Module</Label>
              <Input value={basic.subject} onChange={(e) => setBasic({ ...basic, subject: e.target.value })} />
            </div>

            <div className="space-y-2">
              <Label>Target Class / Section</Label>
              <Input value={basic.targetClass} onChange={(e) => setBasic({ ...basic, targetClass: e.target.value })} />
            </div>

            <div className="space-y-2">
              <Label>Duration (minutes)</Label>
              <Input type="number" value={basic.durationMinutes} onChange={(e) => setBasic({ ...basic, durationMinutes: parseInt(e.target.value) })} />
            </div>

            <div className="space-y-2">
              <Label>Total Marks</Label>
              <Input type="number" value={basic.totalMarks} onChange={(e) => setBasic({ ...basic, totalMarks: parseInt(e.target.value) })} />
            </div>

            <div className="md:col-span-2 space-y-2">
              <Label>Instructions for Students</Label>
              <Textarea 
                value={basic.instructions} 
                onChange={(e) => setBasic({ ...basic, instructions: e.target.value })} 
                placeholder="This is a closed-book supervised CAT. AI assistance is not permitted. Fullscreen mode is mandatory."
                className="min-h-28"
              />
            </div>

            <div className="md:col-span-2 space-y-3">
              <Label>Schedule (Date & Time)</Label>
              
              <Card size="sm" className="w-fit">
                <CardContent>
                  <Calendar
                    mode="single"
                    selected={basic.date}
                    onSelect={(d) => setBasic({ ...basic, date: d })}
                    className="p-0"
                  />
                </CardContent>
                <CardFooter className="border-t bg-card py-4">
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="time-from">Start Time</FieldLabel>
                      <InputGroup>
                        <InputGroupInput
                          id="time-from"
                          type="time"
                          step="1"
                          value={basic.startTime}
                          onChange={(e) => setBasic({ ...basic, startTime: e.target.value })}
                          className="appearance-none [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
                        />
                        <InputGroupAddon>
                          <Clock2Icon className="text-muted-foreground size-4" />
                        </InputGroupAddon>
                      </InputGroup>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="time-to">End Time</FieldLabel>
                      <InputGroup>
                        <InputGroupInput
                          id="time-to"
                          type="time"
                          step="1"
                          value={basic.endTime}
                          onChange={(e) => setBasic({ ...basic, endTime: e.target.value })}
                          className="appearance-none [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
                        />
                        <InputGroupAddon>
                          <Clock2Icon className="text-muted-foreground size-4" />
                        </InputGroupAddon>
                      </InputGroup>
                    </Field>
                  </FieldGroup>
                </CardFooter>
              </Card>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 2: Security & Integrity (Zero-Trust) */}
      {step === "settings" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="size-5" /> Security & Integrity Settings
            </CardTitle>
            <CardDescription>Configure protection level and monitoring rules</CardDescription>
          </CardHeader>
          <CardContent className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
              {Object.entries(security).map(([key, value]) => (
                <div key={key} className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="font-medium capitalize">
                      {key.replace(/([A-Z])/g, " $1")}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {key === "aiAllowed" && "Allow Student Study Support AI during this assessment"}
                      {key === "integrityMonitoring" && "Real-time tab switch, fullscreen, copy/paste detection"}
                      {key === "fullscreenRequired" && "Force browser into fullscreen mode"}
                      {key === "supervised" && "Enable Live Supervision Panel for lecturers"}
                      {key === "openBook" && "Students may refer to personal notes"}
                    </div>
                  </div>
                  <Switch 
                    checked={value} 
                    onCheckedChange={(v) => setSecurity({ ...security, [key]: v })} 
                  />
                </div>
              ))}
            </div>

            <Separator />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <Label>Password Protection</Label>
                <Input placeholder="Optional access code" className="mt-2" />
              </div>
              <div>
                <Label>Number of Attempts</Label>
                <Input type="number" value={basic.numberOfAttempts} onChange={(e) => setBasic({ ...basic, numberOfAttempts: parseInt(e.target.value) })} className="mt-2" />
              </div>
              <div>
                <Label>Result Release Policy</Label>
                <Select value={basic.resultReleaseMode} onValueChange={(v: "immediate" | "delayed") => setBasic({ ...basic, resultReleaseMode: v })}>
                  <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="immediate">Immediate</SelectItem>
                    <SelectItem value="delayed">Delayed (Lecturer Approval)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 3: Assessment Blueprint Builder */}
      {step === "blueprint" && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Assessment Blueprint</CardTitle>
              <CardDescription>Define academic structure, topic coverage, marks distribution and difficulty balance</CardDescription>
            </div>
            <Button onClick={addSection} variant="outline">
              <Plus className="mr-2 size-4" /> Add Section
            </Button>
          </CardHeader>
          <CardContent className="space-y-8">
            {blueprint.map((section, index) => (
              <div key={index} className="border rounded-3xl p-8 space-y-6 bg-card">
                <div className="flex justify-between items-center">
                  <Input 
                    value={section.section} 
                    onChange={(e) => updateSection(index, "section", e.target.value)} 
                    className="font-semibold text-xl w-64" 
                  />
                  <Button variant="ghost" size="icon" onClick={() => removeSection(index)} className="text-destructive">
                    <Trash2 className="size-5" />
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <Label>Topics / Learning Outcomes Covered</Label>
                    <Textarea 
                      value={section.topics} 
                      onChange={(e) => updateSection(index, "topics", e.target.value)} 
                      placeholder="List key topics or outcomes"
                      className="mt-2 min-h-24"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Marks Allocation</Label>
                      <Input 
                        type="number" 
                        value={section.marks} 
                        onChange={(e) => updateSection(index, "marks", parseInt(e.target.value) || 0)} 
                        className="mt-2" 
                      />
                    </div>
                    <div>
                      <Label>Number of Questions</Label>
                      <Input 
                        type="number" 
                        value={section.questions} 
                        onChange={(e) => updateSection(index, "questions", parseInt(e.target.value) || 0)} 
                        className="mt-2" 
                      />
                    </div>
                  </div>
                </div>

                <div className="flex gap-6">
                  <div className="flex-1">
                    <Label>Difficulty Balance</Label>
                    <Select value={section.difficulty} onValueChange={(v) => updateSection(index, "difficulty", v)}>
                      <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Easy">Easy</SelectItem>
                        <SelectItem value="Medium">Medium</SelectItem>
                        <SelectItem value="Hard">Hard</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex-1">
                    <Label>Allowed Question Types</Label>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {["mcq", "truefalse", "shortanswer", "essay", "matching", "fillblank", "computational", "ordering"].map((type) => (
                        <Badge 
                          key={type}
                          variant={section.questionTypes.includes(type) ? "default" : "outline"}
                          className="cursor-pointer"
                          onClick={() => {
                            const current = section.questionTypes
                            updateSection(index, "questionTypes", 
                              current.includes(type) 
                                ? current.filter(t => t !== type) 
                                : [...current, type]
                            )
                          }}
                        >
                          {type}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            <div className="flex justify-between items-center pt-6 border-t">
              <div className="text-sm text-muted-foreground">
                Total Marks: <span className="font-semibold text-foreground">{totalMarksCalculated}</span>
              </div>
              <Button onClick={() => setStep("review")} size="lg">
                Continue to Review & Publish
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 4: Final Review & Publish */}
      {step === "review" && (
        <Card>
          <CardHeader>
            <CardTitle>Final Review & Publish</CardTitle>
            <CardDescription>Human oversight required before publishing</CardDescription>
          </CardHeader>
          <CardContent className="space-y-10">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <h3 className="font-semibold mb-4">Assessment Overview</h3>
                <div className="space-y-3 text-sm">
                  <div><strong>Title:</strong> {basic.title || "Untitled"}</div>
                  <div><strong>Type:</strong> {basic.type}</div>
                  <div><strong>Duration:</strong> {basic.durationMinutes} minutes</div>
                  <div><strong>Target:</strong> {basic.targetClass}</div>
                  <div><strong>Schedule:</strong> {basic.date ? basic.date.toDateString() : "Not set"} ({basic.startTime} - {basic.endTime})</div>
                  <div><strong>Result Release:</strong> {basic.resultReleaseMode}</div>
                </div>
              </div>
              <div>
                <h3 className="font-semibold mb-4">Security Configuration</h3>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(security).filter(([, v]) => v).map(([k]) => (
                    <Badge key={k} variant="secondary">{k.replace(/([A-Z])/g, " $1")}</Badge>
                  ))}
                </div>
              </div>
            </div>

            <Separator />

            <div>
              <h3 className="font-semibold mb-6">Blueprint Summary</h3>
              {blueprint.map((sec, i) => (
                <div key={i} className="mb-6 last:mb-0 p-6 border rounded-2xl">
                  <div className="font-medium">{sec.section} — {sec.topics}</div>
                  <div className="text-sm text-muted-foreground mt-2">
                    {sec.questions} questions • {sec.marks} marks • {sec.difficulty} difficulty
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-4 pt-6">
              <Button variant="outline" size="lg" onClick={() => setStep("blueprint")}>
                <Save className="mr-2 size-4" /> Save Draft
              </Button>
              <Button onClick={handlePublish} size="lg" className="px-10">
                Publish Assessment to Students
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}