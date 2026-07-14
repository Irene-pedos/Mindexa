"use client";

import React from "react";
import { cn } from "@/lib/utils";

export function Marker({
  children,
  className,
  role,
  variant = "default",
}: {
  children: React.ReactNode;
  className?: string;
  role?: string;
  variant?: "default" | "separator";
}) {
  if (variant === "separator") {
    return (
      <div
        role={role}
        className={cn(
          "flex items-center gap-3 w-full py-2 select-none animate-in fade-in duration-200",
          className
        )}
      >
        <div className="h-[1px] flex-1 bg-border/30" />
        <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground/60 px-1">
          {children}
        </div>
        <div className="h-[1px] flex-1 bg-border/40" />
      </div>
    );
  }

  return (
    <div
      role={role}
      className={cn(
        "flex items-center gap-2.5 py-1 px-1.5 rounded-lg text-xs text-muted-foreground/80 font-medium select-none animate-in fade-in duration-200",
        className
      )}
    >
      {children}
    </div>
  );
}

export function MarkerIcon({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-center size-5 rounded-md bg-muted/65 text-muted-foreground/70 shrink-0 border border-border/20 [&_svg]:size-3",
        className
      )}
    >
      {children}
    </div>
  );
}

export function MarkerContent({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "text-[11px] font-medium text-muted-foreground/85 leading-none flex-1 truncate",
        className
      )}
    >
      {children}
    </div>
  );
}
