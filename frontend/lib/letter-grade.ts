/** The API sends letter grades as enum names ("A_PLUS"); show them the way people write them ("A+"). */
export function formatLetterGrade(grade: string | null | undefined): string {
  if (!grade) return "—"
  return grade.replace(/_PLUS$/i, "+").replace(/_MINUS$/i, "-")
}
