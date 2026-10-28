"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { adminAcademicApi } from "@/lib/api/academic"
import type { AcademicStructure } from "@/lib/academic-structure"
import { errorMessage } from "@/lib/error-message"

/** The structure of one institution, reloaded on demand. Late responses for a previous institution are dropped. */
export function useAcademicStructure(institutionId: string | null) {
  const [structure, setStructure] = useState<AcademicStructure | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const latest = useRef(0)

  const reload = useCallback(async () => {
    if (!institutionId) {
      setStructure(null)
      return
    }
    const request = ++latest.current
    setLoading(true)
    setError(null)
    try {
      const data = await adminAcademicApi.getStructure(institutionId)
      if (request === latest.current) setStructure(data)
    } catch (err) {
      if (request === latest.current) setError(errorMessage(err, "Could not load the academic structure."))
    } finally {
      if (request === latest.current) setLoading(false)
    }
  }, [institutionId])

  useEffect(() => {
    setStructure(null)
    void reload()
  }, [reload])

  return { structure, loading, error, reload }
}
