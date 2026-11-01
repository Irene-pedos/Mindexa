"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MoreVertical,
  Eye,
  CheckCircle,
  Lock,
  ShieldCheck,
  GraduationCap,
  Loader2,
  Users,
  Clock,
  Sparkles,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";
import { UserResponse } from "@/lib/api/admin";
import { cn } from "@/lib/utils";

interface UserDirectoryTableProps {
  users: UserResponse[];
  loading: boolean;
  selectedUserIds: Set<string>;
  onToggleSelectAll: () => void;
  onToggleSelectUser: (userId: string) => void;
  onViewUser: (user: UserResponse) => void;
  onApproveUser: (userId: string) => void;
  onStatusUpdate: (userId: string, status: string) => void;
  processingUserId: string | null;
  currentPage: number;
  totalUsers: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

export function UserDirectoryTable({
  users,
  loading,
  selectedUserIds,
  onToggleSelectAll,
  onToggleSelectUser,
  onViewUser,
  onApproveUser,
  onStatusUpdate,
  processingUserId,
  currentPage,
  totalUsers,
  pageSize,
  onPageChange,
}: UserDirectoryTableProps) {
  const totalPages = Math.ceil(totalUsers / pageSize) || 1;
  const isAllSelected = users.length > 0 && selectedUserIds.size === users.length;

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "ADMIN":
        return (
          <Badge
            variant="outline"
            className="rounded-full px-2.5 py-0.5 text-[10px] font-bold border-primary/30 bg-primary/10 text-primary uppercase tracking-wider"
          >
            Admin
          </Badge>
        );
      case "COORDINATOR":
        return (
          <Badge
            variant="outline"
            className="rounded-full px-2.5 py-0.5 text-[10px] font-bold border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-300 uppercase tracking-wider"
          >
            Coordinator
          </Badge>
        );
      case "LECTURER":
        return (
          <Badge
            variant="outline"
            className="rounded-full px-2.5 py-0.5 text-[10px] font-bold border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300 uppercase tracking-wider"
          >
            Lecturer
          </Badge>
        );
      case "REVIEWER":
        return (
          <Badge
            variant="outline"
            className="rounded-full px-2.5 py-0.5 text-[10px] font-bold border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 uppercase tracking-wider"
          >
            Reviewer
          </Badge>
        );
      case "SUPERVISOR":
        return (
          <Badge
            variant="outline"
            className="rounded-full px-2.5 py-0.5 text-[10px] font-bold border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 uppercase tracking-wider"
          >
            Supervisor
          </Badge>
        );
      case "STUDENT":
      default:
        return (
          <Badge
            variant="outline"
            className="rounded-full px-2.5 py-0.5 text-[10px] font-medium border-border/80 bg-muted/40 text-foreground/80 uppercase tracking-wider"
          >
            Student
          </Badge>
        );
    }
  };

  const getRoleAvatarStyle = (role: string) => {
    switch (role) {
      case "ADMIN":
        return "bg-primary/15 text-primary border-primary/30";
      case "COORDINATOR":
        return "bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30";
      case "LECTURER":
        return "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30";
      case "REVIEWER":
      case "SUPERVISOR":
        return "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30";
      case "STUDENT":
      default:
        return "bg-muted/80 text-foreground/80 border-border/80";
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            Active
          </span>
        );
      case "PENDING_APPROVAL":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/25">
            <span className="size-1.5 rounded-full bg-amber-500 animate-pulse" />
            Pending
          </span>
        );
      case "SUSPENDED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/25">
            <span className="size-1.5 rounded-full bg-rose-500" />
            Suspended
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground border">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="rounded-2xl border border-border/80 bg-card overflow-hidden shadow-xs">
      <div className="overflow-x-auto">
        <Table className="min-w-[720px] w-full text-xs">
          <TableHeader className="bg-muted/30 border-b border-border/60">
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[44px] px-4 text-center">
                <Checkbox
                  checked={isAllSelected}
                  onCheckedChange={onToggleSelectAll}
                  aria-label="Select all accounts"
                />
              </TableHead>
              <TableHead className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground py-3">
                Account Holder
              </TableHead>
              <TableHead className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground py-3">
                Functional Role
              </TableHead>
              <TableHead className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground py-3">
                Status
              </TableHead>
              <TableHead className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground py-3">
                Institutional Context
              </TableHead>
              <TableHead className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground py-3">
                Verification
              </TableHead>
              <TableHead className="w-[120px] text-right text-[10px] font-bold uppercase tracking-wider text-muted-foreground py-3 pr-4">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i} className="h-15 border-b border-border/40">
                  <TableCell className="px-4">
                    <Skeleton className="size-4 rounded" />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Skeleton className="size-9 rounded-full" />
                      <div className="space-y-1.5">
                        <Skeleton className="h-3.5 w-32" />
                        <Skeleton className="h-3 w-40" />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-20 rounded-full" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <Skeleton className="h-3.5 w-24" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-16" />
                  </TableCell>
                  <TableCell className="pr-4 text-right">
                    <Skeleton className="size-7 rounded-lg ml-auto" />
                  </TableCell>
                </TableRow>
              ))
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-48 text-center py-10">
                  <div className="flex flex-col items-center justify-center space-y-2 max-w-sm mx-auto">
                    <div className="size-12 rounded-2xl bg-muted/60 flex items-center justify-center text-muted-foreground">
                      <Users className="size-6" />
                    </div>
                    <p className="font-semibold text-sm text-foreground">No accounts match the criteria</p>
                    <p className="text-xs text-muted-foreground text-center">
                      Try adjusting or resetting your search query and filters.
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => {
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
                  <TableRow
                    key={user.id}
                    className={cn(
                      "group border-b border-border/40 transition-colors h-15 hover:bg-muted/40 cursor-pointer",
                      isSelected && "bg-primary/[0.04] dark:bg-primary/[0.07]"
                    )}
                    onClick={(e) => {
                      // Don't trigger if clicked on checkbox or dropdown button
                      const target = e.target as HTMLElement;
                      if (target.closest("button") || target.closest("[role='checkbox']")) {
                        return;
                      }
                      onViewUser(user);
                    }}
                  >
                    <TableCell className="px-4 text-center" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => onToggleSelectUser(user.id)}
                        aria-label={`Select ${user.email}`}
                      />
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            "size-8.5 rounded-full border flex items-center justify-center font-bold text-xs shrink-0 transition-transform duration-150 group-hover:scale-105",
                            getRoleAvatarStyle(user.role)
                          )}
                        >
                          {initials}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-xs text-foreground group-hover:text-primary transition-colors truncate">
                              {fullName || "Uninitialized Account"}
                            </span>
                            {hasAccommodations && (
                              <span title="Active accommodations registered" className="text-emerald-600 dark:text-emerald-400">
                                <Clock className="size-3" />
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-muted-foreground truncate">
                            {user.email}
                          </span>
                        </div>
                      </div>
                    </TableCell>

                    <TableCell>{getRoleBadge(user.role)}</TableCell>

                    <TableCell>{getStatusBadge(user.status)}</TableCell>

                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-xs font-medium text-foreground/90 truncate max-w-[180px]">
                          {profile?.department || "Unassigned Dept"}
                        </span>
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider truncate max-w-[180px]">
                          {profile?.college || "General Registry"}
                        </span>
                      </div>
                    </TableCell>

                    <TableCell>
                      {user.email_verified ? (
                        <div className="flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                          <ShieldCheck className="size-3.5" /> Verified
                        </div>
                      ) : (
                        <span className="text-[11px] text-muted-foreground/80">Unverified</span>
                      )}
                    </TableCell>

                    <TableCell className="text-right pr-4" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        {/* Direct Quick Action: Approve */}
                        {user.status === "PENDING_APPROVAL" && (
                          <Button
                            size="xs"
                            variant="outline"
                            className="h-7 px-2 text-[11px] font-semibold rounded-lg border-emerald-500/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10 gap-1"
                            disabled={isProcessing}
                            onClick={() => onApproveUser(user.id)}
                            title="Approve access"
                          >
                            {isProcessing ? (
                              <Loader2 className="size-3 animate-spin" />
                            ) : (
                              <CheckCircle className="size-3" />
                            )}
                            Approve
                          </Button>
                        )}

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
                              disabled={isProcessing}
                              aria-label="Open actions menu"
                            >
                              {isProcessing ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : (
                                <MoreVertical className="size-3.5" />
                              )}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48 rounded-xl shadow-lg p-1">
                            <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-2 py-1">
                              Account Actions
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator />

                            <DropdownMenuItem
                              className="text-xs py-2 rounded-lg cursor-pointer"
                              onClick={() => onViewUser(user)}
                            >
                              <Eye className="mr-2 size-3.5 text-muted-foreground" /> View Profile &amp; Details
                            </DropdownMenuItem>

                            {user.role === "LECTURER" && (
                              <DropdownMenuItem
                                className="text-xs py-2 rounded-lg cursor-pointer text-primary font-medium"
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
                                <CheckCircle className="mr-2 size-3.5" /> Approve Account
                              </DropdownMenuItem>
                            )}

                            {user.status === "ACTIVE" && (
                              <DropdownMenuItem
                                onClick={() => onStatusUpdate(user.id, "SUSPENDED")}
                                className="text-xs py-2 rounded-lg cursor-pointer text-rose-600 dark:text-rose-400 font-medium"
                              >
                                <Lock className="mr-2 size-3.5" /> Suspend Account
                              </DropdownMenuItem>
                            )}

                            {user.status === "SUSPENDED" && (
                              <DropdownMenuItem
                                onClick={() => onStatusUpdate(user.id, "ACTIVE")}
                                className="text-xs py-2 rounded-lg cursor-pointer text-emerald-600 dark:text-emerald-400 font-medium"
                              >
                                <CheckCircle className="mr-2 size-3.5" /> Reactivate Account
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination Footer */}
      <div className="p-3 bg-muted/20 border-t border-border/60 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
        <div>
          Page <strong className="text-foreground">{currentPage}</strong> of{" "}
          <strong className="text-foreground">{totalPages}</strong> ({totalUsers} total registered accounts)
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-7.5 px-3 rounded-lg text-xs"
            disabled={currentPage <= 1 || loading}
            onClick={() => onPageChange(currentPage - 1)}
          >
            Previous
          </Button>
          <span className="text-[11px] px-2 font-medium">
            {currentPage} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-7.5 px-3 rounded-lg text-xs"
            disabled={currentPage >= totalPages || loading}
            onClick={() => onPageChange(currentPage + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
