// components/mindexa/layout/site-header.tsx
"use client"

import { Bell, LogOut, User } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import React from "react"

const notifications = [
  { id: 1, message: "Database Systems CAT result released (92%)", time: "2h ago", read: false },
  { id: 2, message: "Group project deadline extended", time: "Yesterday", read: true },
  { id: 3, message: "New lecture notes available in Algorithms", time: "Mar 26", read: false },
]

export function SiteHeader() {
  const pathname = usePathname()
  const unread = notifications.filter(n => !n.read).length

  // Determine role from pathname
  const getRole = () => {
    if (pathname.startsWith("/admin")) return "Admin"
    if (pathname.startsWith("/lecturer")) return "Lecturer"
    if (pathname.startsWith("/student")) return "Student"
    return "User"
  }

  const role = getRole()

  // Improved breadcrumb generator with role prefixes
  const getBreadcrumbs = () => {
    const segments = pathname.split("/").filter(Boolean)
    const crumbs = [{ label: "Home", href: `/${role.toLowerCase()}/dashboard` }]

    if (segments.includes("assessments")) crumbs.push({ label: "Assessments", href: `/${role.toLowerCase()}/assessments` })
    if (segments.includes("results")) crumbs.push({ label: "Results", href: `/${role.toLowerCase()}/results` })
    if (segments.includes("courses")) crumbs.push({ label: "Courses", href: `/${role.toLowerCase()}/courses` })
    if (segments.includes("study")) crumbs.push({ label: "Study Support", href: `/${role.toLowerCase()}/study` })
    if (segments.includes("resources")) crumbs.push({ label: "Resources", href: `/${role.toLowerCase()}/resources` })
    if (segments.includes("schedule")) crumbs.push({ label: "Schedule", href: `/${role.toLowerCase()}/schedule` })
    if (segments.includes("profile")) crumbs.push({ label: "Profile", href: "/profile" })
    if (segments.includes("grading")) crumbs.push({ label: "Grading Queue", href: "/lecturer/grading" })
    if (segments.includes("supervision")) crumbs.push({ label: "Live Supervision", href: "/lecturer/supervision" })
    if (segments.includes("ai-assistant")) crumbs.push({ label: "AI Assistant", href: "/lecturer/ai-assistant" })

    return crumbs
  }

  const crumbs = getBreadcrumbs()

  return (
    <header className="sticky top-0 z-50 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <SidebarTrigger className="-ml-1" />

      <Separator orientation="vertical" className="mr-2 h-4" />

      <Breadcrumb>
        <BreadcrumbList>
          {crumbs.map((crumb, index) => (
            <React.Fragment key={index}>
              <BreadcrumbItem>
                {index === crumbs.length - 1 ? (
                  <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link href={crumb.href}>{crumb.label}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {index < crumbs.length - 1 && <BreadcrumbSeparator />}
            </React.Fragment>
          ))}
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex-1" />

      <div className="flex items-center gap-4">
        <Badge variant="secondary" className="font-medium">{role}</Badge>

        {/* Notifications Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="size-5" />
              {unread > 0 && (
                <div className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 text-[10px] font-medium text-white flex items-center justify-center">
                  {unread}
                </div>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel>Notifications</DropdownMenuLabel>
            <ScrollArea className="h-72">
              {notifications.map((n) => (
                <DropdownMenuItem key={n.id} className="flex-col items-start py-3">
                  <div className={n.read ? "text-muted-foreground" : "font-medium"}>{n.message}</div>
                  <div className="text-xs text-muted-foreground mt-1">{n.time}</div>
                </DropdownMenuItem>
              ))}
            </ScrollArea>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <User className="size-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>My Account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/profile">Profile Settings</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/academic-record">Academic Record</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive">
              <LogOut className="mr-2 size-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}