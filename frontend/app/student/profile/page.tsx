// app/student/profile/page.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Accessibility,
  BookOpen,
  Building2,
  CalendarDays,
  Camera,
  Loader2,
  Mail,
  Shield,
} from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { ContextualExplainer } from "@/components/mindexa/common/contextual-explainer";
import { ChangePasswordDialog } from "@/components/mindexa/profile/change-password-dialog";
import { useAuth } from "@/hooks/use-auth";
import { authApi } from "@/lib/api/auth";
import { studentApi, type StudentAcademicContext } from "@/lib/api/student";
import { errorMessage } from "@/lib/error-message";
import { formatPeriodDate } from "@/lib/academic-period";

interface ProfileFields {
  first_name: string;
  last_name: string;
  phone_number: string;
  simple_mode_enabled: boolean;
  large_text_default: boolean;
  reduced_motion_default: boolean;
}

type AuthUser = NonNullable<ReturnType<typeof useAuth>["user"]>;

const fieldsOf = (user: AuthUser): ProfileFields => ({
  first_name: user.profile?.first_name || "",
  last_name: user.profile?.last_name || "",
  phone_number: user.profile?.phone_number || "",
  simple_mode_enabled: !!user.profile?.simple_mode_enabled,
  large_text_default: !!user.profile?.large_text_default,
  reduced_motion_default: !!user.profile?.reduced_motion_default,
});

const API_ORIGIN = process.env.NEXT_PUBLIC_API_URL?.replace("/api/v1", "") || "http://localhost:8000";

export default function ProfileSettingsPage() {
  const { user } = useAuth();

  if (!user) {
    return (
      <div className="mx-auto w-full space-y-5">
        <Skeleton className="h-28 w-full rounded-2xl" />
        <div className="grid gap-5 lg:grid-cols-12">
          <Skeleton className="h-80 rounded-xl lg:col-span-7" />
          <Skeleton className="h-80 rounded-xl lg:col-span-5" />
        </div>
      </div>
    );
  }
  // Remount when a different account signs in so the form never shows the previous person's values.
  return <ProfileView key={user.id} user={user} />;
}

