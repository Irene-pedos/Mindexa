"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Mail,
  Building2,
  ShieldCheck,
  XCircle,
  Copy,
  Check,
  Calendar,
  Clock,
  GraduationCap,
  Sliders,
  CheckCircle,
  Lock,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { UserResponse } from "@/lib/api/admin";
import { useState } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface UserDetailSheetProps {
  user: UserResponse | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onApproveUser: (userId: string) => void;
  onStatusUpdate: (userId: string, status: string) => void;
  onEditAccommodations?: (user: UserResponse) => void;
  isProcessing?: boolean;
}

export function UserDetailSheet({
  user,
  isOpen,
  onOpenChange,
  onApproveUser,
  onStatusUpdate,
  onEditAccommodations,
  isProcessing = false,
}: UserDetailSheetProps) {
  const [copied, setCopied] = useState(false);

  if (!user) return null;

  const profile = user.profile;
  const fullName = profile
    ? `${profile.first_name || ""} ${profile.last_name || ""}`.trim()
    : "Uninitialized Profile";
  const initials = (
    (profile?.first_name?.[0] || "") + (profile?.last_name?.[0] || "")
  ).toUpperCase() || user.email[0].toUpperCase();

  const handleCopyId = () => {
    navigator.clipboard.writeText(user.id);
    setCopied(true);
    toast.success("User ID copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg p-0 flex flex-col justify-between overflow-y-auto bg-background"
      >
        <div className="p-6 space-y-6">
          {/* Header */}
          <SheetHeader className="text-left space-y-3">
            <div className="flex items-center gap-3.5">
              <div className="size-14 rounded-2xl bg-muted border border-border flex items-center justify-center font-bold text-lg text-foreground shrink-0 shadow-2xs">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <SheetTitle className="text-lg font-bold tracking-tight text-foreground truncate">
                  {fullName}
                </SheetTitle>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground truncate">
                  <Mail className="size-3 text-muted-foreground shrink-0" />
                  <span className="truncate">{user.email}</span>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <Badge
                    variant="outline"
                    className="text-[10px] font-semibold uppercase tracking-wider rounded-md h-5 px-2"
                  >
                    {user.role}
                  </Badge>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border",
                      user.status === "ACTIVE" &&
                        "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
                      user.status === "PENDING_APPROVAL" &&
                        "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
                      user.status === "SUSPENDED" &&
                        "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20"
                    )}
                  >
                    {user.status.replace("_", " ")}
                  </span>
                </div>
              </div>
            </div>
            <SheetDescription className="text-xs text-muted-foreground">
              Institutional identity &amp; account governance overview.
            </SheetDescription>
          </SheetHeader>

          <Separator className="bg-border/60" />

          {/* Institutional Information */}
          <div className="space-y-3">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Building2 className="size-3.5" /> Institutional Placement
            </h4>
            <div className="grid grid-cols-2 gap-3 bg-muted/20 p-3.5 rounded-xl border border-border/50 text-xs">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-medium">Department</p>
                <p className="font-semibold text-foreground mt-0.5">
                  {profile?.department || "Unassigned"}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-medium">College / Faculty</p>
                <p className="font-semibold text-foreground mt-0.5">
                  {profile?.college || "General Registry"}
                </p>
              </div>

              {user.role === "STUDENT" && (
                <>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase font-medium">Student Reg ID</p>
                    <p className="font-mono font-semibold text-primary mt-0.5">
                      {profile?.student_id || "N/A"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase font-medium">Academic Level</p>
                    <p className="font-semibold text-foreground mt-0.5">
                      {profile?.level ? `${profile.level} Year ${profile?.year || ""}` : "Not specified"}
                    </p>
                  </div>
                </>
              )}

              {(user.role === "LECTURER" || user.role === "COORDINATOR") && (
                <div className="col-span-2">
                  <p className="text-[10px] text-muted-foreground uppercase font-medium">Staff ID</p>
                  <p className="font-mono font-semibold text-primary mt-0.5">
                    {profile?.staff_id || "N/A"}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Lecturer Teaching Load */}
          {(user.role === "LECTURER" || user.role === "COORDINATOR") && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <GraduationCap className="size-3.5" /> Teaching Assignments
                </h4>
                <Button variant="link" size="xs" className="h-auto p-0 text-primary font-medium text-xs" asChild>
                  <Link href={`/admin/academic/assignments?lecturer_id=${user.id}`}>
                    Manage <ExternalLink className="size-3 ml-1" />
                  </Link>
                </Button>
              </div>
              <div className="bg-muted/20 p-3 rounded-xl border border-border/50 text-xs">
                {profile?.assigned_courses && profile.assigned_courses.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {profile.assigned_courses.map((courseCode) => (
                      <Badge key={courseCode} variant="secondary" className="text-xs font-mono font-medium">
                        {courseCode}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">
                    No active course assignments recorded.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Student Accommodations Summary */}
          {user.role === "STUDENT" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <Sliders className="size-3.5" /> Accessibility &amp; Accommodations
                </h4>
                {onEditAccommodations && (
                  <Button
                    variant="ghost"
                    size="xs"
                    className="h-6 text-xs text-primary font-semibold px-2"
                    onClick={() => onEditAccommodations(user)}
                  >
                    Edit Accommodations
                  </Button>
                )}
              </div>
              <div className="bg-muted/20 p-3.5 rounded-xl border border-border/50 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Time Accommodation:</span>
                  <span className="font-semibold text-foreground">
                    {(profile?.extra_time_percent || 0) > 0 ? (
                      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20 text-[11px] font-semibold">
                        +{profile?.extra_time_percent}% Extra Time
                      </Badge>
                    ) : (
                      "Standard (0%)"
                    )}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Screen Reader Mode:</span>
                  <span className="font-medium text-foreground">
                    {profile?.requires_screen_reader_mode ? "Required" : "Default"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Simple UI Mode:</span>
                  <span className="font-medium text-foreground">
                    {profile?.simple_mode_enabled ? "Enabled" : "Default"}
                  </span>
                </div>
                {profile?.accommodations_note && (
                  <div className="pt-2 border-t border-border/40 text-[11px]">
                    <span className="text-muted-foreground block font-medium">Administrative Note:</span>
                    <p className="text-foreground/90 mt-0.5">{profile.accommodations_note}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Security & Audit Metadata */}
          <div className="space-y-3">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Calendar className="size-3.5" /> Security &amp; Audit Trail
            </h4>
            <div className="space-y-2 text-xs bg-muted/20 p-3.5 rounded-xl border border-border/50">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Email Verification:</span>
                <span className="font-medium flex items-center gap-1.5">
                  {user.email_verified ? (
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                      <ShieldCheck className="size-3.5" /> Verified
                    </span>
                  ) : (
                    <span className="text-muted-foreground flex items-center gap-1">
                      <XCircle className="size-3.5" /> Unverified
                    </span>
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Registered On:</span>
                <span className="font-medium text-foreground">
                  {new Date(user.created_at).toLocaleDateString(undefined, {
                    dateStyle: "medium",
                  })}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Last Login:</span>
                <span className="font-medium text-foreground">
                  {user.last_login_at
                    ? new Date(user.last_login_at).toLocaleString()
                    : "No record yet"}
                </span>
              </div>
              <div className="pt-2 border-t border-border/40 flex items-center justify-between gap-2">
                <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[220px]">
                  ID: {user.id}
                </span>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={handleCopyId}
                  className="h-6 text-[10px] gap-1 px-2"
                >
                  {copied ? (
                    <>
                      <Check className="size-3 text-emerald-600" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="size-3" /> Copy ID
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-border/60 bg-muted/10 flex items-center justify-between gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-xs rounded-xl"
          >
            Close
          </Button>

          <div className="flex items-center gap-2">
            {user.status === "PENDING_APPROVAL" && (
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl"
                onClick={() => {
                  onApproveUser(user.id);
                  onOpenChange(false);
                }}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <Loader2 className="size-3.5 animate-spin mr-1.5" />
                ) : (
                  <CheckCircle className="size-3.5 mr-1.5" />
                )}
                Approve Account
              </Button>
            )}

            {user.status === "ACTIVE" && (
              <Button
                variant="outline"
                size="sm"
                className="border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 text-xs font-semibold rounded-xl"
                onClick={() => {
                  onStatusUpdate(user.id, "SUSPENDED");
                  onOpenChange(false);
                }}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <Loader2 className="size-3.5 animate-spin mr-1.5" />
                ) : (
                  <Lock className="size-3.5 mr-1.5" />
                )}
                Suspend Account
              </Button>
            )}

            {user.status === "SUSPENDED" && (
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl"
                onClick={() => {
                  onStatusUpdate(user.id, "ACTIVE");
                  onOpenChange(false);
                }}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <Loader2 className="size-3.5 animate-spin mr-1.5" />
                ) : (
                  <CheckCircle className="size-3.5 mr-1.5" />
                )}
                Reactivate Account
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
