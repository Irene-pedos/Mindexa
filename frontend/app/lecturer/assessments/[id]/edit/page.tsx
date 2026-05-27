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
import { Loader2, ArrowLeft, Save, Shield } from "lucide-react"
import { Skeleton } from "@/components/ui/interfaces-skeleton"
import { Separator } from "@/components/ui/separator"

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
      <div className="max-w-4xl mx-auto space-y-10">
        <div className="space-y-2">
          <Skeleton variant="title" className="h-10 w-64" />
          <Skeleton variant="title" className="h-4 w-96" />
        </div>
        <Card className="shadow-none border p-8 space-y-8">
            <Skeleton variant="title" className="w-1/3" />
            <Skeleton variant="media" className="h-12 w-full rounded-lg" />
            <div className="grid grid-cols-2 gap-8">
                <Skeleton variant="media" className="h-10 w-full rounded-lg" />
                <Skeleton variant="media" className="h-10 w-full rounded-lg" />
            </div>
            <Separator />
            <div className="space-y-4">
                <Skeleton variant="title" className="w-40" />
                <div className="flex justify-between">
                    <Skeleton variant="text" className="w-1/2" />
                    <Skeleton variant="title" className="w-10 h-6 rounded-full" />
                </div>
            </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">
      <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-xl border h-10 w-10">
            <ArrowLeft className="size-4" />
          </Button>
          <div className="space-y-0.5">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground/90">Edit Assessment</h1>
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-widest">Registry Sync • Protocol Coordination</p>
          </div>
      </div>

      <Card className="shadow-none border rounded-xl overflow-hidden">
        <CardHeader className="border-b bg-muted/5 py-4 px-6">
          <CardTitle className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Institutional Configuration</CardTitle>
        </CardHeader>
        <CardContent className="p-6 space-y-8">
          <div className="space-y-2">
            <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground ml-0.5">Assessment Display Title</Label>
            <Input 
                value={form.title} 
                onChange={(e) => setForm({...form, title: e.target.value})} 
                className="h-10 font-medium text-sm rounded-lg"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground ml-0.5">Protocol Vector</Label>
              <Select value={form.type} onValueChange={(v) => setForm({...form, type: v})}>
                <SelectTrigger className="h-10 rounded-lg text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CAT" className="text-sm">Continuous Assessment Test (CAT)</SelectItem>
                  <SelectItem value="SUMMATIVE" className="text-sm">Summative Examination</SelectItem>
                  <SelectItem value="FORMATIVE" className="text-sm">Formative Assessment</SelectItem>
                  <SelectItem value="HOMEWORK" className="text-sm">Homework / Assignment</SelectItem>
                  <SelectItem value="PRACTICE" className="text-sm">Practice</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground ml-0.5">Session Duration (Minutes)</Label>
              <Input 
                type="number" 
                min={1} 
                value={form.duration} 
                onChange={(e) => setForm({...form, duration: parseInt(e.target.value) || 0})} 
                className="h-10 font-semibold text-sm rounded-lg"
              />
            </div>
          </div>

          <div className="space-y-4 pt-6 border-t border-dashed">
            <h3 className="text-[11px] font-semibold uppercase tracking-widest flex items-center gap-2 text-primary">
                <Shield className="size-3.5" /> Integrity Guard Policy
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex justify-between items-center bg-muted/20 p-4 rounded-xl border hover:border-primary/10 transition-colors">
                    <div>
                        <Label className="text-sm font-semibold">Proctored Monitoring</Label>
                        <p className="text-[10px] text-muted-foreground font-medium mt-0.5">Live behavior auditing.</p>
                    </div>
                    <Switch checked={form.integrityMonitoring} onCheckedChange={(v) => setForm({...form, integrityMonitoring: v})} />
                </div>
                <div className="flex justify-between items-center bg-muted/20 p-4 rounded-xl border hover:border-primary/10 transition-colors">
                    <div>
                        <Label className="text-sm font-semibold">Safe Browser Forced</Label>
                        <p className="text-[10px] text-muted-foreground font-medium mt-0.5">Lockdown environment.</p>
                    </div>
                    <Switch checked={form.fullscreenRequired} onCheckedChange={(v) => setForm({...form, fullscreenRequired: v})} />
                </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3 pt-2">
        <Button variant="ghost" size="sm" asChild className="h-9 px-6 font-semibold rounded-lg text-xs uppercase tracking-tight">
          <Link href="/lecturer/assessments">Abort Changes</Link>
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saving} className="h-9 px-8 font-semibold rounded-lg text-xs uppercase tracking-tight shadow-sm">
          {saving ? <><Loader2 className="mr-2 size-3 animate-spin" /> Committing...</> : <><Save className="mr-2 size-3.5" /> Sync Registry</>}
        </Button>
      </div>
    </div>
  )
}
