// components/mindexa/dashboard/ai-study-entry.tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Brain, ArrowRight } from "lucide-react"

export function AiStudyEntry() {
  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="size-5 text-primary" />
          Study Support AI
        </CardTitle>
        <CardDescription>
          Get personalized revision guidance, concept explanations, and learning gap analysis.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button className="w-full" size="lg">
          Open AI Study Assistant
          <ArrowRight className="ml-2 size-4" />
        </Button>
        <p className="text-xs text-center text-muted-foreground mt-3">
          Available for revision & homework only
        </p>
      </CardContent>
    </Card>
  )
}