// components/mindexa/layout/role-guard.tsx
"use client";

import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Skeleton } from "@/components/ui/skeleton";

export function RoleGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isAuthenticated, loading, isInitializing } = useAuth();

  // Public routes that don't need role protection
  const publicRoutes = ["/", "/login", "/signup"];

  const isPublicRoute = publicRoutes.some((route) => {
    if (route === "/") return pathname === "/";
    return pathname.startsWith(route);
  });

  useEffect(() => {
    // 1. Don't make any routing decisions until auth has finished initializing or while loading
    if (loading || isInitializing || isPublicRoute) return;

    // 2. If definitely not authenticated, redirect to login
    if (!isAuthenticated) {
      console.warn("[RoleGuard] Redirecting to /login — not authenticated");
      router.replace("/login");
      return;
    }

    // 3. If authenticated but user object or role is missing, wait (might be a transient state)
    const userRole = user?.role?.toLowerCase();
    if (!userRole) {
      console.debug("[RoleGuard] User authenticated but role missing, waiting...");
      return;
    }

    // 4. Role-based protection
    console.log("[RoleGuard] Current path:", pathname, "User Role:", userRole);

    if (pathname.startsWith("/lecturer") && userRole !== "lecturer") {
      console.warn("[RoleGuard] Redirecting — wrong role for /lecturer:", userRole);
      router.replace(`/${userRole}/dashboard`);
    } else if (
      pathname.startsWith("/admin") &&
      userRole !== "admin" &&
      userRole !== "super_admin"
    ) {
      console.warn("[RoleGuard] Redirecting — wrong role for /admin:", userRole);
      router.replace("/login/admin");
    } else if (pathname.startsWith("/student") && userRole !== "student") {
      console.warn("[RoleGuard] Redirecting — wrong role for /student:", userRole);
      router.replace(`/${userRole}/dashboard`);
    }
  }, [loading, isInitializing, isPublicRoute, isAuthenticated, user, router, pathname]);

  if (isPublicRoute) {
    return <>{children}</>;
  }

  if (loading || isInitializing) {
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

  // Ensure role matches path — return null while redirect happens
  const userRole = user?.role?.toLowerCase();
  if (pathname.startsWith("/lecturer") && userRole !== "lecturer") return null;
  if (
    pathname.startsWith("/admin") &&
    userRole !== "admin" &&
    userRole !== "super_admin"
  )
    return null;
  if (pathname.startsWith("/student") && userRole !== "student") return null;

  return <>{children}</>;
}
