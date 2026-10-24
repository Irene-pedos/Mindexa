"use client";

import { Suspense } from "react";

import { AssessmentWizard } from "@/components/mindexa/assessment/assessment-wizard";

export default function NewAssessmentPage() {
  return (
    <Suspense fallback={null}>
      <AssessmentWizard />
    </Suspense>
  );
}
