"use client";

import { integrityApi, IntegrityFlag } from "@/lib/api/integrity"
import { toast } from "sonner"
import { Loader2, AlertTriangle, Clock, User } from "lucide-react"
import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"

export default function LecturerIntegrityPage() {
  const [flags, setFlags] = useState<IntegrityFlag[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchFlags()
  }, [])

  const fetchFlags = async () => {
    setLoading(true)
    try {
      const response = await integrityApi.getFlags()
      // API returns { total, page, flags: [...] }
      setFlags(response.flags || [])
    } catch (e: any) {
      toast.error(e.message || "Failed to load integrity flags")
    } finally {
      setLoading(false)
    }
  }

  const handleResolve = async (id: string) => {
    const notes = prompt("Enter resolution notes (min 5 characters):")
    if (notes === null) return
    if (notes.length < 5) {
        toast.error("Resolution notes are too short")
        return
    }

    try {
      await integrityApi.resolveFlag(id, { status: "CONFIRMED", resolution_notes: notes })
      toast.success("Flag resolved")
      fetchFlags()
    } catch (e: any) {
      toast.error(e.message || "Failed to resolve flag")
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight flex items-center gap-3">
          <AlertTriangle className="size-8 text-red-600" /> Integrity & Security Logs
        </h1>
        <p className="text-muted-foreground mt-1">Complete audit trail of all flagged events across assessments</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Integrity Events</CardTitle>
          <CardDescription>All flagged attempts requiring review</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[620px]">
            <div className="space-y-5">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <Loader2 className="size-8 animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Loading logs...</p>
                </div>
              ) : flags.length === 0 ? (
                <div className="text-center py-20 text-muted-foreground">No integrity flags found.</div>
              ) : (
                flags.map((log) => (
                  <div key={log.id} className="border rounded-2xl p-6 hover:bg-muted/50 transition-all">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-full bg-red-100 dark:bg-red-950 flex items-center justify-center">
                          <User className="size-5 text-red-600" />
                        </div>
                        <div>
                          <div className="font-semibold">{log.student_name || "Unknown Student"}</div>
                          <div className="text-sm text-muted-foreground">{log.assessment_name || "Unknown Assessment"}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant={log.risk_level === "HIGH" || log.risk_level === "CRITICAL" ? "destructive" : "default"}>
                          {log.risk_level} Risk
                        </Badge>
                        <Badge variant="outline">{log.status}</Badge>
                      </div>
                    </div>

                    <div className="mt-5 pl-14">
                      <div className="font-medium text-red-600">{log.description}</div>
                      <div className="text-xs text-muted-foreground flex items-center justify-between mt-4">
                        <div className="flex items-center gap-2">
                          <Clock className="size-4" /> {new Date(log.created_at).toLocaleString()}
                        </div>
                        {log.status === "OPEN" && (
                          <Button size="sm" variant="outline" onClick={() => handleResolve(log.id)}>Resolve Flag</Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button variant="outline">Export Full Integrity Report (PDF)</Button>
      </div>
    </div>
  )
}

