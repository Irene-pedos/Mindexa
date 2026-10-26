// components/mindexa/dashboard/performance-chart.tsx
"use client"

import * as React from "react"
import {
  Activity,
  TrendingUp,
  TrendingDown,
  Award,
  Users,
  Sparkles,
  Info,
} from "lucide-react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card"
import {
  ChartContainer,
  type ChartConfig,
} from "@/components/ui/chart"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export interface PerformanceTrendItem {
  month: string
  score: number
  average: number
}

interface PerformanceChartProps {
  data?: PerformanceTrendItem[]
  title?: string
  description?: string
  className?: string
}

const chartConfig = {
  score: {
    label: "Your Score",
    theme: {
      light: "#4f46e5", // Indigo 600
      dark: "#818cf8",  // Indigo 400
    },
  },
  average: {
    label: "Class Average",
    theme: {
      light: "#94a3b8", // Slate 400
      dark: "#475569",  // Slate 600
    },
  },
} satisfies ChartConfig

interface CustomTooltipProps {
  active?: boolean
  payload?: Array<{
    name?: string
    value?: number
    dataKey?: string
    color?: string
  }>
  label?: string
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || !payload.length) return null

  const scoreEntry = payload.find((p) => p.dataKey === "score")
  const avgEntry = payload.find((p) => p.dataKey === "average")

  const scoreVal = scoreEntry?.value ?? 0
  const avgVal = avgEntry?.value ?? 0
  const diff = scoreVal > 0 && avgVal > 0 ? Math.round((scoreVal - avgVal) * 10) / 10 : null

  return (
    <div className="rounded-xl border border-border/80 bg-popover/95 p-3 text-popover-foreground shadow-xl backdrop-blur-md text-xs min-w-[170px] space-y-2 animate-in fade-in-0 zoom-in-95 duration-150">
      <div className="flex items-center justify-between border-b border-border/50 pb-1.5 font-medium">
        <span className="font-semibold text-foreground">{label} Cycle</span>
        {diff !== null && (
          <span
            className={cn(
              "font-mono text-[10px] font-bold px-1.5 py-0.5 rounded-md",
              diff > 0
                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                : diff < 0
                ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                : "bg-muted text-muted-foreground"
            )}
          >
            {diff > 0 ? `+${diff}%` : `${diff}%`}
          </span>
        )}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-[#4f46e5] dark:bg-[#818cf8]" />
            <span className="text-muted-foreground text-[11px]">Your Score:</span>
          </div>
          <span className="font-semibold text-foreground tabular-nums">
            {scoreVal > 0 ? `${scoreVal}%` : "—"}
          </span>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-[#94a3b8] dark:bg-[#475569]" />
            <span className="text-muted-foreground text-[11px]">Class Average:</span>
          </div>
          <span className="font-medium text-muted-foreground tabular-nums">
            {avgVal > 0 ? `${avgVal}%` : "—"}
          </span>
        </div>
      </div>

      {diff !== null && (
        <div className="border-t border-border/40 pt-1.5 text-[10px] text-muted-foreground flex items-center justify-between">
          <span>Cohort Standing:</span>
          <span className="font-medium text-foreground">
            {diff > 0
              ? `${diff}% ahead`
              : diff < 0
              ? `${Math.abs(diff)}% behind`
              : "Exact average"}
          </span>
        </div>
      )}
    </div>
  )
}

export function PerformanceChart({
  data,
  title = "Academic Performance",
  description = "6-month assessment score trend vs. class average",
  className,
}: PerformanceChartProps) {
  const hasData = Boolean(
    data &&
    data.length > 0 &&
    data.some((d) => (d.score ?? 0) > 0 || (d.average ?? 0) > 0)
  )

  // Derived telemetry calculations from real system data
  const telemetry = React.useMemo(() => {
    if (!data || data.length === 0) {
      return {
        personalAvg: 0,
        classAvg: 0,
        delta: 0,
        bestScore: 0,
        activeMonthsCount: 0,
        latestDiff: 0,
      }
    }

    const recordedStudentScores = data.filter((d) => (d.score ?? 0) > 0)
    const recordedClassScores = data.filter((d) => (d.average ?? 0) > 0)

    const personalAvg = recordedStudentScores.length
      ? Math.round(
          recordedStudentScores.reduce((acc, curr) => acc + curr.score, 0) /
            recordedStudentScores.length
        )
      : 0

    const classAvg = recordedClassScores.length
      ? Math.round(
          recordedClassScores.reduce((acc, curr) => acc + curr.average, 0) /
            recordedClassScores.length
        )
      : 0

    const delta = personalAvg > 0 && classAvg > 0 ? personalAvg - classAvg : 0
    const bestScore = recordedStudentScores.length
      ? Math.max(...recordedStudentScores.map((d) => d.score))
      : 0

    const latestActive = [...data].reverse().find((d) => d.score > 0 || d.average > 0)
    const latestDiff =
      latestActive && latestActive.score > 0 && latestActive.average > 0
        ? Math.round((latestActive.score - latestActive.average) * 10) / 10
        : 0

    return {
      personalAvg,
      classAvg,
      delta,
      bestScore,
      activeMonthsCount: recordedStudentScores.length,
      latestDiff,
    }
  }, [data])

  return (
    <Card
      className={cn(
        "col-span-full shadow-2xs border border-border/60 rounded-2xl overflow-hidden bg-card/80 backdrop-blur-xs transition-all",
        className
      )}
    >
      {/* Header */}
      <CardHeader className="p-4 sm:p-5 pb-3 border-b border-border/40 space-y-0">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <div className="size-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <Activity className="size-3.5" />
              </div>
              <h3 className="text-sm font-bold text-foreground tracking-tight">
                {title}
              </h3>
            </div>
            <p className="text-[11px] text-muted-foreground pl-9">
              {description}
            </p>
          </div>

          {/* Dynamic Telemetry Pill */}
          {hasData && telemetry.personalAvg > 0 && (
            <div className="flex items-center gap-2 pl-9 sm:pl-0">
              <Badge
                variant="outline"
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-[11px] font-semibold gap-1 transition-colors",
                  telemetry.delta > 0
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                    : telemetry.delta < 0
                    ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                    : "bg-muted text-muted-foreground border-border/40"
                )}
              >
                {telemetry.delta > 0 ? (
                  <TrendingUp className="size-3" />
                ) : telemetry.delta < 0 ? (
                  <TrendingDown className="size-3" />
                ) : (
                  <Sparkles className="size-3" />
                )}
                <span>
                  {telemetry.delta > 0
                    ? `+${telemetry.delta}% vs Class Avg`
                    : telemetry.delta < 0
                    ? `${telemetry.delta}% vs Class Avg`
                    : "On Par With Class"}
                </span>
              </Badge>
            </div>
          )}
        </div>

        {/* Quick Performance Telemetry Strip */}
        {hasData && (
          <div className="grid grid-cols-3 gap-2 pt-3.5">
            <div className="rounded-xl border border-border/40 bg-muted/20 p-2 sm:p-2.5 text-center sm:text-left transition-colors">
              <span className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground block truncate">
                Your Avg Score
              </span>
              <div className="flex items-baseline justify-center sm:justify-start gap-1 mt-0.5">
                <span className="text-base sm:text-lg font-bold text-foreground tabular-nums">
                  {telemetry.personalAvg > 0 ? `${telemetry.personalAvg}%` : "—"}
                </span>
                {telemetry.personalAvg > 0 && (
                  <span className="text-[9px] text-muted-foreground hidden sm:inline">overall</span>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-border/40 bg-muted/20 p-2 sm:p-2.5 text-center sm:text-left transition-colors">
              <span className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground block truncate">
                Class Avg
              </span>
              <div className="flex items-baseline justify-center sm:justify-start gap-1 mt-0.5">
                <span className="text-base sm:text-lg font-bold text-muted-foreground tabular-nums">
                  {telemetry.classAvg > 0 ? `${telemetry.classAvg}%` : "—"}
                </span>
                {telemetry.classAvg > 0 && (
                  <span className="text-[9px] text-muted-foreground hidden sm:inline">benchmark</span>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-border/40 bg-muted/20 p-2 sm:p-2.5 text-center sm:text-left transition-colors">
              <span className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground block truncate">
                Personal Best
              </span>
              <div className="flex items-baseline justify-center sm:justify-start gap-1 mt-0.5">
                <span className="text-base sm:text-lg font-bold text-primary tabular-nums">
                  {telemetry.bestScore > 0 ? `${telemetry.bestScore}%` : "—"}
                </span>
                {telemetry.bestScore > 0 && (
                  <Award className="size-3 text-primary ml-1 hidden sm:inline shrink-0" />
                )}
              </div>
            </div>
          </div>
        )}
      </CardHeader>

      {/* Chart Body */}
      <CardContent className="pt-4 pb-2 px-3 sm:px-5">
        {!hasData ? (
          <div className="h-[230px] w-full flex flex-col items-center justify-center border border-dashed border-border/40 rounded-xl bg-muted/10 gap-2.5 text-center p-4">
            <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <Activity className="size-5" />
            </div>
            <div className="space-y-0.5">
              <p className="text-xs font-semibold text-foreground">
                No Released Assessment Scores Yet
              </p>
              <p className="text-[11px] text-muted-foreground max-w-xs">
                As your instructors publish grading results, your monthly performance and class comparison will appear here.
              </p>
            </div>
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="h-[230px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data}
                barGap={4}
                margin={{ top: 12, right: 12, left: -16, bottom: 0 }}
              >
                <CartesianGrid
                  vertical={false}
                  strokeDasharray="3 3"
                  stroke="currentColor"
                  className="stroke-border/40"
                />
                <XAxis
                  dataKey="month"
                  tickLine={false}
                  tickMargin={8}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                />
                <YAxis
                  domain={[0, 100]}
                  ticks={[0, 25, 50, 75, 100]}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip
                  cursor={{ fill: "currentColor", opacity: 0.05 }}
                  content={<CustomTooltip />}
                />
                <Bar
                  dataKey="score"
                  name="Your Score"
                  fill="var(--color-score)"
                  radius={[5, 5, 0, 0]}
                  maxBarSize={22}
                />
                <Bar
                  dataKey="average"
                  name="Class Average"
                  fill="var(--color-average)"
                  radius={[5, 5, 0, 0]}
                  maxBarSize={22}
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartContainer>
        )}
      </CardContent>

      {/* Footer Legend */}
      <CardFooter className="py-2.5 px-4 sm:px-5 border-t border-border/40 flex flex-wrap items-center justify-between gap-2 bg-muted/10">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-[#4f46e5] dark:bg-[#818cf8]" />
            <span className="text-[11px] font-medium text-foreground">You</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-[#94a3b8] dark:bg-[#475569]" />
            <span className="text-[11px] font-medium text-muted-foreground">Class Average</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <Info className="size-3 text-muted-foreground/60" />
          <span>Real-time academic evaluation telemetry</span>
        </div>
      </CardFooter>
    </Card>
  )
}
