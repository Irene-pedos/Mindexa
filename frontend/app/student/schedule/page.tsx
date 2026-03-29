// app/student/schedule/page.tsx
"use client"

import React, { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { 
  Calendar as CalendarIcon, 
  Clock, 
  AlertCircle 
} from "lucide-react"
import { format, startOfMonth, endOfMonth, eachDayOfInterval } from "date-fns"
import { cn } from "@/lib/utils"

const today = new Date(2026, 2, 29) // March 29, 2026

const events = [
  {
    id: 1,
    title: "Mid-Semester CAT – Database Systems",
    type: "CAT",
    date: "2026-03-29",
    time: "09:00",
    duration: "90 min",
    className: "CS301 • Section A",
    mode: "Closed Book • Supervised • AI Blocked",
    color: "bg-red-500",
  },
  {
    id: 2,
    title: "Group Project Presentation",
    type: "Group Work",
    date: "2026-03-31",
    time: "14:00",
    duration: "30 min",
    className: "CS401 • Team Alpha",
    mode: "Open Book",
    color: "bg-amber-500",
  },
  {
    id: 3,
    title: "Formative Quiz – Algorithms",
    type: "Formative",
    date: "2026-04-02",
    time: "23:59",
    duration: "40 min",
    className: "CS201",
    mode: "AI Allowed",
    color: "bg-emerald-500",
  },
  {
    id: 4,
    title: "Reassessment Window Opens",
    type: "Reassessment",
    date: "2026-04-05",
    time: "00:00",
    duration: "7 days",
    className: "Multiple Subjects",
    mode: "Special",
    color: "bg-violet-500",
  },
]

export default function StudentSchedulePage() {
  const [selectedDate, setSelectedDate] = useState<string>(format(today, "yyyy-MM-dd"))

  const currentMonthStart = startOfMonth(today)
  const currentMonthEnd = endOfMonth(today)
  const daysInMonth = eachDayOfInterval({ start: currentMonthStart, end: currentMonthEnd })

  const getEventsForDate = (dateStr: string) => 
    events.filter(e => e.date === dateStr)

  const selectedEvents = getEventsForDate(selectedDate)
  const todayEvents = getEventsForDate(format(today, "yyyy-MM-dd"))

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Academic Schedule</h1>
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
                March – April 2026
              </span>
              <Badge variant="outline">Academic Year 2025/2026</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-0.2 text-center mb-6">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => (
                <div key={day} className="text-xs font-medium text-muted-foreground py-1">
                  {day}
                </div>
              ))}

              {daysInMonth.map((day, idx) => {
                const dateStr = format(day, "yyyy-MM-dd")
                const dayEvents = getEventsForDate(dateStr)
                const isToday = dateStr === format(today, "yyyy-MM-dd")
                const isSelected = dateStr === selectedDate

                return (
                  <button
                    key={idx}
                    onClick={() => setSelectedDate(dateStr)}
                    className={cn(
                      "flex flex-col items-center justify-center rounded-xl border transition-all hover:border-primary relative h-8 md:h-12 w-full",
                      isToday && "border-primary bg-primary/10 font-semibold",
                      isSelected && "border-violet-500 bg-violet-950/50 ring-1 ring-violet-500"
                    )}
                  >
                    <span className={cn("text-sm md:text-base", isToday && "text-primary")}>
                      {format(day, "d")}
                    </span>
                    {dayEvents.length > 0 && (
                      <div className="flex gap-1 mt-1">
                        {dayEvents.slice(0, 3).map((_, i) => (
                          <div key={i} className="w-1.5 h-1.5 rounded-full bg-primary" />
                        ))}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Selected Day Details */}
            <div className="pt-6 border-t">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-semibold text-lg">
                  {format(new Date(selectedDate), "EEEE, MMMM d, yyyy")}
                </h3>
                {selectedEvents.length === 0 && (
                  <p className="text-muted-foreground">No scheduled activities on this day</p>
                )}
              </div>

              {selectedEvents.length > 0 ? (
                <div className="space-y-5">
                  {selectedEvents.map(event => (
                    <div 
                      key={event.id} 
                      className="flex gap-6 border-l-4 border-primary pl-6 py-2 group"
                    >
                      <div className="flex-1">
                        <div className="font-medium text-base">{event.title}</div>
                        <div className="text-sm text-muted-foreground mt-1.5 flex items-center gap-4">
                          <span className="flex items-center gap-1">
                            <Clock className="size-4" /> {event.time} • {event.duration}
                          </span>
                          <span>{event.className}</span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-3">{event.mode}</div>
                      </div>
                      <div>
                        <Badge variant={event.type === "CAT" || event.type === "Summative" ? "default" : "secondary"}>
                          {event.type}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-16 text-muted-foreground">
                  No assessments, deadlines, or events scheduled for this day.
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
              <CardTitle className="text-lg">Today • {format(today, "EEEE, MMMM d")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-5xl font-semibold tabular-nums tracking-tight text-primary mb-1">29</div>
              <p className="text-muted-foreground">March 2026</p>

              <div className="mt-8 space-y-6">
                {todayEvents.length > 0 ? (
                  todayEvents.map(event => (
                    <div key={event.id} className="flex gap-4">
                      <div className="text-red-500 mt-1">
                        <AlertCircle className="size-5" />
                      </div>
                      <div>
                        <div className="font-medium">{event.title}</div>
                        <div className="text-sm text-muted-foreground mt-1">
                          {event.time} • {event.duration}
                        </div>
                        <div className="text-xs text-muted-foreground mt-2">{event.className}</div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-muted-foreground">No events scheduled for today</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Upcoming Deadlines */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Upcoming Deadlines</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 text-sm">
              {events.slice(0, 5).map((event, i) => (
                <div key={i} className="flex justify-between items-start">
                  <div className="pr-4">
                    <div className="font-medium line-clamp-2">{event.title}</div>
                    <div className="text-xs text-muted-foreground mt-1">{event.className}</div>
                  </div>
                  <Badge variant="outline" className="text-xs whitespace-nowrap shrink-0">
                    {format(new Date(event.date), "MMM d")}
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
  )
}