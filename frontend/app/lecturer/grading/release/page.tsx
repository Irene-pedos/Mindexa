"use client";

import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

function ReleaseRedirectContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const params = new URLSearchParams(searchParams ? searchParams.toString() : "");
    params.set("tab", "release");
    router.replace(`/lecturer/grading?${params.toString()}`);
  }, [router, searchParams]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-muted-foreground">
      <Loader2 className="size-6 animate-spin text-primary" />
      <p className="text-sm font-medium">Redirecting to Release Queue...</p>
    </div>
  );
}

export default function ReleaseRedirectPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="size-6 animate-spin text-primary" />
          <p className="text-sm font-medium">Loading Release Queue...</p>
        </div>
      }
    >
      <ReleaseRedirectContent />
    </Suspense>
  );
}
