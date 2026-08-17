"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { GripVertical, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

function clampSheetWidth(value: number, min: number, max: number) {
  if (typeof window === "undefined") return value;
  const viewportMax = Math.min(max, Math.floor(window.innerWidth * 0.96));
  return Math.min(viewportMax, Math.max(min, value));
}

export function useResizableSheetWidth(
  defaultWidth: number,
  min: number,
  max: number,
  storageKey: string,
) {
  const [width, setWidth] = useState<number>(() => {
    if (typeof window === "undefined") return defaultWidth;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!Number.isNaN(parsed)) {
          return clampSheetWidth(parsed, min, max);
        }
      }
    } catch {
      // Ignore storage access errors
    }
    return clampSheetWidth(defaultWidth, min, max);
  });

  const [isDragging, setIsDragging] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const draggingRef = useRef(false);

  useEffect(() => {
    const checkDesktop = () => setIsDesktop(window.innerWidth >= 768);
    checkDesktop();
    window.addEventListener("resize", checkDesktop);
    return () => window.removeEventListener("resize", checkDesktop);
  }, []);

  const persist = useCallback(
    (next: number) => {
      try {
        localStorage.setItem(storageKey, String(next));
      } catch {
        // Ignore storage access errors
      }
    },
    [storageKey],
  );

  const startDrag = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    draggingRef.current = true;
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  const resetWidth = useCallback(() => {
    const next = clampSheetWidth(defaultWidth, min, max);
    setWidth(next);
    persist(next);
  }, [defaultWidth, min, max, persist]);

  const nudgeWidth = useCallback(
    (delta: number) => {
      setWidth((current) => {
        const next = clampSheetWidth(current + delta, min, max);
        persist(next);
        return next;
      });
    },
    [min, max, persist],
  );

  const setExactWidth = useCallback(
    (value: number) => {
      const next = clampSheetWidth(value, min, max);
      setWidth(next);
      persist(next);
    },
    [min, max, persist],
  );

  useEffect(() => {
    function onMove(e: PointerEvent) {
      if (!draggingRef.current) return;
      // Right-anchored sheet: width is distance from cursor to right edge
      setWidth(clampSheetWidth(window.innerWidth - e.clientX, min, max));
    }
    function onUp() {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      setIsDragging(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setWidth((current) => {
        persist(current);
        return current;
      });
    }
    function onResize() {
      setWidth((current) => clampSheetWidth(current, min, max));
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("resize", onResize);
    };
  }, [min, max, persist]);

  return {
    width,
    startDrag,
    resetWidth,
    nudgeWidth,
    setExactWidth,
    isDragging,
    isDesktop,
    min,
    max,
    defaultWidth,
  };
}

export function SheetResizeHandle({
  onPointerDown,
  onDoubleClick,
  onNudge,
  onSetWidth,
  isDragging = false,
  width,
  min,
  max,
  className,
}: {
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
  onDoubleClick?: () => void;
  onNudge?: (delta: number) => void;
  onSetWidth?: (value: number) => void;
  isDragging?: boolean;
  width?: number;
  min?: number;
  max?: number;
  className?: string;
}) {
  return (
    <div
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          onNudge?.(32);
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          onNudge?.(-32);
        } else if (e.key === "Home" && typeof max === "number") {
          e.preventDefault();
          onSetWidth?.(max);
        } else if (e.key === "End" && typeof min === "number") {
          e.preventDefault();
          onSetWidth?.(min);
        }
      }}
      role="separator"
      tabIndex={0}
      aria-orientation="vertical"
      aria-label="Drag left edge to resize panel. Double-click to reset."
      aria-valuenow={width}
      aria-valuemin={min}
      aria-valuemax={max}
      title="Drag left/right to resize · Double-click to reset"
      className={cn(
        "hidden md:flex group/resize absolute inset-y-0 -left-2 z-50 w-4 cursor-col-resize items-center justify-center touch-none select-none outline-none",
        "focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-1",
        className,
      )}
    >
      {/* Visual edge border line */}
      <div
        className={cn(
          "h-full w-[2px] transition-[background-color,width] duration-150 ease-out",
          isDragging
            ? "w-[3px] bg-primary"
            : "bg-border group-hover/resize:bg-primary group-focus-visible/resize:bg-primary",
        )}
      />

      {/* Floating Center Grip Pill */}
      <div
        className={cn(
          "absolute left-1/2 top-1/2 flex h-11 w-4.5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border bg-background/95 text-muted-foreground shadow-md backdrop-blur-xs transition-all duration-150 ease-out",
          isDragging
            ? "scale-110 border-primary bg-primary text-primary-foreground shadow-lg"
            : "border-border hover:border-primary hover:text-primary group-hover/resize:scale-105 group-hover/resize:border-primary group-hover/resize:text-primary group-hover/resize:shadow-lg",
        )}
      >
        <GripVertical className="size-3" />
      </div>

      {/* Live Width Pill during Dragging */}
      {isDragging && typeof width === "number" && (
        <div className="pointer-events-none absolute left-6 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-md border border-primary/40 bg-popover/95 px-2 py-0.5 text-[10px] font-mono font-bold tracking-tight text-foreground shadow-lg backdrop-blur-xs">
          {Math.round(width)}px
        </div>
      )}
    </div>
  );
}

/**
 * Compact width preset buttons for sheet headers (responsive: hidden on small screens)
 */
export function SheetWidthPresets({
  currentWidth,
  presets,
  onSelectWidth,
  onReset,
}: {
  currentWidth: number;
  presets: { label: string; width: number }[];
  onSelectWidth: (width: number) => void;
  onReset?: () => void;
}) {
  return (
    <div className="hidden lg:flex items-center gap-1 bg-muted/40 p-1 rounded-lg border border-border/50 text-[10px]">
      <span className="text-muted-foreground font-semibold px-1 hidden xl:inline">
        Width:
      </span>
      {presets.map((preset) => {
        const isActive = Math.abs(currentWidth - preset.width) < 20;
        return (
          <button
            key={preset.label}
            type="button"
            onClick={() => onSelectWidth(preset.width)}
            className={cn(
              "px-2 py-0.5 rounded-md font-semibold transition-all cursor-pointer",
              isActive
                ? "bg-background text-foreground shadow-2xs border border-border/60"
                : "text-muted-foreground hover:text-foreground hover:bg-background/50",
            )}
          >
            {preset.label}
          </button>
        );
      })}
      {onReset && (
        <button
          type="button"
          onClick={onReset}
          title="Reset to default width"
          className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-background/50 transition-colors cursor-pointer"
        >
          <RotateCcw className="size-3" />
        </button>
      )}
    </div>
  );
}
