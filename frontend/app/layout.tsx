// frontend/app/layout.tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono, Outfit } from "next/font/google";
import { cn } from "@/lib/utils";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { AuthProvider } from "@/components/providers/auth-provider";
import { RoleGuard } from "@/components/mindexa/layout/role-guard";
import { Toaster } from "@/components/ui/sonner";

const outfit = Outfit({subsets:['latin'],variable:'--font-sans'});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Mindexa - Secure Academic Integrity Platform",
  description:
    "Ultra-secure academic assessment system with explainable AI grading and real-time integrity monitoring.",
  icons: {
    icon: "/icons/logo/mindexa-icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("font-sans", outfit.variable)}
    >
      <body
        suppressHydrationWarning
        className={cn(
          outfit.variable,
          geistSans.variable,
          geistMono.variable,
          "antialiased bg-background text-foreground",
        )}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="light" // Force light mode for academic feel
          enableSystem={false}
          disableTransitionOnChange
        >
          <AuthProvider>
            <TooltipProvider>
              <RoleGuard>{children}</RoleGuard>
            </TooltipProvider>
          </AuthProvider>
          <Toaster position="top-center" />
        </ThemeProvider>
      </body>
    </html>
  );
}
