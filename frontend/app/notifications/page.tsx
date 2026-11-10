// app/notifications/page.tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";

export default function NotificationsRedirectPage() {
  const router = useRouter();
  const { user, isAuthenticated, loading, isInitializing } = useAuth();

  useEffect(() => {
    if (loading || isInitializing) return;

    if (!isAuthenticated || !user) {
      router.replace("/login");
      return;
    }

    const role = user.role?.toLowerCase() || "student";
    router.replace(`/${role}/notifications`);
  }, [user, isAuthenticated, loading, isInitializing, router]);

  return (
    <div className="flex h-[60vh] w-full flex-col items-center justify-center gap-3">
      <Loader2 className="size-6 animate-spin text-primary" />
      <p className="text-xs text-muted-foreground font-medium">
        Redirecting to your notifications...
      </p>
    </div>
  );
}
