"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ModeToggle } from "@/components/ui/mode-toggle";
import { 
  Camera,
  Loader2,
  Phone,
  LogOut,
  GraduationCap,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Check,
  User
} from "lucide-react";
import { authApi } from "@/lib/api/auth";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

const STEPS = [
  { id: 1, title: "Profile & Contact", subtitle: "Photo & Phone" },
  { id: 2, title: "Academic Bio", subtitle: "Background & Expertise" },
];

export default function LecturerOnboarding() {
  const router = useRouter();
  const { user, checkAuth } = useAuth();
  const [activeStep, setActiveStep] = useState<1 | 2>(1);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  
  const [bio, setBio] = useState(user?.profile?.bio || "");
  const [phone, setPhone] = useState(user?.profile?.phone_number || "");
  const [profilePic, setProfilePic] = useState<string | null>(null);

  const displayName = [user?.profile?.first_name, user?.profile?.last_name]
    .filter(Boolean)
    .join(" ") || user?.profile?.display_name || user?.email?.split("@")[0] || "Faculty Member";

  const initials = [user?.profile?.first_name?.[0], user?.profile?.last_name?.[0]]
    .filter(Boolean)
    .join("")
    .toUpperCase() || user?.email?.[0]?.toUpperCase() || "L";

  const currentAvatarUrl = profilePic || (user?.profile?.avatar_url
    ? `${process.env.NEXT_PUBLIC_API_URL?.replace("/api/v1", "") || "http://localhost:8000"}${user.profile.avatar_url}`
    : undefined);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file (PNG, JPG, WebP)");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error("Avatar image must be under 2MB");
      return;
    }

    const preview = URL.createObjectURL(file);
    setProfilePic(preview);
    setUploadingAvatar(true);

    try {
      await authApi.uploadAvatar(file);
      await checkAuth();
      toast.success("Profile photo updated");
    } catch (err: any) {
      toast.error(err.message || "Avatar upload failed");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleFinish = async () => {
    setSubmitting(true);
    try {
      await authApi.completeLecturerOnboarding({
        bio: bio.trim() || undefined,
        phone_number: phone.trim() || undefined,
      });
      
      toast.success("Profile completed successfully!");
      await checkAuth();
      router.push("/lecturer/dashboard");
    } catch (err: any) {
      toast.error(err.message || "Failed to complete onboarding");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await authApi.logout();
    } catch {
      // Continue to login
    }
    router.push("/login");
  };

  const stepsLeft = 2 - activeStep;

  return (
    <div className="min-h-screen w-full bg-background text-foreground flex items-center justify-center p-3 sm:p-4 md:p-6 relative">
      {/* Discreet floating top controls */}
      <div className="fixed top-3 right-3 sm:top-5 sm:right-5 flex items-center gap-1.5 z-20">
        <ModeToggle variant="ghost" size="sm" className="rounded-lg h-8 w-8 text-muted-foreground hover:text-foreground" />
        <Button
          variant="ghost"
          size="sm"
          onClick={handleSignOut}
          className="h-8 px-2 rounded-lg text-xs text-muted-foreground hover:text-foreground gap-1"
          title="Sign out"
        >
          <LogOut className="size-3.5" />
          <span className="hidden sm:inline">Sign Out</span>
        </Button>
      </div>

      {/* Main Compact Card */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="w-full max-w-md relative z-10"
      >
        <div className="bg-card border border-border/80 rounded-2xl p-5 sm:p-6 space-y-5 shadow-xs">
          {/* Card Header & Title */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] font-semibold">
              <span className="text-primary uppercase tracking-wider">
                Step {activeStep} of 2
              </span>
              <span className="text-muted-foreground">
                {stepsLeft === 0 ? "Final step" : `${stepsLeft} step left`}
              </span>
            </div>

            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              Lecturer Profile
            </h1>
            <p className="text-xs text-muted-foreground">
              {activeStep === 1 
                ? "Set up your photo and contact phone." 
                : "Add your academic bio and specialization summary."}
            </p>

            {/* Stepper Progress Bar */}
            <div className="pt-2">
              <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                <motion.div 
                  className="h-full bg-primary rounded-full"
                  initial={false}
                  animate={{ width: activeStep === 1 ? "50%" : "100%" }}
                  transition={{ duration: 0.3, ease: "easeInOut" }}
                />
              </div>

              {/* Stepper Indicator Pills */}
              <div className="grid grid-cols-2 gap-2 mt-2.5">
                {STEPS.map((s) => {
                  const isActive = activeStep === s.id;
                  const isDone = activeStep > s.id;
                  return (
                    <div 
                      key={s.id}
                      className={`flex items-center gap-2 p-1.5 rounded-lg border text-xs transition-colors ${
                        isActive 
                          ? "border-primary/40 bg-primary/5 text-foreground font-medium" 
                          : isDone 
                          ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400" 
                          : "border-border/40 text-muted-foreground"
                      }`}
                    >
                      <div className={`size-4 rounded-full flex items-center justify-center text-[10px] shrink-0 font-bold ${
                        isDone 
                          ? "bg-emerald-600 text-white" 
                          : isActive 
                          ? "bg-primary text-primary-foreground" 
                          : "bg-muted text-muted-foreground"
                      }`}>
                        {isDone ? <Check className="size-2.5" /> : s.id}
                      </div>
                      <span className="truncate text-[11px]">{s.title}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Step Contents with smooth slide */}
          <AnimatePresence mode="wait">
            {activeStep === 1 ? (
              <motion.div
                key="step-1"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                {/* Compact Avatar & Identity */}
                <div className="flex items-center gap-3.5 p-3 rounded-xl bg-muted/30 border border-border/50">
                  <div className="relative group shrink-0">
                    <Avatar className="size-16 sm:size-18 rounded-full border border-border shadow-xs overflow-hidden bg-muted">
                      <AvatarImage 
                        src={currentAvatarUrl} 
                        alt={displayName}
                        className="object-cover" 
                      />
                      <AvatarFallback className="bg-primary/10 text-primary text-lg font-bold uppercase">
                        {initials}
                      </AvatarFallback>
                    </Avatar>

                    <label
                      htmlFor="lecturer-avatar"
                      className="absolute -bottom-1 -right-1 size-7 bg-primary text-primary-foreground hover:bg-primary/90 rounded-full flex items-center justify-center cursor-pointer transition-transform border-2 border-background shadow-xs hover:scale-105 active:scale-95"
                      title="Upload profile photo"
                    >
                      {uploadingAvatar ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <Camera className="size-3" />
                      )}
                      <input 
                        id="lecturer-avatar"
                        type="file" 
                        className="hidden" 
                        accept="image/png, image/jpeg, image/webp" 
                        onChange={handleAvatarChange}
                        disabled={uploadingAvatar}
                      />
                    </label>
                  </div>

                  <div className="min-w-0 flex-1 space-y-0.5">
                    <h2 className="text-sm font-semibold text-foreground truncate">
                      {displayName}
                    </h2>
                    <p className="text-xs text-muted-foreground font-mono truncate">
                      {user?.email}
                    </p>
                    <span className="inline-block text-[10px] text-primary font-medium">
                      Faculty Member
                    </span>
                  </div>
                </div>

                {/* Phone Input */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="phone" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <Phone className="size-3.5 text-primary" />
                      Phone Number
                    </Label>
                    <span className="text-[10px] text-muted-foreground">Optional</span>
                  </div>
                  <Input
                    id="phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+250 780 000 000"
                    className="h-9.5 rounded-lg border-border/80 bg-background text-xs sm:text-sm focus-visible:ring-primary/20"
                    maxLength={30}
                  />
                  <p className="text-[10px] text-muted-foreground">
                    For proctoring coordination and emergency exam contact.
                  </p>
                </div>

                {/* Next Step Button */}
                <div className="pt-1">
                  <Button
                    onClick={() => setActiveStep(2)}
                    className="w-full h-9.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 font-semibold text-xs gap-1.5 shadow-xs"
                  >
                    <span>Continue to Academic Bio</span>
                    <ArrowRight className="size-3.5" />
                  </Button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="step-2"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                {/* Academic Bio */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="bio" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <GraduationCap className="size-3.5 text-primary" />
                      Academic Bio & Expertise
                    </Label>
                    <span className={`text-[10px] ${bio.length > 900 ? "text-amber-500 font-semibold" : "text-muted-foreground"}`}>
                      {bio.length} / 1000
                    </span>
                  </div>
                  <Textarea
                    id="bio"
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Briefly state your academic focus, teaching domains, and research areas..."
                    className="min-h-[120px] rounded-lg border-border/80 bg-background text-xs sm:text-sm resize-none p-2.5 focus-visible:ring-primary/20 leading-relaxed placeholder:text-muted-foreground/60"
                    maxLength={1000}
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Displayed on student course portals and faculty syllabi.
                  </p>
                </div>

                {/* Navigation Buttons */}
                <div className="pt-1 flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setActiveStep(1)}
                    disabled={submitting}
                    className="h-9.5 px-3 rounded-lg text-xs font-semibold gap-1 text-muted-foreground hover:text-foreground"
                  >
                    <ArrowLeft className="size-3.5" />
                    <span>Back</span>
                  </Button>

                  <Button
                    onClick={handleFinish}
                    disabled={submitting || uploadingAvatar}
                    className="flex-1 h-9.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 font-semibold text-xs gap-1.5 shadow-xs"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="size-3.5 animate-spin" />
                        <span>Finalizing...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="size-3.5" />
                        <span>Complete Onboarding</span>
                      </>
                    )}
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
