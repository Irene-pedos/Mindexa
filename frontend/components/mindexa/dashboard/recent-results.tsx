// components/mindexa/dashboard/recent-results.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StudentRecentResult } from "@/lib/api/student";
import Link from "next/link";

export function RecentResults({ results }: { results: StudentRecentResult[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Results & Feedback</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {results.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No results available yet.
          </p>
        ) : (
          results.map((res, i) => (
            <div
              key={i}
              className="flex justify-between items-center py-2 border-b last:border-0"
            >
              <div>
                <div className="font-medium text-sm">
                  {res.assessment_title}
                </div>
                <div className="text-xs text-muted-foreground">
                  {new Date(res.released_at).toLocaleDateString()}
                </div>
              </div>
              <div className="text-right">
                <div className="font-semibold tabular-nums text-emerald-600">
                  {res.percentage}%
                </div>
                <Badge variant="secondary" className="text-xs">
                  {res.letter_grade || "Released"}
                </Badge>
              </div>
            </div>
          ))
        )}
        <Button variant="ghost" size="sm" asChild className="w-full">
          <Link href="/student/results">View All Results</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
