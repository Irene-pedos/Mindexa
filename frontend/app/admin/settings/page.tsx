// app/admin/settings/page.tsx
"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export default function AdminSystemSettings() {
  return (
    <div className="max-w-3xl mx-auto space-y-10">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">System Settings</h1>
        <p className="text-muted-foreground mt-1">Platform configuration and institutional policies</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>General Platform Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-8">
          <div className="space-y-2">
            <Label>Platform Name</Label>
            <Input defaultValue="Mindexa Academic OS" />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Maintenance Mode</div>
              <div className="text-sm text-muted-foreground">Temporarily disable login for all users</div>
            </div>
            <Switch />
          </div>

          <div className="space-y-2">
            <Label>Default Assessment Duration (minutes)</Label>
            <Input type="number" defaultValue="90" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Security Policies</CardTitle>
        </CardHeader>
        <CardContent className="space-y-8">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Require Fullscreen for All Summative Assessments</div>
            </div>
            <Switch defaultChecked />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">AI Assistance Allowed by Default</div>
              <div className="text-sm text-muted-foreground">Can be overridden per assessment</div>
            </div>
            <Switch />
          </div>

          <div className="space-y-2">
            <Label>Maximum Warning Threshold Before Auto-Flag</Label>
            <Select defaultValue="3">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2">2 warnings</SelectItem>
                <SelectItem value="3">3 warnings</SelectItem>
                <SelectItem value="5">5 warnings</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button size="lg">Save All System Changes</Button>
      </div>
    </div>
  )
}