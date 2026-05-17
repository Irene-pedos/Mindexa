// app/lecturer/assessments/[id]/edit/page.tsx
"use client"

import { useParams, useRouter } from "next/navigation"
import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { assessmentApi } from "@/lib/api/assessment"
import Link from "next/link"
import { Loader2 } from "lucide-react"

export default function EditAssessmentPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    title: "",
    type: "CAT",
    duration: 90,
    integrityMonitoring: true,
    fullscreenRequired: true,
  })

  useEffect(() => {
    async function loadAssessment() {
      try {
        const data = await assessmentApi.getAssessmentById(id) as any;
        setForm({
          title: data.title || "",
          type: data.assessment_type || "CAT",
          duration: data.duration_minutes || 90,
          integrityMonitoring: data.is_supervised !== undefined ? data.is_supervised : true,
          fullscreenRequired: data.fullscreen_required !== undefined ? data.fullscreen_required : true,
        });
      } catch (err: any) {
        toast.error("Failed to load assessment details");
      } finally {
        setLoading(false);
      }
    }
    loadAssessment();
  }, [id]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await assessmentApi.updateAssessment(id, {
        title: form.title,
        assessment_type: form.type,
        duration_minutes: form.duration,
        is_supervised: form.integrityMonitoring,
        fullscreen_required: form.fullscreenRequired,
      });
      toast.success("Assessment updated successfully");
      router.push("/lecturer/assessments");
    } catch (err: any) {
      toast.error(err.message || "Failed to update assessment");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="size-10 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Edit Assessment</h1>
        <p className="text-muted-foreground mt-1">Make changes to published or active assessment settings.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Assessment Settings</CardTitle>
          <CardDescription>Adjust the basic metadata and security rules.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          <div className="space-y-2">
            <Label>Assessment Title</Label>
            <Input value={form.title} onChange={(e) => setForm({...form, title: e.target.value})} />
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>Assessment Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm({...form, type: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CAT">Continuous Assessment Test (CAT)</SelectItem>
                  <SelectItem value="SUMMATIVE">Summative Examination</SelectItem>
                  <SelectItem value="FORMATIVE">Formative Assessment</SelectItem>
                  <SelectItem value="HOMEWORK">Homework / Assignment</SelectItem>
                  <SelectItem value="PRACTICE">Practice</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Duration (minutes)</Label>
              <Input type="number" min={1} value={form.duration} onChange={(e) => setForm({...form, duration: parseInt(e.target.value) || 0})} />
            </div>
          </div>

          <div className="space-y-6 pt-4 border-t">
            <h3 className="font-semibold">Environment & Policy</h3>
            <div className="flex justify-between items-center">
              <div>
                <Label className="text-base">Proctored Monitoring</Label>
                <p className="text-sm text-muted-foreground">Live monitoring and webcam capture enabled</p>
              </div>
              <Switch checked={form.integrityMonitoring} onCheckedChange={(v) => setForm({...form, integrityMonitoring: v})} />
            </div>
            <div className="flex justify-between items-center">
              <div>
                <Label className="text-base">Safe Browser</Label>
                <p className="text-sm text-muted-foreground">Forces fullscreen and detects tab switching</p>
              </div>
              <Switch checked={form.fullscreenRequired} onCheckedChange={(v) => setForm({...form, fullscreenRequired: v})} />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-4">
        <Button variant="outline" size="lg" asChild>
          <Link href="/lecturer/assessments">Close</Link>
        </Button>
        <Button size="lg" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          Save Changes
        </Button>
      </div>
    </div>
  )
}