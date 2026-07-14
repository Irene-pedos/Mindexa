"use client";

import { integrityApi, IntegrityFlag } from "@/lib/api/integrity";
import { toast } from "sonner";
import { AlertTriangle, Clock, User } from "lucide-react";
import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { AIIntegrityExplainer } from "@/components/mindexa/integrity/ai-explainer";

export default function LecturerIntegrityPage() {
  const [flags, setFlags] = useState<IntegrityFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetchFlags();
  }, []);

  const fetchFlags = async () => {
    setLoading(true);
    try {
      const response = await integrityApi.getFlags();
      setFlags(response.flags || []);
    } catch (e: any) {
      toast.error(e.message || "Failed to load integrity flags");
    } finally {
      setLoading(false);
    }
  };

  const handleResolve = async (id: string) => {
    const notes = prompt("Enter resolution notes (min 5 characters):");
    if (notes === null) return;
    if (notes.length < 5) {
      toast.error("Resolution notes are too short");
      return;
    }

    try {
      await integrityApi.resolveFlag(id, {
        status: "CONFIRMED",
        resolution_notes: notes,
      });
      toast.success("Flag resolved");
      fetchFlags();
    } catch (e: any) {
      toast.error(e.message || "Failed to resolve flag");
    }
  };

  return (
    <div className="w-full space-y-3.5 p-1 md:p-2 animate-in fade-in duration-200">
      <div className="border-b pb-2">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
          Integrity & Security Logs
        </h1>
        <p className="text-sm text-muted-foreground mt-1 font-medium">
          Complete audit trail of all flagged events across assessments.
        </p>
      </div>

      <Card className="rounded-xl border border-amber-250 bg-amber-50/40 shadow-none p-3.5">
        <CardContent className="p-0 text-xs text-amber-900/80 leading-normal font-semibold">
          Integrity flags are review recommendations, not automatic penalties. Mindexa can surface suspicious patterns, but final academic decisions must always be confirmed by a lecturer or authorized reviewer.
        </CardContent>
      </Card>

      <Card className="rounded-xl border border-zinc-200 shadow-none overflow-hidden">
        <CardHeader className="border-b bg-zinc-50/50 p-3.5">
          <CardTitle className="text-xs font-bold text-zinc-800 uppercase tracking-wider">Recent Integrity Events</CardTitle>
          <CardDescription className="text-[11px] text-muted-foreground font-semibold mt-0.5">
            All flagged attempts requiring review
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[620px]">
            <div className="divide-y">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="p-5 md:p-6 space-y-4">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-4">
                        <Skeleton className="size-10 rounded-full" />
                        <div className="space-y-1.5">
                          <Skeleton className="h-4 w-32" />
                          <Skeleton className="h-3 w-48 opacity-60" />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Skeleton className="h-6 w-20 rounded-md" />
                        <Skeleton className="h-6 w-20 rounded-md" />
                      </div>
                    </div>
                    <div className="pl-14">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-3 w-32 mt-4 opacity-40" />
                    </div>
                  </div>
                ))
              ) : flags.length === 0 ? (
                <div className="text-center py-20 text-xs font-semibold text-muted-foreground">
                  No integrity flags found.
                </div>
              ) : (
                flags.map((log) => (
                  <div
                    key={log.id}
                    className="p-5 md:p-6 hover:bg-zinc-50/50 transition-all text-left"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-red-50 flex items-center justify-center border border-red-100">
                          <User className="size-4.5 text-red-600" />
                        </div>
                        <div>
                          <div className="font-bold text-zinc-800 text-xs">
                            {log.student_name || "Unknown Student"}
                          </div>
                          <div className="text-[11px] text-zinc-500 font-semibold">
                            {log.assessment_name || "Unknown Assessment"}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap justify-end">
                        {(log as any).is_automated && (
                          <Badge variant="outline" className="rounded-full h-4 text-[7px] font-black bg-red-600 text-white border-none">
                            AUTO-TERMINATED
                          </Badge>
                        )}
                        <Badge
                          variant={
                            log.risk_level === "HIGH" ||
                            log.risk_level === "CRITICAL"
                              ? "destructive"
                              : "default"
                          }
                          className="rounded-full h-4 text-[8px] font-black uppercase tracking-wider"
                        >
                          {log.risk_level} RISK
                        </Badge>
                        <Badge
                          variant="outline"
                          className="rounded-full h-4 text-[8px] font-black uppercase tracking-wider border-zinc-300"
                        >
                          {log.status}
                        </Badge>
                      </div>
                    </div>

                    <div className="mt-3 pl-12">
                      <div className="font-semibold text-red-800 bg-red-500/5 border border-red-100 p-2.5 rounded-lg text-xs leading-relaxed italic">
                        {log.description}
                      </div>
                      <div className="text-[9px] text-zinc-400 flex items-center justify-between mt-4 font-bold uppercase tracking-wider">
                        <div className="flex items-center gap-1.5">
                          <Clock className="size-3 text-zinc-400" />{" "}
                          {new Date(log.created_at).toLocaleString()}
                        </div>
                        <div className="flex gap-1.5">
                           <Button
                            size="sm"
                            variant="ghost"
                            className="rounded-lg h-7 text-[9px] font-bold uppercase border"
                            onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                          >
                            {expandedId === log.id ? "Hide Details" : "AI Analysis"}
                          </Button>
                          {log.status === "OPEN" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="rounded-lg h-7 text-[9px] font-bold uppercase border-zinc-200 bg-white"
                              onClick={() => handleResolve(log.id)}
                            >
                              Resolve
                            </Button>
                          )}
                        </div>
                      </div>

                      {expandedId === log.id && (
                        <div className="mt-6 pt-6 border-t border-dashed animate-in fade-in slide-in-from-top-2 duration-300">
                           <AIIntegrityExplainer flagId={log.id} />
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button variant="outline" size="sm" className="rounded-lg h-8 text-[10px] font-bold uppercase tracking-wider border-zinc-200 bg-white shadow-none">
          Export Full Integrity Report (PDF)
        </Button>
      </div>
    </div>
  );
}
