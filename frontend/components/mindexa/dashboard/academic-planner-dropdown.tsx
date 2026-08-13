// components/mindexa/dashboard/academic-planner-dropdown.tsx
"use client";

import React, { useEffect, useState } from "react";
import {
  Calendar as CalendarIcon,
  Clock,
  BookOpen,
  Award,
  AlertCircle,
  Loader2,
  ShieldAlert,
  Zap,
  ChevronDown,
} from "lucide-react";
import {
  format,
  isToday as isDateToday,
  parseISO,
  isAfter,
  startOfDay,
} from "date-fns";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { studentApi, StudentScheduleEvent } from "@/lib/api/student";
import { isHighSecurityAssessment } from "@/lib/grading-architecture";

export function AcademicPlannerDropdown() {
  const [events, setEvents] = useState<StudentScheduleEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function loadSchedule() {
      try {
        const data = await studentApi.getSchedule();
        setEvents(data.events || []);
      } catch (err) {
        console.error("Failed to load schedule", err);
        setError(true);
      } finally {
        setLoading(false);
      }
    }
    loadSchedule();
  }, []);

  const today = new Date();
  const todayStart = startOfDay(today);

  const filteredEvents = events.filter((e) => {
    const d = parseISO(e.start_at);
    return isDateToday(d) || isAfter(d, todayStart);
  });

  const todayEvents = filteredEvents.filter((e) =>
    isDateToday(parseISO(e.start_at)),
  );
  const upcomingEvents = filteredEvents
    .filter((e) => !isDateToday(parseISO(e.start_at)))
    .slice(0, 4);

  const getEventTypeColor = (type: string) => {
    if (isHighSecurityAssessment(type)) return "text-primary";
    switch (type.toUpperCase()) {
      case "CAT":
      case "SUMMATIVE": return "text-destructive";
      case "FORMATIVE": return "text-foreground";
      case "REASSESSMENT": return "text-foreground";
      case "ASSIGNMENT": return "text-foreground";
      default: return "text-muted-foreground";
    }
  };

  const getEventIcon = (type: string) => {
    const cls = cn("size-3.5 shrink-0", getEventTypeColor(type));
    if (isHighSecurityAssessment(type)) return <ShieldAlert className={cls} />;
    switch (type.toUpperCase()) {
      case "STUDY_SESSION": return <BookOpen className={cls} />;
      case "CAT":
      case "SUMMATIVE": return <AlertCircle className={cls} />;
      case "FORMATIVE": return <BookOpen className={cls} />;
      case "REASSESSMENT": return <Award className={cls} />;
      case "ASSIGNMENT": return <Zap className={cls} />;
      default: return <CalendarIcon className={cls} />;
    }
  };

  const eventDays = events.map((e) => parseISO(e.start_at).getDate());
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 px-3 rounded-lg border-border/60 text-xs gap-1.5 shadow-none hover:bg-muted transition-all"
        >
          <CalendarIcon className="size-3.5" />
          <span>Planner</span>
          {todayEvents.length > 0 && (
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-destructive" />
            </span>
          )}
          <ChevronDown className="size-3 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-[92vw] sm:w-[420px] max-w-lg p-0 overflow-hidden rounded-xl border border-border/60 bg-card shadow-xl animate-in fade-in-80 slide-in-from-top-2 duration-200"
        sideOffset={8}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarIcon className="size-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold text-foreground">Academic Planner</span>
          </div>
          <span className="text-[11px] text-muted-foreground">{format(today, "MMMM yyyy")}</span>
        </div>

        <div className="p-4 space-y-4 max-h-[520px] overflow-y-auto">
          {/* Mini Calendar */}
          <div className="rounded-xl border border-border/40 bg-muted/20 p-3 space-y-2">
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                <div key={i} className="py-0.5">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1 text-center">
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const isCurrentToday = day === today.getDate();
                const hasEvent = eventDays.includes(day);
                return (
                  <div
                    key={i}
                    className={cn(
                      "aspect-square flex items-center justify-center rounded-md text-[11px] transition-colors",
                      isCurrentToday && "bg-primary text-primary-foreground font-semibold",
                      hasEvent && !isCurrentToday && "bg-primary/10 text-primary font-medium",
                      !hasEvent && !isCurrentToday && "text-muted-foreground",
                    )}
                  >
                    {day}
                  </div>
                );
              })}
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-6 gap-2">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Loading schedule…</p>
            </div>
          ) : error ? (
            <p className="text-xs text-destructive text-center py-4">Failed to load schedule.</p>
          ) : (
            <>
              {/* Today */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                    Today · {format(today, "EEE, MMM d")}
                  </span>
                  <Badge variant="outline" className="text-[10px] font-normal border-border/60">
                    {todayEvents.length} event{todayEvents.length !== 1 ? "s" : ""}
                  </Badge>
                </div>

                {todayEvents.length > 0 ? (
                  <div className="space-y-1.5">
                    {todayEvents.map((event) => (
                      <div key={event.id} className="flex gap-2.5 items-center p-2.5 rounded-lg border border-border/40 bg-muted/20">
                        {getEventIcon(event.type)}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-foreground truncate">{event.title}</p>
                          <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                            <Clock className="size-2.5" />
                            {format(parseISO(event.start_at), "HH:mm")} · {event.duration_minutes}m
                          </p>
                        </div>
                        <Badge variant="secondary" className="text-[9px] uppercase shrink-0 px-1.5">
                          {event.type}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground py-2 text-center border border-dashed border-border/40 rounded-lg">
                    No events today.
                  </p>
                )}
              </div>

              {/* Upcoming */}
              {upcomingEvents.length > 0 && (
                <div className="space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Upcoming
                  </span>
                  <div className="space-y-1.5">
                    {upcomingEvents.map((event) => (
                      <div key={event.id} className="flex gap-2.5 items-center p-2.5 rounded-lg border border-border/40 bg-muted/10">
                        {getEventIcon(event.type)}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-foreground truncate">{event.title}</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {format(parseISO(event.start_at), "MMM d · HH:mm")}
                          </p>
                        </div>
                        <Badge variant="outline" className="text-[9px] uppercase shrink-0 border-border/60 px-1.5">
                          {event.type}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Button variant="outline" size="sm" className="w-full h-7 text-xs border-border/60" asChild>
                <Link href="/student/schedule">View full schedule →</Link>
              </Button>
            </>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
