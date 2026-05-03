"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TrendingUp, Users, BookOpen, Shield, ArrowUpRight, ArrowDownRight, Activity } from "lucide-react";
import { adminApi, AdminAnalyticsResponse } from "@/lib/api/admin";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ChartBarMultiple } from "@/components/chart-bar-multiple";
import { ChartLineMultiple } from "@/components/chart-line-multiple";

export default function AdminAnalyticsPage() {
  const [data, setData] = useState<AdminAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadAnalytics() {
    try {
      const result = await adminApi.getAnalytics();
      setData(result);
    } catch (err) {
      console.error("Failed to load analytics", err);
      toast.error("Failed to load platform analytics");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAnalytics();
  }, []);

  const icons = [Users, Activity, BookOpen, Shield];

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Platform Analytics
          </h1>
          <p className="text-muted-foreground text-sm">
            Institution-wide usage, performance, and integrity insights
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          [1, 2, 3, 4].map(i => (
            <Card key={i} className="border shadow-none">
              <CardHeader className="flex flex-row items-center justify-between pb-1 h-10">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="size-3 rounded-full" />
              </CardHeader>
              <CardContent className="pb-3">
                <Skeleton className="h-6 w-12 mb-1" />
                <Skeleton className="h-2 w-24" />
              </CardContent>
            </Card>
          ))
        ) : data?.summary.map((metric, idx) => {
          const Icon = icons[idx] || Activity;
          return (
            <Card key={idx} className="border shadow-none hover:border-muted-foreground/20 transition-colors group">
              <CardHeader className="flex flex-row items-center justify-between pb-1 h-10">
                <CardTitle className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground group-hover:text-primary transition-colors">
                  {metric.label}
                </CardTitle>
                <Icon className="size-3 text-muted-foreground" />
              </CardHeader>
              <CardContent className="pb-3">
                <div className="text-2xl font-bold tracking-tight">{metric.value}</div>
                {metric.trend && (
                  <p className={cn(
                    "text-[10px] mt-0.5 flex items-center gap-0.5 font-semibold",
                    metric.trend_direction === "up" ? "text-emerald-600" : "text-red-600"
                  )}>
                    {metric.trend_direction === "up" ? <ArrowUpRight className="size-2.5" /> : <ArrowDownRight className="size-2.5" />}
                    {metric.trend}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card className="border shadow-none overflow-hidden">
          <CardHeader className="pb-4 border-b">
            <CardTitle className="text-sm">Assessment Activity</CardTitle>
            <CardDescription className="text-xs">Monthly distribution of conducted assessments</CardDescription>
          </CardHeader>
          <CardContent className="pt-4 px-2">
            <ChartBarMultiple />
          </CardContent>
        </Card>

        <Card className="border shadow-none overflow-hidden">
          <CardHeader className="pb-4 border-b">
            <CardTitle className="text-sm">System Load & Integrity</CardTitle>
            <CardDescription className="text-xs">User traffic vs recorded integrity events</CardDescription>
          </CardHeader>
          <CardContent className="pt-4 px-2">
            <ChartLineMultiple />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2 border shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Shield className="size-4 text-muted-foreground" /> Integrity Hotspots
            </CardTitle>
            <CardDescription className="text-xs">Courses with highest recorded integrity flags</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {loading ? (
                [1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full rounded-lg" />)
              ) : data?.integrity_hotspots.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-muted-foreground w-4">{idx + 1}.</span>
                    <span className="text-xs font-medium">{item.course}</span>
                  </div>
                  <div className="flex items-center gap-4 flex-1 max-w-[160px] px-4">
                    <div className="h-1.5 flex-1 bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-primary/60" 
                        style={{ width: `${(item.flags / (data.integrity_hotspots[0]?.flags || 1)) * 100}%` }} 
                      />
                    </div>
                  </div>
                  <Badge variant="outline" className="rounded-md px-2 py-0 h-5 text-[10px] font-bold">{item.flags} Flags</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-none bg-muted/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Key Insights</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              [1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full rounded-lg" />)
            ) : data?.key_insights.map((insight, idx) => (
              <div key={idx} className="p-3 rounded-xl bg-white border text-xs font-medium flex gap-2.5 items-start">
                <div className="size-1.5 rounded-full bg-primary mt-1 shrink-0" />
                {insight}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
