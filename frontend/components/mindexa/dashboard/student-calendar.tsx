// components/mindexa/dashboard/student-calendar.tsx
"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Calendar as CalendarIcon, Clock } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

import { StudentScheduleEvent } from "@/lib/api/student"
import { format, isToday } from "date-fns"

interface StudentCalendarProps {
  events?: StudentScheduleEvent[]
}

export function StudentCalendar({ events = [] }: StudentCalendarProps) {
  // Group events by day
  const groupedEvents = events.reduce((acc: Record<string, StudentScheduleEvent[]>, event) => {
    const date = new Date(event.start_at)
    const dayKey = isToday(date) ? "Today" : format(date, "MMM dd")
    if (!acc[dayKey]) acc[dayKey] = []
    acc[dayKey].push(event)
    return acc
  }, {})

  const scheduleDays = Object.entries(groupedEvents).map(([day, events]) => ({
    day,
    events: events.map(e => ({
      time: format(new Date(e.start_at), "HH:mm"),
      title: e.title,
      type: e.type.toLowerCase(),
    }))
  }))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarIcon className="size-5" />
          Academic Schedule
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {scheduleDays.length > 0 ? (
            scheduleDays.map((day, idx) => (
              <div key={idx}>
                <div className="font-medium text-sm text-muted-foreground mb-3">{day.day}</div>
                {day.events.map((event, i) => (
                  <div key={i} className="flex items-center gap-4 pl-4 border-l-2 border-primary mb-4 last:mb-0">
                    <div className="flex-1">
                      <div className="font-medium">{event.title}</div>
                      <div className="text-sm text-muted-foreground flex items-center gap-1">
                        <Clock className="size-4" /> {event.time}
                      </div>
                    </div>
                    <Badge variant={event.type === "exam" || event.type === "cat" ? "destructive" : "secondary"}>
                      {event.type}
                    </Badge>
                  </div>
                ))}
              </div>
            ))
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No upcoming events in your schedule.
            </div>
          )}
        </div>
        <Button variant="outline" className="w-full mt-4">Open Full Calendar</Button>
      </CardContent>
    </Card>
  )
}