"use client"

import { useId, useMemo, useState } from "react"
import { Loader2, Upload, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { CODE_PATTERN, suggestCode, validateName } from "@/lib/academic-structure"
import { PRESETS, type PresetKey } from "@/lib/structure-profile"
import { browserTimezone, isValidTimezone, timezoneNames } from "@/lib/timezones"

export interface InstitutionRecord {
  id: string
  name: string
  code: string
  timezone: string
  logo_url?: string | null
  is_active: boolean
  settings?: Record<string, unknown> | null
}

export type InstitutionDialogState = { mode: "create" } | { mode: "edit"; institution: InstitutionRecord }

export interface InstitutionFormValues {
  name: string
  code: string
  timezone: string
  /** Kind of institution (create only); "later" skips the choice. */
  type: PresetKey | "later"
  /** undefined: leave the logo alone, "": remove it, otherwise a data URL. */
  logo: string | undefined
}

interface InstitutionDialogProps {
  state: InstitutionDialogState | null
  takenCodes: string[]
  onClose: () => void
  onSubmit: (state: InstitutionDialogState, values: InstitutionFormValues) => Promise<void>
}

const MAX_LOGO_BYTES = 512 * 1024

/** The dialog shell. The form inside mounts fresh each time it opens. */
export function InstitutionDialog(props: InstitutionDialogProps) {
  return (
    <Dialog open={props.state !== null} onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {props.state && <InstitutionForm {...props} state={props.state} />}
      </DialogContent>
    </Dialog>
  )
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error("Could not read that file."))
    reader.readAsDataURL(file)
  })
}

function InstitutionForm({
  state,
  takenCodes,
  onClose,
  onSubmit,
}: InstitutionDialogProps & { state: InstitutionDialogState }) {
  const isCreate = state.mode === "create"
  const existing = state.mode === "edit" ? state.institution : null
  const zones = useMemo(() => timezoneNames(), [])
  const listId = useId()

  const [values, setValues] = useState<InstitutionFormValues>({
    name: existing?.name ?? "",
    code: existing?.code ?? "",
    timezone: existing && isValidTimezone(existing.timezone, zones) ? existing.timezone : browserTimezone(),
    type: "later",
    logo: undefined,
  })
  const [codeTouched, setCodeTouched] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [logoError, setLogoError] = useState<string | null>(null)

  const set = (patch: Partial<InstitutionFormValues>) => setValues((v) => ({ ...v, ...patch }))

  const onName = (name: string) => {
    if (isCreate && !codeTouched) set({ name, code: name.trim() ? suggestCode(name, takenCodes) : "" })
    else set({ name })
  }

  const errors = {
    name: validateName(values.name),
    code: !isCreate
      ? null
      : !values.code.trim()
        ? "A code is required."
        : !CODE_PATTERN.test(values.code.trim().toUpperCase())
          ? "Use 2–20 letters, digits, '-' or '_'."
          : takenCodes.some((c) => c.toUpperCase() === values.code.trim().toUpperCase())
            ? "Another institution already uses this code."
            : null,
    timezone: isValidTimezone(values.timezone, zones)
      ? null
      : "Pick a timezone from the list, for example Africa/Kigali.",
  }
  const invalid = Boolean(errors.name || errors.code || errors.timezone)

  const preview = values.logo === undefined ? (existing?.logo_url ?? null) : values.logo || null

  const onLogo = async (file: File | undefined) => {
    setLogoError(null)
    if (!file) return
    if (!file.type.startsWith("image/")) return setLogoError("Choose an image file (PNG, SVG or JPG).")
    if (file.size > MAX_LOGO_BYTES) return setLogoError("That image is over 512 KB. Use a smaller one.")
    try {
      set({ logo: await readAsDataUrl(file) })
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : "Could not read that file.")
    }
  }

  const submit = async () => {
    setSubmitted(true)
    if (invalid) return
    setSaving(true)
    setServerError(null)
    try {
      await onSubmit(state, { ...values, code: values.code.trim().toUpperCase(), timezone: values.timezone.trim() })
    } catch (err) {
      setServerError(err instanceof Error && err.message ? err.message : "Could not save. Please try again.")
      setSaving(false)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{isCreate ? "Register an institution" : "Edit institution"}</DialogTitle>
        <DialogDescription>
          {isCreate
            ? "Add a university, college, school or training centre. You can organize its departments and classes next."
            : "The code identifies the institution and cannot be changed."}
        </DialogDescription>
      </DialogHeader>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]">
          <div className="space-y-1.5">
            <Label htmlFor="inst-name">Name</Label>
            <Input
              id="inst-name"
              autoFocus
              value={values.name}
              placeholder="e.g. University of Rwanda"
              aria-invalid={submitted && Boolean(errors.name)}
              onChange={(e) => onName(e.target.value)}
            />
            {submitted && errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inst-code">Code</Label>
            <Input
              id="inst-code"
              value={values.code}
              disabled={!isCreate}
              className="font-mono uppercase"
              placeholder="e.g. UR"
              aria-invalid={submitted && Boolean(errors.code)}
              onChange={(e) => {
                setCodeTouched(true)
                set({ code: e.target.value.toUpperCase() })
              }}
            />
            {submitted && errors.code && <p className="text-xs text-destructive">{errors.code}</p>}
          </div>
        </div>

        {isCreate && (
          <div className="space-y-1.5">
            <Label htmlFor="inst-type">What kind of institution is it?</Label>
            <Select value={values.type} onValueChange={(v) => set({ type: v as InstitutionFormValues["type"] })}>
              <SelectTrigger id="inst-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="later">I&apos;ll decide later</SelectItem>
                {PRESETS.filter((p) => p.key !== "custom").map((p) => (
                  <SelectItem key={p.key} value={p.key}>
                    {p.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              This sets the names used for its levels (for example Faculty or Division). You can change it any time in
              Academic Structure.
            </p>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="inst-tz">Timezone</Label>
          <Input
            id="inst-tz"
            list={listId}
            value={values.timezone}
            placeholder="Start typing, e.g. Africa/Kigali"
            aria-invalid={submitted && Boolean(errors.timezone)}
            onChange={(e) => set({ timezone: e.target.value })}
          />
          <datalist id={listId}>
            {zones.map((z) => (
              <option key={z} value={z} />
            ))}
          </datalist>
          {submitted && errors.timezone ? (
            <p className="text-xs text-destructive">{errors.timezone}</p>
          ) : (
            <p className="text-xs text-muted-foreground">Exam times are shown in this timezone.</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="inst-logo">Logo (optional)</Label>
          <div className="flex items-center gap-3">
            <div className="relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed bg-muted/30">
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element -- a data URL the admin just chose
                <img src={preview} alt="Logo preview" className="size-full object-cover" />
              ) : (
                <Upload className="size-5 text-muted-foreground" />
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <Input
                id="inst-logo"
                type="file"
                accept="image/*"
                onChange={(e) => void onLogo(e.target.files?.[0])}
                className="h-auto py-1.5 text-xs file:mr-3 file:text-xs"
              />
              <p className="text-xs text-muted-foreground">Square PNG, SVG or JPG, up to 512 KB.</p>
            </div>
            {preview && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Remove logo"
                onClick={() => set({ logo: "" })}
              >
                <X />
              </Button>
            )}
          </div>
          {logoError && <p className="text-xs text-destructive">{logoError}</p>}
        </div>

        {serverError && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            {serverError}
          </p>
        )}

        <DialogFooter className="gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || (submitted && invalid)}>
            {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
            {isCreate ? "Register institution" : "Save changes"}
          </Button>
        </DialogFooter>
      </form>
    </>
  )
}
