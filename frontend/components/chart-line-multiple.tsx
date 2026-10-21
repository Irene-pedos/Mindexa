"use client";

import React from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

interface ChartLineMultipleProps {
  data: any[];
  config: ChartConfig;
  title?: string;
  description?: string;
  footerTitle?: string;
  footerDescription?: string;
}

export function ChartLineMultiple({
  data = [],
  config,
  title = "System Load & Integrity Trends",
  description = "Execution volume vs. security flags",
  footerTitle,
  footerDescription = "6-month comparative trajectory",
}: ChartLineMultipleProps) {
  const totalAssessments = data.reduce((acc, curr) => acc + (curr.assessments || 0), 0);
  const totalViolations = data.reduce((acc, curr) => acc + (curr.violations || 0), 0);
  const violationRate = totalAssessments > 0 ? ((totalViolations / totalAssessments) * 100).toFixed(1) : "0.0";

  return (
    <div className="flex flex-col h-full space-y-2.5">
      {/* Header: Clean, Typography-led, Compact */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 pb-2 border-b border-border/50">
        <div>
          <h3 className="font-semibold text-xs sm:text-sm text-foreground">{title}</h3>
          <p className="text-[11px] text-muted-foreground">{description}</p>
        </div>

        {/* Compact Incident Rate Tag */}
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md">
            <span>Flag Rate:</span>
            <strong className="font-mono">{violationRate}%</strong>
          </span>
        </div>
      </div>

      {/* Chart Canvas: Compact & Responsive with Gradients */}
      <div className="w-full pt-1">
        <ChartContainer config={config} className="h-[190px] sm:h-[210px] w-full">
          <AreaChart accessibilityLayer data={data} margin={{ top: 8, right: 6, left: -24, bottom: 0 }}>
            <defs>
              <linearGradient id="fillAssessments" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-assessments, #3b82f6)" stopOpacity={0.28} />
                <stop offset="95%" stopColor="var(--color-assessments, #3b82f6)" stopOpacity={0.0} />
              </linearGradient>
              <linearGradient id="fillViolations" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-violations, #f43f5e)" stopOpacity={0.28} />
                <stop offset="95%" stopColor="var(--color-violations, #f43f5e)" stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="hsl(var(--border) / 0.45)" strokeDasharray="3 3" />
            <XAxis
              dataKey="month"
              tickLine={false}
              axisLine={false}
              tickMargin={6}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10, fontWeight: 500 }}
              tickFormatter={(value) => (typeof value === "string" ? value.slice(0, 3) : value)}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={6}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
              allowDecimals={false}
            />
            <ChartTooltip
              cursor={{ stroke: "hsl(var(--muted-foreground) / 0.35)", strokeWidth: 1.5, strokeDasharray: "4 4" }}
              content={
                <ChartTooltipContent
                  indicator="line"
                  className="rounded-lg border border-border/80 bg-popover text-popover-foreground shadow-md p-2 text-xs"
                />
              }
            />
            <Area
              dataKey="assessments"
              type="monotone"
              fill="url(#fillAssessments)"
              stroke="var(--color-assessments, #3b82f6)"
              strokeWidth={2}
              activeDot={{ r: 4, strokeWidth: 1.5, fill: "hsl(var(--background))" }}
            />
            <Area
              dataKey="violations"
              type="monotone"
              fill="url(#fillViolations)"
              stroke="var(--color-violations, #f43f5e)"
              strokeWidth={2}
              activeDot={{ r: 4, strokeWidth: 1.5, fill: "hsl(var(--background))" }}
            />
          </AreaChart>
        </ChartContainer>
      </div>

      {/* Compact Footer */}
      <div className="pt-2 border-t border-border/40 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{footerTitle || "System Telemetry"}</span>
        <span className="text-[10px] text-muted-foreground/80">{footerDescription}</span>
      </div>
    </div>
  );
}
