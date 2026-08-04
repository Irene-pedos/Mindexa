"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  ArrowRight, 
  Camera,
  Clock,
  Briefcase,
  Loader2,
  CheckCircle2,
  Phone
} from "lucide-react";
import { authApi } from "@/lib/api/auth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function LecturerOnboarding() {
  const router = useRouter();
  const { user, checkAuth } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  
  const [bio, setBio] = useState("");
  const [phone, setPhone] = useState(user?.profile?.phone_number || "");
  const [profilePic, setProfilePic] = useState<string | null>(null);

  const handleFinish = async () => {
    setSubmitting(true);
    try {
      await authApi.completeLecturerOnboarding({
        bio,
        phone_number: phone,
      });
      
      toast.success("Profile updated successfully!");
      await checkAuth();
      router.push("/lecturer/dashboard");
    } catch (err: any) {
      toast.error(err.message || "Failed to complete onboarding");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 sm:p-6 md:p-8">
      <div className="max-w-4xl w-full flex flex-col gap-6">
        <div className="text-center space-y-1">
            <h1 className="text-xl font-semibold text-foreground tracking-tight uppercase">Lecturer Onboarding</h1>
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest">Establish your professional profile</p>
        </div>

        <div className="bg-white border border-muted/20 p-8 rounded-3xl shadow-sm space-y-10">
            {/* Profile Picture & Identity */}
            <div className="flex flex-col md:flex-row items-center gap-10">
                <div className="relative group">
                    <Avatar className="size-28 border border-muted/20 rounded-2xl shadow-sm overflow-hidden">
                        <AvatarImage src={profilePic || undefined} className="object-cover" />
                        <AvatarFallback className="bg-muted text-muted-foreground text-3xl font-black uppercase">
                            {user?.profile?.first_name?.[0]}{user?.profile?.last_name?.[0]}
                        </AvatarFallback>
                    </Avatar>
                    <label className="absolute -bottom-2 -right-2 size-9 bg-black text-white rounded-xl flex items-center justify-center cursor-pointer hover:bg-black/90 transition-all border-4 border-white shadow-xl">
                        <Camera className="size-4" />
                        <input type="file" className="hidden" accept="image/*" onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                                const url = URL.createObjectURL(file);
                                setProfilePic(url);
                                authApi.uploadAvatar(file).catch(() => toast.error("Avatar upload failed"));
                            }
                        }} />
                    </label>
                </div>
                
                <div className="flex-1 text-center md:text-left space-y-1">
                    <h3 className="text-xl font-black text-black uppercase tracking-tight">{user?.profile?.first_name} {user?.profile?.last_name}</h3>
                    <div className="flex items-center justify-center md:justify-start gap-2">
                        <Badge variant="outline" className="text-[9px] font-black uppercase border-muted/50 text-muted-foreground">
                            ID: {user?.profile?.staff_id || "Awaiting Assignment"}
                        </Badge>
                        <Badge className="bg-emerald-50 text-emerald-600 border-emerald-100 text-[9px] font-black uppercase">Verified Identity</Badge>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-6">
                    <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1 flex items-center gap-1.5">
                            <Phone className="size-3" /> Contact Phone
                        </Label>
                        <Input 
                            value={phone} 
                            onChange={(e) => setPhone(e.target.value)} 
                            placeholder="+250 780 000 000"
                            className="h-10 rounded-xl border-muted/40 font-bold text-xs bg-muted/5"
                        />
                    </div>
                    
                    <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1 flex items-center gap-1.5">
                            <Briefcase className="size-3" /> Professional Title
                        </Label>
                        <Input 
                            placeholder="e.g. Senior Lecturer in Computer Science"
                            className="h-10 rounded-xl border-muted/40 font-bold text-xs bg-muted/5"
                        />
                    </div>
                </div>

                <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Expertise & Summary</Label>
                    <Textarea 
                        value={bio} 
                        onChange={(e) => setBio(e.target.value)} 
                        placeholder="Academic background and research interests..."
                        className="min-h-[110px] rounded-xl border-muted/40 font-medium text-xs bg-muted/5 resize-none p-4"
                    />
                </div>
            </div>

            <div className="p-4 rounded-2xl border border-primary/10 bg-primary/5 flex items-start gap-4">
                <Clock className="size-4 text-primary shrink-0 mt-0.5" />
                <div className="space-y-1">
                    <p className="text-[10px] font-black text-primary uppercase tracking-tight">Assignment Pending</p>
                    <p className="text-[10px] text-muted-foreground font-medium leading-relaxed">
                        Course assignments will be visible once your institutional administrator verifies your profile and assigns modules to your account.
                    </p>
                </div>
            </div>

            <div className="pt-6 border-t border-muted/10 flex items-center justify-between">
                <Button 
                    variant="ghost"
                    onClick={() => router.push("/login")}
                    className="h-10 px-8 rounded-xl font-black text-[10px] uppercase tracking-widest"
                >
                    Sign Out
                </Button>
                <Button 
                    onClick={handleFinish} 
                    disabled={submitting}
                    className="h-10 px-10 rounded-xl bg-black hover:bg-black/90 text-white font-black text-[10px] uppercase tracking-widest gap-2 shadow-sm"
                >
                    {submitting ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
                    {submitting ? "Finalizing Profile..." : "Complete Onboarding"}
                </Button>
            </div>
        </div>
      </div>
    </div>
  );
}

function Badge({ children, className, variant = "default" }: any) {
    return (
        <span className={cn(
            "px-2 py-0.5 rounded-full border flex items-center justify-center leading-none",
            variant === "outline" ? "bg-white border-muted" : "bg-black text-white border-black",
            className
        )}>
            {children}
        </span>
    )
}
