"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Users, BookOpen, Shield, ArrowUpRight, ArrowDownRight, Activity } from "lucide-react";
import { adminApi, AdminAnalyticsResponse } from "@/lib/api/admin";
import { Skeleton } from "@/components/ui/skeleton";
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
      setLoading(true);
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
      color: "#3b82f6",
    },
    violations: {
      label: "Security Flags",
      color: "#f43f5e",
    },
  } satisfies ChartConfig;

  return (
    <div className="space-y-3.5 max-w-7xl mx-auto">
      {/* Page Header: Compact */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-1">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
            Platform Analytics
          </h1>
          <p className="text-xs text-muted-foreground">
            Institution-wide performance, assessment throughput, and security telemetry.
          </p>
        </div>
      </div>

      {/* Top Metric Cards: 2 cols on mobile, 4 on desktop, compact padding */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
        {loading ? (
          [1, 2, 3, 4].map((i) => (
            <Card key={i} className="border border-border/50 shadow-none rounded-xl bg-card p-3 sm:p-3.5">
              <div className="flex items-center justify-between">
                <div className="space-y-1.5 flex-1">
                  <Skeleton className="h-2.5 w-16" />
                  <Skeleton className="h-6 w-12" />
                </div>
                <Skeleton className="size-8 rounded-lg shrink-0" />
              </div>
            </Card>
          ))
        ) : (
          data?.summary.map((metric, idx) => {
            const Icon = icons[idx] || Activity;
            const pills = [
              "bg-primary/10 text-primary",
              "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
              "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
              "bg-rose-500/10 text-rose-600 dark:text-rose-400",
            ];
            const pill = pills[idx % pills.length];

            return (
              <Card
                key={idx}
                className="border border-border/50 shadow-none rounded-xl bg-card overflow-hidden p-3 sm:p-3.5 transition-colors hover:border-primary/30"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5 min-w-0">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider truncate">
                      {metric.label}
                    </p>
                    <div className="text-lg sm:text-xl font-bold tracking-tight text-foreground">
                      {metric.value}
                    </div>
                    {metric.trend && (
                      <p
                        className={cn(
                          "text-[10px] flex items-center gap-0.5 font-medium pt-0.5",
                          metric.trend_direction === "up"
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-rose-600 dark:text-rose-400"
                        )}
                      >
                        {metric.trend_direction === "up" ? (
                          <ArrowUpRight className="size-3 shrink-0" />
                        ) : (
                          <ArrowDownRight className="size-3 shrink-0" />
                        )}
                        <span>{metric.trend}</span>
                      </p>
                    )}
                  </div>
                  <div className={cn("size-8 rounded-lg flex items-center justify-center shrink-0", pill)}>
                    <Icon className="size-4" />
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>

      {/* Main Charts: 1 col on mobile/tablet, 2 on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-3.5">
        <Card className="border border-border/50 shadow-none rounded-xl bg-card p-3 sm:p-3.5 overflow-hidden">
          {loading ? (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-24" />
              </div>
              <Skeleton className="h-[200px] w-full rounded-lg" />
            </div>
          ) : (
            <ChartBarMultiple
              data={data?.activity_data || []}
              config={chartConfig}
              title="Assessment Activity"
              description="Monthly distribution of conducted assessments"
            />
          )}
        </Card>

        <Card className="border border-border/50 shadow-none rounded-xl bg-card p-3 sm:p-3.5 overflow-hidden">
          {loading ? (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-24" />
              </div>
              <Skeleton className="h-[200px] w-full rounded-lg" />
            </div>
          ) : (
            <ChartLineMultiple
              data={data?.activity_data || []}
              config={chartConfig}
              title="System Load & Integrity"
              description="Assessment volume vs recorded integrity events"
            />
          )}
        </Card>
      </div>

      {/* Lower Section: AI Grading Pipeline + Integrity Hotspots */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-3.5">
        {/* AI Grading Mode Pipeline */}
        <Card className="lg:col-span-2 border border-border/50 shadow-none rounded-xl bg-card p-3 sm:p-3.5">
          <div className="pb-2 border-b border-border/40">
            <h3 className="text-xs sm:text-sm font-semibold text-foreground">
              AI Grading Adoption
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Workload distribution across autonomous, hybrid co-pilot, and rubric grading
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:gap-2.5 pt-2.5">
            {loading ? (
              [1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-lg" />)
            ) : (
              (data as any)?.ai_grading_stats?.map((stat: any, idx: number) => {
                const totalCount =
                  (data as any)?.ai_grading_stats?.reduce(
                    (acc: number, curr: any) => acc + curr.count,
                    0
                  ) || 1;
                const percentage = Math.round((stat.count / totalCount) * 100);
                const themes = [
                  { pill: "bg-primary/10 text-primary", bar: "bg-primary" },
                  { pill: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400", bar: "bg-indigo-500" },
                  { pill: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", bar: "bg-emerald-500" },
                ];
                const theme = themes[idx % themes.length];

                return (
                  <div
                    key={idx}
                    className="p-2.5 sm:p-3 rounded-lg bg-muted/20 border border-border/40 flex flex-col justify-between space-y-2"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground truncate">
                        {stat.mode.replace(/_/g, " ")}
                      </span>
                      <span className={cn("text-[10px] font-semibold px-1.5 py-0.2 rounded shrink-0", theme.pill)}>
                        {percentage}%
                      </span>
                    </div>
                    <div className="space-y-1">
                      <div className="text-lg sm:text-xl font-bold tracking-tight text-foreground">
                        {stat.count}
                      </div>
                      <div className="w-full bg-muted/40 h-1.5 rounded-full overflow-hidden">
                        <div
                          className={cn("h-full rounded-full transition-all duration-300", theme.bar)}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>

        {/* Integrity Hotspots */}
        <Card className="border border-border/50 shadow-none rounded-xl bg-card p-3 sm:p-3.5 flex flex-col justify-between">
          <div className="pb-2 border-b border-border/40">
            <h3 className="text-xs sm:text-sm font-semibold text-foreground">
              Integrity Hotspots
            </h3>
            <p className="text-[11px] text-muted-foreground">Courses with highest flagged incidents</p>
          </div>

          <div className="space-y-2 pt-2.5 flex-1">
            {loading ? (
              [1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-7 w-full rounded-md" />)
            ) : data?.integrity_hotspots?.length === 0 ? (
              <p className="text-[11px] text-muted-foreground italic text-center py-4">No flags recorded</p>
            ) : (
              data?.integrity_hotspots.slice(0, 5).map((item, idx) => {
                const maxFlags = Math.max(...(data?.integrity_hotspots?.map((h) => h.flags) || [1]), 1);
                const ratio = Math.min(100, Math.round((item.flags / maxFlags) * 100));

                return (
                  <div key={idx} className="space-y-0.5">
                    <div className="flex items-center justify-between text-xs font-medium">
                      <span className="truncate max-w-[130px] text-foreground text-[11px]">{item.course}</span>
                      <span className="font-mono text-rose-600 dark:text-rose-400 font-semibold text-[11px]">
                        {item.flags}
                      </span>
                    </div>
                    <div className="w-full bg-muted/40 h-1 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-rose-500 rounded-full transition-all duration-300"
                        style={{ width: `${ratio}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>
      </div>

      {/* Key Insights: Compact & Clean without icon clutter */}
      <Card className="border border-border/50 shadow-none rounded-xl bg-card p-3 sm:p-3.5">
        <div className="pb-2 border-b border-border/40">
          <h3 className="text-xs sm:text-sm font-semibold text-foreground">Key Observations</h3>
          <p className="text-[11px] text-muted-foreground">Automated semester observations</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 sm:gap-2.5 pt-2.5">
          {loading ? (
            [1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)
          ) : (
            data?.key_insights.map((insight, idx) => (
              <div
                key={idx}
                className="p-2.5 sm:p-3 rounded-lg bg-muted/20 border border-border/40 text-[11px] text-foreground/90 font-medium leading-relaxed flex gap-2 items-start"
              >
                <span className="size-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                <span>{insight}</span>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
