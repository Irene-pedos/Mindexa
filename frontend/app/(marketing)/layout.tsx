// frontend/app/(marketing)/layout.tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Header from "@/components/shared/Header";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Mindexa – Secure Academic Integrity Platform",
  description:
    "Cheat-proof assessments with real-time monitoring and explainable AI grading.",
};

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="scroll-smooth">
      <body className={`${inter.className} bg-black text-white antialiased`}>
        <Header />
        <main className="pt-20">{children}</main>{" "}
        {/* offset for fixed header */}
      </body>
    </html>
  );
}
