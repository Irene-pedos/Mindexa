"use client"

import { useMemo, useState } from "react"
import { Check, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import {
  LEVEL_ORDER,
  PRESETS,
  REQUIRED_LEVELS,
  normalizeProfile,
  presetProfile,
  type LevelKey,
  type PresetKey,
  type StructureProfile,
} from "@/lib/structure-profile"
import { KIND_HINT, KIND_ICON, KIND_TONE } from "./kind-meta"

interface ProfileDialogProps {
  open: boolean
  institutionName: string
  /** Null when the institution has not chosen yet. */
  profile: StructureProfile | null
  /** How many records exist per level, so the admin sees what is in use. */
  inUse: Record<LevelKey, number>
  onClose: () => void
  onSave: (profile: StructureProfile) => Promise<void>
}

/** The preset a profile still matches exactly, or "custom" once names or levels were adjusted. */
function inferPreset(profile: StructureProfile): PresetKey {
  for (const preset of PRESETS) {
    if (preset.key === "custom") continue
    const base = presetProfile(preset.key)
    const same = LEVEL_ORDER.every(
      (k) =>
        base.enabled[k] === profile.enabled[k] &&
        base.labels[k].singular === profile.labels[k].singular &&
        base.labels[k].plural === profile.labels[k].plural,
    )
    if (same) return preset.key
  }
  return "custom"
}

/** The dialog shell. The form inside mounts fresh each time it opens, so it always starts from the saved profile. */
export function ProfileDialog(props: ProfileDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={(o) => !o && props.onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {props.open && <ProfileForm {...props} />}
      </DialogContent>
    </Dialog>
  )
}

function ProfileForm({ institutionName, profile, inUse, onClose, onSave }: ProfileDialogProps) {
  const [draft, setDraft] = useState<StructureProfile>(() => profile ?? presetProfile("polytechnic"))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const current = normalizeProfile({ ...draft, preset: inferPreset(draft) })

  const setLabel = (key: LevelKey, part: "singular" | "plural", value: string) =>
    setDraft((d) => ({ ...d, labels: { ...d.labels, [key]: { ...d.labels[key], [part]: value } } }))

  const toggle = (key: LevelKey, on: boolean) =>
    setDraft((d) => normalizeProfile({ ...d, enabled: { ...d.enabled, [key]: on } }))

  const labelProblem = useMemo(
    () =>
      LEVEL_ORDER.find((k) => {
        const l = current.labels[k]
        return !l.singular.trim() || !l.plural.trim() || l.singular.length > 40 || l.plural.length > 40
      }),
    [current],
  )

  const path = LEVEL_ORDER.filter((k) => current.enabled[k]).map((k) => current.labels[k].singular)

  const save = async () => {
    if (labelProblem) return
    setSaving(true)
    setError(null)
    try {
      await onSave(current)
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Could not save the structure settings.")
      setSaving(false)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>How is {institutionName} organized?</DialogTitle>
        <DialogDescription>
          Pick the closest match, then rename or switch off the levels you don&apos;t use. Nothing already created is
          removed or hidden.
        </DialogDescription>
      </DialogHeader>

      <section aria-label="Type of institution" className="grid gap-2 sm:grid-cols-2">
        {PRESETS.map((preset) => {
          const active = current.preset === preset.key
          return (
            <button
              key={preset.key}
              type="button"
              aria-pressed={active}
              onClick={() => setDraft(presetProfile(preset.key))}
              className={cn(
                "relative rounded-xl border p-3 text-left transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                active ? "border-primary bg-primary/5" : "hover:bg-muted/50",
              )}
            >
              {active && (
                <span className="absolute right-2.5 top-2.5 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check className="size-3" />
                </span>
              )}
              <p className="text-sm font-semibold">{preset.title}</p>
              <p className="mt-0.5 pr-6 text-xs text-muted-foreground">{preset.summary}</p>
              <p className="mt-1.5 text-[11px] italic text-muted-foreground/80">{preset.example}</p>
            </button>
          )
        })}
      </section>

      <section aria-label="Levels" className="space-y-2">
        <h3 className="text-sm font-semibold">Levels and names</h3>
        <ul className="divide-y rounded-xl border">
          {LEVEL_ORDER.map((key) => {
            const Icon = KIND_ICON[key]
            const required = REQUIRED_LEVELS.includes(key)
            const locked = key === "year" && !current.enabled.program
            const on = current.enabled[key]
            return (
              <li key={key} className="grid gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="flex min-w-0 items-start gap-3">
                  <span
                    className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg", KIND_TONE[key])}
                  >
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Switch
                        checked={on}
                        disabled={required || locked}
                        onCheckedChange={(v) => toggle(key, v)}
                        aria-label={`Use ${current.labels[key].plural.toLowerCase()}`}
                      />
                      <span className="text-sm font-medium">{required ? "Always used" : on ? "Used" : "Not used"}</span>
                      {inUse[key] > 0 && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                          {inUse[key]} in use
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {locked ? "Needs programmes switched on." : KIND_HINT[key]}
                    </p>
                    {!on && inUse[key] > 0 && (
                      <p className="text-xs text-amber-700 dark:text-amber-400">
                        Existing {current.labels[key].plural.toLowerCase()} stay visible; you just can&apos;t add new
                        ones.
                      </p>
                    )}
                  </div>
                </div>
                <div className={cn("grid grid-cols-2 gap-2 sm:w-72", !on && "opacity-50")}>
                  <div className="space-y-1">
                    <Label htmlFor={`lbl-s-${key}`} className="text-[11px] text-muted-foreground">
                      Name
                    </Label>
                    <Input
                      id={`lbl-s-${key}`}
                      value={draft.labels[key].singular}
                      maxLength={40}
                      onChange={(e) => setLabel(key, "singular", e.target.value)}
                      className="h-8"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`lbl-p-${key}`} className="text-[11px] text-muted-foreground">
                      Plural
                    </Label>
                    <Input
                      id={`lbl-p-${key}`}
                      value={draft.labels[key].plural}
                      maxLength={40}
                      onChange={(e) => setLabel(key, "plural", e.target.value)}
                      className="h-8"
                    />
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Your structure: </span>
        {institutionName} › {path.join(" › ")}
      </p>

      {labelProblem && (
        <p role="alert" className="text-sm text-destructive">
          Give every level a name and a plural (up to 40 characters).
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      <DialogFooter className="gap-2">
        <Button variant="ghost" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={() => void save()} disabled={saving || Boolean(labelProblem)}>
          {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
          Save structure
        </Button>
      </DialogFooter>
    </>
  )
}
