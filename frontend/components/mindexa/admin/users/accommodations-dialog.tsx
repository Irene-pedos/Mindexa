"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Accessibility,
  Clock,
  Sliders,
  History,
  Loader2,
  FileText,
} from "lucide-react";
import { UserResponse, AdminAccommodationsUpdate } from "@/lib/api/admin";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface AccommodationsDialogProps {
  user: UserResponse | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (userId: string, data: AdminAccommodationsUpdate) => Promise<void>;
  isSaving?: boolean;
}

export function AccommodationsDialog({
  user,
  isOpen,
  onOpenChange,
  onSave,
  isSaving = false,
}: AccommodationsDialogProps) {
  const [form, setForm] = useState<AdminAccommodationsUpdate>({
    extra_time_percent: 0,
    requires_screen_reader_mode: false,
    simple_mode_enabled: false,
    large_text_default: false,
    reduced_motion_default: false,
    reason: "",
  });

  useEffect(() => {
    if (user) {
      setForm({
        extra_time_percent: user.profile?.extra_time_percent || 0,
        requires_screen_reader_mode: !!user.profile?.requires_screen_reader_mode,
        simple_mode_enabled: !!user.profile?.simple_mode_enabled,
        large_text_default: !!user.profile?.large_text_default,
        reduced_motion_default: !!user.profile?.reduced_motion_default,
        reason: "",
      });
    }
  }, [user]);

  if (!user) return null;

  const fullName = user.profile
    ? `${user.profile.first_name || ""} ${user.profile.last_name || ""}`.trim()
    : "Student";

  const handleSave = async () => {
    if (!form.reason || form.reason.trim().length < 3) {
      toast.error(
        "An administrative justification note is required for the audit trail."
      );
      return;
    }

    try {
      await onSave(user.id, form);
    } catch {
      // Handled by parent
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto p-6 rounded-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <div className="size-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Accessibility className="size-4.5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold tracking-tight text-foreground">
                Student Accommodations &amp; Timing
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                {fullName} • {user.email}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2 border-y border-border/50 my-1">
          {/* Extended Time Section */}
          <div className="space-y-3 bg-muted/20 p-4 rounded-xl border border-border/50">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Clock className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                  Extended Assessment Time
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  Extra duration calculated automatically into server-enforced countdown timers.
                </p>
              </div>
              <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                +{form.extra_time_percent || 0}%
              </span>
            </div>

            {/* Preset Buttons */}
            <div className="flex items-center gap-1.5 pt-1">
              {[0, 25, 50, 75, 100].map((percent) => (
                <Button
                  key={percent}
                  type="button"
                  variant={form.extra_time_percent === percent ? "default" : "outline"}
                  size="sm"
                  className={cn(
                    "flex-1 h-7 text-xs font-semibold rounded-lg",
                    form.extra_time_percent === percent &&
                      "bg-primary text-primary-foreground"
                  )}
                  onClick={() => setForm((prev) => ({ ...prev, extra_time_percent: percent }))}
                >
                  {percent === 0 ? "Standard (0%)" : `+${percent}%`}
                </Button>
              ))}
            </div>

            {/* Custom Input */}
            <div className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
              <Label htmlFor="customPercent" className="text-xs font-medium shrink-0">
                Custom percentage:
              </Label>
              <Input
                id="customPercent"
                type="number"
                min={0}
                max={200}
                value={form.extra_time_percent || 0}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    extra_time_percent: Math.max(
                      0,
                      Math.min(200, parseInt(e.target.value) || 0)
                    ),
                  }))
                }
                className="h-7 text-xs w-20 rounded-lg"
              />
              <span className="text-xs font-medium">%</span>
            </div>
          </div>

          {/* Accessibility & Sensory Toggles */}
          <div className="space-y-3 p-4 bg-muted/20 rounded-xl border border-border/50">
            <h4 className="text-xs font-bold text-foreground uppercase tracking-wider text-muted-foreground">
              Accessibility &amp; Sensory Preferences
            </h4>

            {/* Screen Reader */}
            <div className="flex items-center justify-between py-1">
              <div className="space-y-0.5 pr-4">
                <Label htmlFor="srMode" className="text-xs font-semibold text-foreground cursor-pointer">
                  Screen Reader Mode
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  Enforces screen-reader ARIA live regions and forces Accessible List Mode for assessments.
                </p>
              </div>
              <Switch
                id="srMode"
                checked={form.requires_screen_reader_mode}
                onCheckedChange={(checked) =>
                  setForm((prev) => ({ ...prev, requires_screen_reader_mode: checked }))
                }
              />
            </div>

            <Separator className="bg-border/40" />

            {/* Simple Mode */}
            <div className="flex items-center justify-between py-1">
              <div className="space-y-0.5 pr-4">
                <Label htmlFor="simpleMode" className="text-xs font-semibold text-foreground cursor-pointer">
                  Simple UI Mode Default
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  Larger tap targets (≥44px), reduced secondary controls, and simplified layouts.
                </p>
              </div>
              <Switch
                id="simpleMode"
                checked={form.simple_mode_enabled}
                onCheckedChange={(checked) =>
                  setForm((prev) => ({ ...prev, simple_mode_enabled: checked }))
                }
              />
            </div>

            <Separator className="bg-border/40" />

            {/* Large Text */}
            <div className="flex items-center justify-between py-1">
              <div className="space-y-0.5 pr-4">
                <Label htmlFor="largeText" className="text-xs font-semibold text-foreground cursor-pointer">
                  Large Text Default
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  Increases root font scaling (+15%) and line height across all test questions.
                </p>
              </div>
              <Switch
                id="largeText"
                checked={form.large_text_default}
                onCheckedChange={(checked) =>
                  setForm((prev) => ({ ...prev, large_text_default: checked }))
                }
              />
            </div>

            <Separator className="bg-border/40" />

            {/* Reduced Motion */}
            <div className="flex items-center justify-between py-1">
              <div className="space-y-0.5 pr-4">
                <Label htmlFor="reducedMotion" className="text-xs font-semibold text-foreground cursor-pointer">
                  Reduced Motion Default
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  Disables rapid animations and transitions to support vestibular comfort.
                </p>
              </div>
              <Switch
                id="reducedMotion"
                checked={form.reduced_motion_default}
                onCheckedChange={(checked) =>
                  setForm((prev) => ({ ...prev, reduced_motion_default: checked }))
                }
              />
            </div>
          </div>

          {/* Audit Reason */}
          <div className="space-y-1.5">
            <Label htmlFor="auditReason" className="text-xs font-bold text-foreground flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <FileText className="size-3.5 text-primary" /> Administrative Justification *
              </span>
              <span className="text-[10px] text-muted-foreground font-normal">
                Required for Audit Trail
              </span>
            </Label>
            <Textarea
              id="auditReason"
              placeholder="e.g. Approved by Disability Support Services (Ref: DSS-2026-442). Granted +25% extra time and screen reader mode."
              value={form.reason}
              onChange={(e) => setForm((prev) => ({ ...prev, reason: e.target.value }))}
              className="text-xs min-h-[75px] rounded-xl"
            />
          </div>

          {/* Last Modified */}
          {user.profile?.updated_at && (
            <div className="text-[11px] text-muted-foreground bg-muted/20 p-2.5 rounded-lg flex items-center gap-2 border border-border/40">
              <History className="size-3.5 text-muted-foreground shrink-0" />
              <span>
                Last accommodation update: {new Date(user.profile.updated_at).toLocaleString()}
              </span>
            </div>
          )}
        </div>

        <DialogFooter className="pt-2 gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-xs rounded-xl"
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={isSaving}
            className="text-xs font-semibold rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground px-5"
          >
            {isSaving ? (
              <>
                <Loader2 className="size-3.5 mr-1.5 animate-spin" /> Saving...
              </>
            ) : (
              "Save Accommodations & Log Audit"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
