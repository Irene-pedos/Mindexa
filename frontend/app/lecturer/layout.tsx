"use client";

// app/(lecturer)/layout.tsx
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { LecturerSidebar } from "@/components/mindexa/layout/lecturer-sidebar";
import { SiteHeader } from "@/components/mindexa/layout/site-header";
import { useAuth } from "@/hooks/use-auth";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export default function LecturerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isAuthenticated, loading, isInitializing } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isGrading = pathname?.startsWith("/lecturer/grading");

  useEffect(() => {
    // Wait until both the loading state and initialization are done
    if (loading || isInitializing) return;

    if (!isAuthenticated) {
      router.replace("/login");
      return;
    }

    const userRole = user?.role?.toLowerCase();
    if (
      userRole &&
      userRole !== "lecturer" &&
      userRole !== "admin" &&
      userRole !== "super_admin"
    ) {
      router.replace(`/${userRole}/dashboard`);
    }
  }, [isAuthenticated, loading, isInitializing, router, user]);

  // Block render until auth is resolved to avoid flash
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
            <div className="mt-auto space-y-2 pb-4">
                <Skeleton className="h-9 w-full rounded-lg opacity-20" />
                <Skeleton className="h-12 w-full rounded-lg" />
            </div>
        </div>
        
        {/* Main Content Skeleton */}
        <div className="flex-1 flex flex-col">
            {/* Header Skeleton */}
            <div className="h-14 border-b px-6 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Skeleton className="h-4 w-4 rounded opacity-50" />
                    <Skeleton className="h-4 w-32" />
                </div>
                <div className="flex items-center gap-3">
                    <Skeleton className="size-8 rounded-full" />
                </div>
            </div>
            
            {/* Body Skeleton */}
            <div className="flex-1 p-8 space-y-8 bg-muted/10 overflow-hidden">
                <div className="space-y-2">
                    <Skeleton className="h-8 w-64" />
                    <Skeleton className="h-4 w-96 opacity-60" />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {[1, 2, 3, 4].map(i => (
                        <Skeleton key={i} className="h-28 w-full rounded-xl" />
                    ))}
                </div>
                
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    <Skeleton className="lg:col-span-8 h-[400px] w-full rounded-xl" />
                    <Skeleton className="lg:col-span-4 h-[400px] w-full rounded-xl" />
                </div>
            </div>
        </div>
      </div>
    );
  }

  // If not authenticated after init, return null — the redirect is happening
  if (!isAuthenticated) {
    return null;
  }

  return (
    <SidebarProvider>
      <LecturerSidebar />
      <SidebarInset className="min-w-0 transition-[margin,width] duration-300">
        <SiteHeader />
        <main
          className={cn(
            "flex-1 bg-muted/30 min-h-[calc(100vh-3.5rem)] w-full min-w-0 transition-all duration-300",
            isGrading ? "p-2 sm:p-4 lg:p-6" : "p-4 sm:p-6",
          )}
        >
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
