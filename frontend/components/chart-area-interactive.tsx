// frontend/components/chart-area-interactive.tsx
"use client"

import * as React from "react"
import Link from "next/link"
import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts"
import {
  BarChart3,
  Calendar,
  Plus,
} from "lucide-react"

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
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export interface ChartAreaKeyItem {
  key: string
  fill?: string
  stroke?: string
  label?: string
}

export interface ChartAreaInteractiveProps {
  data: Array<Record<string, any>>
  config?: ChartConfig
  title?: string
  description?: string
  areaKeys?: ChartAreaKeyItem[]
  emptyActionHref?: string
  emptyActionLabel?: string
  className?: string
}

const defaultChartConfig: ChartConfig = {
  ai: {
    label: "AI Processed",
    theme: {
      light: "#7c3aed", // Violet 600
      dark: "#a78bfa",  // Violet 400
    },
  },
  manual: {
    label: "Manual Review",
    theme: {
      light: "#2563eb", // Blue 600
      dark: "#60a5fa",  // Blue 400
    },
  },
}

const defaultAreaKeys: ChartAreaKeyItem[] = [
  { key: "ai", label: "AI Processed", fill: "#7c3aed", stroke: "#7c3aed" },
  { key: "manual", label: "Manual Review", fill: "#2563eb", stroke: "#2563eb" },
]

interface CustomTooltipProps {
  active?: boolean
  payload?: Array<{
    name?: string
    value?: number
    dataKey?: string
    color?: string
  }>
  label?: string
  config?: ChartConfig
}

