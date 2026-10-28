import { Suspense } from "react"
import { StructureBuilder } from "@/components/mindexa/admin/structure/structure-builder"

export const metadata = { title: "Academic Structure" }

export default function AcademicStructurePage() {
  return (
    <Suspense fallback={null}>
      <StructureBuilder />
    </Suspense>
  )
}
