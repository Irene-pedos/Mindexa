"use client";

import * as React from "react";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

interface ResizableContextType {
  orientation: "horizontal" | "vertical";
  registerPanel: (
    id: string,
    defaultSize?: number | string,
    minSize?: number,
    maxSize?: number
  ) => void;
  unregisterPanel: (id: string) => void;
  sizes: Record<string, number>;
  startResize: (index: number, e: React.PointerEvent) => void;
}

const ResizableContext = React.createContext<ResizableContextType | null>(null);

function parseSize(size?: number | string): number {
  if (typeof size === "number") return size;
  if (typeof size === "string") {
    const parsed = parseFloat(size.replace("%", "").trim());
    return isNaN(parsed) ? 50 : parsed;
  }
  return 50;
}

interface ResizablePanelGroupProps
  extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: "horizontal" | "vertical";
  className?: string;
  children: React.ReactNode;
}

function ResizablePanelGroup({
  orientation = "horizontal",
  className,
  children,
  ...props
}: ResizablePanelGroupProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [panelIds, setPanelIds] = React.useState<string[]>([]);
  const [panelConfigs, setPanelConfigs] = React.useState<
    Record<string, { defaultSize: number; minSize: number; maxSize: number }>
  >({});
  const [sizes, setSizes] = React.useState<Record<string, number>>({});

  const registerPanel = React.useCallback(
    (
      id: string,
      defaultSize?: number | string,
      minSize = 10,
      maxSize = 90
    ) => {
      const parsedDefault = parseSize(defaultSize);
      setPanelConfigs((prev) => {
        const existing = prev[id];
        if (
          existing &&
          existing.defaultSize === parsedDefault &&
          existing.minSize === minSize &&
          existing.maxSize === maxSize
        ) {
          return prev;
        }
        return {
          ...prev,
          [id]: { defaultSize: parsedDefault, minSize, maxSize },
        };
      });
      setPanelIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    },
    []
  );

  const unregisterPanel = React.useCallback((id: string) => {
    setPanelIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : prev));
    setPanelConfigs((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  // Initialize and normalize sizes only when panel configuration changes
  React.useEffect(() => {
    if (panelIds.length === 0) return;

    setSizes((prev) => {
      let changed = false;
      const next: Record<string, number> = { ...prev };

      // Remove sizes of unmounted panels
      Object.keys(next).forEach((k) => {
        if (!panelIds.includes(k)) {
          delete next[k];
          changed = true;
        }
      });

      let unassignedCount = 0;
      let assignedSum = 0;

      panelIds.forEach((id) => {
        if (next[id] !== undefined) {
          assignedSum += next[id];
        } else if (panelConfigs[id]?.defaultSize !== undefined) {
          next[id] = panelConfigs[id].defaultSize;
          assignedSum += next[id];
          changed = true;
        } else {
          unassignedCount++;
        }
      });

      if (unassignedCount > 0) {
        const remaining = Math.max(0, 100 - assignedSum);
        const perPanel = remaining / unassignedCount;
        panelIds.forEach((id) => {
          if (next[id] === undefined) {
            next[id] = perPanel;
            changed = true;
          }
        });
      }

      return changed ? next : prev;
    });
  }, [panelIds, panelConfigs]);

  const startResize = React.useCallback(
    (handleIndex: number, e: React.PointerEvent) => {
      e.preventDefault();
      if (!containerRef.current || panelIds.length <= handleIndex + 1) return;

      const leftId = panelIds[handleIndex];
      const rightId = panelIds[handleIndex + 1];
      if (!leftId || !rightId) return;

      const rect = containerRef.current.getBoundingClientRect();
      const isHorizontal = orientation === "horizontal";
      const totalPixelSize = isHorizontal ? rect.width : rect.height;
      if (totalPixelSize <= 0) return;

      const startPos = isHorizontal ? e.clientX : e.clientY;
      const initialLeftSize = sizes[leftId] ?? 50;
      const initialRightSize = sizes[rightId] ?? 50;
      const combinedSize = initialLeftSize + initialRightSize;

      const onPointerMove = (moveEvent: PointerEvent) => {
        const currentPos = isHorizontal ? moveEvent.clientX : moveEvent.clientY;
        const deltaPx = currentPos - startPos;
        const deltaPercent = (deltaPx / totalPixelSize) * 100;

        let newLeft = initialLeftSize + deltaPercent;
        let newRight = initialRightSize - deltaPercent;

        const leftMin = panelConfigs[leftId]?.minSize ?? 10;
        const leftMax = panelConfigs[leftId]?.maxSize ?? combinedSize - 10;
        const rightMin = panelConfigs[rightId]?.minSize ?? 10;
        const rightMax = panelConfigs[rightId]?.maxSize ?? combinedSize - 10;

        if (newLeft < leftMin) {
          newLeft = leftMin;
          newRight = combinedSize - leftMin;
        } else if (newLeft > leftMax) {
          newLeft = leftMax;
          newRight = combinedSize - leftMax;
        }

        if (newRight < rightMin) {
          newRight = rightMin;
          newLeft = combinedSize - rightMin;
        } else if (newRight > rightMax) {
          newRight = rightMax;
          newLeft = combinedSize - rightMax;
        }

        setSizes((prev) => ({
          ...prev,
          [leftId]: newLeft,
          [rightId]: newRight,
        }));
      };

      const onPointerUp = () => {
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        document.body.style.removeProperty("cursor");
        document.body.style.removeProperty("user-select");
      };

      document.body.style.cursor = isHorizontal ? "col-resize" : "row-resize";
      document.body.style.userSelect = "none";
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    },
    [orientation, panelIds, panelConfigs, sizes]
  );

  const contextValue = React.useMemo<ResizableContextType>(
    () => ({
      orientation,
      registerPanel,
      unregisterPanel,
      sizes,
      startResize,
    }),
    [orientation, registerPanel, unregisterPanel, sizes, startResize]
  );

  return (
    <ResizableContext.Provider value={contextValue}>
      <div
        ref={containerRef}
        data-slot="resizable-panel-group"
        data-panel-group-direction={orientation}
        className={cn(
          "flex h-full w-full",
          orientation === "vertical" ? "flex-col" : "flex-row",
          className
        )}
        {...props}
      >
        {children}
      </div>
    </ResizableContext.Provider>
  );
}

interface ResizablePanelProps extends React.HTMLAttributes<HTMLDivElement> {
  id?: string;
  defaultSize?: number | string;
  minSize?: number;
  maxSize?: number;
  className?: string;
  children: React.ReactNode;
}

function ResizablePanel({
  id: explicitId,
  defaultSize,
  minSize = 10,
  maxSize = 90,
  className,
  style,
  children,
  ...props
}: ResizablePanelProps) {
  const autoId = React.useId();
  const id = explicitId || autoId;
  const context = React.useContext(ResizableContext);

  const registerPanel = context?.registerPanel;
  const unregisterPanel = context?.unregisterPanel;

  React.useEffect(() => {
    if (registerPanel && unregisterPanel) {
      registerPanel(id, defaultSize, minSize, maxSize);
      return () => {
        unregisterPanel(id);
      };
    }
  }, [id, defaultSize, minSize, maxSize, registerPanel, unregisterPanel]);

  const size = context?.sizes[id];
  const sizeStyle: React.CSSProperties =
    size !== undefined
      ? context?.orientation === "vertical"
        ? { height: `${size}%`, flexBasis: `${size}%`, flexGrow: 0, flexShrink: 0 }
        : { width: `${size}%`, flexBasis: `${size}%`, flexGrow: 0, flexShrink: 0 }
      : { flex: 1 };

  return (
    <div
      data-slot="resizable-panel"
      className={cn("overflow-auto min-w-0 min-h-0", className)}
      style={{ ...sizeStyle, ...style }}
      {...props}
    >
      {children}
    </div>
  );
}

interface ResizableHandleProps extends React.HTMLAttributes<HTMLDivElement> {
  withHandle?: boolean;
  className?: string;
}

function ResizableHandle({
  withHandle,
  className,
  onPointerDown,
  ...props
}: ResizableHandleProps) {
  const context = React.useContext(ResizableContext);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    onPointerDown?.(e);
    if (context) {
      const currentTarget = e.currentTarget;
      const parent = currentTarget.parentElement;
      if (parent) {
        const handles = Array.from(
          parent.querySelectorAll('[data-slot="resizable-handle"]')
        );
        const idx = handles.indexOf(currentTarget);
        context.startResize(idx >= 0 ? idx : 0, e);
      }
    }
  };

  const isHorizontal = context?.orientation === "horizontal";

  return (
    <div
      role="separator"
      tabIndex={0}
      data-slot="resizable-handle"
      onPointerDown={handlePointerDown}
      className={cn(
        "relative flex items-center justify-center bg-border/60 hover:bg-primary/50 transition-colors touch-none select-none z-10 shrink-0",
        isHorizontal
          ? "w-1.5 cursor-col-resize hover:w-2 py-2"
          : "h-1.5 cursor-row-resize hover:h-2 px-2 w-full",
        className
      )}
      {...props}
    >
      {withHandle && (
        <div
          className={cn(
            "flex items-center justify-center rounded-sm border border-border bg-background shadow-2xs text-muted-foreground hover:text-foreground pointer-events-none",
            isHorizontal ? "h-6 w-3" : "h-3 w-6"
          )}
        >
          <GripVertical
            className={cn("size-2.5", !isHorizontal && "rotate-90")}
          />
        </div>
      )}
    </div>
  );
}

export { ResizablePanelGroup, ResizablePanel, ResizableHandle };
