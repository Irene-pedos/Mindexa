// app/(student)/profile/page.tsx
"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { User, Mail, Phone, Shield, Bell, Loader2 } from "lucide-react"
import { useAuth } from "@/hooks/use-auth"
import { authApi } from "@/lib/api/auth"
import { toast } from "sonner"
import { Skeleton } from "@/components/ui/skeleton"

export default function ProfileSettingsPage() {
  const { user, checkAuth } = useAuth()
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    phone_number: "",
  })

  useEffect(() => {
    if (user) {
      setFormData({
        first_name: user.profile?.first_name || "",
        last_name: user.profile?.last_name || "",
        phone_number: user.profile?.phone_number || "",
      })
      setInitialLoading(false)
    }
  }, [user])

  const handleSave = async () => {
    setLoading(true)
    try {
      const updatedUser = await authApi.updateProfile(formData)
      localStorage.setItem("user", JSON.stringify(updatedUser))
      checkAuth() // Refresh global auth state
      toast.success("Profile updated successfully")
    } catch (err) {
      toast.error("Failed to update profile")
    } finally {
      setLoading(false)
    }
  }

  if (initialLoading) {
    return (
      <div className="max-w-2xl mx-auto space-y-8">
        <Skeleton className="h-10 w-64" />
        <Card>
          <CardContent className="p-10 space-y-4">
             <Skeleton className="h-24 w-24 rounded-full" />
             <Skeleton className="h-10 w-full" />
             <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Profile Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your personal information and preferences</p>
      </div>

      {/* Profile Information */}
      <Card>
        <CardHeader>
          <CardTitle>Personal Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-6">
            <Avatar className="h-24 w-24">
              <AvatarImage src={user?.profile?.profile_picture_url || "/avatars/student.jpg"} />
              <AvatarFallback className="text-3xl uppercase">
                {user?.profile?.first_name?.[0]}{user?.profile?.last_name?.[0] || user?.email?.[0]}
              </AvatarFallback>
            </Avatar>
            <div>
              <Button variant="outline">Change Photo</Button>
              <p className="text-xs text-muted-foreground mt-2">JPG or PNG. Max 2MB.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="firstName">First Name</Label>
              <Input 
                id="firstName" 
                value={formData.first_name} 
                onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last Name</Label>
              <Input 
                id="lastName" 
                value={formData.last_name} 
                onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">University Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 size-4 text-muted-foreground" />
              <Input id="email" value={user?.email || ""} readOnly className="pl-10 bg-muted" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              <Input 
                id="phone" 
                value={formData.phone_number} 
                onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Student ID</Label>
              <Input value={user?.profile?.student_id || user?.profile?.staff_id || "N/A"} readOnly className="bg-muted" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Security & Preferences */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="size-5" /> Security & Notifications
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-8">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Enable Browser Notifications</div>
              <div className="text-sm text-muted-foreground">Receive reminders for upcoming assessments</div>
            </div>
            <Switch defaultChecked />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Email Notifications</div>
              <div className="text-sm text-muted-foreground">Result releases, deadline changes, and appeals</div>
            </div>
            <Switch defaultChecked />
          </div>

          <Separator />

          <Button variant="outline" className="w-full">Change Password</Button>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button size="lg" onClick={handleSave} disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save Changes
        </Button>
      </div>
    </div>
  )
}