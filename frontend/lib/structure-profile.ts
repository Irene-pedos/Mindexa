/**
 * How an institution describes its own organisation.
 *
 * The data model is one chain (institution > campus > college > department > programme >
 * year level > class), but only the department and the class are required. Each institution
 * picks which of the optional levels it uses and what it calls them, so the same screens fit
 * a university, a polytechnic, a school or a training centre. The choice is stored in the
 * institution's `settings.structure_profile`.
 *
 * Rules that keep it safe:
 *  - existing records are never hidden because a level is switched off; the profile only
 *    decides what can be ADDED and what the screens are called;
 *  - a year level lives under a programme, so it cannot be on while programmes are off.
 */

export type LevelKey = "campus" | "college" | "department" | "program" | "year" | "class"

export const LEVEL_ORDER: LevelKey[] = ["campus", "college", "department", "program", "year", "class"]

/** Levels every institution has; they cannot be switched off. */
export const REQUIRED_LEVELS: LevelKey[] = ["department", "class"]

export interface LevelLabel {
  singular: string
  plural: string
}

export type PresetKey = "university" | "polytechnic" | "school" | "training" | "custom"

export interface StructureProfile {
  preset: PresetKey
  labels: Record<LevelKey, LevelLabel>
  enabled: Record<LevelKey, boolean>
}

const label = (singular: string, plural = `${singular}s`): LevelLabel => ({ singular, plural })

interface PresetDefinition {
  key: PresetKey
  title: string
  summary: string
  /** One illustrative path, shown on the preset card. */
  example: string
  profile: Omit<StructureProfile, "preset">
}

export const PRESETS: PresetDefinition[] = [
  {
    key: "university",
    title: "University",
    summary: "Campuses, faculties, departments, programmes and years of study.",
    example: "Main campus › Faculty of Law › Department of Public Law › LLB › Year 2 › Class A",
    profile: {
      labels: {
        campus: label("Campus", "Campuses"),
        college: label("Faculty", "Faculties"),
        department: label("Department"),
        program: label("Programme"),
        year: label("Year of study", "Years of study"),
        class: label("Class", "Classes"),
      },
      enabled: { campus: true, college: true, department: true, program: true, year: true, class: true },
    },
  },
  {
    key: "polytechnic",
    title: "Polytechnic / College",
    summary: "Colleges or schools with departments, options and levels.",
    example: "College › Department of ICT › Option: Information Technology › Level 6 › Year 2",
    profile: {
      labels: {
        campus: label("Campus", "Campuses"),
        college: label("College"),
        department: label("Department"),
        program: label("Option"),
        year: label("Level"),
        class: label("Class", "Classes"),
      },
      enabled: { campus: false, college: true, department: true, program: true, year: true, class: true },
    },
  },
  {
    key: "school",
    title: "School (primary / secondary)",
    summary: "Divisions with classes. No faculties, programmes or year levels.",
    example: "Secondary › Grade 8A, Grade 8B",
    profile: {
      labels: {
        campus: label("Campus", "Campuses"),
        college: label("School"),
        department: label("Division"),
        program: label("Stream"),
        year: label("Grade"),
        class: label("Class", "Classes"),
      },
      enabled: { campus: false, college: false, department: true, program: false, year: false, class: true },
    },
  },
  {
    key: "training",
    title: "Training centre",
    summary: "Tracks with programmes and cohorts.",
    example: "Software track › Web Development programme › Cohort 12",
    profile: {
      labels: {
        campus: label("Site"),
        college: label("School"),
        department: label("Track"),
        program: label("Programme"),
        year: label("Stage"),
        class: label("Cohort"),
      },
      enabled: { campus: false, college: false, department: true, program: true, year: false, class: true },
    },
  },
  {
    key: "custom",
    title: "Custom",
    summary: "Choose the levels you need and name them yourself.",
    example: "Start from the standard levels and adjust.",
    profile: {
      labels: {
        campus: label("Campus", "Campuses"),
        college: label("College"),
        department: label("Department"),
        program: label("Programme"),
        year: label("Year level", "Year levels"),
        class: label("Class", "Classes"),
      },
      enabled: { campus: true, college: true, department: true, program: true, year: true, class: true },
    },
  },
]

export const DEFAULT_PRESET: PresetKey = "polytechnic"

export function presetProfile(key: PresetKey): StructureProfile {
  const preset = PRESETS.find((p) => p.key === key) ?? PRESETS[1]
  return {
    preset: preset.key,
    labels: { ...preset.profile.labels },
    enabled: { ...preset.profile.enabled },
  }
}

/** Enforce the invariants (required levels on; a year level needs programmes). */
export function normalizeProfile(profile: StructureProfile): StructureProfile {
  const enabled = { ...profile.enabled }
  for (const key of REQUIRED_LEVELS) enabled[key] = true
  if (!enabled.program) enabled.year = false
  return { ...profile, enabled }
}

const isLabel = (v: unknown): v is LevelLabel =>
  typeof v === "object" &&
  v !== null &&
  typeof (v as LevelLabel).singular === "string" &&
  (v as LevelLabel).singular.trim().length > 0 &&
  typeof (v as LevelLabel).plural === "string" &&
  (v as LevelLabel).plural.trim().length > 0

/** The profile saved in an institution's settings, or null when none was chosen yet. */
export function readProfile(settings: Record<string, unknown> | null | undefined): StructureProfile | null {
  const raw = settings?.structure_profile
  if (typeof raw !== "object" || raw === null) return null
  const saved = raw as Partial<StructureProfile>
  const base = presetProfile(PRESETS.some((p) => p.key === saved.preset) ? (saved.preset as PresetKey) : "custom")

  const labels = { ...base.labels }
  const enabled = { ...base.enabled }
  for (const key of LEVEL_ORDER) {
    const candidate = (saved.labels as Record<string, unknown> | undefined)?.[key]
    if (isLabel(candidate)) labels[key] = { singular: candidate.singular.trim(), plural: candidate.plural.trim() }
    const flag = (saved.enabled as Record<string, unknown> | undefined)?.[key]
    if (typeof flag === "boolean") enabled[key] = flag
  }
  return normalizeProfile({ preset: base.preset, labels, enabled })
}

/** What to show before an institution has chosen: every level available, standard names. */
export function profileOrDefault(settings: Record<string, unknown> | null | undefined): StructureProfile {
  return readProfile(settings) ?? presetProfile("custom")
}

/** The settings fragment to save. The server merges it into the existing settings. */
export function profileToSettings(profile: StructureProfile): { structure_profile: StructureProfile } {
  return { structure_profile: normalizeProfile(profile) }
}

export const lower = (text: string): string => text.toLowerCase()
