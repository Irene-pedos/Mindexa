import { Suspense } from "react"
import { AssignmentsRegistry } from "@/components/mindexa/admin/assignments/assignments-registry"

export const metadata = { title: "Teaching Assignments" }

export default function AdminAssignmentPanel() {
  return (
    <Suspense fallback={null}>
      <AssignmentsRegistry />
    </Suspense>
  )
}
