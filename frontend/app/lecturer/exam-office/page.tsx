// frontend/app/lecturer/exam-office/page.tsx
"use client";

import { DutyGuard } from "@/components/mindexa/layout/duty-guard";
import { ExamOfficeQueueView } from "@/components/mindexa/exam-office/exam-office-queue-view";

export default function LecturerExamOfficePage() {
  return (
    <DutyGuard duty="EXAM_OFFICER">
      <ExamOfficeQueueView portal="lecturer" />
    </DutyGuard>
  );
}
