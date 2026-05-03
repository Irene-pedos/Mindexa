// app/admin/profile/page.tsx
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
import { User, Mail, Phone, Shield, Bell, Loader2, Lock } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { authApi } from "@/lib/api/auth";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminProfilePage() {
  const { user, checkAuth } = useAuth();
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    phone_number: "",
  });

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
      <div className="flex items-center gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Administrator Profile
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage your administrative account and system preferences
          </p>
        </div>
        <Badge variant="secondary" className="bg-red-100 text-red-700 hover:bg-red-100 h-6">
          <Lock className="mr-1 size-3" /> System Admin
        </Badge>
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
                  {loading ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
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
            <Label htmlFor="email">Admin Email</Label>
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
              <Label>Admin ID</Label>
              <Input
                value={
                   user?.profile?.staff_id || "ADMIN-001"
                }
                readOnly
                className="bg-muted"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Security & Preferences */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="size-5" /> Security & System Alerts
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-8">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">System Health Alerts</div>
              <div className="text-sm text-muted-foreground">
                Critical alerts regarding server performance and security
              </div>
            </div>
            <Switch defaultChecked />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Audit Log Notifications</div>
              <div className="text-sm text-muted-foreground">
                Notifications for sensitive administrative actions
              </div>
            </div>
            <Switch defaultChecked />
          </div>

          <Separator />

          <Button variant="outline" className="w-full">
            Update Security Credentials
          </Button>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button size="lg" onClick={handleSave} disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save Changes
        </Button>
      </div>
    </div>
  );
}
