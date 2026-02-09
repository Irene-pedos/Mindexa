// frontend/components/shared/Header.tsx
"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils"; // shadcn creates this — make sure it exists
import { ChevronDown } from "lucide-react";

export default function Header() {
  return (
    <header className="fixed top-0 z-50 w-full border-b border-white/10 bg-black/40 backdrop-blur-xl">
      <div className="container mx-auto flex h-20 items-center justify-between px-6">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-xl font-bold text-white">
            M
          </div>
          <span className="text-2xl font-semibold tracking-tight text-white">
            Mindexa
          </span>
        </Link>

        {/* Navigation */}
        <nav className="hidden items-center gap-10 md:flex">
          <Link
            href="/"
            className="text-sm font-medium text-white/80 transition-colors hover:text-white"
          >
            Home
          </Link>

          <div className="group relative">
            <button className="flex items-center gap-1 text-sm font-medium text-white/80 transition-colors hover:text-white">
              Secure Exams{" "}
              <ChevronDown className="h-4 w-4 transition-transform group-hover:rotate-180" />
            </button>
            {/* Dropdown placeholder — we'll implement later */}
          </div>

          <Link
            href="/capabilities"
            className="text-sm font-medium text-white/80 transition-colors hover:text-white"
          >
            Capabilities
          </Link>

          <Link
            href="/about"
            className="text-sm font-medium text-white/80 transition-colors hover:text-white"
          >
            About
          </Link>

          <Link
            href="/faqs"
            className="text-sm font-medium text-white/80 transition-colors hover:text-white"
          >
            FAQs
          </Link>
        </nav>

        {/* CTA */}
        <Button
          asChild
          className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white shadow-lg shadow-indigo-500/20"
        >
          <Link href="/get-started">
            Get Started <span aria-hidden="true">→</span>
          </Link>
        </Button>
      </div>
    </header>
  );
}
