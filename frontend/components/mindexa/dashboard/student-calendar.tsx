// components/mindexa/dashboard/student-calendar.tsx
"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Calendar as CalendarIcon, Clock } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

const schedule = [
  { day: "Today", events: [{ time: "09:00", title: "CAT – Database Systems", type: "exam" }] },
  { day: "Mar 31", events: [{ time: "14:00", title: "Group Presentation", type: "group" }] },
  { day: "Apr 2", events: [{ time: "23:59", title: "Algorithms Quiz", type: "formative" }] },
]

export function StudentCalendar() {
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
          {schedule.map((day, idx) => (
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
                  <Badge variant={event.type === "exam" ? "destructive" : "secondary"}>
                    {event.type}
                  </Badge>
                </div>
              ))}
            </div>
          ))}
        </div>
        <Button variant="outline" className="w-full mt-4">Open Full Calendar</Button>
      </CardContent>
    </Card>
  )
}