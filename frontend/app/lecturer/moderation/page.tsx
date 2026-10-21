// frontend/app/lecturer/moderation/page.tsx
"use client";

import { DutyGuard } from "@/components/mindexa/layout/duty-guard";
import { ModerationQueueView } from "@/components/mindexa/moderation/moderation-queue-view";

export default function LecturerModerationPage() {
  return (
    <DutyGuard duty="MODERATOR">
      <ModerationQueueView portal="lecturer" />
    </DutyGuard>
  );
}
