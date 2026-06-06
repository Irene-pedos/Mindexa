// components/mindexa/dashboard/performance-chart.tsx
"use client"

import { TrendingUp, Activity } from "lucide-react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
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
  title = "Academic Performance Trend",
  description = "Your scores vs class average (Last 6 months)",
}: PerformanceChartProps) {
  const hasData = data && data.length > 0 && data.some(d => d.score > 0 || d.average > 0);

  return (
    <Card className="col-span-full shadow-none border rounded-xl overflow-hidden">
      <CardHeader className="py-3 px-4 bg-muted/5 border-b">
        <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                <Activity className="size-3 text-primary" />
                {title}
            </CardTitle>
            <TrendingUp className="h-3.5 w-3.5 text-emerald-500 opacity-50" />
        </div>
        <CardDescription className="text-[9px] font-medium uppercase tracking-tight text-muted-foreground/60">{description}</CardDescription>
      </CardHeader>
      <CardContent className="pt-6 pb-2">
        {!hasData ? (
           <div className="h-[260px] w-full flex flex-col items-center justify-center border-2 border-dashed border-muted/20 rounded-lg bg-muted/5">
              <Activity className="size-8 text-muted-foreground/20 mb-2" />
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40">No Performance Data Available</p>
              <p className="text-[9px] text-muted-foreground/30 mt-1 uppercase font-medium">Complete assessments to see your trend</p>
           </div>
        ) : (
          <ChartContainer config={chartConfig} className="h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} accessibilityLayer margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
                <XAxis
                  dataKey="month"
                  tickLine={false}
                  tickMargin={10}
                  axisLine={false}
                  tick={{ fontSize: 10, fontWeight: 600 }}
                  className="uppercase tracking-tighter"
                />
                <YAxis 
                  domain={[0, 100]} 
                  tickLine={false} 
                  axisLine={false} 
                  tick={{ fontSize: 10, fontWeight: 600 }}
                  tickFormatter={(v) => `${v}%`}
                />
                <ChartTooltip
                  cursor={{ fill: 'var(--muted)', opacity: 0.1 }}
                  content={<ChartTooltipContent indicator="dashed" />}
                />
                <Bar dataKey="score" fill="var(--color-score)" radius={[4, 4, 0, 0]} barSize={24} />
                <Bar dataKey="average" fill="var(--color-average)" radius={[4, 4, 0, 0]} barSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </ChartContainer>
        )}
      </CardContent>
      <CardFooter className="py-2 px-4 border-t bg-muted/5 flex-row items-center justify-between text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/60">
        <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
                <div className="size-1.5 rounded-full bg-[var(--chart-1)]" />
                <span>Student</span>
            </div>
            <div className="flex items-center gap-1.5">
                <div className="size-1.5 rounded-full bg-[var(--chart-2)]" />
                <span>Platform Avg</span>
            </div>
        </div>
        <span>Last updated: {new Date().toLocaleDateString()}</span>
      </CardFooter>
    </Card>
  )
}