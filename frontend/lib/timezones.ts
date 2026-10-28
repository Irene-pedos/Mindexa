/**
 * Timezone names for the institution forms.
 *
 * The server accepts only real IANA names ("Africa/Kigali", "UTC"); a free-text box let people
 * save things like "UTC+2" that break date handling. The browser knows the full list.
 */

const FALLBACK = [
  "UTC",
  "Africa/Kigali",
  "Africa/Nairobi",
  "Africa/Kampala",
  "Africa/Dar_es_Salaam",
  "Africa/Lagos",
  "Africa/Johannesburg",
  "Africa/Cairo",
  "Europe/London",
  "Europe/Paris",
  "America/New_York",
  "Asia/Dubai",
  "Asia/Kolkata",
]

export function timezoneNames(): string[] {
  const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf
  const all = supported ? supported("timeZone") : FALLBACK
  return all.includes("UTC") ? all : ["UTC", ...all]
}

export function isValidTimezone(name: string, list: readonly string[] = timezoneNames()): boolean {
  return list.includes(name.trim())
}

/** The viewer's own timezone, a sensible default for a new institution. */
export function browserTimezone(): string {
  try {
    const guess = Intl.DateTimeFormat().resolvedOptions().timeZone
    return guess && isValidTimezone(guess) ? guess : "UTC"
  } catch {
    return "UTC"
  }
}

/** "Africa/Kigali" -> "Africa / Kigali" for display. */
export function timezoneLabel(name: string | null | undefined): string {
  if (!name) return "UTC"
  return name.replace(/_/g, " ").replace(/\//g, " / ")
}
