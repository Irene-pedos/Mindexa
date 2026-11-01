"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  EyeOff,
  FileText,
  Loader2,
  RotateCw,
  Search,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { lecturerApi, type LecturerMaterialResponse } from "@/lib/api/lecturer"
import { errorMessage } from "@/lib/error-message"
import {
  anyActive,
  formatBytes,
  materialView,
  validateUploadFile,
  type UploadItem,
} from "@/lib/material-processing"
import { cn } from "@/lib/utils"

export const MATERIAL_CATEGORIES: { value: string; label: string }[] = [
  { value: "LECTURE_NOTES", label: "Lecture notes" },
  { value: "SYLLABUS", label: "Syllabus" },
  { value: "ASSIGNMENT_SPECS", label: "Assignment specs" },
  { value: "RUBRIC", label: "Rubric" },
  { value: "REFERENCE_MATERIALS", label: "Reference material" },
]

const categoryLabel = (value: string) => MATERIAL_CATEGORIES.find((c) => c.value === value)?.label ?? "Material"
const POLL_MS = 3000

interface MaterialsPanelProps {
  workspaceId: string
  materials: LecturerMaterialResponse[]
  onMaterials: (update: (current: LecturerMaterialResponse[]) => LecturerMaterialResponse[]) => void
}

export function MaterialsPanel({ workspaceId, materials, onMaterials }: MaterialsPanelProps) {
  const [category, setCategory] = useState("LECTURE_NOTES")
  const [visible, setVisible] = useState(true)
  const [queue, setQueue] = useState<UploadItem[]>([])
  const [dragging, setDragging] = useState(false)
  const [search, setSearch] = useState("")
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  // While any file is still being prepared for the AI tools, refresh the list every few seconds
  // so its progress bar moves and the result (ready or failed) appears without a reload.
  const polling = anyActive(materials)
  useEffect(() => {
    if (!polling) return
    let live = true
    const id = setInterval(() => {
      lecturerApi
        .getWorkspaceMaterials(workspaceId)
        .then((rows) => live && onMaterials(() => rows))
        .catch(() => undefined) // a missed refresh is harmless; the next one fixes it
    }, POLL_MS)
    return () => {
      live = false
      clearInterval(id)
    }
  }, [polling, workspaceId, onMaterials])

  const patchQueue = useCallback((key: string, patch: Partial<UploadItem>) => {
    setQueue((q) => q.map((item) => (item.key === key ? { ...item, ...patch } : item)))
  }, [])

  const send = useCallback(
    async (item: UploadItem) => {
      patchQueue(item.key, { phase: "uploading", error: undefined })
      try {
        const form = new FormData()
        form.append("file", item.file)
        form.append("teaching_workspace_id", workspaceId)
        form.append("material_category", item.category)
        form.append("is_student_visible", String(item.visible))
        const created = await lecturerApi.uploadMaterial(form)
        setQueue((q) => q.filter((entry) => entry.key !== item.key))
        onMaterials((current) => [created, ...current.filter((m) => m.id !== created.id)])
      } catch (err) {
        patchQueue(item.key, {
          phase: "failed",
          error: errorMessage(err, "The upload did not finish. Check your connection and try again."),
        })
      }
    },
    [onMaterials, patchQueue, workspaceId],
  )

  const addFiles = (files: FileList | File[]) => {
    const accepted: UploadItem[] = []
    for (const file of Array.from(files)) {
      const problem = validateUploadFile(file)
      if (problem) {
        toast.error(`${file.name}: ${problem}`)
        continue
      }
      accepted.push({ key: `${file.name}-${file.size}-${crypto.randomUUID()}`, file, category, visible, phase: "uploading" })
    }
    if (accepted.length === 0) return
    setQueue((q) => [...accepted, ...q])
    accepted.forEach((item) => void send(item))
  }

  const retryIndexing = async (material: LecturerMaterialResponse) => {
    setBusyId(material.id)
    try {
      const updated = await lecturerApi.retryMaterialProcessing(material.id)
      onMaterials((current) => current.map((m) => (m.id === updated.id ? updated : m)))
      toast.success("Preparing the file again")
    } catch (err) {
      toast.error(errorMessage(err, "Could not restart this file."))
    } finally {
      setBusyId(null)
    }
  }

  const confirmDelete = async () => {
    const id = deleteId
    setDeleteId(null)
    if (!id) return
    try {
      await lecturerApi.deleteMaterial(id)
      onMaterials((current) => current.filter((m) => m.id !== id))
      toast.success("Material removed")
    } catch (err) {
      toast.error(errorMessage(err, "Could not remove this material."))
    }
  }

  const download = async (m: LecturerMaterialResponse) => {
    try {
      await lecturerApi.downloadMaterial(m.id, m.original_filename)
    } catch {
      toast.error("Could not download this file.")
    }
  }

  const q = search.trim().toLowerCase()
  const shown = q
    ? materials.filter((m) => (m.display_name || m.original_filename).toLowerCase().includes(q))
    : materials
  const working = materials.filter((m) => materialView(m).active).length
  const failed = materials.filter((m) => materialView(m).phase === "failed").length

  return (
    <div className="space-y-4">
      {/* Upload area */}
      <div className="rounded-2xl border bg-card p-4">
        <div className="mb-3 grid gap-3 sm:grid-cols-[minmax(0,14rem)_1fr] sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="material-category" className="text-xs">
              Kind of material
            </Label>
            <Select value={category} onValueChange={(v) => v && setCategory(v)}>
              <SelectTrigger id="material-category" className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MATERIAL_CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 px-3 py-2">
            <Label htmlFor="material-visible" className="min-w-0 cursor-pointer">
              <span className="block text-xs font-medium">Visible to students</span>
              <span className="block text-[11px] font-normal text-muted-foreground">
                Enrolled students can open and download it
              </span>
            </Label>
            <Switch id="material-visible" checked={visible} onCheckedChange={setVisible} />
          </div>
        </div>

        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            addFiles(e.dataTransfer.files)
          }}
          className={cn(
            "flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-all duration-200",
            dragging ? "scale-[1.01] border-primary bg-primary/10" : "border-border/70 bg-muted/20 hover:border-primary/40 hover:bg-muted/40",
          )}
        >
          <UploadCloud className={cn("size-7 transition-transform duration-200", dragging ? "scale-110 text-primary" : "text-muted-foreground")} />
          <span className="text-sm font-medium">Drop files here or click to choose</span>
          <span className="text-xs text-muted-foreground">
            PDF, Word, text or images, up to 100 MB each. PDFs and documents are prepared for the AI tools after upload.
          </span>
        </button>
        <input
          ref={input}
          type="file"
          multiple
          accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files)
            e.target.value = ""
          }}
        />

        {queue.length > 0 && (
          <ul className="mt-3 space-y-2" aria-label="Uploads">
            {queue.map((item) => (
              <li
                key={item.key}
                className={cn(
                  "flex items-center gap-3 rounded-xl border p-2.5 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-300",
                  item.phase === "failed" ? "border-destructive/30 bg-destructive/5" : "bg-background",
                )}
              >
                {item.phase === "uploading" ? (
                  <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
                ) : (
                  <AlertTriangle className="size-4 shrink-0 text-destructive" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.file.name}</p>
                  <p className={cn("text-xs", item.phase === "failed" ? "text-destructive" : "text-muted-foreground")}>
                    {item.phase === "uploading"
                      ? `Uploading · ${formatBytes(item.file.size)}`
                      : (item.error ?? "The upload did not finish.")}
                  </p>
                  {item.phase === "uploading" && (
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-primary/15">
                      <div className="h-full w-1/3 animate-pulse rounded-full bg-primary motion-reduce:animate-none" />
                    </div>
                  )}
                </div>
                {item.phase === "failed" && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => void send(item)}>
                      <RotateCw className="mr-1.5 size-3.5" /> Retry upload
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Dismiss ${item.file.name}`}
                      onClick={() => setQueue((list) => list.filter((entry) => entry.key !== item.key))}
                    >
                      <X />
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* The materials */}
      <div className="overflow-hidden rounded-2xl border bg-card">
        <div className="flex flex-col gap-2 border-b bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            Course materials
            <Badge variant="secondary" className="px-1.5 text-[10px]">
              {materials.length}
            </Badge>
            {working > 0 && (
              <Badge variant="outline" className="gap-1 border-primary/30 px-1.5 text-[10px] text-primary">
                <Loader2 className="size-3 animate-spin" /> {working} being prepared
              </Badge>
            )}
            {failed > 0 && (
              <Badge variant="outline" className="gap-1 border-destructive/30 px-1.5 text-[10px] text-destructive">
                <AlertTriangle className="size-3" /> {failed} need attention
              </Badge>
            )}
          </div>
          {materials.length > 4 && (
            <div className="relative w-full sm:w-56">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Search materials"
                placeholder="Search materials"
                className="h-8 pl-8 text-xs"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          )}
        </div>

        {shown.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <FileText className="mx-auto mb-2 size-7 text-muted-foreground/50" />
            <p className="text-sm font-medium">{materials.length === 0 ? "No materials yet" : "No material matches your search"}</p>
            {materials.length === 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                Upload your notes, syllabus or rubrics. Students can study from them and the AI tools can use them.
              </p>
            )}
          </div>
        ) : (
          <ul className="divide-y">
            {shown.map((m) => {
              const view = materialView(m)
              return (
                <li key={m.id} className="px-4 py-3 transition-colors hover:bg-muted/20">
                  <div className="flex items-start gap-3">
                    <span
                      className={cn(
                        "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg",
                        view.phase === "failed" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary",
                      )}
                    >
                      <FileText className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="truncate text-sm font-semibold leading-tight">{m.display_name || m.original_filename}</p>
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                        <span>{categoryLabel(m.material_category)}</span>
                        <span aria-hidden>·</span>
                        <span>{formatBytes(m.file_size_bytes)}</span>
                        <span aria-hidden>·</span>
                        <span className="inline-flex items-center gap-1">
                          {m.is_student_visible ? <Eye className="size-3" /> : <EyeOff className="size-3" />}
                          {m.is_student_visible ? "Visible to students" : "Hidden from students"}
                        </span>
                      </p>

                      <MaterialStatus view={view} />
                    </div>
                    <div className="flex shrink-0 items-center">
                      <Button variant="ghost" size="icon" aria-label={`Download ${m.original_filename}`} onClick={() => void download(m)}>
                        <Download />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${m.original_filename}`}
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => setDeleteId(m.id)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                  {view.phase === "failed" && (
                    <div className="ml-12 mt-2">
                      <Button size="sm" variant="outline" disabled={busyId === m.id} onClick={() => void retryIndexing(m)}>
                        {busyId === m.id ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <RotateCw className="mr-1.5 size-3.5" />}
                        Try preparing again
                      </Button>
                      <span className="ml-2 text-xs text-muted-foreground">The file is saved; nothing needs to be uploaded again.</span>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this material?</AlertDialogTitle>
            <AlertDialogDescription>
              Students will no longer be able to open it and the AI tools stop using it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDelete()}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/** The one line (and bar) under a material telling what is happening to it. */
function MaterialStatus({ view }: { view: ReturnType<typeof materialView> }) {
  if (view.phase === "ready") {
    return (
      <p className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="size-3.5 shrink-0" /> {view.label}
      </p>
    )
  }
  if (view.phase === "failed") {
    return (
      <p role="alert" className="flex items-start gap-1.5 text-xs text-destructive">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {view.label}
      </p>
    )
  }
  return (
    <div role="status" className="space-y-1">
      <p className="flex items-center gap-1.5 text-xs text-primary">
        {view.phase === "waiting" ? <Clock className="size-3.5 shrink-0" /> : <Loader2 className="size-3.5 shrink-0 animate-spin" />}
        {view.label}
      </p>
      <div className="h-1.5 overflow-hidden rounded-full bg-primary/15">
        {view.phase === "working" && view.percent > 0 ? (
          <div
            className="h-full rounded-full bg-primary transition-all duration-700 ease-out"
            style={{ width: `${view.percent}%` }}
            role="progressbar"
            aria-valuenow={view.percent}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        ) : (
          <div className="h-full w-1/3 animate-pulse rounded-full bg-primary/60 motion-reduce:animate-none" />
        )}
      </div>
    </div>
  )
}
