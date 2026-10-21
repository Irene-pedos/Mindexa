"use client";

import React from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

interface ChartBarMultipleProps {
  data: any[];
  config: ChartConfig;
  title?: string;
  description?: string;
  footerTitle?: string;
  footerDescription?: string;
}

export function ChartBarMultiple({
  data = [],
  config,
  title = "Assessment & Integrity Volume",
  description = "Monthly distribution of tests and flags",
  footerTitle,
  footerDescription = "Volume across active semester",
}: ChartBarMultipleProps) {
  const totalAssessments = data.reduce((acc, curr) => acc + (curr.assessments || 0), 0);
  const totalViolations = data.reduce((acc, curr) => acc + (curr.violations || 0), 0);

  return (
    <div className="flex flex-col h-full space-y-2.5">
      {/* Header: Clean, Typography-led, Compact */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 pb-2 border-b border-border/50">
        <div>
          <h3 className="font-semibold text-xs sm:text-sm text-foreground">{title}</h3>
          <p className="text-[11px] text-muted-foreground">{description}</p>
        </div>

        {/* Compact Legend with Counts */}
        <div className="flex items-center gap-3 text-[11px]">
          <div className="flex items-center gap-1.5 font-medium text-foreground/80">
            <span className="size-2 rounded-sm bg-primary" />
            <span>Assessments</span>
            <span className="font-mono text-muted-foreground">({totalAssessments})</span>
          </div>
          <div className="flex items-center gap-1.5 font-medium text-foreground/80">
            <span className="size-2 rounded-sm bg-rose-500" />
            <span>Violations</span>
            <span className="font-mono text-rose-600 dark:text-rose-400 font-semibold">({totalViolations})</span>
          </div>
        </div>
      </div>

      {/* Chart Canvas: Compact & Responsive */}
      <div className="w-full pt-1">
        <ChartContainer config={config} className="h-[190px] sm:h-[210px] w-full">
          <BarChart accessibilityLayer data={data} margin={{ top: 8, right: 6, left: -24, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="hsl(var(--border) / 0.45)" strokeDasharray="3 3" />
            <XAxis
              dataKey="month"
              tickLine={false}
              tickMargin={6}
              axisLine={false}
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
              cursor={{ fill: "hsl(var(--muted) / 0.2)", radius: 4 }}
              content={
                <ChartTooltipContent
                  indicator="dot"
                  className="rounded-lg border border-border/80 bg-popover text-popover-foreground shadow-md p-2 text-xs"
                />
              }
            />
            <Bar
              dataKey="assessments"
              fill="var(--color-assessments, hsl(var(--primary)))"
              radius={[4, 4, 0, 0]}
              maxBarSize={32}
            />
            <Bar
              dataKey="violations"
              fill="var(--color-violations, #f43f5e)"
              radius={[4, 4, 0, 0]}
              maxBarSize={32}
            />
          </BarChart>
        </ChartContainer>
      </div>

      {/* Compact Footer */}
      <div className="pt-2 border-t border-border/40 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{footerTitle || "Active Term"}</span>
        <span className="text-[10px] text-muted-foreground/80">{footerDescription}</span>
      </div>
    </div>
  );
}
