import type { Metadata } from "next";
// Fonts are bundled with the app (not fetched from Google at build time), so the
// production build works offline and on restricted networks.
import "@fontsource-variable/outfit";
import "@fontsource-variable/geist-mono";
import { cn } from "@/lib/utils";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { AuthProvider } from "@/components/providers/auth-provider";
import { AccessibilityProvider } from "@/components/providers/accessibility-provider";
import { RoleGuard } from "@/components/mindexa/layout/role-guard";
import { GuidedTourModal } from "@/components/mindexa/onboarding/guided-tour-modal";
import { Toaster } from "@/components/ui/sonner";

const fontVariables = {
  "--font-sans": "'Outfit Variable', ui-sans-serif, system-ui, sans-serif",
  "--font-geist-mono":
    "'Geist Mono Variable', ui-monospace, SFMono-Regular, Menlo, monospace",
} as React.CSSProperties;

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
      className="font-sans"
      style={fontVariables}
    >
      <body
        suppressHydrationWarning
        className={cn("antialiased bg-background text-foreground")}
      >
        {/* Global Error Suppression for Browser Extensions (e.g., MetaMask) */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                const suppressedErrors = [
                  'Failed to connect to MetaMask',
                  'MetaMask: Disconnected from chain',
                  'Ethereum provider',
                  'inpage.js',
                  'Unexpected token <', // Common when script injection fails
                  'Extension context invalidated'
                ];

                function shouldSuppress(msg) {
                  if (!msg) return false;
                  const str = String(msg);
                  return suppressedErrors.some(err => str.includes(err));
                }

                const originalError = console.error;
                console.error = function(...args) {
                  const firstArg = String(args[0]);
                  if (suppressedErrors.some(error => firstArg.includes(error))) {
                    return;
                  }
                  originalError.apply(console, args);
                };

                const originalWarn = console.warn;
                console.warn = function(...args) {
                  const firstArg = String(args[0]);
                  if (suppressedErrors.some(error => firstArg.includes(error))) {
                    return;
                  }
                  originalWarn.apply(console, args);
                };

                window.addEventListener('error', function(event) {
                  const msg = event.message || (event.error && event.error.message);
                  if (msg && suppressedErrors.some(error => String(msg).includes(error))) {
                    event.stopImmediatePropagation();
                    event.preventDefault();
                    return false;
                  }
                }, true);

                window.addEventListener('unhandledrejection', function(event) {
                  const msg = event.reason && (event.reason.message || event.reason);
                  if (msg && suppressedErrors.some(error => String(msg).includes(error))) {
                    event.stopImmediatePropagation();
                    event.preventDefault();
                  }
                }, true);
              })();
            `,
          }}
        />
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={true}
          disableTransitionOnChange
        >
          <AuthProvider>
            <AccessibilityProvider>
              <TooltipProvider>
                <RoleGuard>{children}</RoleGuard>
                <GuidedTourModal />
              </TooltipProvider>
            </AccessibilityProvider>
          </AuthProvider>
          <Toaster position="top-center" />
        </ThemeProvider>
      </body>
    </html>
  );
}
