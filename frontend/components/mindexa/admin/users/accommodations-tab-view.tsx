"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  GraduationCap,
  Clock,
  Accessibility,
  Sliders,
  Search,
  Mail,
  X,
  FileText,
  SlidersHorizontal,
} from "lucide-react";
import { UserResponse } from "@/lib/api/admin";
import { cn } from "@/lib/utils";

interface AccommodationsTabViewProps {
  users: UserResponse[];
  onOpenAccommodationsModal: (user: UserResponse) => void;
}

export function AccommodationsTabView({
  users,
  onOpenAccommodationsModal,
}: AccommodationsTabViewProps) {
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"all" | "extraTime" | "screenReader" | "simple">("all");

  const studentUsers = useMemo(() => {
    return users.filter((u) => u.role === "STUDENT");
  }, [users]);

  const stats = useMemo(() => {
    const total = studentUsers.length;
    const withExtraTime = studentUsers.filter(
      (u) => (u.profile?.extra_time_percent || 0) > 0
    ).length;
    const withScreenReader = studentUsers.filter(
      (u) => !!u.profile?.requires_screen_reader_mode
    ).length;
    const withSimpleMode = studentUsers.filter(
      (u) => !!u.profile?.simple_mode_enabled
    ).length;
    return { total, withExtraTime, withScreenReader, withSimpleMode };
  }, [studentUsers]);

  const filteredStudents = useMemo(() => {
    return studentUsers.filter((u) => {
      // Type pill filter
      if (filterType === "extraTime" && !(u.profile?.extra_time_percent && u.profile.extra_time_percent > 0)) {
        return false;
      }
      if (filterType === "screenReader" && !u.profile?.requires_screen_reader_mode) {
        return false;
      }
      if (filterType === "simple" && !u.profile?.simple_mode_enabled) {
        return false;
      }

      // Search term
      if (search.trim()) {
        const q = search.toLowerCase();
        const fullName = `${u.profile?.first_name || ""} ${
          u.profile?.last_name || ""
        }`.toLowerCase();
        const email = (u.email || "").toLowerCase();
        const studentId = (u.profile?.student_id || "").toLowerCase();
        const department = (u.profile?.department || "").toLowerCase();
        return (
          fullName.includes(q) ||
          email.includes(q) ||
          studentId.includes(q) ||
          department.includes(q)
        );
      }
      return true;
    });
  }, [studentUsers, search, filterType]);

  const statCards = [
    {
      id: "all" as const,
      label: "Enrolled Students",
      value: stats.total,
      badge: "Candidates",
      icon: GraduationCap,
      color: "text-primary",
      bgColor: "bg-primary/10 dark:bg-primary/15",
    },
    {
      id: "extraTime" as const,
      label: "Extra Time Active",
      value: stats.withExtraTime,
      badge: "Extended timers",
      icon: Clock,
      color: "text-emerald-600 dark:text-emerald-400",
      bgColor: "bg-emerald-500/10 dark:bg-emerald-500/15",
    },
    {
      id: "screenReader" as const,
      label: "Screen Reader",
      value: stats.withScreenReader,
      badge: "Live ARIA",
      icon: Accessibility,
      color: "text-indigo-600 dark:text-indigo-400",
      bgColor: "bg-indigo-500/10 dark:bg-indigo-500/15",
    },
    {
      id: "simple" as const,
      label: "Simple UI Defaults",
      value: stats.withSimpleMode,
      badge: "Simplified controls",
      icon: Sliders,
      color: "text-amber-600 dark:text-amber-400",
      bgColor: "bg-amber-500/10 dark:bg-amber-500/15",
    },
  ];

  return (
    <div className="space-y-4">
      {/* Sleek, Compact 4 Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
        {statCards.map((card) => {
          const Icon = card.icon;
          const isActive = filterType === card.id;

          return (
            <Card
              key={card.id}
              onClick={() => setFilterType(prev => prev === card.id ? "all" : card.id)}
              role="button"
              tabIndex={0}
              aria-pressed={isActive}
              className={cn(
                "group relative overflow-hidden rounded-xl border border-border/80 bg-card p-3 sm:py-3 sm:px-3.5 transition-all duration-200 cursor-pointer shadow-2xs select-none hover:shadow-xs",
                isActive
                  ? "ring-1.5 ring-primary/40 border-primary/60 bg-primary/[0.03] dark:bg-primary/[0.05]"
                  : "hover:-translate-y-0.5 hover:border-primary/40"
              )}
            >
              <div className="flex items-center justify-between gap-2.5">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={cn(
                      "size-9 sm:size-10 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105",
                      card.bgColor,
                      card.color
                    )}
                  >
                    <Icon className="size-4 sm:size-4.5" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider truncate block">
                      {card.label}
                    </span>
                    <div className="flex items-baseline gap-2 mt-0.5">
                      <span className={cn("text-lg sm:text-2xl font-extrabold tracking-tight tabular-nums", card.color)}>
                        {card.value}
                      </span>
                      <span className="text-[9px] font-semibold text-muted-foreground hidden sm:inline-block truncate">
                        {card.badge}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Student Accommodations Search & Quick Filter Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search students by name, email, registration #..."
            className="pl-9 pr-8 h-9 text-xs sm:text-sm rounded-xl border-border/80 bg-background shadow-2xs focus-visible:ring-1 focus-visible:ring-primary"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {filterType !== "all" && (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setFilterType("all")}
              className="text-xs text-muted-foreground hover:text-foreground h-7 px-2"
            >
              Reset filter
            </Button>
          )}
          <span className="text-xs text-muted-foreground font-medium">
            Showing <strong className="text-foreground">{filteredStudents.length}</strong> student{filteredStudents.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Accommodations Table */}
      <div className="rounded-2xl border border-border/80 bg-card overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <Table className="min-w-[700px] w-full text-xs">
            <TableHeader className="bg-muted/40 border-b border-border/60">
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground py-3">
                  Student Account
                </TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground py-3">
                  Academic Scope
                </TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground py-3">
                  Time Accommodation
                </TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground py-3">
                  Sensory &amp; Assistive Setup
                </TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground py-3">
                  Administrative Reason
                </TableHead>
                <TableHead className="text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground py-3 pr-4">
                  Action
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredStudents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-40 text-center text-xs text-muted-foreground">
                    No student accounts found matching the criteria.
                  </TableCell>
                </TableRow>
              ) : (
                filteredStudents.map((student) => {
                  const profile = student.profile;
                  const extraTime = profile?.extra_time_percent || 0;
                  const fullName = profile
                    ? `${profile.first_name || ""} ${profile.last_name || ""}`.trim()
                    : "Student";
                  const initials = (
                    (profile?.first_name?.[0] || "") + (profile?.last_name?.[0] || "")
                  ).toUpperCase() || student.email[0].toUpperCase();

                  const hasAccommodations =
                    extraTime > 0 ||
                    profile?.requires_screen_reader_mode ||
                    profile?.simple_mode_enabled ||
                    profile?.large_text_default ||
                    profile?.reduced_motion_default;

                  return (
                    <TableRow key={student.id} className="hover:bg-muted/30 transition-colors h-16 border-b border-border/40">
                      <TableCell className="py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="size-8.5 rounded-full bg-muted border flex items-center justify-center font-bold text-xs text-foreground/80 shrink-0">
                            {initials}
                          </div>
                          <div>
                            <div className="font-semibold text-xs text-foreground">
                              {fullName}
                            </div>
                            <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                              <Mail className="size-3 text-muted-foreground/60" /> {student.email}
                            </div>
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className="py-3">
                        <div className="text-xs font-medium text-foreground">
                          {profile?.department || "General Registry"}
                        </div>
                        <div className="text-[11px] text-muted-foreground font-mono">
                          ID: {profile?.student_id || "N/A"}
                        </div>
                      </TableCell>

                      <TableCell className="py-3">
                        {extraTime > 0 ? (
                          <Badge
                            variant="outline"
                            className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25 text-xs font-semibold gap-1.5"
                          >
                            <Clock className="size-3 text-emerald-600 dark:text-emerald-400" />
                            +{extraTime}% Extra Time
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">Standard (0%)</span>
                        )}
                      </TableCell>

                      <TableCell className="py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {profile?.requires_screen_reader_mode && (
                            <Badge variant="outline" className="bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/25 text-[10px] font-semibold">
                              Screen Reader
                            </Badge>
                          )}
                          {profile?.simple_mode_enabled && (
                            <Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/25 text-[10px] font-semibold">
                              Simple UI
                            </Badge>
                          )}
                          {profile?.large_text_default && (
                            <Badge variant="outline" className="bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/25 text-[10px] font-semibold">
                              Large Text
                            </Badge>
                          )}
                          {profile?.reduced_motion_default && (
                            <Badge variant="outline" className="bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/25 text-[10px] font-semibold">
                              Reduced Motion
                            </Badge>
                          )}
                          {!hasAccommodations && (
                            <span className="text-xs text-muted-foreground">Standard Profile</span>
                          )}
                        </div>
                      </TableCell>

                      <TableCell className="py-3 max-w-xs">
                        {profile?.accommodations_note ? (
                          <div
                            className="text-xs text-foreground/80 truncate font-medium"
                            title={profile.accommodations_note}
                          >
                            {profile.accommodations_note}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">No note on record</span>
                        )}
                        {profile?.updated_at && (
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            Updated: {new Date(profile.updated_at).toLocaleDateString()}
                          </div>
                        )}
                      </TableCell>

                      <TableCell className="py-3 text-right pr-4">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs font-semibold rounded-xl gap-1.5 border-border/80 hover:border-primary/40"
                          onClick={() => onOpenAccommodationsModal(student)}
                        >
                          <Sliders className="size-3.5 text-primary" /> Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
