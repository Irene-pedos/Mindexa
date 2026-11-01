// components/mindexa/layout/sidebar-ai-widget.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { X, Sparkles, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Dynamic import of Three.js / React-Three-Fiber Silk component with SSR disabled
const Silk = dynamic(() => import("@/components/Silk"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 size-full bg-gradient-to-br from-[#0a1a4a] via-[#0c2269] to-[#061238] animate-pulse" />
  ),
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
      // Clear legacy localStorage dismissal so widget reappears on fresh sessions
      if (typeof window !== "undefined" && window.localStorage.getItem(storageKey)) {
        window.localStorage.removeItem(storageKey);
      }
      // Check session-only dismissal
      const saved =
        typeof window !== "undefined"
          ? window.sessionStorage.getItem(storageKey)
          : null;
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
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(storageKey, "true");
      }
    } catch {}
  };

  if (!mounted) {
    return null;
  }

  return (
    <AnimatePresence mode="wait">
      {!isDismissed && (
        <motion.div
          key={storageKey}
          initial={{ opacity: 0, y: 10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{
            opacity: 0,
            y: -6,
            scale: 0.92,
            height: 0,
            marginTop: 0,
            marginBottom: 0,
            paddingTop: 0,
            paddingBottom: 0,
            transition: {
              opacity: { duration: 0.18, ease: "easeOut" },
              height: { duration: 0.25, ease: [0.4, 0, 0.2, 1] },
              y: { duration: 0.18, ease: "easeOut" },
              scale: { duration: 0.18, ease: "easeOut" },
            },
          }}
          transition={{
            duration: 0.25,
            ease: [0.16, 1, 0.3, 1],
          }}
          className={cn(
            "group-data-[collapsible=icon]:hidden px-1 overflow-hidden bg-transparent border-0 shadow-none",
            className
          )}
        >
          {/* Floating Card Container */}
          <div className="group/ai-widget relative rounded-2xl border border-white/20 p-3.5 shadow-xl shadow-black/25 space-y-2.5 text-left overflow-hidden text-white bg-transparent backdrop-blur-md transition-all duration-300">
            {/* Animated Silk Background (fills 100% of the widget card) */}
            <div className="absolute inset-0 size-full overflow-hidden rounded-[inherit] pointer-events-none z-0">
              <Silk
                speed={4.8}
                scale={0.7}
                color="#1447e6"
                noiseIntensity={1.3}
                rotation={0}
              />
              {/* Subtle contrast gradient for optimal typography readability */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/25 to-black/35 pointer-events-none" />
            </div>

            {/* Dismiss / Close Button */}
            <button
              type="button"
              onClick={handleDismiss}
              className="absolute top-2.5 right-2.5 z-20 size-6 rounded-full flex items-center justify-center text-white/70 hover:text-white bg-black/25 hover:bg-black/50 backdrop-blur-sm border border-white/10 hover:border-white/20 transition-all duration-150 active:scale-90"
              title="Hide for this session"
              aria-label="Hide for this session"
            >
              <X className="size-3.5" />
            </button>

            {/* Content & Action */}
            <div className="relative z-10 space-y-1 pr-6">
              <div className="flex items-center gap-1.5 font-semibold text-xs text-white tracking-tight">
                {icon || (
                  <Sparkles className="size-3.5 text-blue-300 fill-blue-300/30 shrink-0" />
                )}
                <span className="truncate">{title}</span>
              </div>
              <p className="text-[11px] text-white/85 font-normal leading-relaxed line-clamp-2">
                {description}
              </p>
            </div>

            <div className="relative z-10 pt-0.5">
              <Button
                asChild
                size="sm"
                className="w-full h-8 text-xs font-semibold rounded-xl bg-white text-[#0a2575] hover:bg-white/95 shadow-md shadow-black/10 border-0 transition-all duration-150 active:scale-[0.98] group/btn flex items-center justify-center gap-1.5"
              >
                <Link href={buttonHref}>
                  <span>{buttonText}</span>
                  <ArrowRight className="size-3 transition-transform duration-150 group-hover/btn:translate-x-0.5" />
                </Link>
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
