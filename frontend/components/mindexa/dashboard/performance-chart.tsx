// components/mindexa/dashboard/performance-chart.tsx
"use client"

import { Activity, TrendingUp } from "lucide-react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, ResponsiveContainer } from "recharts"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

interface PerformanceChartProps {
  data?: { month: string; score: number; average: number }[]
  title?: string
  description?: string
}

const chartConfig = {
  score: {
    label: "Your Score",
    color: "var(--chart-1)",
  },
  average: {
    label: "Class Average",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig

export function PerformanceChart({
  data,
  title = "Academic Performance",
  description = "Your scores vs class average · Last 6 months",
}: PerformanceChartProps) {
  const hasData = data && data.length > 0 && data.some(d => d.score > 0 || d.average > 0)

  return (
    <Card className="col-span-full shadow-none border border-border/50 rounded-xl overflow-hidden">
      <CardHeader className="py-3 px-4 border-b border-border/40 flex flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-2">
          <Activity className="size-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-foreground">{title}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <TrendingUp className="size-3.5 text-muted-foreground/40" />
          <span className="text-[10px] text-muted-foreground">{description}</span>
        </div>
      </CardHeader>

      <CardContent className="pt-4 pb-2 px-4">
        {!hasData ? (
          <div className="h-[220px] w-full flex flex-col items-center justify-center border border-dashed border-border/30 rounded-lg bg-muted/5 gap-2">
            <Activity className="size-7 text-muted-foreground/20" />
            <p className="text-[11px] text-muted-foreground/50">No performance data yet</p>
            <p className="text-[10px] text-muted-foreground/30">Complete assessments to see your trend</p>
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} accessibilityLayer margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
                <XAxis
                  dataKey="month"
                  tickLine={false}
                  tickMargin={8}
                  axisLine={false}
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                />
                <YAxis
                  domain={[0, 100]}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  tickFormatter={(v) => `${v}%`}
                />
                <ChartTooltip
                  cursor={{ fill: "var(--muted)", opacity: 0.08 }}
                  content={<ChartTooltipContent indicator="dashed" />}
                />
                <Bar dataKey="score" fill="var(--color-score)" radius={[3, 3, 0, 0]} barSize={20} />
                <Bar dataKey="average" fill="var(--color-average)" radius={[3, 3, 0, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </ChartContainer>
        )}
      </CardContent>

      <CardFooter className="py-2.5 px-4 border-t border-border/40 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <div className="size-2 rounded-full bg-[var(--chart-1)]" />
            <span className="text-[10px] text-muted-foreground">You</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="size-2 rounded-full bg-[var(--chart-2)]" />
            <span className="text-[10px] text-muted-foreground">Class avg</span>
          </div>
        </div>
        <span className="text-[10px] text-muted-foreground/50">
          Updated {new Date().toLocaleDateString()}
        </span>
      </CardFooter>
    </Card>
  )
}