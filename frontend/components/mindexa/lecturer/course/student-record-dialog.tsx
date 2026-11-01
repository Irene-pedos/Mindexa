"use client"

import { useEffect, useState } from "react"
import { format } from "date-fns"
import { Activity, GraduationCap } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { lecturerApi, type StudentCourseRecordResponse } from "@/lib/api/lecturer"
import { errorMessage } from "@/lib/error-message"

interface StudentRecordDialogProps {
  workspaceId: string
  student: { id: string; name: string } | null
  onClose: () => void
}

export function StudentRecordDialog({ workspaceId, student, onClose }: StudentRecordDialogProps) {
  return (
    <Dialog open={student !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        {student && <RecordBody workspaceId={workspaceId} student={student} />}
      </DialogContent>
    </Dialog>
  )
}

function RecordBody({ workspaceId, student }: { workspaceId: string; student: { id: string; name: string } }) {
  const [record, setRecord] = useState<StudentCourseRecordResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    lecturerApi
      .getStudentRecord(workspaceId, student.id)
      .then((data) => live && setRecord(data))
      .catch((err: unknown) => live && setError(errorMessage(err, "Could not load this student's record.")))
    return () => {
      live = false
    }
  }, [workspaceId, student.id])

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <GraduationCap className="size-4.5 text-primary" />
          {student.name}
        </DialogTitle>
        <DialogDescription>Progress and assessment attempts in this course.</DialogDescription>
      </DialogHeader>

      {error ? (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : !record ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
        </div>
      ) : (
        <div className="space-y-4">
          <dl className="grid grid-cols-2 gap-3 rounded-xl border bg-muted/20 p-3 text-xs sm:grid-cols-4">
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Student ID</dt>
              <dd className="mt-0.5 font-mono font-medium">{record.student_id}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Email</dt>
              <dd className="mt-0.5 truncate font-medium" title={record.email}>
                {record.email}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Enrolled</dt>
              <dd className="mt-0.5 font-medium">{record.enrolled_at ? format(new Date(record.enrolled_at), "MMM d, yyyy") : "Not recorded"}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Progress</dt>
              <dd className="mt-0.5 text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{record.overall_progress}%</dd>
            </div>
          </dl>

          <section className="space-y-2">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Activity className="size-3.5 text-primary" /> Assessment attempts ({record.attempts?.length ?? 0})
            </h3>
            <ul className="max-h-64 divide-y overflow-y-auto rounded-xl border">
              {!record.attempts || record.attempts.length === 0 ? (
                <li className="p-6 text-center text-xs text-muted-foreground">No attempts recorded for this student yet.</li>
              ) : (
                record.attempts.map((att) => (
                  <li key={att.id} className="flex items-center justify-between gap-3 p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{att.assessment_title}</p>
                      <p className="text-xs text-muted-foreground">
                        {att.submitted_at ? format(new Date(att.submitted_at), "MMM d, HH:mm") : "Not submitted yet"} · {att.status}
                      </p>
                    </div>
                    {att.percentage !== null ? (
                      <span className="text-sm font-bold tabular-nums text-primary">{att.percentage}%</span>
                    ) : (
                      <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-700 dark:text-amber-400">
                        In progress
                      </Badge>
                    )}
                  </li>
                ))
              )}
            </ul>
          </section>
        </div>
      )}
    </>
  )
}
