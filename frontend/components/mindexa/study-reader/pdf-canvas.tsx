// frontend/components/mindexa/study-reader/pdf-canvas.tsx
"use client";

import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import { Document, Page } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import {
  AnnotationColor,
  NormalizedRect,
  SelectionRangeInfo,
  StudentAnnotation,
  ZoomMode,
} from "./types";
import { HighlightLayer } from "./highlight-layer";
import { SelectionToolbar } from "./selection-toolbar";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Loader2, Flame, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PdfCanvasProps {
  fileUrl: string;
  currentPage: number;
  numPages: number;
  zoom: number;
  zoomMode: ZoomMode;
  rotation: number;
  twoPageView: boolean;
  annotations: StudentAnnotation[];
  selectedRange: SelectionRangeInfo | null;
  searchQuery?: string;
  focusSpotlight?: {
    page: number;
    title: string;
    reason?: string;
    quote?: string;
  } | null;
  onDismissFocusSpotlight?: () => void;
  onTextSelection: (selection: SelectionRangeInfo | null) => void;
  onHighlight: (color: AnnotationColor, noteText?: string) => void;
  onAddKeyPoint: (title: string, quote: string, pageNumber: number) => void;
  onAskAi: (selectedText: string, pageNumber: number) => void;
  onUpdateAnnotation: (
    id: string,
    updates: { color?: AnnotationColor; note_text?: string },
  ) => void;
  onDeleteAnnotation: (id: string) => void;
  onLoadSuccess: (pdf: any) => void;
  onLoadError: (error: Error) => void;
  onPageChange: (page: number) => void;
  onRetry?: () => void;
}

