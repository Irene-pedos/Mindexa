"use client"

import { useMemo, useState } from "react"
import { Loader2 } from "lucide-react"
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
import { suggestCode, validateCode, validateName, type TreeNode } from "@/lib/academic-structure"
import type { LevelKey, StructureProfile } from "@/lib/structure-profile"
import { EMPTY_FORM, type EntityFormValues } from "@/lib/structure-actions"
import { KIND_HINT } from "./kind-meta"

export type EntityDialogState =
  | { mode: "create"; kind: LevelKey; parent: TreeNode; path: string }
  | { mode: "edit"; kind: LevelKey; node: TreeNode; initial: EntityFormValues }

interface EntityDialogProps {
  state: EntityDialogState | null
  profile: StructureProfile
  /** Codes already used by siblings (create only), to catch duplicates before the server does. */
  takenCodes: string[]
  onClose: () => void
  /** Resolves on success; throw to keep the dialog open and show the message. */
  onSubmit: (state: EntityDialogState, values: EntityFormValues) => Promise<void>
}

const DELIVERY = [
  { value: "PHYSICAL_ROOM", label: "In a room / on campus" },
  { value: "ONLINE", label: "Online" },
  { value: "HYBRID", label: "Hybrid (room and online)" },
  { value: "NOT_APPLICABLE", label: "Not applicable" },
]

/** The dialog shell. The form inside mounts fresh each time it opens, so it never shows stale input. */
export function EntityDialog({ state, profile, takenCodes, onClose, onSubmit }: EntityDialogProps) {
  return (
    <Dialog open={state !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        {state && (
          <EntityForm state={state} profile={profile} takenCodes={takenCodes} onClose={onClose} onSubmit={onSubmit} />
        )}
      </DialogContent>
    </Dialog>
  )
}

interface EntityFormProps extends Omit<EntityDialogProps, "state"> {
  state: EntityDialogState
}

function EntityForm({ state, profile, takenCodes, onClose, onSubmit }: EntityFormProps) {
  const [values, setValues] = useState<EntityFormValues>(state.mode === "edit" ? state.initial : EMPTY_FORM)
  const [codeTouched, setCodeTouched] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const kind = state.kind
  const label = profile.labels[kind]
  const isCreate = state.mode === "create"
  const needsCode = kind !== "class"

  const set = (patch: Partial<EntityFormValues>) => setValues((v) => ({ ...v, ...patch }))

  const onName = (name: string) => {
    // propose a code until the admin writes one themselves
    if (isCreate && needsCode && !codeTouched) set({ name, code: name.trim() ? suggestCode(name, takenCodes) : "" })
    else set({ name })
  }

  const errors = useMemo(
    () => ({
      name: validateName(values.name, kind === "class" ? 1 : 2),
      code: isCreate && needsCode ? validateCode(values.code, takenCodes) : null,
    }),
    [values.name, values.code, kind, isCreate, needsCode, takenCodes],
  )
  const invalid = Boolean(errors.name || errors.code)

  const submit = async () => {
    setSubmitted(true)
    if (invalid) return
    setSaving(true)
    setServerError(null)
    try {
      await onSubmit(state, values)
    } catch (err) {
      setServerError(err instanceof Error && err.message ? err.message : "Could not save. Please try again.")
      setSaving(false)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {isCreate ? `Add ${label.singular.toLowerCase()}` : `Edit ${label.singular.toLowerCase()}`}
        </DialogTitle>
        <DialogDescription>
          {state.mode === "create" ? (
            <>
              Adding to <span className="font-medium text-foreground">{state.path}</span>. {KIND_HINT[kind]}
            </>
          ) : (
            "The code and the place in the structure cannot be changed once created."
          )}
        </DialogDescription>
      </DialogHeader>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="entity-name">{label.singular} name</Label>
          <Input
            id="entity-name"
            autoFocus
            value={values.name}
            placeholder={kind === "class" ? "e.g. Class A" : `e.g. ${exampleName(kind)}`}
            aria-invalid={submitted && Boolean(errors.name)}
            onChange={(e) => onName(e.target.value)}
          />
          {submitted && errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
        </div>

        {needsCode && (
          <div className="space-y-1.5">
            <Label htmlFor="entity-code">Code</Label>
            <Input
              id="entity-code"
              value={values.code}
              disabled={!isCreate}
              className="font-mono uppercase"
              placeholder="e.g. ICT"
              aria-invalid={submitted && Boolean(errors.code)}
              onChange={(e) => {
                setCodeTouched(true)
                set({ code: e.target.value.toUpperCase() })
              }}
            />
            {submitted && errors.code ? (
              <p className="text-xs text-destructive">{errors.code}</p>
            ) : isCreate ? (
              <p className="text-xs text-muted-foreground">
                A short identifier, unique here. It cannot be changed later.
              </p>
            ) : null}
          </div>
        )}

        {kind === "year" && (
          <div className="space-y-1.5">
            <Label htmlFor="entity-level">{label.singular} number (optional)</Label>
            <Input
              id="entity-level"
              type="number"
              inputMode="numeric"
              min={0}
              max={99}
              value={values.level}
              placeholder="e.g. 6"
              onChange={(e) => set({ level: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">Used to keep {label.plural.toLowerCase()} in order.</p>
          </div>
        )}

        {kind === "class" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="entity-capacity">Seats (optional)</Label>
                <Input
                  id="entity-capacity"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={values.capacity}
                  placeholder="e.g. 40"
                  onChange={(e) => set({ capacity: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="entity-delivery">Delivery</Label>
                <Select value={values.locationType} onValueChange={(v) => set({ locationType: v })}>
                  <SelectTrigger id="entity-delivery">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DELIVERY.map((d) => (
                      <SelectItem key={d.value} value={d.value}>
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="entity-room">
                {values.locationType === "ONLINE" ? "Meeting link (optional)" : "Room (optional)"}
              </Label>
              <Input
                id="entity-room"
                value={values.room}
                placeholder={values.locationType === "ONLINE" ? "e.g. Teams link" : "e.g. Lab 1"}
                onChange={(e) => set({ room: e.target.value })}
              />
            </div>
          </>
        )}

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
            {isCreate ? `Add ${label.singular.toLowerCase()}` : "Save changes"}
          </Button>
        </DialogFooter>
      </form>
    </>
  )
}

function exampleName(kind: LevelKey): string {
  switch (kind) {
    case "campus":
      return "Main Campus"
    case "college":
      return "College of Engineering"
    case "department":
      return "Information and Communication Technology"
    case "program":
      return "Information Technology"
    case "year":
      return "Level 6"
    default:
      return ""
  }
}
