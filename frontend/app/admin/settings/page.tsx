"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Globe, Shield, Settings, Server, Bell, Save, Loader2, ArrowRight } from "lucide-react"
import { toast } from "sonner"
import { adminApi } from "@/lib/api/admin"

export default function AdminSystemSettings() {
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [settings, setSettings] = useState({
    platform_name: "Mindexa Academic OS",
    timezone: "UTC",
    maintenance_mode: false,
    enforce_fullscreen: true,
    ai_assistance_default: false,
    auto_flag_threshold: "3",
    default_duration: 90
  })

  useEffect(() => {
    async function loadSettings() {
      try {
        const data = await adminApi.getSystemSettings()
        if (data) setSettings(data)
      } catch (err) {
        console.error("Failed to load settings", err)
      } finally {
        setInitialLoading(false)
      }
    }
    loadSettings()
  }, [])

  const handleSave = async () => {
    setLoading(true)
    try {
      await adminApi.updateSystemSettings(settings)
      toast.success("System configurations updated successfully")
    } catch (err) {
      toast.error("Failed to save system settings")
    } finally {
      setLoading(false)
    }
  }

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id)
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">System Settings</h1>
          <p className="text-muted-foreground text-sm">Platform-wide institutional configuration</p>
        </div>
        <Button size="sm" className="rounded-lg px-4 h-9" onClick={handleSave} disabled={loading}>
          {loading ? "Saving..." : <><Save className="mr-2 size-3.5" /> Save Changes</>}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Navigation / Sections (Sidebar style in desktop) */}
        <div className="md:col-span-1 space-y-1 sticky top-20 h-fit">
          {[
            { id: "general", label: "General Settings", icon: Settings },
            { id: "security", label: "Security & Integrity", icon: Shield },
            { id: "academic", label: "Academic Structure", icon: Globe },
            { id: "notifications", label: "Notifications", icon: Bell },
            { id: "server", label: "Platform & API", icon: Server },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => scrollToSection(item.id)}
              className="w-full flex items-center gap-3 px-3 py-2 text-xs font-medium rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            >
              <item.icon className="size-4" />
              {item.label}
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="md:col-span-2 space-y-6 pb-20">
          <Card id="general" className="border shadow-none scroll-mt-20">
            <CardHeader className="py-3 px-4 border-b h-12 flex justify-center">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">General Configuration</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground">Platform Display Name</Label>
                <Input 
                  value={settings.platform_name} 
                  onChange={(e) => setSettings({...settings, platform_name: e.target.value})}
                  className="h-9 text-xs" 
                />
              </div>

              <div className="space-y-1.5 pt-2">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground">Default Timezone</Label>
                <Select 
                  value={settings.timezone} 
                  onValueChange={(v) => setSettings({...settings, timezone: v})}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UTC">Coordinated Universal Time (UTC)</SelectItem>
                    <SelectItem value="GMT+2">Central African Time (GMT+2)</SelectItem>
                    <SelectItem value="EST">Eastern Standard Time (EST)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between pt-2 border-t mt-2">
                <div className="space-y-0.5">
                  <div className="text-xs font-semibold">Maintenance Mode</div>
                  <div className="text-[10px] text-muted-foreground">Temporarily disable student access</div>
                </div>
                <Switch 
                  checked={settings.maintenance_mode} 
                  onCheckedChange={(v) => setSettings({...settings, maintenance_mode: v})}
                  className="scale-75" 
                />
              </div>
            </CardContent>
          </Card>

          <Card id="security" className="border shadow-none scroll-mt-20">
            <CardHeader className="py-3 px-4 border-b h-12 flex justify-center">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Security & Integrity Policies</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="text-xs font-semibold">Enforce Global Fullscreen</div>
                  <div className="text-[10px] text-muted-foreground">Mandatory for all summative exams</div>
                </div>
                <Switch 
                  checked={settings.enforce_fullscreen} 
                  onCheckedChange={(v) => setSettings({...settings, enforce_fullscreen: v})}
                  className="scale-75" 
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <div className="space-y-0.5">
                  <div className="text-xs font-semibold">AI Assistant Governance</div>
                  <div className="text-[10px] text-muted-foreground">Enable student study support by default</div>
                </div>
                <Switch 
                  checked={settings.ai_assistance_default} 
                  onCheckedChange={(v) => setSettings({...settings, ai_assistance_default: v})}
                  className="scale-75" 
                />
              </div>

              <div className="space-y-1.5 pt-2 border-t mt-2">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground">Auto-Flag Threshold</Label>
                <Select 
                  value={settings.auto_flag_threshold} 
                  onValueChange={(v) => setSettings({...settings, auto_flag_threshold: v})}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2">2 warnings</SelectItem>
                    <SelectItem value="3">3 warnings</SelectItem>
                    <SelectItem value="5">5 warnings</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground italic">Warnings before system flags attempt for review</p>
              </div>
            </CardContent>
          </Card>

          <Card id="academic" className="border shadow-none scroll-mt-20">
            <CardHeader className="py-3 px-4 border-b h-12 flex justify-center">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Academic & Institutional</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4 text-[13px] text-muted-foreground">
              <p>Configure institutional hierarchy, departments, and semesters.</p>
              <Button variant="outline" size="sm" className="h-8 text-xs font-bold">Manage Academic Structure <ArrowRight className="size-3 ml-2" /></Button>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" size="sm" className="h-8 text-xs px-4">Discard</Button>
            <Button size="sm" className="h-8 text-xs px-6" onClick={handleSave} disabled={loading}>
              Save Config
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}