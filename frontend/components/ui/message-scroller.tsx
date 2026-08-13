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
}

const MessageScrollerContext = createContext<MessageScrollerContextType | undefined>(undefined);

export function MessageScrollerProvider({ children }: { children: React.ReactNode }) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [showScrollButton, setShowScrollButton] = useState(false);

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
    }),
    [isAtBottom, scrollToBottom, showScrollButton]
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

  // Disengage auto-scroll on any deliberate user interaction so they
  // aren't pulled back to the bottom while reading, selecting text, or
  // using keyboard navigation. Auto-scroll re-engages automatically
  // when the user scrolls back to the bottom (handleScroll in MessageScroller).
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
  const { isAtBottom, scrollToBottom } = useMessageScroller();

  useEffect(() => {
    if (isAtBottom) {
      scrollToBottom("auto");
    }
  }, [children, isAtBottom, scrollToBottom]);

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
