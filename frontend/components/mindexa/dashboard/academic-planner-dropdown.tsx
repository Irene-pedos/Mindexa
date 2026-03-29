// components/mindexa/dashboard/academic-planner-dropdown.tsx
"use client"

import React, { useState } from "react"
import { Calendar as CalendarIcon, Clock, Users, BookOpen, Award, AlertCircle } from "lucide-react"
import { format } from "date-fns"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

const today = new Date(2026, 2, 29)

const scheduleItems = [
  {
    id: 1,
    title: "Mid-Semester CAT – Database Systems",
    type: "CAT",
    date: "2026-03-29",
    time: "09:00",
    duration: "90 min",
    className: "CS301 • Section A",
    mode: "Closed Book",
    icon: <AlertCircle className="size-4 text-red-500" />,
  },
  {
    id: 2,
    title: "Group Project Submission",
    type: "Group Work",
    date: "2026-03-31",
    time: "23:59",
    className: "CS401 • Team Alpha",
    mode: "Open Book",
    icon: <Users className="size-4 text-amber-500" />,
  },
  {
    id: 3,
    title: "Formative Quiz – Algorithms",
    type: "Formative",
    date: "2026-04-02",
    time: "23:59",
    className: "CS201",
    mode: "AI Allowed",
    icon: <BookOpen className="size-4 text-emerald-500" />,
  },
  {
    id: 4,
    title: "Reassessment Window Opens",
    type: "Reassessment",
    date: "2026-04-05",
    time: "00:00",
    className: "Multiple Subjects",
    mode: "Special",
    icon: <Award className="size-4 text-violet-500" />,
  },
]

export function AcademicPlannerDropdown() {
  const todayEvents = scheduleItems.filter((e) => e.date === "2026-03-29")
  const upcomingEvents = scheduleItems.filter((e) => e.date !== "2026-03-29").slice(0, 4)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-2">
          <CalendarIcon className="size-4" />
          Academic Planner
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
            <div className="text-sm font-medium text-muted-foreground mb-3">March 2026</div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs">
              {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                <div key={i} className="py-1 text-muted-foreground">{d}</div>
              ))}
              {Array.from({ length: 31 }).map((_, i) => {
                const day = i + 1
                const isToday = day === 29
                const hasEvent = [29, 31, 2, 5].includes(day)
                return (
                  <div
                    key={i}
                    className={cn(
                      "aspect-square flex items-center justify-center rounded-full text-sm",
                      isToday && "bg-primary text-primary-foreground font-semibold",
                      hasEvent && !isToday && "text-red-500 font-medium relative after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:size-1 after:rounded-full after:bg-red-500"
                    )}
                  >
                    {day}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Today's Schedule */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="font-semibold text-sm">Today • {format(today, "EEEE, MMMM d")}</div>
              <Badge variant="outline" className="text-xs">Mar 29</Badge>
            </div>

            {todayEvents.length > 0 ? (
              <div className="space-y-3">
                {todayEvents.map((event) => (
                  <Card key={event.id} className="p-4">
                    <div className="flex gap-3">
                      <div className="mt-0.5">{event.icon}</div>
                      <div className="flex-1">
                        <div className="font-medium text-sm">{event.title}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1">
                          <Clock className="size-3" /> {event.time} • {event.duration}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">{event.className}</div>
                      </div>
                      <Badge variant="secondary" className="self-start text-[10px]">{event.type}</Badge>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-4">No events scheduled today.</p>
            )}
          </div>

          {/* Upcoming Activities */}
          <div>
            <div className="font-semibold text-sm mb-4">Upcoming Activities</div>
            <div className="space-y-3">
              {upcomingEvents.map((event) => (
                <Card key={event.id} className="p-4">
                  <div className="flex gap-3">
                    <div className="mt-0.5">{event.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm line-clamp-1">{event.title}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {format(new Date(event.date), "MMM d")} • {event.time}
                      </div>
                      <div className="text-xs text-muted-foreground">{event.className}</div>
                    </div>
                    <Badge variant="outline" className="self-start text-[10px] whitespace-nowrap">
                      {event.type}
                    </Badge>
                  </div>
                </Card>
              ))}
            </div>
            <Button variant="ghost" className="w-full mt-4 text-sm" asChild>
              <a href="/student/schedule">View Full Schedule →</a>
            </Button>
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}