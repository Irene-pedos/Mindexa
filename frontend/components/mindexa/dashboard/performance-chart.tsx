// components/mindexa/dashboard/performance-chart.tsx
"use client"

import { TrendingUp } from "lucide-react"
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

const chartData = [
  { month: "Jan", score: 78, average: 72 },
  { month: "Feb", score: 85, average: 74 },
  { month: "Mar", score: 82, average: 76 },
  { month: "Apr", score: 91, average: 79 },
  { month: "May", score: 88, average: 81 },
  { month: "Jun", score: 94, average: 83 },
]

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

export function PerformanceChart() {
  return (
    <Card className="col-span-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Academic Performance Trend
          <TrendingUp className="h-4 w-4 text-emerald-500" />
        </CardTitle>
        <CardDescription>
          Your scores vs class average (Last 6 months)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} accessibilityLayer>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="month"
                tickLine={false}
                tickMargin={10}
                axisLine={false}
              />
              <YAxis domain={[0, 100]} tickLine={false} axisLine={false} />
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent indicator="dashed" />}
              />
              <Bar dataKey="score" fill="var(--color-score)" radius={6} />
              <Bar dataKey="average" fill="var(--color-average)" radius={6} />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      </CardContent>
      <CardFooter className="flex-col items-start gap-2 text-sm">
        <div className="flex gap-2 leading-none font-medium text-emerald-500">
          Trending up by 8.4% this semester <TrendingUp className="h-4 w-4" />
        </div>
        <div className="leading-none text-muted-foreground">
          Strong improvement in Database Systems and Algorithms modules
        </div>
      </CardFooter>
    </Card>
  )
}