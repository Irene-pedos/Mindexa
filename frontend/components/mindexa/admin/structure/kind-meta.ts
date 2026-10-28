import { Building2, GraduationCap, Landmark, Layers, Library, MapPin, Users, type LucideIcon } from "lucide-react"
import type { NodeKind } from "@/lib/academic-structure"
import type { LevelKey, StructureProfile } from "@/lib/structure-profile"

export const KIND_ICON: Record<NodeKind, LucideIcon> = {
  institution: Building2,
  campus: MapPin,
  college: Landmark,
  department: Library,
  program: GraduationCap,
  year: Layers,
  class: Users,
}

/** Soft colour per level so a node's type is recognisable at a glance. */
export const KIND_TONE: Record<NodeKind, string> = {
  institution: "bg-primary/10 text-primary",
  campus: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  college: "bg-violet-500/10 text-violet-700 dark:text-violet-400",
  department: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  program: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  year: "bg-rose-500/10 text-rose-700 dark:text-rose-400",
  class: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
}

/** What a level is called by this institution ("Faculty", "Division", ...). */
export function kindLabel(profile: StructureProfile, kind: NodeKind, plural = false): string {
  if (kind === "institution") return plural ? "Institutions" : "Institution"
  const label = profile.labels[kind as LevelKey]
  return plural ? label.plural : label.singular
}

/** One line on what a level is for, shown in empty states and the add menu. */
export const KIND_HINT: Record<LevelKey, string> = {
  campus: "A physical site of the institution.",
  college: "A faculty, school or college that groups departments.",
  department: "A unit that owns courses, programmes and classes.",
  program: "A degree programme or specialization offered by a department.",
  year: "A stage of a programme (a year or level) that groups classes.",
  class: "A group of students taught together. Students enrol in classes.",
}
