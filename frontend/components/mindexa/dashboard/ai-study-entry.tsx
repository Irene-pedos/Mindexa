// components/mindexa/dashboard/ai-study-entry.tsx
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ArrowRight, Sparkles } from "lucide-react"
import Link from "next/link"

export function AiStudyEntry() {
  return (
    <Card className="border border-border/50 bg-card shadow-none rounded-xl">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Sparkles className="size-4 text-primary" />
          </div>
          <div className="space-y-0.5 min-w-0">
            <p className="text-xs font-semibold text-foreground">Study Support AI</p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Personalized revision guidance, concept explanations, and learning gap analysis.
            </p>
          </div>
        </div>
        <Button asChild size="sm" variant="outline" className="w-full h-8 text-xs gap-1.5 border-border/60">
          <Link href="/student/study">
            Open AI Study Assistant
            <ArrowRight className="size-3.5" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}