// app/lecturer/profile/page.tsx
"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { User, Mail, Phone, Shield, Bell, Loader2, GraduationCap } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { authApi } from "@/lib/api/auth";
import { academicApi } from "@/lib/api/academic";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";

export default function LecturerProfilePage() {
  const { user, checkAuth } = useAuth();
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [assignments, setAssignments] = useState<any[]>([]);

  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    phone_number: "",
  });

  useEffect(() => {
    async function loadData() {
      if (user) {
        setFormData({
          first_name: user.profile?.first_name || "",
          last_name: user.profile?.last_name || "",
          phone_number: user.profile?.phone_number || "",
        });
        
        try {
          const assData = await academicApi.getMyAssignments();
          setAssignments(assData);
        } catch (e) {
          console.error("Failed to load assignments", e);
        }
        
        setInitialLoading(false);
      }
    }
    loadData();
  }, [user]);

  const handleSave = async () => {
    setLoading(true);
    try {
      const updatedUser = await authApi.updateProfile(formData);
      localStorage.setItem("user", JSON.stringify(updatedUser));
      checkAuth(); // Refresh global auth state
      toast.success("Profile updated successfully");
    } catch (err) {
      toast.error("Failed to update profile");
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error("File size must be less than 2MB");
      return;
    }

    setLoading(true);
    try {
      const updatedUser = await authApi.uploadAvatar(file);
      localStorage.setItem("user", JSON.stringify(updatedUser));
      checkAuth();
      toast.success("Profile picture updated");
    } catch (err) {
      toast.error("Failed to upload image");
    } finally {
      setLoading(false);
    }
  };

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
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          Lecturer Profile Settings
        </h1>
        <p className="text-muted-foreground mt-1">
          Manage your personal information and preferences
        </p>
      </div>

      {/* Profile Information */}
      <Card>
        <CardHeader>
          <CardTitle>Personal Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-6">
            <Avatar className="h-24 w-24 border">
              <AvatarImage
                src={
                  user?.profile?.profile_picture_url
                    ? `${process.env.NEXT_PUBLIC_API_URL?.replace("/api/v1", "") || "http://localhost:8000"}${user.profile.profile_picture_url}`
                    : "/avatars/user avatar.png"
                }
              />
              <AvatarFallback className="text-3xl uppercase bg-muted">
                {user?.profile?.first_name?.[0]}
                {user?.profile?.last_name?.[0] || user?.email?.[0]}
              </AvatarFallback>
            </Avatar>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="relative overflow-hidden h-9"
                  disabled={loading}
                >
                  {loading ? <div className="size-4 rounded-full bg-primary/20 animate-pulse mr-2" /> : null}
                  Change Photo
                  <input
                    type="file"
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    accept="image/*"
                    onChange={handleFileChange}
                    disabled={loading}
                  />
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                JPG or PNG. Max 2MB.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="firstName">First Name</Label>
              <Input
                id="firstName"
                value={formData.first_name}
                onChange={(e) =>
                  setFormData({ ...formData, first_name: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last Name</Label>
              <Input
                id="lastName"
                value={formData.last_name}
                onChange={(e) =>
                  setFormData({ ...formData, last_name: e.target.value })
                }
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Work Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 size-4 text-muted-foreground" />
              <Input
                id="email"
                value={user?.email || ""}
                readOnly
                className="pl-10 bg-muted"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                value={formData.phone_number}
                onChange={(e) =>
                  setFormData({ ...formData, phone_number: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Staff ID</Label>
              <Input
                value={
                   user?.profile?.staff_id || "N/A"
                }
                readOnly
                className="bg-muted"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Academic Assignments */}
      <Card className="border shadow-none rounded-xl overflow-hidden">
        <CardHeader className="bg-muted/5 border-b py-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <GraduationCap className="size-4 text-primary" /> Institutional Assignments
                </CardTitle>
                <CardDescription className="text-[10px] uppercase font-bold tracking-wider">Verified Teaching Responsibilities</CardDescription>
            </div>
            <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 rounded-full h-5 text-[10px]">
                {assignments.length} ACTIVE
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {assignments.length === 0 ? (
            <div className="p-8 text-center space-y-3">
                <div className="size-12 rounded-full bg-muted/50 flex items-center justify-center mx-auto text-muted-foreground/30">
                    <Shield className="size-6" />
                </div>
                <div className="space-y-1">
                    <p className="text-sm font-semibold">No active assignments found.</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                        Your teaching permissions will appear here once an institutional administrator finalizes your department and course roles.
                    </p>
                </div>
            </div>
          ) : (
            <div className="divide-y">
                {assignments.map((ass) => (
                    <div key={ass.id} className="p-6 space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">University / Institution</Label>
                                <Input value={ass.institution_name || "N/A"} readOnly className="bg-muted h-9 rounded-full text-xs font-medium" />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Academic Year</Label>
                                <Input value={ass.academic_year || "N/A"} readOnly className="bg-muted h-9 rounded-full text-xs font-medium" />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Campus</Label>
                                <Input value={ass.campus_name || "Not applicable"} readOnly className="bg-muted h-9 rounded-full text-xs font-medium" />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">College / Faculty</Label>
                                <Input value={ass.college_name || "Not applicable"} readOnly className="bg-muted h-9 rounded-full text-xs font-medium" />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Department</Label>
                                <Input value={ass.department_name || "N/A"} readOnly className="bg-muted h-9 rounded-full text-xs font-medium" />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Assigned Role</Label>
                                <div className="flex items-center gap-3 h-9 px-4 rounded-full bg-primary/5 border border-primary/10 w-full">
                                    <Shield className="size-3.5 text-primary" />
                                    <span className="text-xs font-bold text-primary uppercase tracking-tight">
                                        {ass.role.replace(/_/g, " ")}
                                    </span>
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Program / Specialization</Label>
                                <Input value={ass.option_name || "General Departmental Assignment"} readOnly className="bg-muted h-9 rounded-full text-xs font-medium italic" />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
          )}
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
              <div className="text-sm text-muted-foreground">
                Receive reminders for grading tasks and system alerts
              </div>
            </div>
            <Switch defaultChecked />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Email Notifications</div>
              <div className="text-sm text-muted-foreground">
                New submissions, student appeals, and administrative updates
              </div>
            </div>
            <Switch defaultChecked />
          </div>

          <Separator />

          <Button variant="outline" className="w-full">
            Change Password
          </Button>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button size="lg" onClick={handleSave} disabled={loading}>
          {loading ? "Saving Changes..." : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}
