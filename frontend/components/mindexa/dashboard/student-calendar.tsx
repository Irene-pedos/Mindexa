// components/mindexa/dashboard/student-calendar.tsx
"use client"

import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Calendar as CalendarIcon, Clock, ChevronRight } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { StudentScheduleEvent } from "@/lib/api/student"
import { format, isToday, isAfter, startOfDay } from "date-fns"
import Link from "next/link"
import { cn } from "@/lib/utils"

interface StudentCalendarProps {
  events?: StudentScheduleEvent[]
}

export function StudentCalendar({ events = [] }: StudentCalendarProps) {
  const today = startOfDay(new Date())

  const filteredEvents = events.filter(event => {
    const eventDate = new Date(event.start_at)
    return isToday(eventDate) || isAfter(eventDate, today)
  })

  const groupedEvents = filteredEvents.reduce((acc: Record<string, StudentScheduleEvent[]>, event) => {
    const date = new Date(event.start_at)
    const dayKey = isToday(date) ? "Today" : format(date, "MMM d")
    if (!acc[dayKey]) acc[dayKey] = []
    acc[dayKey].push(event)
    return acc
  }, {})

  const scheduleDays = Object.entries(groupedEvents).slice(0, 3)

  const getTypeBadgeVariant = (type: string): "destructive" | "secondary" | "outline" => {
    const t = type.toUpperCase()
    if (t === "CAT" || t === "SUMMATIVE" || t === "EXAM") return "destructive"
    if (t === "STUDY_SESSION" || t === "FORMATIVE") return "secondary"
    return "outline"
  }

  return (
    <Card className="border border-border/50 shadow-none rounded-xl">
      <CardHeader className="px-4 py-3 border-b border-border/40 flex flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-2">
          <CalendarIcon className="size-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-foreground">Academic Schedule</span>
        </div>
        <Button variant="ghost" size="sm" className="h-6 text-[11px] px-2 text-muted-foreground hover:text-foreground gap-1" asChild>
          <Link href="/student/schedule">
            Full calendar <ChevronRight className="size-3" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="p-4">
        {scheduleDays.length > 0 ? (
          <div className="space-y-4">
            {scheduleDays.map(([day, dayEvents], idx) => (
              <div key={idx} className="space-y-2">
                <div className={cn(
                  "text-[10px] font-bold uppercase tracking-wider",
                  day === "Today" ? "text-primary" : "text-muted-foreground"
                )}>
                  {day}
                </div>
                <div className="space-y-1.5">
                  {dayEvents.map((event, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 p-2.5 rounded-lg border border-border/40 bg-muted/20 hover:bg-muted/40 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{event.title}</p>
                        <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Clock className="size-3 shrink-0" />
                          {format(new Date(event.start_at), "HH:mm")}
                          {event.duration_minutes && (
                            <span className="opacity-60">· {event.duration_minutes}m</span>
                          )}
                        </p>
                      </div>
                      <Badge variant={getTypeBadgeVariant(event.type)} className="text-[9px] uppercase shrink-0 px-1.5">
                        {event.type.replace("_", " ")}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center space-y-1">
            <CalendarIcon className="mx-auto size-6 text-muted-foreground/20" />
            <p className="text-xs text-muted-foreground">No upcoming events.</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}