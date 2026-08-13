// app/(student)/profile/page.tsx
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
import { User, Mail, Phone, Shield, Bell, BookOpen, Accessibility } from "lucide-react";
import { ContextualExplainer } from "@/components/mindexa/common/contextual-explainer";
import { useAuth } from "@/hooks/use-auth";
import { authApi } from "@/lib/api/auth";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";

export default function ProfileSettingsPage() {
  const { user, checkAuth } = useAuth();
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    phone_number: "",
    simple_mode_enabled: false,
    large_text_default: false,
    reduced_motion_default: false,
  });

  // BUG-16 fix: notification preferences with persistent state
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
    if (user) {
      setFormData({
        first_name: user.profile?.first_name || "",
        last_name: user.profile?.last_name || "",
        phone_number: user.profile?.phone_number || "",
        simple_mode_enabled: !!user.profile?.simple_mode_enabled,
        large_text_default: !!user.profile?.large_text_default,
        reduced_motion_default: !!user.profile?.reduced_motion_default,
      });
      setInitialLoading(false);
    }
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

  // BUG-31 fix: change password handler
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
      <div className="space-y-6 w-full mx-auto animate-in fade-in duration-300">
        <Skeleton className="h-10 w-64 rounded-lg" />
        <Card className="bg-card/30 border border-border/45 rounded-xl shadow-sm overflow-hidden">
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
    <div className="space-y-6 w-full mx-auto animate-in fade-in duration-300">
      <div className="border-b border-border/25 pb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Profile Settings
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          Manage your personal information, contact methods, and preferences
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column - Forms */}
        <div className="lg:col-span-8 space-y-6">
          {/* Profile Information */}
          <Card className="bg-card/30 border border-border/45 rounded-xl shadow-sm overflow-hidden">
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
                    className="h-9 text-xs rounded-lg"
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
                    className="h-9 text-xs rounded-lg"
                    onChange={(e) =>
                      setFormData({ ...formData, last_name: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="text-xs font-semibold text-muted-foreground">University Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                  <Input
                    id="email"
                    value={user?.email || ""}
                    readOnly
                    className="pl-10 h-9 text-xs rounded-lg bg-muted/50 text-muted-foreground border-border/40"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="phone" className="text-xs font-semibold text-muted-foreground">Phone Number</Label>
                  <Input
                    id="phone"
                    value={formData.phone_number}
                    className="h-9 text-xs rounded-lg"
                    onChange={(e) =>
                      setFormData({ ...formData, phone_number: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-muted-foreground">Student ID</Label>
                  <Input
                    value={
                      user?.profile?.student_id || user?.profile?.staff_id || "N/A"
                    }
                    readOnly
                    className="h-9 text-xs rounded-lg bg-muted/50 text-muted-foreground border-border/40"
                  />
                </div>
              </div>

              <Separator className="bg-border/40 my-4" />

              <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider flex items-center gap-2 text-primary">
                  <BookOpen className="size-4" /> Academic Information
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-muted-foreground">College / Institution</Label>
                    <Input
                      value={user?.profile?.college || "N/A"}
                      readOnly
                      className="h-9 text-xs rounded-lg bg-muted/50 text-muted-foreground border-border/40"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-muted-foreground">Department</Label>
                    <Input
                      value={user?.profile?.department || "N/A"}
                      readOnly
                      className="h-9 text-xs rounded-lg bg-muted/50 text-muted-foreground border-border/40"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-muted-foreground">Option / Specialization</Label>
                    <Input
                      value={user?.profile?.option || "N/A"}
                      readOnly
                      className="h-9 text-xs rounded-lg bg-muted/50 text-muted-foreground border-border/40"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold text-muted-foreground">Academic Level</Label>
                      <Input
                        value={user?.profile?.level ? `Level ${user.profile.level}` : "N/A"}
                        readOnly
                        className="h-9 text-xs rounded-lg bg-muted/50 text-muted-foreground border-border/40 text-center font-bold"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold text-muted-foreground">Academic Year / Period</Label>
                      <Input
                        value={user?.profile?.year || "N/A"}
                        readOnly
                        className="h-9 text-xs rounded-lg bg-muted/50 text-muted-foreground border-border/40 text-center"
                      />
                    </div>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground/75 italic">
                  * To request a change to your academic assignment, please contact your faculty administrator.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Avatar & Preferences */}
        <div className="lg:col-span-4 space-y-6">
          {/* Avatar upload card */}
          <Card className="bg-card/30 border border-border/45 rounded-xl shadow-sm overflow-hidden">
            <CardContent className="p-5 flex flex-col items-center text-center space-y-4">
              <Avatar className="h-24 w-24 border border-border/60 shadow-sm">
                <AvatarImage
                  src={
                    user?.profile?.avatar_url
                      ? `${process.env.NEXT_PUBLIC_API_URL?.replace("/api/v1", "") || "http://localhost:8000"}${user.profile.avatar_url}`
                      : "/avatars/user avatar.png"
                  }
                />
                <AvatarFallback className="text-3xl uppercase bg-muted text-muted-foreground">
                  {user?.profile?.first_name?.[0]}
                  {user?.profile?.last_name?.[0] || user?.email?.[0]}
                </AvatarFallback>
              </Avatar>
              <div className="space-y-2 w-full">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="relative overflow-hidden h-8 text-xs font-semibold px-4 w-full rounded-lg border-border/60"
                  disabled={loading}
                >
                  {loading ? <div className="size-3 rounded-full bg-primary/20 animate-pulse mr-2" /> : null}
                  Change Photo
                  <input
                    type="file"
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    accept="image/*"
                    onChange={handleFileChange}
                    disabled={loading}
                  />
                </Button>
                <p className="text-[9px] text-muted-foreground uppercase font-bold tracking-wider">
                  JPG or PNG. Max 2MB.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Accessibility & Accommodations */}
          <Card className="bg-card/30 border border-border/45 rounded-xl shadow-sm overflow-hidden">
            <CardHeader className="pb-2.5 pt-4.5 px-5">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                  <Accessibility className="size-5 text-primary" /> Accessibility & Accommodations
                </CardTitle>
                <ContextualExplainer topic="accommodations" variant="pill" label="Policy Info" />
              </div>
            </CardHeader>
            <CardContent className="space-y-4 px-5 pb-5">
              <div className="space-y-3">
                <div className="p-3 rounded-lg bg-primary/5 border border-primary/15 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-foreground">Extra Time Multiplier</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      Server-enforced accommodation
                    </div>
                  </div>
                  <Badge variant={user?.profile?.extra_time_percent ? "default" : "outline"} className="text-xs font-bold">
                    {user?.profile?.extra_time_percent ? `+${user.profile.extra_time_percent}% Extra Time` : "Standard (0%)"}
                  </Badge>
                </div>

                <div className="p-3 rounded-lg bg-muted/40 border border-border/50 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-foreground">Screen-Reader Mode</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      Institutional accommodation preset
                    </div>
                  </div>
                  <Badge variant={user?.profile?.requires_screen_reader_mode ? "default" : "outline"} className="text-xs font-bold">
                    {user?.profile?.requires_screen_reader_mode ? "Active / Required" : "Standard UI"}
                  </Badge>
                </div>
              </div>

              <Separator className="bg-border/40" />

              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-xs font-bold text-foreground">Simple Mode (Tier 1)</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    High-clarity interface with enlarged touch targets
                  </div>
                </div>
                <Switch
                  checked={formData.simple_mode_enabled}
                  onCheckedChange={(val) => setFormData((prev) => ({ ...prev, simple_mode_enabled: val }))}
                  id="pref-simple-mode"
                />
              </div>

              <Separator className="bg-border/40" />

              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-xs font-bold text-foreground">Large Text Default</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    Enlarged default reading typography
                  </div>
                </div>
                <Switch
                  checked={formData.large_text_default}
                  onCheckedChange={(val) => setFormData((prev) => ({ ...prev, large_text_default: val }))}
                  id="pref-large-text"
                />
              </div>

              <Separator className="bg-border/40" />

              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-xs font-bold text-foreground">Reduced Motion</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    Minimize UI transitions and animations
                  </div>
                </div>
                <Switch
                  checked={formData.reduced_motion_default}
                  onCheckedChange={(val) => setFormData((prev) => ({ ...prev, reduced_motion_default: val }))}
                  id="pref-reduced-motion"
                />
              </div>
            </CardContent>
          </Card>

          {/* Security & Preferences */}
          <Card className="bg-card/30 border border-border/45 rounded-xl shadow-sm overflow-hidden">
            <CardHeader className="pb-2.5 pt-4.5 px-5">
              <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                <Shield className="size-5 text-primary" /> Security & Notifications
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5 px-5 pb-5">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-xs font-bold text-foreground">Browser Reminders</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    Reminders for upcoming tests
                  </div>
                </div>
                <Switch
                  checked={browserNotifications}
                  onCheckedChange={setBrowserNotifications}
                  id="pref-browser-notifs"
                />
              </div>

              <Separator className="bg-border/40" />

              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-xs font-bold text-foreground">Email Notifications</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    Result releases & deadline changes
                  </div>
                </div>
                <Switch
                  checked={emailNotifications}
                  onCheckedChange={setEmailNotifications}
                  id="pref-email-notifs"
                />
              </div>

              <Separator className="bg-border/40" />

              <Button variant="outline" className="w-full h-8 text-xs font-semibold rounded-lg border-border/60" onClick={handleChangePassword}>
                Change Password
              </Button>
            </CardContent>
          </Card>

          <div className="flex justify-end pt-2">
            <Button size="lg" onClick={handleSave} disabled={loading} className="w-full h-9 text-xs font-semibold rounded-lg shadow-none">
              {loading ? "Saving Changes..." : "Save Changes"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
