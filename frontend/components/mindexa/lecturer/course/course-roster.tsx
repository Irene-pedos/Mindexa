"use client"

import { useState } from "react"
import { ChevronRight, Search, Users } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import type { LecturerCourseRosterItem } from "@/lib/api/lecturer"

interface CourseRosterProps {
  roster: LecturerCourseRosterItem[]
  onOpen: (student: LecturerCourseRosterItem) => void
}

/** The students of a course. Rows are buttons, so the whole row is reachable by keyboard. */
export function CourseRoster({ roster, onOpen }: CourseRosterProps) {
  const [search, setSearch] = useState("")
  const q = search.trim().toLowerCase()
  const shown = q
    ? roster.filter((s) => s.name.toLowerCase().includes(q) || s.student_id.toLowerCase().includes(q) || s.email.toLowerCase().includes(q))
    : roster

  return (
    <div className="overflow-hidden rounded-2xl border bg-card">
      <div className="flex flex-col gap-2 border-b bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold">Students ({roster.length})</p>
          <p className="text-xs text-muted-foreground">Progress is the share of published assessments each student has submitted.</p>
        </div>
        {roster.length > 5 && (
          <div className="relative w-full sm:w-60">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Search students"
              placeholder="Name, ID or email"
              className="h-8 pl-8 text-xs"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        )}
      </div>

      {shown.length === 0 ? (
        <div className="px-4 py-12 text-center">
          <Users className="mx-auto mb-2 size-7 text-muted-foreground/50" />
          <p className="text-sm font-medium">{roster.length === 0 ? "No students in this course yet" : "No student matches your search"}</p>
          {roster.length === 0 && (
            <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
              Students appear here when they are enrolled in the class this course is set up for.
            </p>
          )}
        </div>
      ) : (
        <ul className="divide-y">
          {shown.map((student, index) => (
            <li key={student.id}>
              <button
                type="button"
                onClick={() => onOpen(student)}
                style={{ animationDelay: `${Math.min(index, 10) * 20}ms` }}
                className="group grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 px-4 py-3 text-left transition-colors hover:bg-muted/30 focus-visible:bg-muted/30 focus-visible:outline-none motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300 motion-safe:fill-mode-backwards sm:grid-cols-[7rem_minmax(0,1fr)_9rem_1.25rem]"
              >
                <span className="order-2 font-mono text-xs text-muted-foreground sm:order-none">{student.student_id}</span>
                <span className="order-1 min-w-0 sm:order-none">
                  <span className="block truncate text-sm font-medium group-hover:text-primary">{student.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{student.email}</span>
                </span>
                <span className="order-3 col-span-2 flex items-center gap-2 sm:order-none sm:col-span-1">
                  <Progress value={student.progress} className="h-1.5" />
                  <span className="w-9 shrink-0 text-right text-xs font-semibold tabular-nums">{student.progress}%</span>
                </span>
                <ChevronRight className="hidden size-4 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 sm:block" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
