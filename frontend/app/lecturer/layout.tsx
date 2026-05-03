"use client";

// app/(lecturer)/layout.tsx
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { LecturerSidebar } from "@/components/mindexa/layout/lecturer-sidebar";
import { SiteHeader } from "@/components/mindexa/layout/site-header";
import { useAuth } from "@/hooks/use-auth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

export default function LecturerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isAuthenticated, loading, isInitializing } = useAuth();
  const router = useRouter();

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
      <div className="h-screen w-screen flex flex-col items-center justify-center gap-4">
        <Loader2 className="size-10 animate-spin text-primary" />
        <p className="text-muted-foreground animate-pulse">Authenticating...</p>
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
      <SidebarInset>
        <SiteHeader />
        <main className="flex-1 p-6 bg-muted/30 min-h-[calc(100vh-3.5rem)]">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
