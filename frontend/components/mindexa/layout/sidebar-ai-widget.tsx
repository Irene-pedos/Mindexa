// components/mindexa/layout/sidebar-ai-widget.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Dynamic import of Three.js / React-Three-Fiber Silk component with SSR disabled
const Silk = dynamic(() => import("@/components/Silk"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-[#0c2269]" />,
});

interface SidebarAiWidgetProps {
  storageKey: string;
  title: string;
  description: string;
  buttonText: string;
  buttonHref: string;
  icon?: React.ReactNode;
  className?: string;
}

export function SidebarAiWidget({
  storageKey,
  title,
  description,
  buttonText,
  buttonHref,
  icon,
  className,
}: SidebarAiWidgetProps) {
  const [isDismissed, setIsDismissed] = React.useState<boolean>(true);
  const [mounted, setMounted] = React.useState<boolean>(false);

  React.useEffect(() => {
    setMounted(true);
    try {
      const saved = localStorage.getItem(storageKey);
      setIsDismissed(saved === "true");
    } catch {
      setIsDismissed(false);
    }
  }, [storageKey]);

  const handleDismiss = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDismissed(true);
    try {
      localStorage.setItem(storageKey, "true");
    } catch {}
  };

  if (!mounted || isDismissed) {
    return null;
  }

  return (
    <div className={cn("group-data-[collapsible=icon]:hidden px-1", className)}>
      <div className="relative rounded-2xl border-0 bg-[#091847] p-3.5 shadow-lg space-y-2.5 text-left transition-all duration-300 overflow-hidden text-white">
        {/* Animated Silk Gradient Background */}
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none opacity-90">
          <Silk
            speed={4.8}
            scale={0.7}
            color="#1447e6"
            noiseIntensity={1.3}
            rotation={0}
          />
          {/* Subtle Dark Gradient Overlay for optimal contrast & typography readability */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-black/15 to-black/50" />
        </div>

        {/* Dismiss / Close Button */}
        <button
          type="button"
          onClick={handleDismiss}
          className="absolute top-2.5 right-2.5 z-20 size-6 rounded-full flex items-center justify-center text-white/70 hover:text-white bg-black/20 hover:bg-black/40 backdrop-blur-xs transition-colors"
          title="Dismiss widget"
          aria-label="Dismiss widget"
        >
          <X className="size-3.5" />
        </button>

        {/* Content & Action */}
        <div className="relative z-10 space-y-1.5 pr-6">
          <div className="flex items-center gap-1.5 font-semibold text-xs text-white tracking-tight">
            {icon || <Sparkles className="size-3.5 text-blue-300 fill-blue-300/30" />}
            <span>{title}</span>
          </div>
          <p className="text-[11px] text-white/85 font-normal leading-relaxed">
            {description}
          </p>
        </div>

        <div className="relative z-10 pt-0.5">
          <Button
            asChild
            size="sm"
            className="w-full h-8 text-xs font-semibold rounded-xl bg-white text-[#0a2575] hover:bg-white/90 shadow-sm border-0 transition-transform active:scale-98"
          >
            <Link href={buttonHref}>{buttonText}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
