"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";

import { AssessmentWizard } from "@/components/mindexa/assessment/assessment-wizard";

export default function EditAssessmentPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <Suspense fallback={null}>
      <AssessmentWizard editId={id} />
    </Suspense>
  );
}
