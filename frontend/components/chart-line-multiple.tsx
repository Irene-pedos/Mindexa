"use client"

import { TrendingUp } from "lucide-react"
import { CartesianGrid, Line, LineChart, XAxis } from "recharts"

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

export const description = "A multiple line chart showing assessment trends"

const chartData = [
  { month: "January", assessments: 186, violations: 80 },
  { month: "February", assessments: 305, violations: 200 },
  { month: "March", assessments: 237, violations: 120 },
  { month: "April", assessments: 73, violations: 190 },
  { month: "May", assessments: 209, violations: 130 },
  { month: "June", assessments: 214, violations: 140 },
]

const chartConfig = {
  assessments: {
    label: "Assessments",
    color: "var(--chart-1)",
  },
  violations: {
    label: "Violations",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig

export function ChartLineMultiple() {
  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle>Assessments vs Violations Trends</CardTitle>
        <CardDescription>January - June 2026</CardDescription>
      </CardHeader>
      <CardContent className="flex-1">
        <ChartContainer config={chartConfig}>
          <LineChart
            accessibilityLayer
            data={chartData}
            margin={{
              left: 12,
              right: 12,
            }}
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="month"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={(value) => value.slice(0, 3)}
            />
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            <Line
              dataKey="assessments"
              type="monotone"
              stroke="var(--color-assessments)"
              strokeWidth={2}
              dot={false}
            />
            <Line
              dataKey="violations"
              type="monotone"
              stroke="var(--color-violations)"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
      <CardFooter>
        <div className="flex w-full items-start gap-2 text-sm">
          <div className="grid gap-2">
            <div className="flex items-center gap-2 leading-none font-medium">
              Integrity violations down by 4.2% this month <TrendingUp className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="flex items-center gap-2 leading-none text-muted-foreground">
              Comparing total assessments and violations for the last 6 months
            </div>
          </div>
        </div>
      </CardFooter>
    </Card>
  )
}
