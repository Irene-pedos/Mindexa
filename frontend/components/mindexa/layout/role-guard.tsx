// components/mindexa/layout/role-guard.tsx
"use client"

import { usePathname } from "next/navigation"
import { ReactNode } from "react"

// TODO: Replace with real auth context once backend is connected
const mockUserRole = "student" as "student" | "lecturer" | "admin" | null

export function RoleGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname()

  // Public routes that don't need role protection
  const publicRoutes = ["/", "/login", "/signup"]

  if (publicRoutes.some(route => pathname === route || pathname.startsWith(route))) {
    return <>{children}</>
  }

  if (!mockUserRole) {
    // In production this would redirect to /login
    return <div className="flex min-h-screen items-center justify-center">Redirecting to login...</div>
  }

  // For now we allow all roles (real logic will check route group vs user role later)
  return <>{children}</>
}