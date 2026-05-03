"use client"

import * as React from "react"
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts"

import { useIsMobile } from "@/hooks/use-mobile"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group"

interface ChartAreaInteractiveProps {
  data: any[]
  config: ChartConfig
  title: string
  description: string
  areaKeys: {
    key: string
    fill: string
    stroke: string
  }[]
}

export function ChartAreaInteractive({
  data,
  config,
  title,
  description: chartDesc,
  areaKeys,
}: ChartAreaInteractiveProps) {
  const isMobile = useIsMobile()
  const [timeRange, setTimeRange] = React.useState("90d")

  React.useEffect(() => {
    if (isMobile) {
      setTimeRange("7d")
    }
  }, [isMobile])

  const filteredData = React.useMemo(() => {
    if (!data || data.length === 0) return []
    
    // Sort by date just in case
    const sortedData = [...data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    
    const latestDate = new Date(sortedData[sortedData.length - 1].date)
    
    let daysToSubtract = 90
    if (timeRange === "30d") {
      daysToSubtract = 30
    } else if (timeRange === "7d") {
      daysToSubtract = 7
    }
    
    const startDate = new Date(latestDate)
    startDate.setDate(startDate.getDate() - daysToSubtract)
    
    return sortedData.filter((item) => new Date(item.date) >= startDate)
  }, [data, timeRange])

  if (!data || data.length === 0) {
    return (
      <Card className="flex items-center justify-center h-[400px]">
        <p className="text-muted-foreground">No data available</p>
      </Card>
    )
  }

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          <span className="hidden @[540px]/card:block">
            {chartDesc}
          </span>
          <span className="@[540px]/card:hidden">Trend over time</span>
        </CardDescription>
        <CardAction>
          <ToggleGroup
            type="single"
            value={timeRange}
            onValueChange={setTimeRange}
            variant="outline"
            className="hidden *:data-[slot=toggle-group-item]:px-4! @[767px]/card:flex"
          >
            <ToggleGroupItem value="90d">Last 3 months</ToggleGroupItem>
            <ToggleGroupItem value="30d">Last 30 days</ToggleGroupItem>
            <ToggleGroupItem value="7d">Last 7 days</ToggleGroupItem>
          </ToggleGroup>
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger
              className="flex w-40 **:data-[slot=select-value]:block **:data-[slot=select-value]:truncate @[767px]/card:hidden"
              size="sm"
              aria-label="Select a value"
            >
              <SelectValue placeholder="Last 3 months" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="90d" className="rounded-lg">
                Last 3 months
              </SelectItem>
              <SelectItem value="30d" className="rounded-lg">
                Last 30 days
              </SelectItem>
              <SelectItem value="7d" className="rounded-lg">
                Last 7 days
              </SelectItem>
            </SelectContent>
          </Select>
        </CardAction>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        <ChartContainer
          config={config}
          className="aspect-auto h-[250px] w-full"
        >
          <AreaChart data={filteredData}>
            <defs>
              {areaKeys.map((key) => (
                <linearGradient key={key.key} id={`fill-${key.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor={key.fill}
                    stopOpacity={0.8}
                  />
                  <stop
                    offset="95%"
                    stopColor={key.fill}
                    stopOpacity={0.1}
                  />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
              tickFormatter={(value) => {
                const date = new Date(value)
                return date.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })
              }}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  labelFormatter={(value) => {
                    return new Date(value).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })
                  }}
                  indicator="dot"
                />
              }
            />
            {areaKeys.map((key) => (
              <Area
                key={key.key}
                dataKey={key.key}
                type="natural"
                fill={`url(#fill-${key.key})`}
                stroke={key.stroke}
                stackId="a"
              />
            ))}
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
