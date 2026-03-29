// app/lecturer/assessments/[id]/edit/page.tsx
"use client"

import { useParams } from "next/navigation"
import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export default function EditAssessmentPage() {
  const params = useParams()
  const id = params.id

  const [form, setForm] = useState({
    title: "Mid-Semester CAT – Database Systems",
    type: "CAT",
    duration: 90,
    integrityMonitoring: true,
    fullscreenRequired: true,
  })

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Edit Assessment</h1>
        <p className="text-muted-foreground">ID: {id}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Assessment Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-8">
          <div className="space-y-2">
            <Label>Title</Label>
            <Input value={form.title} onChange={(e) => setForm({...form, title: e.target.value})} />
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm({...form, type: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CAT">CAT</SelectItem>
                  <SelectItem value="Summative">Summative</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Duration (minutes)</Label>
              <Input type="number" value={form.duration} onChange={(e) => setForm({...form, duration: parseInt(e.target.value)})} />
            </div>
          </div>

          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>Integrity Monitoring</div>
              <Switch checked={form.integrityMonitoring} onCheckedChange={(v) => setForm({...form, integrityMonitoring: v})} />
            </div>
            <div className="flex justify-between items-center">
              <div>Fullscreen Required</div>
              <Switch checked={form.fullscreenRequired} onCheckedChange={(v) => setForm({...form, fullscreenRequired: v})} />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-4">
        <Button variant="outline" size="lg">Cancel</Button>
        <Button size="lg">Save Changes</Button>
      </div>
    </div>
  )
}