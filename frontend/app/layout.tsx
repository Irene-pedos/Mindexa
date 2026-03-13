// frontend/app/layout.tsx
import localFont from "next/font/local";
import "./globals.css";
import type { Metadata } from "next";
import Header from "@/components/shared/Header"; // your existing header

const vastago = localFont({
  src: [
    {
      path: "../public/fonts/VastagoGrotesk-Thin.woff2",
      weight: "100",
      style: "normal",
    },
    {
      path: "../public/fonts/VastagoGrotesk-ExtraLight.woff2",
      weight: "200",
      style: "normal",
    },
    {
      path: "../public/fonts/VastagoGrotesk-Light.woff2",
      weight: "300",
      style: "normal",
    },
    {
      path: "../public/fonts/VastagoGrotesk-Regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../public/fonts/VastagoGrotesk-Medium.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "../public/fonts/VastagoGrotesk-SemiBold.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "../public/fonts/VastagoGrotesk-Bold.woff2",
      weight: "700",
      style: "normal",
    },
    {
      path: "../public/fonts/VastagoGrotesk-Heavy.woff2",
      weight: "800",
      style: "normal",
    },
    {
      path: "../public/fonts/VastagoGrotesk-Black.woff2",
      weight: "900",
      style: "normal",
    },
  ],
  variable: "--font-vastago", // CSS variable we use in Tailwind
  display: "swap",
  preload: true, // improves Largest Contentful Paint (LCP)
  fallback: ["system-ui", "sans-serif"], // safe fallback
});

export const metadata: Metadata = {
  title: "Mindexa – Secure Academic Integrity Platform",
  description:
    "Cheat-proof assessments with real-time monitoring and explainable AI grading.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`
          ${vastago.variable}
          font-sans antialiased dark
          bg-background text-foreground
        `}
      >
        <Header />
        <main>{children}</main>
      </body>
    </html>
  );
}
