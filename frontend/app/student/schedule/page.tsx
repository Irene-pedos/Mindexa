// app/student/schedule/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarIcon, Clock, AlertCircle } from "lucide-react";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
} from "date-fns";
import { cn } from "@/lib/utils";
import { studentApi, StudentScheduleEvent } from "@/lib/api/student";
import { Skeleton } from "@/components/ui/skeleton";

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
      <div className="space-y-8">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
          <Skeleton className="xl:col-span-5 h-[600px] w-full" />
          <div className="xl:col-span-7 space-y-6">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          Academic Schedule
        </h1>
        <p className="text-muted-foreground mt-1">
          All upcoming assessments, deadlines, group work, and review windows
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
        {/* Interactive Calendar */}
        <Card className="xl:col-span-5">
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-lg">
              <span className="flex items-center gap-3">
                <CalendarIcon className="size-5" />
                {format(selectedDate, "MMMM yyyy")}
              </span>
              <Badge variant="outline">Academic Year 2025/2026</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-1 text-center mb-6">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                <div
                  key={day}
                  className="text-xs font-medium text-muted-foreground py-1"
                >
                  {day}
                </div>
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
                      "flex flex-col items-center justify-center rounded-xl border transition-all hover:border-primary relative h-5 md:h-12 w-full",
                      isToday && "border-primary bg-primary/10 font-semibold",
                      isSelected &&
                        "border-violet-300 bg-violet-350/50 ring-1 ring-violet-400",
                    )}
                  >
                    <span
                      className={cn(
                        "text-sm md:text-base",
                        isToday && "text-primary",
                      )}
                    >
                      {format(day, "d")}
                    </span>
                    {dayEvents.length > 0 && (
                      <div className="flex gap-1 mt-1">
                        {dayEvents.slice(0, 3).map((_, i) => (
                          <div
                            key={i}
                            className="w-1 h-1 rounded-full bg-primary"
                          />
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Selected Day Details */}
            <div className="pt-6 border-t">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-semibold text-lg">
                  {format(selectedDate, "EEEE, MMMM d, yyyy")}
                </h3>
              </div>

              {selectedEvents.length > 0 ? (
                <div className="space-y-5">
                  {selectedEvents.map((event) => (
                    <div
                      key={event.id}
                      className="flex gap-6 border-l-4 border-primary pl-6 py-2 group"
                    >
                      <div className="flex-1">
                        <div className="font-medium text-base">
                          {event.title}
                        </div>
                        <div className="text-sm text-muted-foreground mt-1.5 flex items-center gap-4">
                          <span className="flex items-center gap-1">
                            <Clock className="size-4" />{" "}
                            {format(new Date(event.start_at), "HH:mm")}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-3">
                          {event.description}
                        </div>
                      </div>
                      <div>
                        <Badge className={event.color_hint}>{event.type}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-16 text-muted-foreground">
                  No activities scheduled for this day.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Sidebar – Today + Upcoming */}
        <div className="xl:col-span-7 space-y-6">
          {/* Today’s Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                Today • {format(today, "EEEE, MMMM d")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-5xl font-semibold tabular-nums tracking-tight text-primary mb-1">
                {format(today, "d")}
              </div>
              <p className="text-muted-foreground">
                {format(today, "MMMM yyyy")}
              </p>

              <div className="mt-8 space-y-6">
                {todayEvents.length > 0 ? (
                  todayEvents.map((event) => (
                    <div key={event.id} className="flex gap-4">
                      <div className="text-red-500 mt-1">
                        <AlertCircle className="size-5" />
                      </div>
                      <div>
                        <div className="font-medium">{event.title}</div>
                        <div className="text-sm text-muted-foreground mt-1">
                          {format(new Date(event.start_at), "HH:mm")}
                        </div>
                        <div className="text-xs text-muted-foreground mt-2">
                          {event.description}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-muted-foreground">
                    No events scheduled for today
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Upcoming Deadlines */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Upcoming Activities</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 text-sm">
              {events
                .filter((e) => new Date(e.start_at) >= today)
                .slice(0, 5)
                .map((event, i) => (
                  <div key={i} className="flex justify-between items-start">
                    <div className="pr-4">
                      <div className="font-medium line-clamp-2">
                        {event.title}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {event.description}
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className="text-xs whitespace-nowrap shrink-0"
                    >
                      {format(new Date(event.start_at), "MMM d")}
                    </Badge>
                  </div>
                ))}
            </CardContent>
          </Card>

          <Button size="lg" className="w-full" asChild>
            <a href="/student/assessments">Browse All Assessments</a>
          </Button>
        </div>
      </div>
    </div>
  );
}
