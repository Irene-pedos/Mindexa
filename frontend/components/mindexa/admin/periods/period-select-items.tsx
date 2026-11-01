"use client"

import { SelectGroup, SelectItem, SelectLabel } from "@/components/ui/select"
import { pickerGroups, type PeriodLike } from "@/lib/academic-period"

/**
 * The choices for "which period?": each semester under its academic year's heading, and a year
 * only when it has no semesters. Courses and assignments belong to a semester, not to the year
 * around it, so the year itself is not offered when it has semesters.
 */
export function PeriodSelectItems({ periods }: { periods: PeriodLike[] }) {
  return (
    <>
      {pickerGroups(periods).map((group) =>
        group.label ? (
          <SelectGroup key={group.label}>
            <SelectLabel className="text-xs text-muted-foreground">{group.label}</SelectLabel>
            {group.items.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        ) : (
          group.items.map((item) => (
            <SelectItem key={item.id} value={item.id}>
              {item.label}
            </SelectItem>
          ))
        ),
      )}
    </>
  )
}
