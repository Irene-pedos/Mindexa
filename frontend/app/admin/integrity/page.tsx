"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertTriangle,
  Clock,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Users,
  Loader2,
  Search,
  Filter,
  ArrowRight,
  RefreshCw,
  FileSpreadsheet,
} from "lucide-react";
import { adminApi, AdminIntegrityOverview } from "@/lib/api/admin";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function AdminIntegrityPage() {
  const [data, setData] = useState<AdminIntegrityOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterSeverity, setFilterSeverity] = useState<string>("ALL");

  async function loadIntegrity() {
    try {
      setLoading(true);
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

  const filteredFlags = (data?.recent_flags || []).filter((flag: any) => {
    const matchesSearch =
      (flag.student_name || "").toLowerCase().includes(search.toLowerCase()) ||
      (flag.assessment_name || "").toLowerCase().includes(search.toLowerCase()) ||
      (flag.description || "").toLowerCase().includes(search.toLowerCase());
    if (!matchesSearch) return false;
    if (filterSeverity === "ALL") return true;
    if (filterSeverity === "CRITICAL") return flag.risk_level === "CRITICAL" || flag.risk_level === "HIGH";
    if (filterSeverity === "MEDIUM") return flag.risk_level === "MEDIUM";
    return true;
  });

  return (
    <div data-tour="admin-integrity" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2.5">
            <div className="size-9 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center">
              <ShieldAlert className="size-5" />
            </div>
            Integrity & Security Center
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Platform-wide audit trail, real-time telemetry, and proctoring security oversight.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl h-9 text-xs gap-1.5"
            onClick={loadIntegrity}
            disabled={loading}
          >
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
            Refresh
          </Button>
          <Button
            size="sm"
            variant="default"
            className="rounded-xl h-9 text-xs px-4 bg-primary gap-1.5"
            onClick={() => toast.info("Audit log export scheduled. Check notifications.")}
          >
            <FileSpreadsheet className="size-3.5" />
            Export Audit Log
          </Button>
        </div>
      </div>

      {/* Metric Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: "Flagged Today",
            value: data?.total_flagged_today ?? 0,
            icon: AlertTriangle,
            pill: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
          },
          {
            label: "High Severity Incidents",
            value: data?.high_severity_today ?? 0,
            icon: ShieldAlert,
            pill: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
          },
          {
            label: "Active Monitored Sessions",
            value: data?.active_sessions ?? 0,
            icon: Users,
            pill: "bg-primary/10 text-primary",
          },
          {
            label: "Security Defense Status",
            value: "Enforced",
            icon: ShieldCheck,
            pill: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
          },
        ].map((stat, i) => (
          <Card
            key={i}
            className="border border-border/60 shadow-none rounded-2xl bg-card overflow-hidden p-5"
          >
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {stat.label}
                </p>
                <h3 className="text-2xl font-bold tracking-tight">
                  {stat.value}
                </h3>
              </div>
              <div className={cn("size-11 rounded-xl flex items-center justify-center shrink-0", stat.pill)}>
                <stat.icon className="size-5" />
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Main Grid: Feed + Policies */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Live Integrity Feed */}
        <Card className="lg:col-span-8 border border-border/60 shadow-none overflow-hidden rounded-2xl bg-card">
          <CardHeader className="bg-muted/30 border-b p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-sm font-semibold">Live Incident Audit Feed</CardTitle>
                <CardDescription className="text-xs">
                  Proctoring anomalies, browser environment deviations, and behavioral flags.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative w-44 sm:w-56">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search incidents..."
                    className="w-full bg-background border border-border/60 rounded-xl pl-8 pr-2.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div className="flex items-center gap-1">
                  {["ALL", "CRITICAL"].map((sev) => (
                    <Button
                      key={sev}
                      variant={filterSeverity === sev ? "default" : "outline"}
                      size="sm"
                      className="h-7 text-[10px] rounded-lg px-2 capitalize"
                      onClick={() => setFilterSeverity(sev)}
                    >
                      {sev === "ALL" ? "All" : "Critical Only"}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[520px]">
              <div className="divide-y divide-border/60">
                {loading ? (
                  [1, 2, 3, 4].map((i) => (
                    <div key={i} className="p-4 space-y-2">
                      <div className="flex justify-between">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-4 w-12 rounded-full" />
                      </div>
                      <Skeleton className="h-3 w-full" />
                    </div>
                  ))
                ) : filteredFlags.length === 0 ? (
                  <div className="p-12 text-center text-muted-foreground text-xs space-y-2">
                    <ShieldCheck className="size-8 mx-auto text-muted-foreground/60" />
                    <p className="font-medium">No integrity flags recorded.</p>
                    <p className="text-[11px] text-muted-foreground">All proctored sessions are operating within security thresholds.</p>
                  </div>
                ) : (
                  filteredFlags.map((flag: any) => {
                    const isHigh = flag.risk_level === "CRITICAL" || flag.risk_level === "HIGH";
                    return (
                      <div key={flag.id} className="p-5 hover:bg-muted/20 transition-colors">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <div
                              className={cn(
                                "mt-0.5 size-8 rounded-xl flex items-center justify-center shrink-0",
                                isHigh
                                  ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                                  : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                              )}
                            >
                              <AlertTriangle className="size-4" />
                            </div>
                            <div className="space-y-0.5">
                              <div className="font-semibold text-sm text-foreground">{flag.student_name}</div>
                              <div className="text-xs text-muted-foreground">
                                Assessment: <span className="text-foreground font-medium">{flag.assessment_name}</span>
                              </div>
                            </div>
                          </div>
                          <Badge
                            variant="outline"
                            className={cn(
                              "rounded-full px-2.5 py-0.5 text-[10px] font-semibold border uppercase tracking-wider",
                              isHigh
                                ? "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30"
                                : "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30"
                            )}
                          >
                            {flag.risk_level}
                          </Badge>
                        </div>

                        <div className="mt-3 pl-11 space-y-2">
                          <div className="text-xs text-foreground/80 leading-relaxed bg-muted/30 p-2.5 rounded-xl border border-border/40">
                            {flag.description}
                          </div>
                          <div className="flex items-center gap-4 text-[11px] text-muted-foreground font-medium">
                            <span className="flex items-center gap-1.5">
                              <Clock className="size-3 text-muted-foreground/70" />
                              {new Date(flag.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                            <span className="flex items-center gap-1.5">
                              <Shield className="size-3 text-muted-foreground/70" />
                              Status:{" "}
                              <span
                                className={cn(
                                  "font-semibold",
                                  flag.status === "OPEN" ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"
                                )}
                              >
                                {flag.status}
                              </span>
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Security Policy & Oversight Column */}
        <div className="lg:col-span-4 space-y-5">
          <Card className="border border-border/60 shadow-none rounded-2xl bg-card overflow-hidden">
            <CardHeader className="p-5 border-b bg-muted/20">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Shield className="size-4 text-primary" />
                Active Security Rules
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-3.5">
              {[
                { title: "Browser Focus Tracking", desc: "Flags tab switches, window minimization, or split screens.", status: "Active" },
                { title: "Audio & Webcam Anomaly", desc: "Detects multiple voices or absence of candidate.", status: "Active" },
                { title: "Clipboard & Paste Guard", desc: "Blocks external paste attempts during exam writing.", status: "Active" },
                { title: "Device IP Conflict Detection", desc: "Prevents concurrent login tokens across multiple machines.", status: "Active" },
              ].map((rule, idx) => (
                <div key={idx} className="p-3 rounded-xl border border-border/60 bg-muted/10 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">{rule.title}</span>
                    <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 text-[9px] px-1.5 py-0 uppercase">
                      {rule.status}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug">{rule.desc}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border border-border/60 shadow-none rounded-2xl bg-muted/20 p-5 space-y-2">
            <h4 className="text-xs font-semibold text-foreground">Compliance & Archival Notice</h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              All proctoring event logs and cryptographic integrity verification records are retained for institutional accreditation audits.
            </p>
            <Button variant="link" className="p-0 h-auto text-xs font-semibold text-primary inline-flex items-center gap-1 pt-1">
              Institutional Security Standards <ArrowRight className="size-3" />
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
}
