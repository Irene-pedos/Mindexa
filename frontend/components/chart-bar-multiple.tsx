"use client"

import { TrendingDown, TrendingUp } from "lucide-react"
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts"

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

interface ChartBarMultipleProps {
  data: any[]
  config: ChartConfig
  title?: string
  description?: string
  footerTitle?: string
  footerDescription?: string
}

export function ChartBarMultiple({
  data,
  config,
  title = "Assessments & Violations Overview",
  description = "Monthly distribution",
  footerTitle,
  footerDescription = "Showing total assessments versus integrity violations"
}: ChartBarMultipleProps) {
  return (
    <Card className="border-none shadow-none">
      <CardHeader className="px-0 pt-0">
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <ChartContainer config={config} className="h-[250px] w-full">
          <BarChart accessibilityLayer data={data}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="month"
              tickLine={false}
              tickMargin={10}
              axisLine={false}
              tickFormatter={(value) => value.slice(0, 3)}
            />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent indicator="dashed" />}
            />
            {Object.keys(config).map((key, index) => (
              <Bar 
                key={key} 
                dataKey={key} 
                fill={`var(--color-${key})`} 
                radius={4} 
              />
            ))}
          </BarChart>
        </ChartContainer>
      </CardContent>
      <CardFooter className="flex-col items-start gap-2 text-sm px-0 pb-0">
        {footerTitle && (
          <div className="flex gap-2 leading-none font-medium">
            {footerTitle}
          </div>
        )}
        <div className="leading-none text-muted-foreground">
          {footerDescription}
        </div>
      </CardFooter>
    </Card>
  )
}
