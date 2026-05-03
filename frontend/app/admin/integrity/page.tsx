"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { AlertTriangle, Clock, Shield, Users, Loader2, Search, Filter, ArrowRight } from "lucide-react"
import { adminApi, AdminIntegrityOverview } from "@/lib/api/admin"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

export default function AdminIntegrityPage() {
  const [data, setData] = useState<AdminIntegrityOverview | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadIntegrity() {
    try {
      const result = await adminApi.getIntegrityOverview();
      setData(result);
    } catch (err) {
      console.error("Failed to load integrity overview", err);
      toast.error("Failed to load integrity data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadIntegrity();
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Shield className="size-5 text-red-600" />
            Integrity & Security Center
          </h1>
          <p className="text-muted-foreground text-sm">Platform-wide audit trail and security oversight</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="rounded-lg h-8" onClick={loadIntegrity} disabled={loading}>
            {loading ? <Loader2 className="size-3.5 animate-spin mr-1.5" /> : <Clock className="size-3.5 mr-1.5" />}
            Refresh
          </Button>
          <Button size="sm" className="rounded-lg h-8 bg-red-600 hover:bg-red-700 text-xs px-4">
            Export Log
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Summary Cards */}
        <div className="lg:col-span-4 space-y-4">
          <Card className="border shadow-none">
            <CardHeader className="py-3 px-4 border-b h-12 flex justify-center">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Monitoring Status</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              {loading ? (
                [1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full rounded-lg" />)
              ) : (
                <>
                  <div className="flex items-center justify-between p-3 rounded-xl border border-red-100 bg-transparent">
                    <span className="text-xs font-medium text-muted-foreground">Flagged Today</span>
                    <span className="text-lg font-bold text-red-600">{data?.total_flagged_today}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-xl border border-amber-100 bg-transparent">
                    <span className="text-xs font-medium text-muted-foreground">High Severity</span>
                    <span className="text-lg font-bold text-amber-600">{data?.high_severity_today}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-xl border border-border bg-transparent">
                    <span className="text-xs font-medium text-muted-foreground">Active Sessions</span>
                    <span className="text-lg font-bold">{data?.active_sessions}</span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="border shadow-none bg-muted/10">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground leading-normal">
                All events are permanently logged with timestamps. 
                High-severity incidents notify primary supervisors.
              </p>
              <Button variant="link" className="p-0 h-auto text-[10px] font-bold text-primary mt-2">
                Security Policy <ArrowRight className="size-2.5 ml-1" />
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Live Integrity Feed */}
        <Card className="lg:col-span-8 border shadow-none overflow-hidden text-[13px]">
          <CardHeader className="bg-muted/40 border-b py-2.5 px-4 h-12 flex justify-center">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold">Recent Integrity Flags</CardTitle>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7"><Search className="size-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7"><Filter className="size-3.5" /></Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[500px]">
              <div className="divide-y divide-border">
                {loading ? (
                  [1, 2, 3, 4].map(i => (
                    <div key={i} className="p-4 space-y-2">
                      <div className="flex justify-between">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-4 w-12 rounded-full" />
                      </div>
                      <Skeleton className="h-3 w-full" />
                    </div>
                  ))
                ) : data?.recent_flags.length === 0 ? (
                  <div className="p-10 text-center text-muted-foreground text-xs">
                    No integrity flags recorded.
                  </div>
                ) : data?.recent_flags.map((flag: any) => (
                  <div key={flag.id} className="p-4 hover:bg-muted/10 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className={cn(
                          "mt-0.5 size-7 rounded-lg flex items-center justify-center shrink-0",
                          flag.risk_level === "CRITICAL" || flag.risk_level === "HIGH" 
                            ? "bg-red-50 text-red-600" 
                            : "bg-amber-50 text-amber-600"
                        )}>
                          <AlertTriangle className="size-3.5" />
                        </div>
                        <div className="space-y-0.5">
                          <div className="font-semibold text-sm">{flag.student_name}</div>
                          <div className="text-[11px] text-muted-foreground">
                            Assessment: <span className="text-foreground font-medium">{flag.assessment_name}</span>
                          </div>
                        </div>
                      </div>
                      <Badge 
                        variant="outline"
                        className={cn(
                          "rounded-md px-1.5 py-0 h-5 text-[9px] font-bold",
                          (flag.risk_level === "CRITICAL" || flag.risk_level === "HIGH") ? "border-red-200 text-red-700" : "border-amber-200 text-amber-700"
                        )}
                      >
                        {flag.risk_level}
                      </Badge>
                    </div>

                    <div className="mt-2.5 pl-10">
                      <div className="text-[12px] text-muted-foreground leading-snug">
                        {flag.description}
                      </div>
                      <div className="mt-2 flex items-center gap-4 text-[10px] text-muted-foreground/70 font-medium">
                        <span className="flex items-center gap-1">
                          <Clock className="size-2.5" /> 
                          {new Date(flag.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span className="flex items-center gap-1">
                          <Shield className="size-2.5" /> 
                          Status: <span className={cn(
                            "font-bold",
                            flag.status === "OPEN" ? "text-amber-600" : "text-emerald-600"
                          )}>{flag.status}</span>
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}