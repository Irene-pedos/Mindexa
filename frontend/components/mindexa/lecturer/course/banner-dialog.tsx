"use client"

import { useState } from "react"
import { ImageIcon, Loader2, UploadCloud } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { lecturerApi, type WorkspaceDetail } from "@/lib/api/lecturer"
import { errorMessage } from "@/lib/error-message"
import { cn } from "@/lib/utils"

const MAX_BYTES = 5 * 1024 * 1024

interface BannerDialogProps {
  open: boolean
  workspaceId: string
  current: string | null | undefined
  onClose: () => void
  onSaved: (workspace: WorkspaceDetail) => void
}

/** The dialog shell. The form inside mounts fresh each time it opens. */
export function BannerDialog(props: BannerDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent className="sm:max-w-md">{props.open && <BannerForm {...props} />}</DialogContent>
    </Dialog>
  )
}

function BannerForm({ workspaceId, current, onClose, onSaved }: BannerDialogProps) {
  const [file, setFile] = useState<File | null>(null)
  const [url, setUrl] = useState("")
  const [dragging, setDragging] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const preview = objectUrl ?? (url.trim() || current || null)

  const choose = (picked: File | undefined) => {
    if (!picked) return
    if (!picked.type.startsWith("image/")) return setError("Choose an image file (PNG, JPG, WebP or SVG).")
    if (picked.size > MAX_BYTES) return setError("That image is over 5 MB. Use a smaller one.")
    setError(null)
    setFile(picked)
    setUrl("")
    setObjectUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous)
      return URL.createObjectURL(picked)
    })
  }

  const save = async () => {
    const finalUrl = file ? null : url.trim()
    if (!file && !finalUrl) return setError("Choose an image or paste an image address.")
    setSaving(true)
    setError(null)
    try {
      const banner = file ? (await lecturerApi.uploadImage(file)).url : finalUrl
      const updated = await lecturerApi.updateWorkspace(workspaceId, { banner_image_url: banner ?? "" })
      toast.success("Course banner updated")
      onSaved(updated)
    } catch (err) {
      setError(errorMessage(err, "Could not update the banner."))
      setSaving(false)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <ImageIcon className="size-4.5 text-primary" /> Course banner
        </DialogTitle>
        <DialogDescription>The picture students see at the top of this course.</DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <label
          htmlFor="banner-upload"
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            choose(e.dataTransfer.files[0])
          }}
          className={cn(
            "relative flex min-h-36 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-dashed p-6 text-center transition-colors",
            dragging ? "border-primary bg-primary/10" : "border-border/70 bg-muted/20 hover:bg-muted/40",
          )}
        >
          <input id="banner-upload" type="file" accept="image/*" className="sr-only" onChange={(e) => choose(e.target.files?.[0])} />
          {preview && (
            <div
              className="absolute inset-0 bg-cover bg-center opacity-40"
              style={{ backgroundImage: `url(${JSON.stringify(preview)})` }}
              aria-hidden
            />
          )}
          <span className="relative z-10 flex flex-col items-center gap-1">
            <UploadCloud className="size-6 text-primary" />
            <span className="text-sm font-medium">Click to choose or drop an image</span>
            <span className="text-xs text-muted-foreground">PNG, JPG, WebP or SVG, up to 5 MB</span>
          </span>
        </label>

        <div className="space-y-1.5">
          <Label htmlFor="banner-url">Or an image address</Label>
          <Input
            id="banner-url"
            placeholder="https://…"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value)
              setFile(null)
              setObjectUrl((previous) => {
                if (previous) URL.revokeObjectURL(previous)
                return null
              })
            }}
          />
        </div>

        {error && (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
      </div>

      <DialogFooter className="gap-2">
        <Button variant="ghost" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={() => void save()} disabled={saving}>
          {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
          Save banner
        </Button>
      </DialogFooter>
    </>
  )
}
