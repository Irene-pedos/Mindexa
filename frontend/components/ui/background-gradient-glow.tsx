"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface BackgroundGradientGlowProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "aurora" | "morning-mist";
}

export function BackgroundGradientGlow({
  className,
  variant = "morning-mist",
  children,
  ...props
}: BackgroundGradientGlowProps) {
  const backgroundStyle =
    variant === "aurora"
      ? {
          background: `
            radial-gradient(ellipse 85% 65% at 8% 8%, rgba(175, 109, 255, 0.42), transparent 60%),
            radial-gradient(ellipse 75% 60% at 75% 35%, rgba(255, 235, 170, 0.55), transparent 62%),
            radial-gradient(ellipse 70% 60% at 15% 80%, rgba(255, 100, 180, 0.40), transparent 62%),
            radial-gradient(ellipse 70% 60% at 92% 92%, rgba(120, 190, 255, 0.45), transparent 62%),
            linear-gradient(180deg, #f7eaff 0%, #fde2ea 100%)
          `,
        }
      : {
          backgroundImage: `
            linear-gradient(135deg, 
              rgba(248,250,252,1) 0%, 
              rgba(219,234,254,0.7) 30%, 
              rgba(165,180,252,0.5) 60%, 
              rgba(129,140,248,0.6) 100%
            ),
            radial-gradient(circle at 20% 30%, rgba(255,255,255,0.6) 0%, transparent 40%),
            radial-gradient(circle at 80% 70%, rgba(199,210,254,0.4) 0%, transparent 50%),
            radial-gradient(circle at 40% 80%, rgba(224,231,255,0.3) 0%, transparent 60%)
          `,
        };

  return (
    <div className={cn("relative min-h-full w-full", className)} {...props}>
      <div className="absolute inset-0 z-0 pointer-events-none rounded-[inherit]" style={backgroundStyle} />
      <div className="relative z-10 w-full h-full">{children}</div>
    </div>
  );
}
