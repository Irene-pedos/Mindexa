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
      setIsAtBottom(true);
      setShowScrollButton(false);
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

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const disengage = () => {
      const offset = 25;
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= offset;
      if (!atBottom) {
        setIsAtBottom(false);
        setShowScrollButton(el.scrollHeight > el.clientHeight);
      }
    };

    const onSelectionChange = () => {
      if (document.getSelection()?.toString()) disengage();
    };

    el.addEventListener("mousedown", disengage, { passive: true });
    el.addEventListener("keydown", disengage, { passive: true });
    el.addEventListener("selectstart", disengage, { passive: true });
    document.addEventListener("selectionchange", onSelectionChange, { passive: true });

    return () => {
      el.removeEventListener("mousedown", disengage);
      el.removeEventListener("keydown", disengage);
      el.removeEventListener("selectstart", disengage);
      document.removeEventListener("selectionchange", onSelectionChange);
    };
  }, [viewportRef, setIsAtBottom, setShowScrollButton]);

  return (
    <div
      ref={viewportRef}
      className={cn("h-full overflow-y-auto scroll-fade scrollbar-none", className)}
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

  if (!showScrollButton) return null;

  return (
    <Button
      onClick={() => scrollToBottom("smooth")}
      size="sm"
      className={cn(
        "absolute bottom-4 right-4 rounded-full size-8 p-0 shadow-lg hover:shadow-xl transition-all animate-in fade-in slide-in-from-bottom-2 duration-200 z-30",
        className
      )}
      aria-label="Scroll to bottom"
      type="button"
    >
      <ArrowDownIcon className="size-4" />
    </Button>
  );
}
