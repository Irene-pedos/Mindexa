"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ArrowDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface MessageScrollerContextType {
  viewportRef: React.RefObject<HTMLDivElement | null>;
  isAtBottom: boolean;
  setIsAtBottom: (atBottom: boolean) => void;
  scrollToBottom: (behavior?: ScrollBehavior) => void;
  showScrollButton: boolean;
  setShowScrollButton: (show: boolean) => void;
  scrollPreviousItemPeek: number;
  scrollMargin: number;
  isAnchoring: boolean;
  setIsAnchoring: (anchoring: boolean) => void;
}

const MessageScrollerContext = createContext<MessageScrollerContextType | undefined>(undefined);

export function MessageScrollerProvider({
  children,
  scrollPreviousItemPeek = 64,
  scrollMargin = 24,
}: {
  children: React.ReactNode;
  scrollPreviousItemPeek?: number;
  scrollMargin?: number;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [isAnchoring, setIsAnchoring] = useState(false);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    if (viewportRef.current) {
      viewportRef.current.scrollTo({
        top: viewportRef.current.scrollHeight,
        behavior,
      });
      setTimeout(() => {
        if (viewportRef.current) {
          const el = viewportRef.current;
          const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
          if (dist <= 50) {
            setIsAtBottom(true);
            setShowScrollButton(false);
          }
        }
      }, 350);
    }
  }, []);

  const value = useMemo(
    () => ({
      viewportRef,
      isAtBottom,
      setIsAtBottom,
      scrollToBottom,
      showScrollButton,
      setShowScrollButton,
      scrollPreviousItemPeek,
      scrollMargin,
      isAnchoring,
      setIsAnchoring,
    }),
    [
      isAtBottom,
      scrollToBottom,
      showScrollButton,
      scrollPreviousItemPeek,
      scrollMargin,
      isAnchoring,
    ]
  );

  return (
    <MessageScrollerContext.Provider value={value}>
      {children}
    </MessageScrollerContext.Provider>
  );
}

export function useMessageScroller() {
  const ctx = useContext(MessageScrollerContext);
  if (!ctx) throw new Error("useMessageScroller must be used within MessageScrollerProvider");
  return ctx;
}

export function MessageScroller({ children, className }: { children: React.ReactNode; className?: string }) {
  const { viewportRef, setIsAtBottom, setShowScrollButton } = useMessageScroller();

  const handleScroll = () => {
    const el = viewportRef.current;
    if (!el) return;

    // Threshold check (25px from bottom)
    const offset = 25;
    const isBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= offset;
    
    setIsAtBottom(isBottom);
    if (isBottom) {
      setShowScrollButton(false);
    } else {
      const scrolledUpSubstantially = el.scrollHeight - el.scrollTop - el.clientHeight > 100;
      if (scrolledUpSubstantially) {
        setShowScrollButton(el.scrollHeight > el.clientHeight);
      }
    }
  };

  return (
    <div className={cn("relative flex-1 overflow-hidden h-full", className)} onScroll={handleScroll}>
      {children}
    </div>
  );
}

export function MessageScrollerViewport({ children, className }: { children: React.ReactNode; className?: string }) {
  const { viewportRef, setIsAtBottom, setShowScrollButton } = useMessageScroller();

  const handleScroll = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;

    const threshold = 40;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distanceFromBottom <= threshold;

    setIsAtBottom(atBottom);

    if (atBottom) {
      setShowScrollButton(false);
    } else {
      const scrolledUp = distanceFromBottom > 80;
      if (scrolledUp && el.scrollHeight > el.clientHeight) {
        setShowScrollButton(true);
      }
    }
  }, [viewportRef, setIsAtBottom, setShowScrollButton]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    handleScroll();

    const disengage = () => {
      handleScroll();
    };

    const onSelectionChange = () => {
      if (document.getSelection()?.toString()) {
        setIsAtBottom(false);
      }
    };

    el.addEventListener("mousedown", disengage, { passive: true });
    el.addEventListener("keydown", disengage, { passive: true });
    el.addEventListener("selectstart", disengage, { passive: true });
    document.addEventListener("selectionchange", onSelectionChange, { passive: true });

    const resizeObserver = new ResizeObserver(() => {
      handleScroll();
    });
    resizeObserver.observe(el);

    return () => {
      el.removeEventListener("mousedown", disengage);
      el.removeEventListener("keydown", disengage);
      el.removeEventListener("selectstart", disengage);
      document.removeEventListener("selectionchange", onSelectionChange);
      resizeObserver.disconnect();
    };
  }, [viewportRef, handleScroll, setIsAtBottom]);

  return (
    <div
      ref={viewportRef}
      onScroll={handleScroll}
      className={cn("h-full overflow-y-auto scroll-fade narrow-scrollbar-dark", className)}
    >
      {children}
    </div>
  );
}

