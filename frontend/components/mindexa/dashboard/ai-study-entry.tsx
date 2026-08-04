// components/mindexa/dashboard/ai-study-entry.tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ArrowRight } from "lucide-react"
import { SparklesIcon } from "@/components/ui/sparkles-icon"
import Link from "next/link"

export function AiStudyEntry() {
  return (
    <Card className="border-border/60 bg-card shadow-xs rounded-xl">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <SparklesIcon size={20} className="text-primary" />
          Study Support AI
        </CardTitle>
        <CardDescription className="text-xs">
          Get personalized revision guidance, concept explanations, and learning gap analysis.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-2">
        <Button asChild className="w-full h-8.5 text-xs font-semibold rounded-lg shadow-xs">
          <Link href="/student/study">
            Open AI Study Assistant
            <ArrowRight className="ml-1.5 size-3.5" />
          </Link>
        </Button>
        <p className="text-[11px] text-center text-muted-foreground mt-2.5 font-medium">
          Available for revision & homework support
        </p>
      </CardContent>
    </Card>
  )
}