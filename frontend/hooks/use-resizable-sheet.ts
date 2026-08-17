"use client";

import { useState, useCallback } from "react";

interface UseResizableSheetOptions {
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
}

export function useResizableSheet({
  defaultWidth = 760,
  minWidth = 460,
  maxWidth = 1400,
}: UseResizableSheetOptions = {}) {
  const [width, setWidth] = useState(defaultWidth);
  const [isResizing, setIsResizing] = useState(false);

  const startResize = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = width;

      const onPointerMove = (moveEvent: PointerEvent) => {
        // For a sheet anchored to the right side: dragging to the left increases its width
        const deltaX = startX - moveEvent.clientX;
        const screenMax =
          typeof window !== "undefined" ? window.innerWidth - 24 : maxWidth;
        const effectiveMax = Math.min(maxWidth, screenMax);
        const newWidth = Math.min(
          Math.max(minWidth, startWidth + deltaX),
          effectiveMax
        );
        setWidth(newWidth);
      };

      const onPointerUp = () => {
        setIsResizing(false);
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        document.body.style.removeProperty("cursor");
        document.body.style.removeProperty("user-select");
      };

      setIsResizing(true);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    },
    [width, minWidth, maxWidth]
  );

  return {
    width,
    setWidth,
    isResizing,
    startResize,
  };
}