export function PdfCanvas({
  fileUrl,
  currentPage,
  numPages,
  zoom,
  zoomMode,
  rotation,
  twoPageView,
  annotations,
  selectedRange,
  searchQuery,
  focusSpotlight,
  onDismissFocusSpotlight,
  onTextSelection,
  onHighlight,
  onAddKeyPoint,
  onAskAi,
  onUpdateAnnotation,
  onDeleteAnnotation,
  onLoadSuccess,
  onLoadError,
  onPageChange,
  onRetry,
}: PdfCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const page1WrapperRef = useRef<HTMLDivElement>(null);
  const page2WrapperRef = useRef<HTMLDivElement>(null);
  const lastWheelTimeRef = useRef<number>(0);

  const [containerWidth, setContainerWidth] = useState<number>(800);
  const [containerHeight, setContainerHeight] = useState<number>(900);

  // Track page rendered aspect ratios per page number (default standard A4 1.414)
  const [aspectRatioMap, setAspectRatioMap] = useState<Record<number, number>>(
    {},
  );

  // Safe clamped current page against numPages
  const safeCurrentPage = Math.max(1, Math.min(currentPage, numPages || 1));
  const secondPage =
    twoPageView && numPages > 1 && safeCurrentPage < numPages
      ? safeCurrentPage + 1
      : null;

  // Custom text renderer for instant in-page search term highlighting
  const customTextRenderer = useMemo(() => {
    if (!searchQuery || !searchQuery.trim()) return undefined;
    const trimmed = searchQuery.trim();
    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(${escaped})`, "gi");

    return ({ str }: { str: string }) => {
      if (!regex.test(str)) return str;
      return str.replace(
        regex,
        `<mark class="bg-amber-300 dark:bg-amber-400 text-slate-950 font-bold rounded-xs px-0.5 ring-2 ring-amber-500/80 shadow-xs">$&</mark>`,
      );
    };
  }, [searchQuery]);

  // Measure container dimensions for fit-width and fit-page
  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setContainerWidth(entry.contentRect.width);
        setContainerHeight(entry.contentRect.height);
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Compute calculated scale / width for rendering with true discrete page clamping
  const {
    computedPage1Width,
    computedPage1Height,
    computedPage2Width,
    computedPage2Height,
  } = useMemo(() => {
    const isRotatedSideways = rotation === 90 || rotation === 270;
    const rawRatio1 = aspectRatioMap[safeCurrentPage] || 1.414;
    const ratio1 = isRotatedSideways ? 1 / rawRatio1 : rawRatio1;

    const rawRatio2 = (secondPage && aspectRatioMap[secondPage]) || rawRatio1;
    const ratio2 = isRotatedSideways ? 1 / rawRatio2 : rawRatio2;

    const horizontalPadding = containerWidth < 640 ? 16 : 40;
    const verticalPadding = containerHeight < 600 ? 16 : 36;

    const maxAvailableWidth = Math.max(280, containerWidth - horizontalPadding);
    const maxAvailableHeight = Math.max(280, containerHeight - verticalPadding);

    // Two-page spread
    if (twoPageView && numPages > 1 && secondPage) {
      const halfWidth = (maxAvailableWidth - 20) / 2;
      if (zoomMode === "fit-page") {
        const w1 = Math.min(halfWidth, maxAvailableHeight / ratio1);
        const w2 = Math.min(halfWidth, maxAvailableHeight / ratio2);
        return {
          computedPage1Width: Math.round(w1),
          computedPage1Height: Math.round(w1 * ratio1),
          computedPage2Width: Math.round(w2),
          computedPage2Height: Math.round(w2 * ratio2),
        };
      }
      if (zoomMode === "fit-width") {
        return {
          computedPage1Width: Math.round(halfWidth),
          computedPage1Height: Math.round(halfWidth * ratio1),
          computedPage2Width: Math.round(halfWidth),
          computedPage2Height: Math.round(halfWidth * ratio2),
        };
      }
      const baseW1 = Math.min(halfWidth, maxAvailableHeight / ratio1);
      const baseW2 = Math.min(halfWidth, maxAvailableHeight / ratio2);
      const w1 = baseW1 * (zoom / 100);
      const w2 = baseW2 * (zoom / 100);
      return {
        computedPage1Width: Math.round(w1),
        computedPage1Height: Math.round(w1 * ratio1),
        computedPage2Width: Math.round(w2),
        computedPage2Height: Math.round(w2 * ratio2),
      };
    }

    // Single page mode: Fit-Page strictly fits viewport without causing vertical scrollbar
    if (zoomMode === "fit-page") {
      const w = Math.min(maxAvailableWidth, maxAvailableHeight / ratio1);
      return {
        computedPage1Width: Math.round(w),
        computedPage1Height: Math.round(w * ratio1),
        computedPage2Width: Math.round(w),
        computedPage2Height: Math.round(w * ratio1),
      };
    }

    if (zoomMode === "fit-width") {
      const w = maxAvailableWidth;
      return {
        computedPage1Width: Math.round(w),
        computedPage1Height: Math.round(w * ratio1),
        computedPage2Width: Math.round(w),
        computedPage2Height: Math.round(w * ratio1),
      };
    }

    // Custom zoom: Scale relative to the ideal fit-page baseline
    const baselineFitPageWidth = Math.min(
      maxAvailableWidth,
      maxAvailableHeight / ratio1,
    );
    const w = baselineFitPageWidth * (zoom / 100);
    return {
      computedPage1Width: Math.round(w),
      computedPage1Height: Math.round(w * ratio1),
      computedPage2Width: Math.round(w),
      computedPage2Height: Math.round(w * ratio1),
    };
  }, [
    containerWidth,
    containerHeight,
    zoomMode,
    zoom,
    rotation,
    twoPageView,
    numPages,
    aspectRatioMap,
    safeCurrentPage,
    secondPage,
  ]);

  // Handle PDF Page load success to calibrate aspect ratio per page
  const handlePage1LoadSuccess = useCallback(
    (pageData: any) => {
      const { width, height } = pageData;
      if (width > 0 && height > 0) {
        const ratio = height / width;
        setAspectRatioMap((prev) => {
          if (prev[safeCurrentPage] === ratio) return prev;
          return { ...prev, [safeCurrentPage]: ratio };
        });
      }
    },
    [safeCurrentPage],
  );

  const handlePage2LoadSuccess = useCallback(
    (pageData: any) => {
      const { width, height } = pageData;
      if (width > 0 && height > 0 && secondPage) {
        const ratio = height / width;
        setAspectRatioMap((prev) => {
          if (prev[secondPage] === ratio) return prev;
          return { ...prev, [secondPage]: ratio };
        });
      }
    },
    [secondPage],
  );

  // Discrete Page navigation on mouse wheel when page is fully visible
  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      const el = containerRef.current;
      if (!el) return;

      const isScrollable = el.scrollHeight > el.clientHeight + 10;
      if (isScrollable) return;

      const now = Date.now();
      if (now - lastWheelTimeRef.current < 400) return;

      if (e.deltaY > 50) {
        // Scrolling down -> Next page
        if (twoPageView) {
          if (safeCurrentPage + 1 < numPages) {
            onPageChange(Math.min(numPages, safeCurrentPage + 2));
            lastWheelTimeRef.current = now;
          }
        } else {
          if (safeCurrentPage < numPages) {
            onPageChange(Math.min(numPages, safeCurrentPage + 1));
            lastWheelTimeRef.current = now;
          }
        }
      } else if (e.deltaY < -50) {
        // Scrolling up -> Prev page
        if (safeCurrentPage > 1) {
          if (twoPageView) {
            onPageChange(Math.max(1, safeCurrentPage - 2));
            lastWheelTimeRef.current = now;
          } else {
            onPageChange(Math.max(1, safeCurrentPage - 1));
            lastWheelTimeRef.current = now;
          }
        }
      }
    },
    [twoPageView, safeCurrentPage, numPages, onPageChange],
  );

  // Text selection handler: extracts text and normalizes coordinates to 0..1
  const handleMouseUp = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) {
      if (selectedRange) {
        onTextSelection(null);
      }
      return;
    }

    const selectedText = selection.toString().trim();
    if (!selectedText || selectedText.length === 0) {
      if (selectedRange) {
        onTextSelection(null);
      }
      return;
    }

    const range = selection.getRangeAt(0);
    const clientRects = Array.from(range.getClientRects());
    if (clientRects.length === 0) {
      if (selectedRange) {
        onTextSelection(null);
      }
      return;
    }

    // Determine which page the selection is on
    let targetPageNum = safeCurrentPage;
    let pageWrapper = page1WrapperRef.current;

    const commonAncestor = range.commonAncestorContainer;
    const commonElement =
      commonAncestor.nodeType === Node.ELEMENT_NODE
        ? (commonAncestor as Element)
        : commonAncestor.parentElement;

    if (
      page2WrapperRef.current &&
      secondPage &&
      commonElement &&
      page2WrapperRef.current.contains(commonElement)
    ) {
      targetPageNum = secondPage;
      pageWrapper = page2WrapperRef.current;
    }

    if (!pageWrapper) return;

    const pageRect = pageWrapper.getBoundingClientRect();
    if (pageRect.width === 0 || pageRect.height === 0) return;

    // Calculate viewport-normalized coordinates for each rect
    const normalizedRects: NormalizedRect[] = clientRects
      .map((r) => {
        const x = (r.left - pageRect.left) / pageRect.width;
        const y = (r.top - pageRect.top) / pageRect.height;
        const w = r.width / pageRect.width;
        const h = r.height / pageRect.height;

        return {
          x: Math.max(0, Math.min(1, x)),
          y: Math.max(0, Math.min(1, y)),
          w: Math.max(0, Math.min(1, w)),
          h: Math.max(0, Math.min(1, h)),
          page: targetPageNum,
        };
      })
      .filter((r) => r.w > 0.005 && r.h > 0.005);

    if (normalizedRects.length === 0) {
      if (selectedRange) onTextSelection(null);
      return;
    }

    // Trigger parent callback with normalized selection info
    const boundingRect = range.getBoundingClientRect();
    onTextSelection({
      text: selectedText,
      pageNumber: targetPageNum,
      rects: normalizedRects,
      boundingRect: {
        top: boundingRect.top,
        left: boundingRect.left,
        width: boundingRect.width,
        height: boundingRect.height,
      },
    });
  }, [safeCurrentPage, secondPage, selectedRange, onTextSelection]);

  // Auto-dismiss active text selection on outside click, window resize, or orientation change
  useEffect(() => {
    const handleResizeOrRotate = () => {
      if (selectedRange) {
        onTextSelection(null);
      }
    };

    const handleDocumentMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      // If clicking inside selection toolbar or any part of the text selection layer, don't dismiss
      if (
        target.closest(".selection-toolbar") ||
        target.closest(".react-pdf__Page__textContent") ||
        target.closest(".textLayer") ||
        target.closest(".react-pdf__Page")
      ) {
        return;
      }
      if (selectedRange) {
        onTextSelection(null);
      }
    };

    window.addEventListener("resize", handleResizeOrRotate, { passive: true });
    window.addEventListener("orientationchange", handleResizeOrRotate, {
      passive: true,
    });
    document.addEventListener("mousedown", handleDocumentMouseDown);

    return () => {
      window.removeEventListener("resize", handleResizeOrRotate);
      window.removeEventListener("orientationchange", handleResizeOrRotate);
      document.removeEventListener("mousedown", handleDocumentMouseDown);
    };
  }, [selectedRange, onTextSelection]);

  const isSpotlightOnCurrentSpread = Boolean(
    focusSpotlight &&
      (focusSpotlight.page === safeCurrentPage ||
        (secondPage && focusSpotlight.page === secondPage)),
  );

  return (
    <div
      ref={containerRef}
      onMouseUp={handleMouseUp}
      onWheel={handleWheel}
      onScroll={() => {
        if (selectedRange) {
          onTextSelection(null);
        }
      }}
      className="relative w-full h-full overflow-auto flex items-center justify-center p-2 sm:p-4 bg-muted/30 select-text"
      tabIndex={0}
    >
      {/* Floating Focus Spotlight Banner */}
      {isSpotlightOnCurrentSpread && focusSpotlight && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2.5 px-4 py-2 rounded-xl bg-rose-600/95 text-white shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-200 border border-rose-400 max-w-lg">
          <Flame className="size-4 text-amber-200 shrink-0 animate-bounce" />
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-bold leading-tight truncate">
              Focus Priority: {focusSpotlight.title}
            </span>
            {focusSpotlight.reason && (
              <span className="text-[11px] text-rose-100/90 leading-tight line-clamp-1">
                {focusSpotlight.reason}
              </span>
            )}
            {focusSpotlight.quote && (
              <span className="text-[10px] text-amber-100 font-serif italic line-clamp-1">
                &ldquo;{focusSpotlight.quote}&rdquo;
              </span>
            )}
          </div>
          {onDismissFocusSpotlight && (
            <Button
              variant="ghost"
              size="icon"
              className="size-5 rounded text-white/80 hover:text-white hover:bg-rose-500 shrink-0 ml-1"
              onClick={onDismissFocusSpotlight}
            >
              <X className="size-3" />
            </Button>
          )}
        </div>
      )}

      {/* Floating Selection Toolbar when text is selected */}
      {selectedRange && (
        <SelectionToolbar
          key={`${selectedRange.pageNumber}-${selectedRange.text}-${selectedRange.boundingRect.left}-${selectedRange.boundingRect.top}`}
          selection={selectedRange}
          onHighlight={(color, noteText) => onHighlight(color, noteText)}
          onAddKeyPoint={(title, quote, pageNum) =>
            onAddKeyPoint(title, quote, pageNum)
          }
          onAskAi={(text, pageNum) => onAskAi(text, pageNum)}
          onClose={() => onTextSelection(null)}
        />
      )}

      <Document
        file={fileUrl}
        onLoadSuccess={onLoadSuccess}
        onLoadError={onLoadError}
        loading={
          <div className="flex flex-col items-center justify-center min-h-[500px] w-full gap-4">
            <Skeleton className="w-[min(650px,90%)] h-[750px] rounded-xl shadow-lg border border-border/40" />
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-4 animate-spin text-primary" />
              <span>Rendering PDF pages…</span>
            </div>
          </div>
        }
        error={
          <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center bg-card rounded-2xl border border-destructive/20 shadow-sm max-w-md my-auto">
            <AlertTriangle className="size-10 text-destructive mb-3" />
            <h3 className="text-sm font-semibold text-foreground mb-1">
              Failed to display PDF
            </h3>
            <p className="text-xs text-muted-foreground mb-4">
              The PDF could not be rendered. It may be corrupt or encrypted.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={onRetry ? onRetry : () => window.location.reload()}
              className="text-xs"
            >
              Retry
            </Button>
          </div>
        }
        className="flex items-center justify-center gap-6 m-auto py-2"
      >
        {/* Page 1 (Current Page) */}
        <div
          ref={page1WrapperRef}
          className={cn(
            "paper-sheet relative rounded-md shadow-2xl border border-border/50 bg-card overflow-hidden transition-all duration-150 shrink-0",
            "ring-1 ring-black/5 dark:ring-white/5",
            isSpotlightOnCurrentSpread &&
              focusSpotlight?.page === safeCurrentPage &&
              "ring-4 ring-rose-500/80 shadow-rose-500/20",
          )}
          style={{ width: computedPage1Width, height: computedPage1Height }}
        >
          {/* Highlight Layer for Page 1 */}
          <HighlightLayer
            pageNumber={safeCurrentPage}
            annotations={annotations}
            pageWidth={computedPage1Width}
            pageHeight={computedPage1Height}
            onUpdateAnnotation={onUpdateAnnotation}
            onDeleteAnnotation={onDeleteAnnotation}
          />

          <Page
            pageNumber={safeCurrentPage}
            width={computedPage1Width}
            rotate={rotation}
            renderTextLayer={true}
            renderAnnotationLayer={true}
            customTextRenderer={customTextRenderer}
            onLoadSuccess={handlePage1LoadSuccess}
            className="pdf-page-render max-w-full"
            loading={
              <Skeleton
                className="w-full rounded-md"
                style={{ height: computedPage1Height }}
              />
            }
          />
        </div>

        {/* Page 2 (Two-page spread on wide screens) */}
        {secondPage && (
          <div
            ref={page2WrapperRef}
            className={cn(
              "paper-sheet relative rounded-md shadow-2xl border border-border/50 bg-card overflow-hidden transition-all duration-150 shrink-0 hidden md:block",
              "ring-1 ring-black/5 dark:ring-white/5",
              isSpotlightOnCurrentSpread &&
                focusSpotlight?.page === secondPage &&
                "ring-4 ring-rose-500/80 shadow-rose-500/20",
            )}
            style={{ width: computedPage2Width, height: computedPage2Height }}
          >
            {/* Highlight Layer for Page 2 */}
            <HighlightLayer
              pageNumber={secondPage}
              annotations={annotations}
              pageWidth={computedPage2Width}
              pageHeight={computedPage2Height}
              onUpdateAnnotation={onUpdateAnnotation}
              onDeleteAnnotation={onDeleteAnnotation}
            />

            <Page
              pageNumber={secondPage}
              width={computedPage2Width}
              rotate={rotation}
              renderTextLayer={true}
              renderAnnotationLayer={true}
              customTextRenderer={customTextRenderer}
              onLoadSuccess={handlePage2LoadSuccess}
              className="pdf-page-render max-w-full"
              loading={
                <Skeleton
                  className="w-full rounded-md"
                  style={{ height: computedPage2Height }}
                />
              }
            />
          </div>
        )}
      </Document>
    </div>
  );
}