export function MessageScrollerContent({
  children,
  className,
  "aria-busy": ariaBusy,
}: {
  children: React.ReactNode;
  className?: string;
  "aria-busy"?: boolean;
}) {
  const { isAtBottom, scrollToBottom, isAnchoring } = useMessageScroller();

  useEffect(() => {
    if (isAtBottom && !isAnchoring) {
      scrollToBottom("auto");
    }
  }, [children, isAtBottom, scrollToBottom, isAnchoring]);

  return (
    <div
      role="log"
      aria-relevant="additions"
      aria-busy={ariaBusy}
      className={cn("flex flex-col gap-4", className)}
    >
      {children}
    </div>
  );
}

export function MessageScrollerItem({
  children,
  className,
  scrollAnchor = false,
}: {
  children: React.ReactNode;
  className?: string;
  scrollAnchor?: boolean;
}) {
  const itemRef = useRef<HTMLDivElement | null>(null);
  const {
    viewportRef,
    scrollPreviousItemPeek,
    scrollMargin,
    setIsAnchoring,
    setIsAtBottom,
  } = useMessageScroller();

  useEffect(() => {
    if (scrollAnchor && itemRef.current && viewportRef.current) {
      const container = viewportRef.current;
      const element = itemRef.current;

      setIsAnchoring(true);
      setIsAtBottom(false);

      const frameId = requestAnimationFrame(() => {
        if (!container || !element) return;
        const containerRect = container.getBoundingClientRect();
        const elementRect = element.getBoundingClientRect();
        const relativeTop = elementRect.top - containerRect.top + container.scrollTop;

        const targetScrollTop = Math.max(
          0,
          relativeTop - scrollPreviousItemPeek - scrollMargin
        );

        container.scrollTo({
          top: targetScrollTop,
          behavior: "smooth",
        });

        setTimeout(() => {
          setIsAnchoring(false);
        }, 300);
      });

      return () => cancelAnimationFrame(frameId);
    }
  }, [
    scrollAnchor,
    viewportRef,
    scrollPreviousItemPeek,
    scrollMargin,
    setIsAnchoring,
    setIsAtBottom,
  ]);

  return (
    <div ref={itemRef} className={className}>
      {children}
    </div>
  );
}

export function MessageScrollerButton({ className }: { className?: string }) {
  const { showScrollButton, scrollToBottom } = useMessageScroller();

  return (
    <button
      onClick={() => scrollToBottom("smooth")}
      className={cn(
        "absolute z-30 transition-all duration-300 ease-out",
        "flex items-center justify-center",
        "size-8 sm:size-9 rounded-full",
        "bg-card/95 dark:bg-card/95 backdrop-blur-md",
        "border border-border/80 shadow-md hover:shadow-lg",
        "text-muted-foreground hover:text-foreground",
        "hover:scale-110 active:scale-95 focus:outline-none focus:ring-2 focus:ring-primary/40",
        "cursor-pointer group",
        showScrollButton
          ? "opacity-100 translate-y-0 pointer-events-auto"
          : "opacity-0 translate-y-3 pointer-events-none",
        className || "bottom-24 sm:bottom-28 right-4 sm:right-6 md:right-8"
      )}
      aria-label="Scroll to bottom"
      type="button"
      title="Scroll to latest messages"
    >
      <ArrowDownIcon className="size-4 transition-transform duration-200 group-hover:translate-y-0.5" />
    </button>
  );
}