function CustomTooltip({ active, payload, label, config }: CustomTooltipProps) {
  if (!active || !payload || !payload.length) return null

  const total = payload.reduce((acc, curr) => acc + (Number(curr.value) || 0), 0)

  const formattedDate = label
    ? new Date(label).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : ""

  return (
    <div className="rounded-xl border border-border/80 bg-popover/95 p-3 text-popover-foreground shadow-xl backdrop-blur-md text-xs min-w-[210px] space-y-2 animate-in fade-in-0 zoom-in-95 duration-150">
      <div className="flex items-center justify-between border-b border-border/50 pb-1.5 font-medium">
        <div className="flex items-center gap-1.5 text-muted-foreground text-[11px]">
          <Calendar className="size-3" />
          <span>{formattedDate}</span>
        </div>
        <Badge variant="outline" className="text-[10px] font-mono h-4 px-1.5 bg-muted">
          {total} total
        </Badge>
      </div>

      <div className="space-y-1.5 pt-0.5">
        {payload.map((entry) => {
          const key = entry.dataKey as string
          const val = Number(entry.value) || 0
          const pct = total > 0 ? Math.round((val / total) * 100) : 0
          const labelName = entry.name || (config?.[key]?.label as string) || key
          const dotColor = entry.color || `var(--color-${key})`

          return (
            <div key={key} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5">
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: dotColor }}
                />
                <span className="text-muted-foreground text-[11px]">{labelName}:</span>
              </div>
              <div className="flex items-center gap-1 font-semibold text-foreground tabular-nums">
                <span>{val.toLocaleString()}</span>
                {total > 0 && (
                  <span className="text-[10px] font-normal text-muted-foreground">
                    ({pct}%)
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {payload.length >= 2 && total > 0 && (
        <div className="border-t border-border/40 pt-1.5 text-[10px] text-muted-foreground flex items-center justify-between">
          <span>Primary Segment:</span>
          <span className="font-semibold text-primary">
            {payload[0].name}: {Math.round(((Number(payload[0].value) || 0) / total) * 100)}%
          </span>
        </div>
      )}
    </div>
  )
}

export function ChartAreaInteractive({
  data,
  config = defaultChartConfig,
  title = "Institutional Activity & Grading Volume",
  description = "Daily submission distribution and AI-assisted automated review volume",
  areaKeys,
  emptyActionHref,
  emptyActionLabel,
  className,
}: ChartAreaInteractiveProps) {
  const [timeRange, setTimeRange] = React.useState<"30d" | "14d" | "7d">("30d")

  const effectiveAreaKeys = React.useMemo(() => {
    if (areaKeys && areaKeys.length > 0) return areaKeys
    if (config) {
      const keys = Object.keys(config)
      if (keys.length > 0) {
        return keys.map((k) => ({
          key: k,
          label: (config[k]?.label as string) || k,
          fill: `var(--color-${k})`,
          stroke: `var(--color-${k})`,
        }))
      }
    }
    return defaultAreaKeys
  }, [areaKeys, config])

  // Filter data based on selected time window (data typically has up to 30 or 31 days)
  const filteredData = React.useMemo(() => {
    if (!data || data.length === 0) return []

    const sortedData = [...data].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    )

    if (sortedData.length === 0) return []
    const latestDate = new Date(sortedData[sortedData.length - 1].date)

    let daysToKeep = 30
    if (timeRange === "14d") daysToKeep = 14
    if (timeRange === "7d") daysToKeep = 7

    const startDate = new Date(latestDate)
    startDate.setDate(startDate.getDate() - (daysToKeep - 1))
    startDate.setHours(0, 0, 0, 0)

    return sortedData.filter((item) => new Date(item.date) >= startDate)
  }, [data, timeRange])

  const hasSubmissions = React.useMemo(() => {
    if (!filteredData || filteredData.length === 0) return false
    return filteredData.some((item) =>
      effectiveAreaKeys.some((k) => (Number(item[k.key]) || 0) > 0)
    )
  }, [filteredData, effectiveAreaKeys])

  return (
    <Card
      className={cn(
        "border border-border/60 bg-card/80 backdrop-blur-xs shadow-2xs rounded-2xl overflow-hidden transition-all flex flex-col justify-between h-full",
        className
      )}
    >
      {/* Header with Title and Segmented Time Range Selector */}
      <CardHeader className="p-4 sm:p-5 pb-3 border-b border-border/40 space-y-0">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <div className="size-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <BarChart3 className="size-3.5" />
              </div>
              <h3 className="text-sm font-bold text-foreground tracking-tight">
                {title}
              </h3>
            </div>
            <p className="text-[11px] text-muted-foreground pl-9">
              {description}
            </p>
          </div>

          {/* Responsive Time Range Segmented Toggle */}
          <div className="flex items-center gap-1 rounded-xl bg-muted/40 p-1 border border-border/40 self-start md:self-auto">
            <button
              type="button"
              onClick={() => setTimeRange("30d")}
              className={cn(
                "px-2.5 py-1 text-xs font-semibold rounded-lg transition-all",
                timeRange === "30d"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              30 Days
            </button>
            <button
              type="button"
              onClick={() => setTimeRange("14d")}
              className={cn(
                "px-2.5 py-1 text-xs font-semibold rounded-lg transition-all",
                timeRange === "14d"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              14 Days
            </button>
            <button
              type="button"
              onClick={() => setTimeRange("7d")}
              className={cn(
                "px-2.5 py-1 text-xs font-semibold rounded-lg transition-all",
                timeRange === "7d"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              7 Days
            </button>
          </div>
        </div>
      </CardHeader>

      {/* Chart Canvas */}
      <CardContent className="pt-4 pb-2 px-2 sm:px-5 flex-1 flex flex-col justify-center">
        {!hasSubmissions ? (
          <div className="relative rounded-xl overflow-hidden border border-border/40 bg-muted/5">
            <ChartContainer config={config} className="h-[250px] w-full opacity-20 pointer-events-none">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={filteredData.length > 0 ? filteredData : [{ date: new Date().toISOString() }]}
                  margin={{ top: 12, right: 12, left: -20, bottom: 0 }}
                >
                  <CartesianGrid
                    vertical={false}
                    strokeDasharray="3 3"
                    stroke="currentColor"
                    className="stroke-border/40"
                  />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    minTickGap={28}
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    tickFormatter={(value) => {
                      const date = new Date(value)
                      return date.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })
                    }}
                  />
                  <YAxis
                    domain={[0, 10]}
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartContainer>

            <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center bg-card/40 backdrop-blur-2xs">
              <div className="size-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-2 shadow-2xs">
                <BarChart3 className="size-5" />
              </div>
              <p className="text-xs font-semibold text-foreground">
                No Activity Recorded ({timeRange === "30d" ? "Past 30 Days" : timeRange === "14d" ? "Past 14 Days" : "Past 7 Days"})
              </p>
              <p className="text-[11px] text-muted-foreground max-w-sm mt-0.5">
                Institutional telemetry and volume metrics will automatically chart here once operations commence.
              </p>
              {emptyActionHref && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3 h-8 text-xs font-medium rounded-xl border-border/60 hover:bg-muted/50 gap-1.5 shadow-2xs"
                  asChild
                >
                  <Link href={emptyActionHref}>
                    <Plus className="size-3.5" />
                    <span>{emptyActionLabel || "Launch Activity"}</span>
                  </Link>
                </Button>
              )}
            </div>
          </div>
        ) : (
          <ChartContainer config={config} className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={filteredData}
                margin={{ top: 12, right: 12, left: -20, bottom: 0 }}
              >
                <defs>
                  {effectiveAreaKeys.map((item) => {
                    const fallbackColor =
                      item.fill || item.stroke || (config?.[item.key] as any)?.color || "#7c3aed"
                    return (
                      <linearGradient
                        key={item.key}
                        id={`fill-${item.key}`}
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor={`var(--color-${item.key}, ${fallbackColor})`}
                          stopOpacity={0.4}
                        />
                        <stop
                          offset="95%"
                          stopColor={`var(--color-${item.key}, ${fallbackColor})`}
                          stopOpacity={0.02}
                        />
                      </linearGradient>
                    )
                  })}
                </defs>

                <CartesianGrid
                  vertical={false}
                  strokeDasharray="3 3"
                  stroke="currentColor"
                  className="stroke-border/40"
                />

                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={28}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  tickFormatter={(value) => {
                    const date = new Date(value)
                    return date.toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })
                  }}
                />

                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  allowDecimals={false}
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                />

                <Tooltip
                  cursor={{ stroke: "currentColor", strokeWidth: 1, strokeDasharray: "4 4", opacity: 0.3 }}
                  content={<CustomTooltip config={config} />}
                />

                {/* Render Areas */}
                {effectiveAreaKeys.map((item) => {
                  const fallbackColor =
                    item.stroke || item.fill || (config?.[item.key] as any)?.color || "#7c3aed"
                  return (
                    <Area
                      key={item.key}
                      dataKey={item.key}
                      name={item.label || (config?.[item.key]?.label as string) || item.key}
                      type="monotone"
                      fill={`url(#fill-${item.key})`}
                      stroke={`var(--color-${item.key}, ${fallbackColor})`}
                      strokeWidth={2}
                      stackId="volume"
                    />
                  )
                })}
              </AreaChart>
            </ResponsiveContainer>
          </ChartContainer>
        )}
      </CardContent>

      {/* Footer Legend & System Telemetry Status */}
      <CardFooter className="py-2.5 px-4 sm:px-5 border-t border-border/40 flex flex-wrap items-center justify-between gap-2 bg-muted/10">
        <div className="flex items-center gap-4 flex-wrap">
          {effectiveAreaKeys.map((item) => {
            const fallbackColor =
              item.stroke || item.fill || (config?.[item.key] as any)?.color || "#7c3aed"
            return (
              <div key={item.key} className="flex items-center gap-1.5">
                <span
                  className="size-2.5 rounded-sm"
                  style={{
                    backgroundColor: `var(--color-${item.key}, ${fallbackColor})`,
                  }}
                />
                <span className="text-[11px] font-medium text-foreground">
                  {item.label || (config?.[item.key]?.label as string) || item.key}
                </span>
              </div>
            )
          })}
        </div>

        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span>Real-time institutional telemetry pipeline</span>
        </div>
      </CardFooter>
    </Card>
  )
}
