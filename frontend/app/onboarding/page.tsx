"use client";

import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";

export default function OnboardingPage() {
  const { user, loading, isInitializing } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isInitializing && !loading) {
      if (!user) {
        router.replace("/login");
        return;
      }

      if (user.onboarding_completed) {
        const role = user.role.toLowerCase();
        if (role === "admin" || role === "super_admin") router.replace("/admin/dashboard");
        else if (role === "lecturer") router.replace("/lecturer/dashboard");
        else router.replace("/student/dashboard");
        return;
      }

      const role = user.role.toLowerCase();
      if (role === "student") router.replace("/onboarding/student");
      else if (role === "lecturer") router.replace("/onboarding/lecturer");
      else if (role === "admin" || role === "super_admin") router.replace("/admin/dashboard");
      else router.replace("/onboarding/student"); // Default
    }
  }, [user, loading, isInitializing, router]);

  return (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-6 w-full max-w-sm px-6">
        <Skeleton className="size-16 rounded-2xl" />
        <div className="space-y-2 w-full text-center">
            <Skeleton className="h-4 w-3/4 mx-auto" />
            <Skeleton className="h-3 w-1/2 mx-auto opacity-60" />
        </div>
      </div>
    </div>
  );
}
