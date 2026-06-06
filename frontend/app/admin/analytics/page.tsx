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
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ChartBarMultiple } from "@/components/chart-bar-multiple";
import { ChartLineMultiple } from "@/components/chart-line-multiple";
import { type ChartConfig } from "@/components/ui/chart";

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

  const chartConfig = {
    assessments: {
      label: "Assessments",
      color: "hsl(var(--chart-1))",
    },
    violations: {
      label: "Violations",
      color: "hsl(var(--chart-2))",
    },
  } satisfies ChartConfig;

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
          <CardContent className="pt-6">
            {loading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : (
              <ChartBarMultiple 
                data={data?.activity_data || []} 
                config={chartConfig}
                title="Assessment Activity"
                description="Monthly distribution of conducted assessments"
              />
            )}
          </CardContent>
        </Card>

        <Card className="border shadow-none overflow-hidden">
          <CardContent className="pt-6">
            {loading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : (
              <ChartLineMultiple 
                data={data?.activity_data || []} 
                config={chartConfig}
                title="System Load & Integrity"
                description="Assessment volume vs recorded integrity events"
              />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2 border shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="size-4 text-muted-foreground" /> AI Grading Adoption
            </CardTitle>
            <CardDescription className="text-xs">Distribution of assessments by AI grading mode</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {loading ? (
                [1, 2, 3].map(i => <Skeleton key={i} className="h-24 rounded-2xl border" />)
              ) : (data as any)?.ai_grading_stats?.map((stat: any, idx: number) => (
                <div key={idx} className="p-4 rounded-2xl bg-muted/30 border border-muted/50 flex flex-col justify-center items-center text-center gap-1">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{stat.mode.replace(/_/g, ' ')}</div>
                  <div className="text-2xl font-black">{stat.count}</div>
                  <div className="text-[9px] font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                    {Math.round((stat.count / ((data as any)?.ai_grading_stats?.reduce((acc: number, curr: any) => acc + curr.count, 0) || 1)) * 100)}% Usage
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Shield className="size-4 text-muted-foreground" /> Integrity Hotspots
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {loading ? (
                [1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full rounded-lg" />)
              ) : data?.integrity_hotspots.slice(0, 5).map((item, idx) => (
                <div key={idx} className="flex items-center justify-between">
                  <span className="text-xs font-medium truncate max-w-[120px]">{item.course}</span>
                  <Badge variant="outline" className="rounded-md px-2 py-0 h-5 text-[10px] font-bold">{item.flags} Flags</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border shadow-none bg-muted/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Key Insights</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
  );
}
