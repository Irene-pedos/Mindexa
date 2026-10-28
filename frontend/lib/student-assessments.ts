/**
 * Pure rules behind the student's assessment list and the pre-start checklist, kept out of the
 * components so they can be tested: which tab an assessment belongs to, how each tab is ordered,
 * what kind of session it is, and the rules the student is shown before starting.
 */
import type { AssessmentCategory } from "./grading-architecture"
import type { StudentAssessment } from "./api/assessment"

export type AssessmentTab = "active" | "upcoming" | "submitted" | "missed" | "violations"

export const TAB_ORDER: AssessmentTab[] = ["active", "upcoming", "submitted", "missed", "violations"]

export function tabOf(category: AssessmentCategory): AssessmentTab {
  switch (category) {
    case "ACTIVE":
    case "IN_PROGRESS":
      return "active"
    case "UPCOMING":
      return "upcoming"
    case "SUBMITTED":
    case "GRADED":
      return "submitted"
    case "MISSED":
      return "missed"
    case "VIOLATION":
      return "violations"
  }
}

const time = (iso: string | null | undefined, fallback: number): number => (iso ? new Date(iso).getTime() : fallback)

/** What needs the student first: running attempts, then whatever closes soonest; finished work newest first. */
export function sortForTab<T extends StudentAssessment>(tab: AssessmentTab, items: T[]): T[] {
  const list = [...items]
  if (tab === "active") {
    return list.sort((a, b) => {
      const ra = a.student_status === "IN_PROGRESS" ? 0 : 1
      const rb = b.student_status === "IN_PROGRESS" ? 0 : 1
      return ra - rb || time(a.window_end, Infinity) - time(b.window_end, Infinity)
    })
  }
  if (tab === "upcoming") return list.sort((a, b) => time(a.window_start, Infinity) - time(b.window_start, Infinity))
  return list.sort((a, b) => time(b.window_end ?? b.window_start, 0) - time(a.window_end ?? a.window_start, 0))
}

export type SessionKind = "homework" | "practice" | "exam"

/** Homework and practice are open sessions; everything else is a monitored sitting. */
export function sessionKind(a: Pick<StudentAssessment, "assessment_type" | "integrity_monitoring_enabled">): SessionKind {
  const type = (a.assessment_type || "").toUpperCase()
  if (type === "HOMEWORK") return "homework"
  if (type === "FORMATIVE" && a.integrity_monitoring_enabled === false) return "practice"
  return "exam"
}

export interface StartRule {
  id: string
  tone: "neutral" | "important" | "positive"
  title: string
  text: string
}

const stamp = (iso: string): string =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })

/** The rules shown before starting, built only from what this assessment is actually set to. */
export function startRules(a: StudentAssessment): StartRule[] {
  const rules: StartRule[] = []
  const left = Math.max(0, a.max_attempts - a.attempts_used)

  rules.push({
    id: "time",
    tone: "neutral",
    title: a.duration_minutes ? `${a.duration_minutes} minutes` : "No time limit",
    text: a.window_end
      ? `The window closes ${stamp(a.window_end)}. Anything not submitted by then is submitted for you.`
      : "You can take it whenever you are ready.",
  })

  rules.push({
    id: "attempts",
    tone: "neutral",
    title: `Attempt ${Math.min(a.max_attempts, a.attempts_used + 1)} of ${a.max_attempts}`,
    text: left > 1 ? `${left} attempts remain, including this one.` : "This is your last attempt.",
  })

  rules.push(
    a.allow_resume
      ? {
          id: "resume",
          tone: "positive",
          title: "You can pause and come back",
          text: "Your answers are saved as you go and you can resume before the window closes.",
        }
      : {
          id: "resume",
          tone: "important",
          title: "No pausing",
          text: "Once you start, the timer keeps running even if you leave the page.",
        },
  )

  if (a.integrity_monitoring_enabled) {
    rules.push({
      id: "monitoring",
      tone: "important",
      title: a.fullscreen_required ? "Fullscreen and monitoring" : "Integrity monitoring",
      text: a.fullscreen_required
        ? "Stay in fullscreen. Switching tabs, opening other apps or leaving fullscreen is recorded and repeated violations submit your work automatically."
        : "Switching tabs or apps is recorded. Repeated violations submit your work automatically.",
    })
  } else {
    rules.push({
      id: "monitoring",
      tone: "positive",
      title: "No integrity monitoring",
      text: "Switching tabs or windows will not raise a warning.",
    })
  }

  rules.push({
    id: "materials",
    tone: a.is_open_book ? "positive" : "important",
    title: a.is_open_book ? "Open book" : "Closed book",
    text: a.is_open_book
      ? "You may use your notes and course materials."
      : "Do not use notes, books or the internet unless a question says so.",
  })

  rules.push({
    id: "ai",
    tone: a.ai_assistance_allowed ? "positive" : "important",
    title: a.ai_assistance_allowed ? "AI study assistant available" : "No AI assistance",
    text: a.ai_assistance_allowed
      ? "You can ask the AI tutor for explanations while you work."
      : "AI tools are switched off for this assessment.",
  })

  if (a.is_password_protected) {
    rules.push({
      id: "password",
      tone: "important",
      title: "Access password",
      text: "You will be asked for the password your lecturer gave you.",
    })
  }
  return rules
}

export const START_COPY: Record<SessionKind, { title: string; description: string; cta: string }> = {
  homework: {
    title: "Before you start your homework",
    description: "Take-home work: read the rules and the deadline below.",
    cta: "Start homework",
  },
  practice: {
    title: "Before you start your practice",
    description: "A practice session is for learning and is not monitored.",
    cta: "Start practice",
  },
  exam: {
    title: "Before you start",
    description: "Please read the rules for this assessment.",
    cta: "Start assessment",
  },
}

/** Friendly wording for why an eligibility rule is stopping the student. */
export function blockedMessage(reason: string | null | undefined): string {
  if (!reason) return ""
  return "You are not eligible to start this assessment right now. Please contact your lecturer or your institution's office."
}
