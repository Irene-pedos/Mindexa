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
import { User, Mail, Phone, Shield, Bell, Loader2, GraduationCap, Briefcase } from "lucide-react";
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

  // Notification preferences with persistent state
  const [browserNotifications, setBrowserNotifications] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("pref_browser_notifs") !== "false";
    }
    return true;
  });
  const [emailNotifications, setEmailNotifications] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("pref_email_notifs") !== "false";
    }
    return true;
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
      // Persist notification prefs
      localStorage.setItem("pref_browser_notifs", String(browserNotifications));
      localStorage.setItem("pref_email_notifs", String(emailNotifications));
      checkAuth(); // Refresh global auth state
      toast.success("Profile updated successfully");
    } catch (err) {
      toast.error("Failed to update profile");
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = () => {
    toast.info("To change your password, please contact your institution's IT support or use the forgot-password flow from the login page.");
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
      <div className="w-full space-y-3.5 p-1 md:p-2 animate-in fade-in duration-300">
        <Skeleton className="h-10 w-64 rounded-lg" />
        <Card className="bg-card/30 border border-zinc-200 rounded-xl shadow-sm overflow-hidden">
          <CardContent className="p-6 space-y-4">
            <Skeleton className="h-24 w-24 rounded-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full space-y-3.5 p-1 md:p-2 animate-in fade-in duration-300">
      <div className="border-b border-zinc-200 pb-2">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
          Profile Settings
        </h1>
        <p className="text-sm text-muted-foreground mt-1 font-medium">
          Manage your personal information, staff credentials, and active teaching assignments.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Column - Forms */}
        <div className="lg:col-span-8 space-y-4">
          {/* Profile Information */}
          <Card className="bg-card/30 border border-zinc-200 rounded-xl shadow-sm overflow-hidden">
            <CardHeader className="pb-2.5 pt-4.5 px-5">
              <CardTitle className="text-base font-semibold text-foreground">Personal Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 px-5 pb-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName" className="text-xs font-semibold text-muted-foreground">First Name</Label>
                  <Input
                    id="firstName"
                    value={formData.first_name}
                    className="h-9 text-xs rounded-lg border-zinc-200 bg-white"
                    onChange={(e) =>
                      setFormData({ ...formData, first_name: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName" className="text-xs font-semibold text-muted-foreground">Last Name</Label>
                  <Input
                    id="lastName"
                    value={formData.last_name}
                    className="h-9 text-xs rounded-lg border-zinc-200 bg-white"
                    onChange={(e) =>
                      setFormData({ ...formData, last_name: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="text-xs font-semibold text-muted-foreground">Work Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                  <Input
                    id="email"
                    value={user?.email || ""}
                    readOnly
                    className="pl-10 h-9 text-xs rounded-lg bg-zinc-50 text-muted-foreground border-zinc-200"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="phone" className="text-xs font-semibold text-muted-foreground">Phone Number</Label>
                  <Input
                    id="phone"
                    value={formData.phone_number}
                    className="h-9 text-xs rounded-lg border-zinc-200 bg-white"
                    onChange={(e) =>
                      setFormData({ ...formData, phone_number: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-muted-foreground">Staff ID</Label>
                  <Input
                    value={user?.profile?.staff_id || "N/A"}
                    readOnly
                    className="h-9 text-xs rounded-lg bg-zinc-50 text-muted-foreground border-zinc-200"
                  />
                </div>
              </div>

              <Separator className="bg-zinc-150 my-4" />

              {/* Verified Teaching Assignments */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider flex items-center gap-2 text-primary">
                  <GraduationCap className="size-4.5" /> Institutional Assignments
                </h3>
                
                {assignments.length === 0 ? (
                  <div className="p-8 text-center space-y-3 bg-zinc-50/50 border border-dashed rounded-xl">
                    <div className="size-12 rounded-full bg-zinc-100 flex items-center justify-center mx-auto text-zinc-400">
                      <Shield className="size-5" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-zinc-700">No active assignments found.</p>
                      <p className="text-[11px] text-muted-foreground leading-normal max-w-sm mx-auto font-medium">
                        Your teaching permissions will appear here once an administrator finalizes your department and course roles.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {assignments.map((ass) => (
                      <div key={ass.id} className="p-4 rounded-xl border border-zinc-200 bg-zinc-50/30 space-y-3 text-left">
                        <div className="flex items-center justify-between border-b pb-2">
                          <div className="font-bold text-zinc-800 text-xs flex items-center gap-1.5">
                            <Briefcase className="size-3.5 text-zinc-500" />
                            {ass.course_name || "Course Setup"}
                          </div>
                          <Badge variant="outline" className="text-[9px] font-bold h-5 uppercase px-2 border-primary/20 bg-primary/5 text-primary">
                            {ass.role?.replace(/_/g, " ") || "Lecturer"}
                          </Badge>
                        </div>
                        
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-[11px]">
                          <div>
                            <span className="text-muted-foreground font-semibold block text-[10px] uppercase">Institution</span>
                            <span className="font-bold text-zinc-800">{ass.institution_name || "N/A"}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground font-semibold block text-[10px] uppercase">Department</span>
                            <span className="font-bold text-zinc-800">{ass.department_name || "N/A"}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground font-semibold block text-[10px] uppercase">Section / Cohort</span>
                            <span className="font-bold text-zinc-800">{ass.class_section_name || "General"}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Security & Preferences */}
          <Card className="bg-card/30 border border-zinc-200 rounded-xl shadow-sm overflow-hidden">
            <CardHeader className="pb-2.5 pt-4.5 px-5">
              <CardTitle className="text-base font-semibold text-zinc-800 flex items-center gap-2">
                <Shield className="size-4.5 text-primary" /> Security & Preferences
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 px-5 pb-5">
              <div className="flex items-center justify-between gap-4 py-1">
                <div className="space-y-0.5">
                  <Label className="text-xs font-bold text-zinc-800">Browser Notifications</Label>
                  <p className="text-[11px] font-medium text-muted-foreground leading-normal">
                    Receive proctoring alerts, batch grading warnings, and general system updates in-app.
                  </p>
                </div>
                <Switch
                  checked={browserNotifications}
                  onCheckedChange={setBrowserNotifications}
                />
              </div>

              <Separator className="bg-zinc-150" />

              <div className="flex items-center justify-between gap-4 py-1">
                <div className="space-y-0.5">
                  <Label className="text-xs font-bold text-zinc-800">Email Notifications</Label>
                  <p className="text-[11px] font-medium text-muted-foreground leading-normal">
                    Get regular digests on completed student submissions, grading queues, and appeal requests.
                  </p>
                </div>
                <Switch
                  checked={emailNotifications}
                  onCheckedChange={setEmailNotifications}
                />
              </div>

              <Separator className="bg-zinc-150" />

              <div className="pt-2 flex justify-start">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleChangePassword}
                  className="h-8 px-4 text-xs font-bold uppercase tracking-wider rounded-lg border-zinc-200 bg-white"
                >
                  Change Password
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Save Changes button */}
          <div className="flex justify-end pt-2">
            <Button
              onClick={handleSave}
              disabled={loading}
              className="h-9 px-6 rounded-lg text-xs font-bold uppercase tracking-wider text-white"
            >
              {loading && <Loader2 className="mr-2 size-3.5 animate-spin" />}
              Save Configuration
            </Button>
          </div>
        </div>

        {/* Right Column - Avatar & Info card */}
        <div className="lg:col-span-4 space-y-4">
          <Card className="bg-card/30 border border-zinc-200 rounded-xl shadow-sm overflow-hidden">
            <CardContent className="p-5 flex flex-col items-center text-center space-y-4">
              <div className="relative group">
                <Avatar className="h-24 w-24 border-2 border-primary/20 shadow-md">
                  <AvatarImage
                    src={
                      user?.profile?.avatar_url
                        ? `${process.env.NEXT_PUBLIC_API_URL?.replace("/api/v1", "") || "http://localhost:8000"}${user.profile.avatar_url}`
                        : undefined
                    }
                  />
                  <AvatarFallback className="text-3xl font-bold bg-muted text-muted-foreground uppercase">
                    {user?.profile?.first_name?.[0]}
                    {user?.profile?.last_name?.[0] || user?.email?.[0]}
                  </AvatarFallback>
                </Avatar>
                <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity duration-200 cursor-pointer">
                  <span className="text-[10px] text-white font-bold uppercase tracking-wider">Upload</span>
                  <input
                    type="file"
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    accept="image/*"
                    onChange={handleFileChange}
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <h2 className="text-base font-bold text-zinc-900 leading-tight">
                  {user?.profile?.first_name} {user?.profile?.last_name}
                </h2>
                <Badge variant="outline" className="text-[9px] uppercase tracking-wider font-bold h-5 px-2 bg-primary/5 text-primary border-primary/20">
                  Lecturer Account
                </Badge>
              </div>

              <Separator className="bg-zinc-150" />

              <div className="w-full text-left space-y-2.5 text-xs text-zinc-600 font-medium">
                <div>
                  <span className="text-muted-foreground text-[10px] uppercase font-bold tracking-wider block">Authorized Role</span>
                  <span className="text-zinc-800 font-semibold">{user?.role?.toUpperCase() || "LECTURER"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground text-[10px] uppercase font-bold tracking-wider block">Registrar Status</span>
                  <span className="text-emerald-600 font-semibold uppercase tracking-wide flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-emerald-500 inline-block animate-pulse" /> Active & Verified
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
