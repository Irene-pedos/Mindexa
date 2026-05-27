"use client";

// app/student/layout.tsx
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { StudentSidebar } from "@/components/mindexa/layout/student-sidebar";
import { SiteHeader } from "@/components/mindexa/layout/site-header";
import { useAuth } from "@/hooks/use-auth";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
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
      <div className="flex h-screen w-screen overflow-hidden bg-background">
        {/* Sidebar Skeleton */}
        <div className="w-64 border-r bg-muted/5 p-4 flex flex-col">
            <div className="flex items-center gap-3 px-2">
                <Skeleton className="size-8 rounded-lg" />
                <Skeleton className="h-4 w-24" />
            </div>
            <div className="space-y-2 pt-8">
                {[1, 2, 3, 4, 5, 6].map(i => (
                    <Skeleton key={i} className="h-9 w-full rounded-lg opacity-40" />
                ))}
            </div>
        </div>
        
        {/* Main Content Skeleton */}
        <div className="flex-1 flex flex-col">
            {/* Header Skeleton */}
            <div className="h-14 border-b px-6 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Skeleton className="h-4 w-32" />
                </div>
                <div className="flex items-center gap-3">
                    <Skeleton className="size-8 rounded-full" />
                </div>
            </div>
            
            {/* Body Skeleton */}
            <div className="flex-1 p-8 space-y-8 bg-muted/10 overflow-hidden">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {[1, 2, 3, 4].map(i => (
                        <Skeleton key={i} className="h-20 w-full rounded-xl" />
                    ))}
                </div>
                
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    <Skeleton className="lg:col-span-4 h-[500px] w-full rounded-xl" />
                    <Skeleton className="lg:col-span-8 h-[500px] w-full rounded-xl" />
                </div>
            </div>
        </div>
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