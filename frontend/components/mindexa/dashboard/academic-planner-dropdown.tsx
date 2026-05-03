// components/mindexa/dashboard/academic-planner-dropdown.tsx
"use client"

import React, { useEffect, useState } from "react"
import { Calendar as CalendarIcon, Clock, Users, BookOpen, Award, AlertCircle, Loader2 } from "lucide-react"
import { format, isToday as isDateToday, parseISO } from "date-fns"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { studentApi, StudentScheduleEvent } from "@/lib/api/student"

export function AcademicPlannerDropdown() {
  const [events, setEvents] = useState<StudentScheduleEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    async function loadSchedule() {
      try {
        const data = await studentApi.getSchedule()
        setEvents(data.events || [])
      } catch (err) {
        console.error("Failed to load schedule", err)
        setError(true)
      } finally {
        setLoading(false)
      }
    }
    loadSchedule()
  }, [])

  const today = new Date()
  const todayEvents = events.filter((e) => isDateToday(parseISO(e.start_at)))
  const upcomingEvents = events.filter((e) => !isDateToday(parseISO(e.start_at))).slice(0, 4)

  const getIcon = (type: string) => {
    switch (type.toUpperCase()) {
      case "CAT": return <AlertCircle className="size-4 text-red-500" />
      case "SUMMATIVE": return <AlertCircle className="size-4 text-red-500" />
      case "FORMATIVE": return <BookOpen className="size-4 text-emerald-500" />
      case "REASSESSMENT": return <Award className="size-4 text-violet-500" />
      default: return <CalendarIcon className="size-4 text-muted-foreground" />
    }
  }

  // Days with events for the mini calendar
  const eventDays = events.map(e => parseISO(e.start_at).getDate())

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-2">
          <CalendarIcon className="size-4" />
          Academic Planner
          {todayEvents.length > 0 && (
            <span className="ml-1 flex h-2 w-2 rounded-full bg-red-500" />
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent 
        align="end" 
        className="w-80 p-0 overflow-hidden"
        sideOffset={8}
      >
        <div className="p-6 space-y-8 max-h-[520px] overflow-auto">
          {/* Mini Calendar */}
          <div>
            <div className="text-sm font-medium text-muted-foreground mb-3">{format(today, "MMMM yyyy")}</div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs">
              {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                <div key={i} className="py-1 text-muted-foreground">{d}</div>
              ))}
              {Array.from({ length: 31 }).map((_, i) => {
                const day = i + 1
                const isCurrentToday = day === today.getDate()
                const hasEvent = eventDays.includes(day)
                return (
                  <div
                    key={i}
                    className={cn(
                      "aspect-square flex items-center justify-center rounded-full text-sm",
                      isCurrentToday && "bg-primary text-primary-foreground font-semibold",
                      hasEvent && !isCurrentToday && "text-red-500 font-medium relative after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:size-1 after:rounded-full after:bg-red-500"
                    )}
                  >
                    {day}
                  </div>
                )
              })}
            </div>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Loading schedule...</p>
            </div>
          ) : error ? (
            <p className="text-sm text-destructive text-center py-4">Failed to load schedule.</p>
          ) : (
            <>
              {/* Today's Schedule */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="font-semibold text-sm">Today • {format(today, "EEEE, MMMM d")}</div>
                  <Badge variant="outline" className="text-xs">{format(today, "MMM d")}</Badge>
                </div>

                {todayEvents.length > 0 ? (
                  <div className="space-y-3">
                    {todayEvents.map((event) => (
                      <Card key={event.id} className="p-4">
                        <div className="flex gap-3">
                          <div className="mt-0.5">{getIcon(event.type)}</div>
                          <div className="flex-1">
                            <div className="font-medium text-sm">{event.title}</div>
                            <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1">
                              <Clock className="size-3" /> {format(parseISO(event.start_at), "HH:mm")} • {event.duration_minutes} min
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">{event.course_code} {event.course_name}</div>
                          </div>
                          <Badge variant="secondary" className="self-start text-[10px]">{event.type}</Badge>
                        </div>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-4 text-center border rounded-xl border-dashed">No events scheduled today.</p>
                )}
              </div>

              {/* Upcoming Activities */}
              <div>
                <div className="font-semibold text-sm mb-4">Upcoming Activities</div>
                {upcomingEvents.length > 0 ? (
                  <div className="space-y-3">
                    {upcomingEvents.map((event) => (
                      <Card key={event.id} className="p-4">
                        <div className="flex gap-3">
                          <div className="mt-0.5">{getIcon(event.type)}</div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm line-clamp-1">{event.title}</div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {format(parseISO(event.start_at), "MMM d")} • {format(parseISO(event.start_at), "HH:mm")}
                            </div>
                            <div className="text-xs text-muted-foreground line-clamp-1">{event.course_code} {event.course_name}</div>
                          </div>
                          <Badge variant="outline" className="self-start text-[10px] whitespace-nowrap">
                            {event.type}
                          </Badge>
                        </div>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">No upcoming activities.</p>
                )}
                <Button variant="ghost" className="w-full mt-4 text-sm" asChild>
                  <a href="/student/schedule">View Full Schedule →</a>
                </Button>
              </div>
            </>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}