function ProfileView({ user }: { user: AuthUser }) {
  const { checkAuth, logout } = useAuth();
  const saved = fieldsOf(user);
  const [form, setForm] = useState<ProfileFields>(saved);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [context, setContext] = useState<StudentAcademicContext | null | undefined>(undefined);
  const photoInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    studentApi
      .getAcademicContext()
      .then((data) => live && setContext(data))
      .catch(() => live && setContext(null));
    return () => {
      live = false;
    };
  }, []);

  const set = (patch: Partial<ProfileFields>) => setForm((f) => ({ ...f, ...patch }));
  const dirty = (Object.keys(saved) as (keyof ProfileFields)[]).some((key) => saved[key] !== form[key]);
  const nameMissing = !form.first_name.trim() || !form.last_name.trim();

  const handleSave = async () => {
    if (nameMissing) {
      toast.error("Your first and last name cannot be empty.");
      return;
    }
    setSaving(true);
    try {
      await authApi.updateProfile({
        ...form,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        phone_number: form.phone_number.trim(),
      });
      await checkAuth();
      toast.success("Profile saved");
    } catch (err) {
      toast.error(errorMessage(err, "Could not save your profile."));
    } finally {
      setSaving(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Choose an image file (JPG or PNG).");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("That photo is over 2 MB. Choose a smaller one.");
      return;
    }
    setUploading(true);
    try {
      await authApi.uploadAvatar(file);
      await checkAuth();
      toast.success("Profile photo updated");
    } catch (err) {
      toast.error(errorMessage(err, "Could not upload the photo."));
    } finally {
      setUploading(false);
    }
  };

  const fullName = [user.profile?.first_name, user.profile?.last_name].filter(Boolean).join(" ") || user.email;
  const studentId = user.profile?.student_id || user.profile?.staff_id;
  const extraTime = user.profile?.extra_time_percent;

  return (
    <div className="mx-auto w-full space-y-5 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
      {/* Identity */}
      <Card className="overflow-hidden rounded-2xl border-border/45 bg-card/40 shadow-sm">
        <div className="h-16 bg-gradient-to-r from-primary/15 via-primary/5 to-transparent" aria-hidden />
        <CardContent className="-mt-9 flex flex-col gap-4 px-5 pb-5 sm:flex-row sm:items-end">
          <div className="relative w-fit shrink-0">
            <Avatar className="size-20 border-4 border-background shadow-sm">
              <AvatarImage
                src={user.profile?.avatar_url ? `${API_ORIGIN}${user.profile.avatar_url}` : "/avatars/user avatar.png"}
                alt=""
              />
              <AvatarFallback className="bg-muted text-2xl uppercase text-muted-foreground">
                {user.profile?.first_name?.[0]}
                {user.profile?.last_name?.[0] || user.email[0]}
              </AvatarFallback>
            </Avatar>
            <button
              type="button"
              onClick={() => photoInput.current?.click()}
              disabled={uploading}
              aria-label="Change profile photo"
              className="absolute -bottom-1 -right-1 flex size-8 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm transition-colors hover:text-foreground disabled:opacity-60"
            >
              {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Camera className="size-3.5" />}
            </button>
            <input ref={photoInput} type="file" accept="image/*" className="sr-only" onChange={handleFileChange} tabIndex={-1} />
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
            <h1 className="truncate text-xl font-semibold tracking-tight text-foreground">{fullName}</h1>
            <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
              <Mail className="size-3.5 shrink-0" />
              {user.email}
            </p>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="secondary" className="text-[10px] font-semibold">Student</Badge>
              {studentId && <Badge variant="outline" className="font-mono text-[10px]">{studentId}</Badge>}
              {context?.institution_name && (
                <Badge variant="outline" className="gap-1 text-[10px]">
                  <Building2 className="size-3" />
                  {context.institution_name}
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
        <div className="space-y-5 lg:col-span-7">
          <Card className="rounded-xl border-border/45 bg-card/30 shadow-sm">
            <CardHeader className="px-5 pb-2 pt-4">
              <CardTitle className="text-base font-semibold">Personal information</CardTitle>
              <CardDescription className="text-xs">Your name appears on results and certificates.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 px-5 pb-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="firstName" className="text-xs font-semibold text-muted-foreground">First name</Label>
                  <Input
                    id="firstName"
                    value={form.first_name}
                    aria-invalid={!form.first_name.trim()}
                    className="h-9 rounded-lg text-sm"
                    onChange={(e) => set({ first_name: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lastName" className="text-xs font-semibold text-muted-foreground">Last name</Label>
                  <Input
                    id="lastName"
                    value={form.last_name}
                    aria-invalid={!form.last_name.trim()}
                    className="h-9 rounded-lg text-sm"
                    onChange={(e) => set({ last_name: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone" className="text-xs font-semibold text-muted-foreground">Phone number</Label>
                <Input
                  id="phone"
                  type="tel"
                  inputMode="tel"
                  value={form.phone_number}
                  placeholder="+250 7XX XXX XXX"
                  className="h-9 rounded-lg text-sm"
                  onChange={(e) => set({ phone_number: e.target.value })}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Your email and student ID are managed by your institution and cannot be changed here.
              </p>
            </CardContent>
          </Card>

          <Card className="rounded-xl border-border/45 bg-card/30 shadow-sm">
            <CardHeader className="px-5 pb-2 pt-4">
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <BookOpen className="size-4.5 text-primary" /> Where you study
              </CardTitle>
              <CardDescription className="text-xs">
                Taken from your class, so it always matches what your institution has on record.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              {context === undefined ? (
                <div className="space-y-2.5">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-9 w-full rounded-lg" />
                  ))}
                </div>
              ) : context === null ? (
                <p className="text-sm text-muted-foreground">Could not load your academic details. Please refresh the page.</p>
              ) : context.levels.length === 0 ? (
                <div className="rounded-xl border border-dashed bg-muted/20 p-4 text-center">
                  <p className="text-sm font-medium text-foreground">Your class is not set yet</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Without a class you will not see any course. Choose it to get started.
                  </p>
                  <Button asChild size="sm" className="mt-3">
                    <Link href="/onboarding/student">Choose my class</Link>
                  </Button>
                </div>
              ) : (
                <dl className="divide-y rounded-xl border bg-background/40">
                  {context.levels.map((level) => (
                    <div key={level.key} className="flex items-baseline justify-between gap-4 px-3.5 py-2.5">
                      <dt className="shrink-0 text-xs font-medium text-muted-foreground">{level.label}</dt>
                      <dd className="min-w-0 truncate text-right text-sm font-medium text-foreground" title={level.name}>
                        {level.name}
                      </dd>
                    </div>
                  ))}
                  {context.current_period && (
                    <div className="flex items-baseline justify-between gap-4 bg-primary/5 px-3.5 py-2.5">
                      <dt className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <CalendarDays className="size-3.5" /> Current period
                      </dt>
                      <dd className="min-w-0 text-right text-sm font-medium text-foreground">
                        {context.current_period.name}
                        <span className="block text-[11px] font-normal text-muted-foreground">
                          {formatPeriodDate(context.current_period.start_date)} – {formatPeriodDate(context.current_period.end_date)}
                        </span>
                      </dd>
                    </div>
                  )}
                </dl>
              )}
              {context && context.levels.length > 0 && (
                <p className="mt-3 text-[11px] text-muted-foreground">
                  To change your class, contact your institution&apos;s administrator.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5 lg:col-span-5">
          <Card className="rounded-xl border-border/45 bg-card/30 shadow-sm">
            <CardHeader className="px-5 pb-2 pt-4">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                  <Accessibility className="size-4.5 text-primary" /> Accessibility
                </CardTitle>
                <ContextualExplainer topic="accommodations" variant="pill" label="Policy info" />
              </div>
            </CardHeader>
            <CardContent className="space-y-3 px-5 pb-5">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/15 bg-primary/5 p-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground">Extra time</p>
                    <p className="text-[11px] text-muted-foreground">Set by your institution</p>
                  </div>
                  <Badge variant={extraTime ? "default" : "outline"} className="shrink-0 text-xs">
                    {extraTime ? `+${extraTime}%` : "None"}
                  </Badge>
                </div>
                {user.profile?.requires_screen_reader_mode && (
                  <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-foreground">Screen-reader mode</p>
                      <p className="text-[11px] text-muted-foreground">Set by your institution</p>
                    </div>
                    <Badge className="shrink-0 text-xs">On</Badge>
                  </div>
                )}
              </div>

              <Separator />

              {(
                [
                  ["simple_mode_enabled", "Simple mode", "A clearer layout with larger buttons"],
                  ["large_text_default", "Larger text", "Bigger type when reading"],
                  ["reduced_motion_default", "Reduce motion", "Fewer animations and transitions"],
                ] as const
              ).map(([key, title, hint]) => (
                <div key={key} className="flex items-center justify-between gap-4">
                  <Label htmlFor={`pref-${key}`} className="min-w-0 cursor-pointer">
                    <span className="block text-xs font-semibold text-foreground">{title}</span>
                    <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">{hint}</span>
                  </Label>
                  <Switch id={`pref-${key}`} checked={form[key]} onCheckedChange={(value) => set({ [key]: value })} />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="rounded-xl border-border/45 bg-card/30 shadow-sm">
            <CardHeader className="px-5 pb-2 pt-4">
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <Shield className="size-4.5 text-primary" /> Security
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 px-5 pb-5">
              <p className="text-xs text-muted-foreground">
                Use a long password you do not use anywhere else. Changing it signs you out of every device.
              </p>
              <Button variant="outline" className="h-9 w-full rounded-lg text-xs font-semibold" onClick={() => setPasswordOpen(true)}>
                Change password
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Save bar: only asks for attention when something changed */}
      <div
        className={`sticky bottom-3 z-10 flex items-center justify-between gap-3 rounded-xl border bg-background/95 px-4 py-2.5 shadow-lg backdrop-blur transition-all duration-300 ${
          dirty ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"
        }`}
        aria-hidden={!dirty}
      >
        <p className="text-xs font-medium text-muted-foreground">You have unsaved changes.</p>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" disabled={saving} onClick={() => setForm(saved)} tabIndex={dirty ? 0 : -1}>
            Discard
          </Button>
          <Button size="sm" disabled={saving || nameMissing} onClick={() => void handleSave()} tabIndex={dirty ? 0 : -1}>
            {saving && <Loader2 className="mr-2 size-3.5 animate-spin" />}
            Save changes
          </Button>
        </div>
      </div>

      <ChangePasswordDialog
        open={passwordOpen}
        onClose={() => setPasswordOpen(false)}
        onChanged={() => {
          setPasswordOpen(false);
          void logout();
        }}
      />
    </div>
  );
}
