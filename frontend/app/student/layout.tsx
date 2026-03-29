// app/(student)/layout.tsx
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { StudentSidebar } from "@/components/mindexa/layout/student-sidebar"
import { SiteHeader } from "@/components/mindexa/layout/site-header"

export default function StudentLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <SidebarProvider>
      <StudentSidebar />
      <SidebarInset>
        <SiteHeader />
        <main className="flex-1 p-6 bg-muted/30 min-h-[calc(100vh-3.5rem)]">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}