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

interface ChartLineMultipleProps {
  data: any[]
  config: ChartConfig
  title?: string
  description?: string
  footerTitle?: string
  footerDescription?: string
}

export function ChartLineMultiple({
  data,
  config,
  title = "Assessments vs Violations Trends",
  description = "Timeline view",
  footerTitle,
  footerDescription = "Comparing total assessments and violations"
}: ChartLineMultipleProps) {
  return (
    <Card className="flex flex-col border-none shadow-none">
      <CardHeader className="px-0 pt-0">
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 px-0">
        <ChartContainer config={config}>
          <LineChart
            accessibilityLayer
            data={data}
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
            {Object.keys(config).map((key) => (
              <Line
                key={key}
                dataKey={key}
                type="monotone"
                stroke={`var(--color-${key})`}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </LineChart>
        </ChartContainer>
      </CardContent>
      <CardFooter className="px-0 pb-0">
        <div className="flex w-full items-start gap-2 text-sm">
          <div className="grid gap-1">
            {footerTitle && (
              <div className="flex items-center gap-2 leading-none font-medium">
                {footerTitle}
              </div>
            )}
            <div className="flex items-center gap-2 leading-none text-muted-foreground">
              {footerDescription}
            </div>
          </div>
        </div>
      </CardFooter>
    </Card>
  )
}
