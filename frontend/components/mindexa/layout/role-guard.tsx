// components/mindexa/layout/role-guard.tsx
"use client";

import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Skeleton } from "@/components/ui/skeleton";

export function RoleGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isAuthenticated, loading } = useAuth();

  // Public routes that don't need role protection
  const publicRoutes = ["/", "/login", "/signup"];

  const isPublicRoute = publicRoutes.some((route) => {
    if (route === "/") return pathname === "/";
    return pathname.startsWith(route);
  });

  useEffect(() => {
    if (!loading && !isPublicRoute) {
      if (!isAuthenticated) {
        router.replace("/login");
        return;
      }

      // Role-based protection
      if (pathname.startsWith("/lecturer") && user?.role !== "LECTURER") {
        router.replace("/login");
      } else if (pathname.startsWith("/admin") && user?.role !== "ADMIN") {
        router.replace("/login/admin"); // Admin has a different portal
      } else if (pathname.startsWith("/student") && user?.role !== "STUDENT") {
        router.replace("/login");
      }
    }
  }, [loading, isPublicRoute, isAuthenticated, user, router, pathname]);

  if (isPublicRoute) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Skeleton className="h-12 w-12 rounded-full" />
          <Skeleton className="h-4 w-40" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  // Ensure role matches path
  if (pathname.startsWith("/lecturer") && user?.role !== "LECTURER") return null;
  if (pathname.startsWith("/admin") && user?.role !== "ADMIN") return null;
  if (pathname.startsWith("/student") && user?.role !== "STUDENT") return null;

  return <>{children}</>;
}
