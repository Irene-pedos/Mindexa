// app/student/schedule/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarIcon, Clock, AlertCircle, Link as LinkIcon, ChevronRight, ChevronLeft, Database } from "lucide-react";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  addMonths,
  subMonths,
} from "date-fns";
import { cn } from "@/lib/utils";
import { studentApi, StudentScheduleEvent } from "@/lib/api/student";
import { Skeleton } from "@/components/ui/interfaces-skeleton";
import { Separator } from "@/components/ui/separator";
import Link from "next/link";

export default function StudentSchedulePage() {
  const [events, setEvents] = useState<StudentScheduleEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  const today = new Date();

  useEffect(() => {
    async function loadSchedule() {
      try {
        const data = await studentApi.getSchedule();
        setEvents(data.events);
      } catch (err) {
        console.error("Failed to load schedule", err);
      } finally {
        setLoading(false);
      }
    }
    loadSchedule();
  }, []);

  const currentMonthStart = startOfMonth(selectedDate);
  const currentMonthEnd = endOfMonth(selectedDate);
  const daysInMonth = eachDayOfInterval({
    start: currentMonthStart,
    end: currentMonthEnd,
  });

  const getEventsForDate = (date: Date) =>
    events.filter((e) => isSameDay(new Date(e.start_at), date));

  const selectedEvents = getEventsForDate(selectedDate);
  const todayEvents = getEventsForDate(today);

  if (loading) {
    return (
      <div className="space-y-6 w-full mx-auto animate-in fade-in duration-300">
        <div className="space-y-1">
            <Skeleton variant="title" className="h-8 w-48" />
            <Skeleton variant="title" className="h-4 w-72" />
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <div className="xl:col-span-5">
            <Skeleton variant="media" className="h-[500px] w-full" />
          </div>
          <div className="xl:col-span-7 space-y-6">
            <Skeleton variant="media" className="h-40 w-full" />
            <Skeleton variant="media" className="h-56 w-full" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 w-full mx-auto animate-in fade-in duration-300">
      <div className="space-y-0.5 border-b border-border/25 pb-3">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Academic Schedule
        </h1>
        <p className="text-xs text-muted-foreground font-medium">
          Registry for assessments, collaborative deadlines, and revision windows.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        {/* Interactive Calendar */}
        <Card className="xl:col-span-5 bg-card hover:border-primary/20 shadow-xs transition-all duration-200 rounded-xl border border-border/60 overflow-hidden">
          <CardHeader className="border-b border-border/40 bg-muted/10 py-3 px-4">
            <CardTitle className="flex items-center justify-between text-sm">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-lg"
                onClick={() => setSelectedDate(d => subMonths(d, 1))}
                aria-label="Previous month"
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span className="flex items-center gap-2 font-semibold text-xs text-foreground">
                <CalendarIcon className="size-4 text-primary" />
                {format(selectedDate, "MMMM yyyy")}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-lg"
                onClick={() => setSelectedDate(d => addMonths(d, 1))}
                aria-label="Next month"
              >
                <ChevronRight className="size-4" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-1 text-center mb-5">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                <div
                  key={day}
                  className="text-[10px] font-semibold uppercase text-muted-foreground py-1"
                >
                  {day}
                </div>
              ))}
              {/* Empty offset cells */}
              {Array.from({ length: startOfMonth(selectedDate).getDay() }).map((_, i) => (
                <div key={`offset-${i}`} />
              ))}
              {daysInMonth.map((day, idx) => {
                const dayEvents = getEventsForDate(day);
                const isToday = isSameDay(day, today);
                const isSelected = isSameDay(day, selectedDate);

                return (
                  <button
                    key={idx}
                    onClick={() => setSelectedDate(day)}
                    className={cn(
                      "flex flex-col items-center justify-center rounded-lg border transition-all h-9.5 w-full",
                      isToday && "border-primary bg-primary/5",
                      isSelected 
                        ? "border-primary bg-primary text-primary-foreground shadow-xs z-10 font-bold" 
                        : "bg-card/20 border-transparent hover:bg-card/50 hover:border-border/40 text-foreground"
                    )}
                  >
                    <span
                      className={cn(
                        "text-xs font-medium",
                        isToday && !isSelected && "text-primary font-bold",
                      )}
                    >
                      {format(day, "d")}
                    </span>
                    {dayEvents.length > 0 && (
                      <div className="flex gap-0.5 mt-0.5">
                        {dayEvents.slice(0, 2).map((_, i) => (
                          <div
                            key={i}
                            className={cn(
                                "size-1 rounded-full",
                                isSelected ? "bg-primary-foreground" : "bg-primary"
                            )}
                          />
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Selected Day Details */}
            <div className="pt-3 border-t border-dashed border-border/40">
              <h3 className="font-semibold text-xs text-foreground flex items-center gap-1.5 mb-3">
                 <ChevronRight className="size-3.5 text-primary" />
                 {format(selectedDate, "EEEE, MMM d")}
              </h3>

              {selectedEvents.length > 0 ? (
                <div className="space-y-2">
                  {selectedEvents.map((event) => (
                    <div
                      key={event.id}
                      className="flex gap-3 p-3 rounded-lg border border-border/40 bg-card/40 transition-all hover:bg-card/70"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-xs truncate">
                          {event.title}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5 font-medium uppercase flex items-center gap-1">
                          <Clock className="size-3" />{" "}
                          {format(new Date(event.start_at), "HH:mm")}
                        </div>
                      </div>
                      <Badge variant="outline" className={cn("h-4.5 text-[9px] font-semibold uppercase shrink-0", event.color_hint)}>{event.type}</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 bg-card/10 rounded-xl border border-dashed border-border/30 text-muted-foreground text-xs font-medium">
                  No records for this date.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="xl:col-span-7 space-y-5">
          {/* Today’s Agenda Card */}
          <Card className="bg-card/40 hover:bg-card/60 hover:border-primary/20 backdrop-blur-xs shadow-xs transition-all duration-200 rounded-xl border border-border/50 overflow-hidden">
            <CardHeader className="bg-primary/5 border-b border-border/30 py-3 px-4">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-primary flex items-center gap-2">
                Live Agenda
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5">
              <div className="flex items-center gap-4 mb-4">
                <div className="text-3xl font-semibold tabular-nums tracking-tight text-foreground">
                    {format(today, "d")}
                </div>
                <div className="space-y-0">
                    <div className="text-xs font-semibold text-foreground">{format(today, "MMMM yyyy")}</div>
                    <div className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">{format(today, "EEEE")}</div>
                </div>
              </div>

              <div className="space-y-2.5">
                {todayEvents.length > 0 ? (
                  todayEvents.map((event) => (
                    <div key={event.id} className="flex gap-3 p-3 rounded-lg border border-primary/15 bg-primary/5">
                      <div className="text-primary mt-0.5">
                        <AlertCircle className="size-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-xs text-foreground">{event.title}</div>
                        <div className="text-[10px] text-primary/80 font-medium mt-0.5 uppercase">
                          Starts at {format(new Date(event.start_at), "HH:mm")}
                        </div>
                      </div>
                      <Badge variant="default" className="h-4.5 text-[8px] font-semibold uppercase tracking-tight shrink-0">Immediate</Badge>
                    </div>
                  ))
                ) : (
                  <div className="p-5 text-center bg-card/10 rounded-xl border border-dashed border-border/30">
                    <p className="text-xs text-muted-foreground font-medium">
                        No critical tasks scheduled for today.
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Upcoming Deadlines */}
          <Card className="bg-card/40 hover:bg-card/60 hover:border-primary/20 backdrop-blur-xs shadow-xs transition-all duration-200 rounded-xl border border-border/50 overflow-hidden">
            <CardHeader className="border-b border-border/30 py-3 px-4">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                Sequential Activities
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="space-y-2">
              {events
                .filter((e) => new Date(e.start_at) >= today)
                .slice(0, 5)
                .map((event, i) => (
                  <div key={i} className="flex justify-between items-center p-2.5 rounded-lg hover:bg-card/60 bg-card/20 transition-colors border border-border/30">
                    <div className="flex-1 min-w-0 pr-3">
                      <div className="font-semibold text-xs truncate text-foreground">
                        {event.title}
                      </div>
                      <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-tight">
                        {event.type}
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className="text-[9px] font-semibold uppercase whitespace-nowrap shrink-0 border-primary/20 bg-primary/5 text-primary h-5 px-2"
                    >
                      {format(new Date(event.start_at), "MMM d")}
                    </Badge>
                  </div>
                ))}
              </div>

              <div className="pt-3 mt-3 border-t border-border/40">
                <Button variant="outline" size="sm" className="w-full h-8.5 font-semibold text-xs rounded-lg border-border/60 shadow-none hover:bg-muted transition-all" asChild>
                  <Link href="/student/assessments" className="flex items-center justify-between w-full px-1">
                    <span className="flex items-center gap-1.5">
                      <Database className="size-3.5 text-primary" />
                      View Assessments Registry
                    </span>
                    <ChevronRight className="size-3.5 text-muted-foreground" />
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
