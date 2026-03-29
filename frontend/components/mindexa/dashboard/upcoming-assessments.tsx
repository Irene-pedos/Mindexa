// components/mindexa/dashboard/upcoming-assessments.tsx
"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Calendar, Clock } from "lucide-react"
import Link from "next/link"

const upcoming = [
  {
    id: "db-cat-301",
    title: "Mid-Semester CAT – Database Systems",
    type: "CAT",
    date: "Tomorrow, 09:00",
    duration: "90 min",
    mode: "Closed Book • Supervised • AI Blocked",
    class: "CS301 • Section A",
  },
  {
    id: "algo-quiz-201",
    title: "Formative Quiz – Algorithms",
    type: "Formative",
    date: "Apr 2, 23:59",
    duration: "40 min",
    mode: "AI Allowed",
    class: "CS201",
  },
  {
    id: "group-project-401",
    title: "Group Project Presentation",
    type: "Group Work",
    date: "Mar 31, 14:00",
    duration: "30 min",
    mode: "Open Book",
    class: "CS401 • Team Alpha",
  },
]

export function UpcomingAssessments() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Upcoming Assessments</CardTitle>
            <CardDescription>Next 14 days</CardDescription>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/assessments">View all</Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {upcoming.map((item) => (
          <div 
            key={item.id} 
            className="flex items-start justify-between rounded-lg border p-4 hover:bg-muted/50 transition-colors group"
          >
            <div className="space-y-1 pr-4">
              <div className="font-medium leading-tight">{item.title}</div>
              <div className="text-sm text-muted-foreground flex items-center gap-4">
                <span className="flex items-center gap-1">
                  <Calendar className="size-4" /> {item.date}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="size-4" /> {item.duration}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">{item.class}</div>
            </div>

            <div className="flex flex-col items-end gap-3">
              <Badge variant={item.type === "CAT" ? "default" : item.type === "Formative" ? "secondary" : "outline"}>
                {item.type}
              </Badge>
              
              <Button 
                size="sm" 
                asChild
                className="group-hover:bg-primary group-hover:text-primary-foreground transition-colors"
              >
                <Link href={`/student/assessments/${item.id}/take`}>
                  Start Assessment
                </Link>
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}