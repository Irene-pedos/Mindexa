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
    <div className="space-y-8">
      <div className="flex flex-col gap-0.5">
        <h1 className="text-3xl font-semibold tracking-tight flex items-center gap-3">
          Integrity & Security Logs
        </h1>
        <p className="text-muted-foreground mt-1">
          Complete audit trail of all flagged events across assessments
        </p>
      </div>

      <Card className="rounded-2xl border-amber-200 bg-amber-50/40 shadow-none">
        <CardContent className="py-4 px-5 text-sm text-amber-900/80 leading-relaxed">
          Integrity flags are review recommendations, not automatic penalties. Mindexa can surface suspicious patterns, but final academic decisions must always be confirmed by a lecturer or authorized reviewer.
        </CardContent>
      </Card>

      <Card className="rounded-2xl border shadow-none">
        <CardHeader className="border-b bg-muted/5">
          <CardTitle>Recent Integrity Events</CardTitle>
          <CardDescription>
            All flagged attempts requiring review
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[620px]">
            <div className="divide-y">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="p-8 space-y-4">
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
                <div className="text-center py-20 text-muted-foreground">
                  No integrity flags found.
                </div>
              ) : (
                flags.map((log) => (
                  <div
                    key={log.id}
                    className="p-8 hover:bg-muted/30 transition-all"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center border border-red-200">
                          <User className="size-5 text-red-600" />
                        </div>
                        <div>
                          <div className="font-semibold">
                            {log.student_name || "Unknown Student"}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {log.assessment_name || "Unknown Assessment"}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {(log as any).is_automated && (
                          <Badge variant="outline" className="rounded-full h-5 text-[8px] font-black bg-red-600 text-white border-none">
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
                          className="rounded-full h-5 text-[10px] font-bold"
                        >
                          {log.risk_level} RISK
                        </Badge>
                        <Badge
                          variant="outline"
                          className="rounded-full h-5 text-[10px] font-bold"
                        >
                          {log.status}
                        </Badge>
                      </div>
                    </div>

                    <div className="mt-5 pl-14">
                      <div className="font-medium text-red-700/80 bg-red-50/50 border border-red-100 p-3 rounded-xl text-sm italic">
                        {log.description}
                      </div>
                      <div className="text-[10px] text-muted-foreground flex items-center justify-between mt-6 font-bold uppercase tracking-wider">
                        <div className="flex items-center gap-2">
                          <Clock className="size-3.5" />{" "}
                          {new Date(log.created_at).toLocaleString()}
                        </div>
                        <div className="flex gap-2">
                           <Button
                            size="sm"
                            variant="ghost"
                            className="rounded-full h-8 text-[10px] font-bold"
                            onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                          >
                            {expandedId === log.id ? "Hide Details" : "View Details & AI Analysis"}
                          </Button>
                          {log.status === "OPEN" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="rounded-full h-8 text-[10px] font-bold"
                              onClick={() => handleResolve(log.id)}
                            >
                              Resolve Flag
                            </Button>
                          )}
                        </div>
                      </div>

                      {expandedId === log.id && (
                        <div className="mt-8 pt-8 border-t border-dashed animate-in fade-in slide-in-from-top-2 duration-300">
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
        <Button variant="outline" className="rounded-full">
          Export Full Integrity Report (PDF)
        </Button>
      </div>
    </div>
  );
}
