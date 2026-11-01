/**
 * How a course material looks while it is being prepared for the AI tools (reading the file,
 * splitting it, creating embeddings). Pure helpers so the panel and the tests share one source.
 */

export type MaterialPhase = "ready" | "working" | "waiting" | "failed"

export interface MaterialLike {
  processing_status: string
  processing_progress?: number
  processing_stage?: string | null
  processing_error?: string | null
  chunk_count?: number | null
  file_extension?: string
}

export interface MaterialView {
  phase: MaterialPhase
  /** 0-100; only meaningful for "working". */
  percent: number
  /** One short line for the row, e.g. "Creating embeddings · 45%". */
  label: string
  /** True while polling is worth doing. */
  active: boolean
}

const STAGE_LABEL: Record<string, string> = {
  QUEUED: "Waiting to start",
  READING: "Reading the file",
  CHUNKING: "Splitting into sections",
  EMBEDDING: "Creating AI embeddings",
  SAVING: "Saving the index",
  RETRYING: "The AI service was slow. Trying again automatically",
}

export const stageLabel = (stage: string | null | undefined): string =>
  (stage && STAGE_LABEL[stage]) || "Preparing for the AI tools"

const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg"]

export function materialView(m: MaterialLike): MaterialView {
  const status = (m.processing_status || "").toUpperCase()
  // Pictures are stored for download but have no text to index, so they never "fail".
  if (IMAGE_EXTENSIONS.includes((m.file_extension || "").toLowerCase())) {
    return { phase: "ready", percent: 100, label: "Image · available to download, not used by the AI tools", active: false }
  }
  const percent = Math.max(0, Math.min(100, Math.round(m.processing_progress ?? 0)))

  if (status === "PROCESSED" || status === "COMPLETED") {
    const sections = m.chunk_count ?? 0
    return {
      phase: "ready",
      percent: 100,
      label: sections > 0 ? `Ready for the AI tools · ${sections} section${sections === 1 ? "" : "s"}` : "Ready for the AI tools",
      active: false,
    }
  }
  if (status === "FAILED") {
    return { phase: "failed", percent, label: m.processing_error || "Preparing this file for the AI tools failed.", active: false }
  }
  if (status === "PROCESSING") {
    const stage = m.processing_stage
    return {
      phase: stage === "RETRYING" ? "waiting" : "working",
      percent,
      label: percent > 0 && stage !== "RETRYING" ? `${stageLabel(stage)} · ${percent}%` : stageLabel(stage),
      active: true,
    }
  }
  // PENDING: queued, or between automatic retries
  return {
    phase: "waiting",
    percent,
    label: stageLabel(m.processing_stage ?? "QUEUED"),
    active: true,
  }
}

/** Whether any material still needs its status refreshed. */
export const anyActive = (materials: MaterialLike[]): boolean => materials.some((m) => materialView(m).active)

export type UploadPhase = "uploading" | "failed"

export interface UploadItem {
  key: string
  file: File
  category: string
  visible: boolean
  phase: UploadPhase
  error?: string
}

/** Largest file the server accepts, shown before a doomed upload starts. */
export const MAX_UPLOAD_MB = 100

export function validateUploadFile(file: File, maxMb: number = MAX_UPLOAD_MB): string | null {
  if (file.size === 0) return "This file is empty."
  if (file.size > maxMb * 1024 * 1024) return `This file is over ${maxMb} MB.`
  const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : ""
  if (!["pdf", "docx", "doc", "txt", "png", "jpg", "jpeg"].includes(ext))
    return "Upload a PDF, Word document, text file or image."
  return null
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
