// components/mindexa/dashboard/quick-actions.tsx
import { Button } from "@/components/ui/button"
import { Play, Calendar, Brain, Plus } from "lucide-react"
import Link from "next/link"

export function QuickActions() {
  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild size="sm" className="h-8 text-xs gap-1.5">
        <Link href="/student/assessments">
          <Play className="size-3.5" />
          Join Assessment
        </Link>
      </Button>

      <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 border-border/60" asChild>
        <Link href="/student/schedule">
          <Calendar className="size-3.5" />
          Full Schedule
        </Link>
      </Button>

      <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 border-border/60" asChild>
        <Link href="/student/study">
          <Brain className="size-3.5" />
          Study Support
        </Link>
      </Button>

      <Button variant="ghost" size="sm" className="h-8 text-xs gap-1.5 text-muted-foreground hover:text-foreground">
        <Plus className="size-3.5" />
        Submit Homework
      </Button>
    </div>
  )
}