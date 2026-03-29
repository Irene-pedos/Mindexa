// app/(lecturer)/layout.tsx
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { LecturerSidebar } from "@/components/mindexa/layout/lecturer-sidebar"
import { SiteHeader } from "@/components/mindexa/layout/site-header"

export default function LecturerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <SidebarProvider>
      <LecturerSidebar />
      <SidebarInset>
        <SiteHeader role="lecturer" />
        <main className="flex-1 p-6 bg-muted/30 min-h-[calc(100vh-3.5rem)]">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}