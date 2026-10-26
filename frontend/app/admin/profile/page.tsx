// app/admin/profile/page.tsx
"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import {
  User,
  Mail,
  Phone,
  Shield,
  Bell,
  Lock,
  Camera,
  CheckCircle2,
  KeyRound,
  ShieldAlert,
  Loader2,
  Save,
  Building2,
  Calendar,
  Sparkles,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { authApi } from "@/lib/api/auth";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export default function AdminProfilePage() {
  const { user, checkAuth } = useAuth();
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    phone_number: "",
  });

  // Notification Preferences (UI state)
  const [systemHealthAlerts, setSystemHealthAlerts] = useState(true);
  const [auditLogAlerts, setAuditLogAlerts] = useState(true);
  const [integrityAlerts, setIntegrityAlerts] = useState(true);

  useEffect(() => {
    if (user) {
      setFormData({
        first_name: user.profile?.first_name || "",
        last_name: user.profile?.last_name || "",
        phone_number: user.profile?.phone_number || "",
      });
      setInitialLoading(false);
    }
  }, [user]);

  const handleSave = async () => {
    setLoading(true);
    try {
      const updatedUser = await authApi.updateProfile(formData);
      localStorage.setItem("user", JSON.stringify(updatedUser));
      checkAuth();
      toast.success("Administrator profile updated successfully");
    } catch {
      toast.error("Failed to update profile details");
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error("Avatar image size must be under 2MB");
      return;
    }

    setLoading(true);
    try {
      const updatedUser = await authApi.uploadAvatar(file);
      localStorage.setItem("user", JSON.stringify(updatedUser));
      checkAuth();
      toast.success("Profile avatar updated successfully");
    } catch {
      toast.error("Failed to upload profile picture");
    } finally {
      setLoading(false);
    }
  };

  if (initialLoading) {
    return (
      <div className="w-full min-w-0 space-y-6">
        <Skeleton className="h-10 w-72 rounded-xl" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <Skeleton className="lg:col-span-4 h-96 w-full rounded-2xl" />
          <Skeleton className="lg:col-span-8 h-96 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  const avatarUrl = user?.profile?.avatar_url
    ? `${process.env.NEXT_PUBLIC_API_URL?.replace("/api/v1", "") || "http://localhost:8000"}${user.profile.avatar_url}`
    : "/avatars/user avatar.png";

  const displayName =
    user?.profile?.first_name || user?.profile?.last_name
      ? `${user?.profile?.first_name || ""} ${user?.profile?.last_name || ""}`.trim()
      : "System Administrator";

  const staffId = user?.profile?.staff_id || "ADMIN-001";
  const userRole = (user?.role || "admin").toUpperCase();
  const duties: string[] = user?.duties || ["SYSTEM_GOVERNANCE"];

  return (
    <div className="w-full min-w-0 space-y-6 transition-all duration-300 ease-in-out">
      {/* Header Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-5 border-b border-border/40">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Shield className="size-4.5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold tracking-tight text-foreground">
                  Administrator Profile
                </h1>
                <Badge variant="outline" className="text-[10px] font-mono px-2 py-0 h-5 border-primary/30 text-primary bg-primary/5">
                  {userRole}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Institutional administrative identity, assigned duties, and security governance.
              </p>
            </div>
          </div>
        </div>

        <Button
          size="sm"
          onClick={handleSave}
          disabled={loading}
          className="h-8.5 rounded-xl gap-2 px-4 text-xs font-semibold shadow-xs cursor-pointer self-start sm:self-auto"
        >
          {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
          Save Changes
        </Button>
      </div>

      {/* 12-Column Responsive Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Identity & Duty Card (4 Cols) */}
        <div className="lg:col-span-4 space-y-6">
          <div className="p-6 rounded-2xl bg-card border border-border shadow-2xs space-y-5 flex flex-col items-center text-center">
            {/* Interactive Avatar with Hover Upload */}
            <div className="relative group">
              <Avatar className="size-24 rounded-2xl border-2 border-border shadow-xs overflow-hidden">
                <AvatarImage src={avatarUrl} alt={displayName} className="object-cover" />
                <AvatarFallback className="text-2xl font-bold bg-muted text-foreground">
                  {user?.profile?.first_name?.[0] || user?.email?.[0] || "A"}
                </AvatarFallback>
              </Avatar>

              <label className="absolute inset-0 rounded-2xl bg-black/60 text-white flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                <Camera className="size-5 mb-1" />
                <span className="text-[10px] font-medium">Change</span>
                <input
                  type="file"
                  className="sr-only"
                  accept="image/*"
                  onChange={handleFileChange}
                  disabled={loading}
                />
              </label>
            </div>

            <div className="space-y-1">
              <h2 className="text-base font-semibold text-foreground tracking-tight">{displayName}</h2>
              <p className="text-xs text-muted-foreground">{user?.email}</p>
              <div className="pt-1">
                <span className="font-mono text-[10px] font-semibold px-2 py-0.5 rounded-md bg-muted text-muted-foreground border border-border/80">
                  {staffId}
                </span>
              </div>
            </div>

            <div className="w-full pt-4 border-t border-border/60 space-y-3 text-left">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Account Status</span>
                <span className="inline-flex items-center gap-1.5 font-medium text-emerald-600 dark:text-emerald-400">
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  Verified Active
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Access Level</span>
                <span className="font-medium text-foreground">High Privilege</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Security Clearance</span>
                <span className="font-medium text-foreground">Tier 1 Certified</span>
              </div>
            </div>

            {/* Assigned Duties Badges */}
            <div className="w-full pt-4 border-t border-border/60 text-left space-y-2">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Assigned Staff Duties
              </span>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {duties.map((duty, idx) => (
                  <Badge
                    key={idx}
                    variant="outline"
                    className="text-[10px] font-medium rounded-lg border-border bg-muted/30 px-2 py-0.5 gap-1"
                  >
                    <Shield className="size-2.5 text-primary" />
                    {duty.replace(/_/g, " ")}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Credentials, Security & Alerts (8 Cols) */}
        <div className="lg:col-span-8 space-y-6">
          {/* Personal Information */}
          <div className="p-5 sm:p-6 rounded-2xl bg-card border border-border shadow-2xs space-y-4">
            <div>
              <h3 className="text-sm font-semibold tracking-tight text-foreground">
                Personal & Contact Information
              </h3>
              <p className="text-xs text-muted-foreground">
                Official institutional identity records used in audit logs and grade release signatures.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <div className="space-y-1.5">
                <Label htmlFor="firstName" className="text-xs font-semibold">
                  First Name
                </Label>
                <Input
                  id="firstName"
                  className="h-9 text-xs"
                  value={formData.first_name}
                  onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="lastName" className="text-xs font-semibold">
                  Last Name
                </Label>
                <Input
                  id="lastName"
                  className="h-9 text-xs"
                  value={formData.last_name}
                  onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs font-semibold">
                  Admin Work Email
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                  <Input
                    id="email"
                    value={user?.email || ""}
                    readOnly
                    className="pl-9 h-9 text-xs bg-muted/40 font-mono text-muted-foreground cursor-not-allowed"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="phone" className="text-xs font-semibold">
                  Telephone Contact
                </Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                  <Input
                    id="phone"
                    placeholder="+250 788 000 000"
                    className="pl-9 h-9 text-xs"
                    value={formData.phone_number}
                    onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Security & Operational Alerts */}
          <div className="p-5 sm:p-6 rounded-2xl bg-card border border-border shadow-2xs space-y-4">
            <div>
              <h3 className="text-sm font-semibold tracking-tight text-foreground">
                Operational Alerts & Notifications
              </h3>
              <p className="text-xs text-muted-foreground">
                Configure real-time system alerts delivered to your administrative console.
              </p>
            </div>

            <div className="space-y-3 pt-1">
              <div className="flex items-center justify-between gap-4 p-3.5 rounded-xl bg-muted/20 border border-border/60">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-foreground">System Health & Infrastructure Alerts</span>
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 border-border">
                      Critical
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Notifications regarding service uptime, database replica status, and API worker health.
                  </p>
                </div>
                <Switch checked={systemHealthAlerts} onCheckedChange={setSystemHealthAlerts} />
              </div>

              <div className="flex items-center justify-between gap-4 p-3.5 rounded-xl bg-muted/20 border border-border/60">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-foreground">Audit Log & Clearance Events</span>
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 border-border">
                      Security
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Immediate notification whenever an exam seal is broken or policy threshold overridden.
                  </p>
                </div>
                <Switch checked={auditLogAlerts} onCheckedChange={setAuditLogAlerts} />
              </div>

              <div className="flex items-center justify-between gap-4 p-3.5 rounded-xl bg-muted/20 border border-border/60">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-foreground">Integrity Anomaly Flags</span>
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 border-border">
                      Proctoring
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Alerts when AI proctoring engines detect elevated anomalous candidate behavioral patterns.
                  </p>
                </div>
                <Switch checked={integrityAlerts} onCheckedChange={setIntegrityAlerts} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
