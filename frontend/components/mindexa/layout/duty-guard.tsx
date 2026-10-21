// components/mindexa/layout/duty-guard.tsx
"use client";

import { ShieldAlert } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { hasDuty } from "@/lib/duty-workspace";

const DUTY_LABELS = {
  MODERATOR: "Moderator",
  EXAM_OFFICER: "Exam Officer",
} as const;

/**
 * Renders children only for users holding the given active duty.
 * The backend enforces access too; this replaces a page of 403 errors
 * with a clear explanation.
 */
export function DutyGuard({
  duty,
  children,
}: {
  duty: keyof typeof DUTY_LABELS;
  children: React.ReactNode;
}) {
  const { user } = useAuth();

  if (hasDuty(user, duty)) return <>{children}</>;

  return (
    <Card className="mx-auto mt-12 max-w-md">
      <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
        <ShieldAlert className="size-10 text-muted-foreground" aria-hidden="true" />
        <h2 className="text-lg font-semibold">{DUTY_LABELS[duty]} duty required</h2>
        <p className="text-sm text-muted-foreground">
          This page is only available to staff with an active {DUTY_LABELS[duty]} duty.
          Ask your administrator to assign it if you need access.
        </p>
      </CardContent>
    </Card>
  );
}
