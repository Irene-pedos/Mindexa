// components/mindexa/dashboard/recent-results.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

const results = [
  { title: "Introduction to AI – Quiz 3", score: "92%", status: "Released", date: "Mar 20" },
  { title: "Database Design – CAT 1", score: "87%", status: "Released", date: "Mar 15" },
  { title: "Algorithms – Homework 4", score: "Pending Review", status: "Under Review", date: "Mar 22" },
]

export function RecentResults() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Results & Feedback</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {results.map((res, i) => (
          <div key={i} className="flex justify-between items-center py-2 border-b last:border-0">
            <div>
              <div className="font-medium text-sm">{res.title}</div>
              <div className="text-xs text-muted-foreground">{res.date}</div>
            </div>
            <div className="text-right">
              <div className="font-semibold tabular-nums">{res.score}</div>
              <Badge variant={res.status === "Released" ? "secondary" : "outline"} className="text-xs">
                {res.status}
              </Badge>
            </div>
          </div>
        ))}
        <Button variant="ghost" size="sm" className="w-full">View All Results</Button>
      </CardContent>
    </Card>
  )
}