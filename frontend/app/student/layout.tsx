"use client";

// app/student/layout.tsx
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { StudentSidebar } from "@/components/mindexa/layout/student-sidebar";
import { SiteHeader } from "@/components/mindexa/layout/site-header";
import { useAuth } from "@/hooks/use-auth";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export default function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isAuthenticated, loading, isInitializing } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // Hide sidebar and header if actively taking an assessment
  const isTakingAssessment = pathname.includes("/assessments/") && pathname.endsWith("/take");

  useEffect(() => {
    if (loading || isInitializing) return;

    if (!isAuthenticated) {
      router.replace("/login");
      return;
    }

    const userRole = user?.role?.toLowerCase();
    if (userRole && userRole !== "student") {
      router.replace(`/${userRole}/dashboard`);
    }
  }, [isAuthenticated, loading, isInitializing, router, user]);

  if (loading || isInitializing) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center gap-4">
        <Loader2 className="size-10 animate-spin text-primary" />
        <p className="text-muted-foreground animate-pulse">Authenticating...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <SidebarProvider>
      {!isTakingAssessment && <StudentSidebar />}
      <SidebarInset>
        {!isTakingAssessment && <SiteHeader />}
        <main className={cn(
          "flex-1 bg-muted/30 min-h-[calc(100vh-3.5rem)]",
          !isTakingAssessment && "p-6",
          isTakingAssessment && "p-0 bg-background min-h-screen"
        )}>
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}