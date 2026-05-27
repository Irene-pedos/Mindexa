"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  ArrowRight, 
  Camera,
  Clock,
  Briefcase
} from "lucide-react";
import { authApi } from "@/lib/api/auth";
import { toast } from "sonner";
import { Separator } from "@/components/ui/separator";

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
    <div className="min-h-screen bg-muted/20 flex items-center justify-center p-6 md:p-12">
      <Card className="max-w-4xl w-full shadow-none border rounded-xl bg-background">
        <CardHeader className="border-b bg-muted/5 py-8 px-10">
            <div className="space-y-1">
                <CardTitle className="text-2xl font-semibold tracking-tight">Lecturer Onboarding</CardTitle>
                <CardDescription className="text-sm font-medium">
                    Finalize your professional identity to begin academic oversight.
                </CardDescription>
            </div>
        </CardHeader>

        <CardContent className="p-10 space-y-10">
            <div className="flex flex-col md:flex-row items-center gap-10">
                <div className="relative">
                    <Avatar className="size-28 border-2 border-muted shadow-sm">
                        <AvatarImage src={profilePic || undefined} />
                        <AvatarFallback className="bg-muted text-muted-foreground text-3xl font-semibold uppercase">
                            {user?.profile?.first_name?.[0]}{user?.profile?.last_name?.[0]}
                        </AvatarFallback>
                    </Avatar>
                    <label className="absolute -bottom-1 -right-1 size-9 bg-primary text-white rounded-full flex items-center justify-center shadow-sm cursor-pointer hover:bg-primary/90 transition-colors border-2 border-background">
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
                
                <div className="flex-1 text-center md:text-left">
                    <h3 className="text-xl font-semibold text-foreground">{user?.profile?.first_name} {user?.profile?.last_name}</h3>
                    <p className="text-xs text-muted-foreground font-mono uppercase tracking-widest mt-1">Staff Identifier: {user?.profile?.staff_id || "Awaiting Assignment"}</p>
                </div>
            </div>

            <Separator />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-6">
                    <div className="space-y-2.5">
                        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Work Contact Phone</Label>
                        <Input 
                            value={phone} 
                            onChange={(e) => setPhone(e.target.value)} 
                            placeholder="+250 780 000 000"
                            className="h-11 rounded-lg"
                        />
                    </div>
                    
                    <div className="space-y-2.5">
                        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Professional Title / Specialization</Label>
                        <Input 
                            placeholder="e.g. Senior Lecturer in Computer Science"
                            className="h-11 rounded-lg"
                        />
                    </div>
                </div>

                <div className="space-y-2.5">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Professional Summary & Expertise</Label>
                    <Textarea 
                        value={bio} 
                        onChange={(e) => setBio(e.target.value)} 
                        placeholder="Areas of expertise, research interests, and academic background..."
                        className="min-h-[120px] rounded-lg resize-none text-sm"
                    />
                </div>
            </div>

            <div className="p-6 rounded-lg border bg-blue-50/50 border-blue-100 flex items-start gap-4">
                <Clock className="size-5 text-blue-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                    <p className="text-sm font-semibold text-blue-900">Academic Assignments Pending Approval</p>
                    <p className="text-xs text-blue-800/80 leading-relaxed">
                        Your academic assignments will appear after institutional approval. Access to specific courses and department tools will be activated once your profile is verified and assigned by the institutional administrator.
                    </p>
                </div>
            </div>
        </CardContent>

        <CardFooter className="p-10 pt-0 border-t bg-muted/5 flex justify-end gap-3">
            <Button 
                variant="outline"
                onClick={() => router.push("/login")}
                className="h-11 px-8 rounded-lg font-semibold"
            >
                Log Out
            </Button>
            <Button 
                onClick={handleFinish} 
                disabled={submitting}
                className="h-11 px-10 rounded-lg font-semibold gap-2 shadow-sm"
            >
                {submitting ? "Completing Profile..." : "Complete Onboarding"}
                {!submitting && <ArrowRight className="size-4" />}
            </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
