// components/mindexa/dashboard/academic-planner-dropdown.tsx
"use client";

import React, { useEffect, useState } from "react";
import {
  Calendar as CalendarIcon,
  Clock,
  Users,
  BookOpen,
  Award,
  AlertCircle,
  Loader2,
  ShieldAlert,
  Zap,
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
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { studentApi, StudentScheduleEvent } from "@/lib/api/student";
import { isHighSecurityAssessment } from "@/lib/grading-architecture";
import { useRouter } from "next/navigation";

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

  // Filter out past events (keep today and future)
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

  const getIcon = (type: string) => {
    const highSecurity = isHighSecurityAssessment(type);
    if (highSecurity) return <ShieldAlert className="size-4 text-primary" />;

    switch (type.toUpperCase()) {
      case "STUDY_SESSION":
        return <BookOpen className="size-4 text-primary" />;
      case "CAT":
        return <AlertCircle className="size-4 text-red-500" />;
      case "SUMMATIVE":
        return <AlertCircle className="size-4 text-red-500" />;
      case "FORMATIVE":
        return <BookOpen className="size-4 text-emerald-500" />;
      case "REASSESSMENT":
        return <Award className="size-4 text-violet-500" />;
      case "ASSIGNMENT":
        return <Zap className="size-4 text-amber-500" />;
      default:
        return <CalendarIcon className="size-4 text-muted-foreground" />;
    }
  };

  // Days with events for the mini calendar
  const eventDays = events.map((e) => parseISO(e.start_at).getDate());

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8.5 px-3 rounded-lg border-border/60 text-xs font-semibold gap-1.5 shadow-none hover:bg-muted transition-all">
          <CalendarIcon className="size-3.5 text-primary" />
          <span>Academic Planner</span>
          {todayEvents.length > 0 && (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-[92vw] sm:w-[460px] max-w-lg p-0 overflow-hidden rounded-xl border border-border/60 bg-card shadow-xl animate-in fade-in-80 slide-in-from-top-2 duration-200"
        sideOffset={8}
      >
        {/* Dropdown Header */}
        <div className="p-3.5 px-4 border-b border-border/60 bg-muted/20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarIcon className="size-4 text-primary" />
            <h3 className="text-xs font-semibold text-foreground">Academic Planner</h3>
          </div>
          <Badge variant="outline" className="text-[10px] font-semibold border-primary/20 text-primary bg-primary/5">
            {format(today, "MMMM yyyy")}
          </Badge>
        </div>

        <div className="p-4 space-y-5 max-h-[540px] overflow-y-auto">
          {/* Mini Calendar */}
          <div className="rounded-xl border border-border/50 bg-muted/10 p-3 space-y-2">
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                <div key={i} className="py-1">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1 text-center">
              {Array.from({ length: 31 }).map((_, i) => {
                const day = i + 1;
                const isCurrentToday = day === today.getDate();
                const hasEvent = eventDays.includes(day);
                return (
                  <div
                    key={i}
                    className={cn(
                      "aspect-square flex items-center justify-center rounded-lg text-xs transition-colors",
                      isCurrentToday &&
                        "bg-primary text-primary-foreground font-semibold shadow-xs",
                      hasEvent &&
                        !isCurrentToday &&
                        "text-primary font-bold relative bg-primary/10",
                    )}
                  >
                    {day}
                  </div>
                );
              })}
            </div>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2.5">
              <Loader2 className="size-5 animate-spin text-primary" />
              <p className="text-xs text-muted-foreground font-medium">
                Loading schedule events...
              </p>
            </div>
          ) : error ? (
            <p className="text-xs text-destructive text-center py-4 font-medium">
              Failed to load schedule.
            </p>
          ) : (
            <>
              {/* Today's Schedule */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-emerald-500" />
                    Today &bull; {format(today, "EEEE, MMM d")}
                  </span>
                  <Badge variant="outline" className="text-[10px] font-medium border-border/60">
                    {todayEvents.length} Event{todayEvents.length === 1 ? "" : "s"}
                  </Badge>
                </div>

                {todayEvents.length > 0 ? (
                  <div className="space-y-2">
                    {todayEvents.map((event) => (
                      <Card key={event.id} className="p-3 rounded-xl border border-border/60 bg-card shadow-xs">
                        <div className="flex gap-2.5 items-start">
                          <div className="mt-0.5 shrink-0">{getIcon(event.type)}</div>
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-xs text-foreground truncate">
                              {event.title}
                            </div>
                            <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-0.5 font-medium">
                              <Clock className="size-3 text-muted-foreground/70" />{" "}
                              {format(parseISO(event.start_at), "HH:mm")} &bull;{" "}
                              {event.duration_minutes} min
                            </div>
                            <div className="text-[10px] text-muted-foreground font-medium truncate mt-0.5">
                              {event.course_code} {event.course_name}
                            </div>
                          </div>
                          <Badge
                            variant="secondary"
                            className="text-[9px] font-semibold uppercase px-1.5 py-0.5 shrink-0"
                          >
                            {event.type}
                          </Badge>
                        </div>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground py-3 text-center border rounded-xl border-dashed border-border/40 font-medium">
                    No events scheduled for today.
                  </p>
                )}
              </div>

              {/* Upcoming Activities */}
              <div className="space-y-2.5 pt-1">
                <div className="font-semibold text-xs text-foreground">
                  Upcoming Activities
                </div>
                {upcomingEvents.length > 0 ? (
                  <div className="space-y-2">
                    {upcomingEvents.map((event) => (
                      <Card key={event.id} className="p-3 rounded-xl border border-border/60 bg-card shadow-xs">
                        <div className="flex gap-2.5 items-start">
                          <div className="mt-0.5 shrink-0">{getIcon(event.type)}</div>
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-xs text-foreground truncate">
                              {event.title}
                            </div>
                            <div className="text-[11px] text-muted-foreground mt-0.5 font-medium">
                              {format(parseISO(event.start_at), "MMM d")} &bull;{" "}
                              {format(parseISO(event.start_at), "HH:mm")}
                            </div>
                            <div className="text-[10px] text-muted-foreground truncate font-medium mt-0.5">
                              {event.course_code} {event.course_name}
                            </div>
                          </div>
                          <Badge
                            variant="outline"
                            className="text-[9px] font-semibold uppercase px-1.5 py-0.5 shrink-0 border-border/60"
                          >
                            {event.type}
                          </Badge>
                        </div>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-3 font-medium">
                    No upcoming activities.
                  </p>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-2 text-xs font-semibold h-8 rounded-lg border-border/60 shadow-none hover:bg-primary hover:text-primary-foreground transition-colors"
                  asChild
                >
                  <Link href="/student/schedule">View Full Schedule &rarr;</Link>
                </Button>
              </div>
            </>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
