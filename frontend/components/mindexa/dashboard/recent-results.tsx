// components/mindexa/dashboard/recent-results.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StudentRecentResult } from "@/lib/api/student";
import { getResultLifecycleSummary } from "@/lib/grading-architecture";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function RecentResults({ results }: { results: StudentRecentResult[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Results & Release Status</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {results.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No results available yet.
          </p>
        ) : (
          results.map((res, i) => (
            <Link
              key={i}
              href={`/student/results/${res.id}`}
              className="flex justify-between items-center py-2 border-b last:border-0 hover:bg-muted/50 px-2 -mx-2 rounded-lg transition-colors group"
            >
              <div>
                <div className="font-medium text-sm group-hover:text-primary transition-colors">
                  {res.assessment_title}
                </div>
                <div className="text-[10px] text-muted-foreground flex items-center gap-2">
                  <span>
                    {res.released_at
                      ? new Date(res.released_at).toLocaleDateString()
                      : "Pending release"}
                  </span>
                  {res.course_code && (
                    <span className="font-mono bg-muted px-1 py-0.5 rounded">
                      {res.course_code} {res.academic_year && `• ${res.academic_year}`}
                    </span>
                  )}
                </div>
                <div className={cn(
                  "text-[10px] mt-1 font-medium",
                  getResultLifecycleSummary(res as any).tone === 'destructive' ? "text-red-600 font-bold" : "text-muted-foreground"
                )}>
                  {getResultLifecycleSummary(res as any).label}
                </div>
              </div>
              <div className="text-right">
                <div className="font-semibold tabular-nums text-emerald-600">
                  {res.percentage}%
                </div>
                <Badge variant="secondary" className="text-[10px] h-4 font-bold px-1.5 uppercase">
                  {res.letter_grade || "N/A"}
                </Badge>
              </div>
            </Link>
          ))
        )}
        <Button variant="ghost" size="sm" asChild className="w-full">
          <Link href="/student/results">View All Results</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
