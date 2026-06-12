// app/student/study/page.tsx
"use client";

import React from "react";
import { AISupportChat } from "@/components/mindexa/student/ai-support-chat";

export default function StudentStudySupportPage() {
  return (
    <div className="w-full h-[calc(100vh-100px)] min-h-[500px]">
      <AISupportChat />
    </div>
  );
}
