"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
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
import { authApi } from "@/lib/api/auth"
import { errorMessage } from "@/lib/error-message"

/** The server's minimum (PASSWORD_MIN_LENGTH). The server stays the authority on every other rule. */
const MIN_LENGTH = 12

interface ChangePasswordDialogProps {
  open: boolean
  onClose: () => void
  /** Called once the password changed; the server has ended every session by then. */
  onChanged: () => void
}

export function ChangePasswordDialog({ open, onClose, onChanged }: ChangePasswordDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">{open && <PasswordForm onClose={onClose} onChanged={onChanged} />}</DialogContent>
    </Dialog>
  )
}

function PasswordForm({ onClose, onChanged }: Omit<ChangePasswordDialogProps, "open">) {
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [confirm, setConfirm] = useState("")
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const errors = {
    current: current ? null : "Enter your current password.",
    next:
      next.length < MIN_LENGTH
        ? `Use at least ${MIN_LENGTH} characters.`
        : next === current
          ? "Choose a password different from the current one."
          : null,
    confirm: confirm === next ? null : "The two passwords do not match.",
  }
  const invalid = Boolean(errors.current || errors.next || errors.confirm)

  const submit = async () => {
    setSubmitted(true)
    if (invalid) return
    setSaving(true)
    setServerError(null)
    try {
      await authApi.changePassword({ current_password: current, new_password: next, confirm_password: confirm })
      toast.success("Password changed. Please sign in again.")
      onChanged()
    } catch (err) {
      setServerError(errorMessage(err, "Could not change the password. Check your current password and try again."))
      setSaving(false)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Change password</DialogTitle>
        <DialogDescription>
          For your security you will be signed out of every device and asked to sign in again with the new password.
        </DialogDescription>
      </DialogHeader>

      <form
        className="space-y-3.5"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="pw-current">Current password</Label>
          <Input
            id="pw-current"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={current}
            aria-invalid={submitted && Boolean(errors.current)}
            onChange={(e) => setCurrent(e.target.value)}
          />
          {submitted && errors.current && <p className="text-xs text-destructive">{errors.current}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pw-new">New password</Label>
          <Input
            id="pw-new"
            type="password"
            autoComplete="new-password"
            value={next}
            aria-invalid={submitted && Boolean(errors.next)}
            onChange={(e) => setNext(e.target.value)}
          />
          {submitted && errors.next ? (
            <p className="text-xs text-destructive">{errors.next}</p>
          ) : (
            <p className="text-xs text-muted-foreground">At least {MIN_LENGTH} characters.</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pw-confirm">Repeat the new password</Label>
          <Input
            id="pw-confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            aria-invalid={submitted && Boolean(errors.confirm)}
            onChange={(e) => setConfirm(e.target.value)}
          />
          {submitted && errors.confirm && <p className="text-xs text-destructive">{errors.confirm}</p>}
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
            Change password
          </Button>
        </DialogFooter>
      </form>
    </>
  )
}
