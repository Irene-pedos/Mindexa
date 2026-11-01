"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  MoreVertical,
  Eye,
  CheckCircle,
  Lock,
  Building2,
  Mail,
  GraduationCap,
  Clock,
  Loader2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserResponse } from "@/lib/api/admin";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface UserGridViewProps {
  users: UserResponse[];
  selectedUserIds: Set<string>;
  onToggleSelectUser: (userId: string) => void;
  onViewUser: (user: UserResponse) => void;
  onApproveUser: (userId: string) => void;
  onStatusUpdate: (userId: string, status: string) => void;
  processingUserId: string | null;
}

export function UserGridView({
  users,
  selectedUserIds,
  onToggleSelectUser,
  onViewUser,
  onApproveUser,
  onStatusUpdate,
  processingUserId,
}: UserGridViewProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
      {users.map((user) => {
        const isSelected = selectedUserIds.has(user.id);
        const isProcessing = processingUserId === user.id;
        const profile = user.profile;
        const fullName = profile
          ? `${profile.first_name || ""} ${profile.last_name || ""}`.trim()
          : "";
        const initials = (
          (profile?.first_name?.[0] || "") + (profile?.last_name?.[0] || "")
        ).toUpperCase() || user.email[0].toUpperCase();

        const hasAccommodations =
          (profile?.extra_time_percent || 0) > 0 ||
          profile?.requires_screen_reader_mode ||
          profile?.simple_mode_enabled;

        return (
          <Card
            key={user.id}
            className={cn(
              "rounded-2xl border border-border/80 bg-card p-4 transition-all duration-200 hover:border-primary/40 shadow-xs flex flex-col justify-between relative group",
              isSelected && "ring-2 ring-primary/40 bg-primary/[0.02]"
            )}
          >
            <div>
              {/* Header: Checkbox + Avatar + Action */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => onToggleSelectUser(user.id)}
                    aria-label={`Select ${user.email}`}
                    className="shrink-0"
                  />
                  <div className="size-10 rounded-full bg-muted border border-border flex items-center justify-center font-bold text-xs text-foreground/80 shrink-0">
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-semibold text-xs sm:text-sm text-foreground truncate">
                      {fullName || "Uninitialized Account"}
                    </h4>
                    <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                      <Mail className="size-3 shrink-0" />
                      {user.email}
                    </p>
                  </div>
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 rounded-lg hover:bg-muted text-muted-foreground shrink-0"
                      disabled={isProcessing}
                    >
                      {isProcessing ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <MoreVertical className="size-3.5" />
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44 rounded-xl shadow-lg p-1">
                    <DropdownMenuItem
                      className="text-xs py-2 rounded-lg cursor-pointer"
                      onClick={() => onViewUser(user)}
                    >
                      <Eye className="mr-2 size-3.5 text-muted-foreground" /> View Profile
                    </DropdownMenuItem>
                    {user.role === "LECTURER" && (
                      <DropdownMenuItem
                        className="text-xs py-2 rounded-lg cursor-pointer text-primary"
                        asChild
                      >
                        <Link href={`/admin/academic/assignments?lecturer_id=${user.id}`}>
                          <GraduationCap className="mr-2 size-3.5" /> Assign Teaching
                        </Link>
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    {user.status === "PENDING_APPROVAL" && (
                      <DropdownMenuItem
                        onClick={() => onApproveUser(user.id)}
                        className="text-xs py-2 rounded-lg cursor-pointer text-emerald-600 dark:text-emerald-400 font-medium"
                      >
                        <CheckCircle className="mr-2 size-3.5" /> Approve
                      </DropdownMenuItem>
                    )}
                    {user.status === "ACTIVE" && (
                      <DropdownMenuItem
                        onClick={() => onStatusUpdate(user.id, "SUSPENDED")}
                        className="text-xs py-2 rounded-lg cursor-pointer text-rose-600 dark:text-rose-400 font-medium"
                      >
                        <Lock className="mr-2 size-3.5" /> Suspend
                      </DropdownMenuItem>
                    )}
                    {user.status === "SUSPENDED" && (
                      <DropdownMenuItem
                        onClick={() => onStatusUpdate(user.id, "ACTIVE")}
                        className="text-xs py-2 rounded-lg cursor-pointer text-emerald-600 dark:text-emerald-400 font-medium"
                      >
                        <CheckCircle className="mr-2 size-3.5" /> Reactivate
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Badges Row */}
              <div className="flex items-center gap-1.5 flex-wrap mt-3 pt-3 border-t border-border/40">
                <Badge
                  variant="outline"
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
                    user.role === "ADMIN" && "border-primary/30 bg-primary/10 text-primary",
                    user.role === "COORDINATOR" && "border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-300",
                    user.role === "LECTURER" && "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
                    user.role === "STUDENT" && "border-border/70 bg-muted/40 text-foreground/80"
                  )}
                >
                  {user.role}
                </Badge>

                <Badge
                  variant="secondary"
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
                    user.status === "ACTIVE" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20",
                    user.status === "PENDING_APPROVAL" && "bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20",
                    user.status === "SUSPENDED" && "bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/20"
                  )}
                >
                  {user.status.replace("_", " ")}
                </Badge>

                {hasAccommodations && (
                  <Badge variant="outline" className="rounded-full px-2 py-0.5 text-[9px] font-medium border-emerald-500/30 text-emerald-700 dark:text-emerald-300 bg-emerald-500/5 gap-1">
                    <Clock className="size-2.5" /> Accommodated
                  </Badge>
                )}
              </div>

              {/* Institutional Context */}
              <div className="mt-3 text-xs space-y-1 bg-muted/20 p-2.5 rounded-xl border border-border/40">
                <div className="flex items-center gap-1.5 text-muted-foreground text-[11px]">
                  <Building2 className="size-3 shrink-0" />
                  <span className="font-medium text-foreground truncate">
                    {profile?.department || "Unassigned Dept"}
                  </span>
                </div>
                <div className="text-[10px] text-muted-foreground font-mono pl-4">
                  {user.role === "STUDENT" ? (
                    <span>ID: {profile?.student_id || "N/A"}</span>
                  ) : (
                    <span>Staff ID: {profile?.staff_id || "N/A"}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-between gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs rounded-lg flex-1"
                onClick={() => onViewUser(user)}
              >
                <Eye className="size-3 mr-1" /> Profile
              </Button>

              {user.status === "PENDING_APPROVAL" && (
                <Button
                  size="sm"
                  className="h-8 text-xs rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                  onClick={() => onApproveUser(user.id)}
                  disabled={isProcessing}
                >
                  Approve
                </Button>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
