// components/mindexa/dashboard/quick-actions.tsx
import { Button } from "@/components/ui/button"
import { Plus, Play, Calendar, Brain } from "lucide-react"
import Link from "next/link"

export function QuickActions() {
  return (
    <div className="flex flex-wrap gap-3">
      <Button asChild size="lg" className="font-medium">
        <Link href="/student/assessments">
          <Play className="mr-2 size-5" />
          Join Active Assessment
        </Link>
      </Button>

      <Button variant="outline" size="lg" asChild>
        <Link href="/student/schedule">
          <Calendar className="mr-2 size-5" />
          View Full Schedule
        </Link>
      </Button>

      <Button variant="outline" size="lg" asChild>
        <Link href="/student/study">
          <Brain className="mr-2 size-5" />
          Open Study Support
        </Link>
      </Button>

      <Button variant="outline" size="lg">
        <Plus className="mr-2 size-5" />
        Submit Homework
      </Button>
    </div>
  )
}