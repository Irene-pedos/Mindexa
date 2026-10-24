// frontend/components/mindexa/study-reader/pdf-canvas.tsx
"use client";

import React, {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
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
import { AlertTriangle, Flame, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ── Layout constants (px) ───────────────────────────────────────────────────
const PAD_TOP = 16;
/** Room under the last page so the floating page navigator never covers it. */
const PAD_BOTTOM = 96;
const ROW_GAP = 16;
const COL_GAP = 16;
const DEFAULT_RATIO = 1.414; // A4 until a page is measured
const TWO_UP_MIN_WIDTH = 768;
/** Fraction of the viewport height below its top edge that decides "the page being read". */
const READING_LINE = 0.35;
/** Mount pages this many viewport-heights above and below what is visible. */
const OVERSCAN_VIEWPORTS = 1;
const MEASURE_CHUNK = 24;
/** Widest a page grows in fit-width mode. */
const MAX_PAGE_WIDTH = 1100;

interface Row {
  index: number;
  pages: number[];
  top: number;
  height: number;
}

/** Index of the last row whose top is at or above `y`. */
function findRow(rows: Row[], y: number): number {
  let lo = 0;
  let hi = rows.length - 1;
  let found = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (rows[mid].top <= y) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

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

interface PdfPageViewProps {
  pageNumber: number;
  width: number;
  height: number;
  rotation: number;
  annotations: StudentAnnotation[];
  customTextRenderer?: (item: { str: string }) => string;
  isSpotlight: boolean;
  onUpdateAnnotation: PdfCanvasProps["onUpdateAnnotation"];
  onDeleteAnnotation: PdfCanvasProps["onDeleteAnnotation"];
  onRatio: (pageNumber: number, ratio: number) => void;
}

/** One page sheet. Memoised so scrolling only mounts/unmounts sheets and never re-renders the rest. */
const PdfPageView = memo(function PdfPageView({
  pageNumber,
  width,
  height,
  rotation,
  annotations,
  customTextRenderer,
  isSpotlight,
  onUpdateAnnotation,
  onDeleteAnnotation,
  onRatio,
}: PdfPageViewProps) {
  return (
    <div
      data-page-number={pageNumber}
      className={cn(
        "paper-sheet relative shrink-0 overflow-hidden rounded-md border border-border/50 bg-card shadow-xl",
        "ring-1 ring-black/5 dark:ring-white/5",
        isSpotlight && "ring-4 ring-rose-500/80 shadow-rose-500/20",
      )}
      style={{ width, height }}
    >
      <HighlightLayer
        pageNumber={pageNumber}
        annotations={annotations}
        pageWidth={width}
        pageHeight={height}
        onUpdateAnnotation={onUpdateAnnotation}
        onDeleteAnnotation={onDeleteAnnotation}
      />
      <Page
        pageNumber={pageNumber}
        width={width}
        rotate={rotation}
        renderTextLayer
        renderAnnotationLayer
        customTextRenderer={customTextRenderer}
        onLoadSuccess={(page: any) => {
          if (page?.width > 0 && page?.height > 0) {
            onRatio(pageNumber, page.height / page.width);
          }
        }}
        className="pdf-page-render max-w-full"
        loading={<Skeleton className="w-full rounded-md" style={{ height }} />}
      />
      <span className="pointer-events-none absolute bottom-1.5 right-2 rounded bg-background/70 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground backdrop-blur-sm">
        {pageNumber}
      </span>
    </div>
  );
});

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
  const scrollRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef(0);
  const suppressEmitRef = useRef(false);
  const suppressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The page this component last reported or scrolled to; tells outside navigation from our own scrolling. */
  const lastPageRef = useRef(currentPage);
  const initialScrollDoneRef = useRef(false);
  /** Where the viewport top sits (page + fraction of its row), used to keep the place across relayouts. */
  const anchorRef = useRef<{ page: number; frac: number }>({ page: currentPage, frac: 0 });

  const [size, setSize] = useState({ width: 0, height: 0 });
  const [scrollTop, setScrollTop] = useState(0);
  const [pdfDoc, setPdfDoc] = useState<any | null>(null);
  const [ratios, setRatios] = useState<Record<number, number>>({});
  const [layoutReady, setLayoutReady] = useState(false);

  const totalPages = pdfDoc?.numPages ?? numPages ?? 0;

  // ── Measure the viewport ─────────────────────────────────────────────────
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // ResizeObserver reports the initial size as soon as it starts observing.
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      const width = Math.round(rect.width);
      const height = Math.round(rect.height);
      setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    scrollRef.current?.focus({ preventScroll: true });
  }, []);

  // ── Measure every page's shape up front (no rendering) so heights are right before scrolling ──
  useEffect(() => {
    if (!pdfDoc) return;
    let cancelled = false;

    (async () => {
      const total: number = pdfDoc.numPages;
      for (let start = 1; start <= total; start += MEASURE_CHUNK) {
        const end = Math.min(total, start + MEASURE_CHUNK - 1);
        const chunk: Record<number, number> = {};
        await Promise.all(
          Array.from({ length: end - start + 1 }, (_, i) => start + i).map(async (n) => {
            try {
              const page = await pdfDoc.getPage(n);
              const viewport = page.getViewport({ scale: 1 });
              if (viewport.width > 0) chunk[n] = viewport.height / viewport.width;
              page.cleanup?.();
            } catch {
              // an unreadable page keeps the default shape
            }
          }),
        );
        if (cancelled) return;
        setRatios((prev) => ({ ...prev, ...chunk }));
        if (start === 1) setLayoutReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pdfDoc]);

  const handleLoadSuccess = useCallback(
    (pdf: any) => {
      setPdfDoc(pdf);
      onLoadSuccess(pdf);
    },
    [onLoadSuccess],
  );

  const handlePageRatio = useCallback((pageNumber: number, ratio: number) => {
    setRatios((prev) => (Math.abs((prev[pageNumber] ?? 0) - ratio) < 0.005 ? prev : { ...prev, [pageNumber]: ratio }));
  }, []);

  // ── Geometry ─────────────────────────────────────────────────────────────
  const columns = twoPageView && size.width >= TWO_UP_MIN_WIDTH ? 2 : 1;
  const sideways = rotation === 90 || rotation === 270;

  const ratioOf = useCallback(
    (page: number) => {
      const raw = ratios[page] ?? ratios[1] ?? DEFAULT_RATIO;
      return sideways ? 1 / raw : raw;
    },
    [ratios, sideways],
  );

  const pageWidth = useMemo(() => {
    if (size.width === 0) return 0;
    const padX = size.width < 640 ? 16 : 48;
    const available = Math.max(240, size.width - padX);
    // Past this width a line of text is too long to read comfortably, even on a very wide screen.
    const fitWidth = Math.min(MAX_PAGE_WIDTH, (available - (columns - 1) * COL_GAP) / columns);
    if (zoomMode === "fit-width") return Math.round(fitWidth);
    if (zoomMode === "fit-page") {
      const availableHeight = Math.max(280, size.height - PAD_TOP * 2);
      return Math.round(Math.min(fitWidth, availableHeight / ratioOf(1)));
    }
    return Math.round(fitWidth * (zoom / 100));
  }, [size.width, size.height, columns, zoomMode, zoom, ratioOf]);

  const { rows, totalHeight, rowWidth } = useMemo(() => {
    const built: Row[] = [];
    let top = PAD_TOP;
    for (let first = 1; first <= totalPages; first += columns) {
      const pages = Array.from({ length: Math.min(columns, totalPages - first + 1) }, (_, i) => first + i);
      const height = Math.max(...pages.map((p) => Math.round(pageWidth * ratioOf(p))));
      built.push({ index: built.length, pages, top, height });
      top += height + ROW_GAP;
    }
    return {
      rows: built,
      totalHeight: top - ROW_GAP + PAD_BOTTOM,
      rowWidth: columns * pageWidth + (columns - 1) * COL_GAP,
    };
  }, [totalPages, columns, pageWidth, ratioOf]);

  const rowOfPage = useCallback(
    (page: number) => Math.min(rows.length - 1, Math.max(0, Math.floor((page - 1) / columns))),
    [rows.length, columns],
  );

  // ── Scrolling helpers ────────────────────────────────────────────────────
  const setScrollSilently = useCallback((top: number) => {
    const el = scrollRef.current;
    if (!el) return;
    suppressEmitRef.current = true;
    if (suppressTimerRef.current) clearTimeout(suppressTimerRef.current);
    el.scrollTop = Math.max(0, top);
    suppressTimerRef.current = setTimeout(() => {
      suppressEmitRef.current = false;
    }, 140);
  }, []);

  const scrollToPage = useCallback(
    (page: number) => {
      if (rows.length === 0) return;
      const row = rows[rowOfPage(page)];
      anchorRef.current = { page: row.pages[0], frac: 0 };
      setScrollSilently(row.top - PAD_TOP / 2);
    },
    [rows, rowOfPage, setScrollSilently],
  );

  // Keep the reader's place when the layout changes under them (zoom, resize, rotation, late measurements).
  useLayoutEffect(() => {
    if (!layoutReady || rows.length === 0 || pageWidth === 0) return;

    if (!initialScrollDoneRef.current) {
      initialScrollDoneRef.current = true;
      lastPageRef.current = currentPage;
      scrollToPage(currentPage);
      return;
    }

    const { page, frac } = anchorRef.current;
    const row = rows[rowOfPage(page)];
    setScrollSilently(row.top + frac * row.height);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a layout change should re-anchor
  }, [rows, layoutReady]);

  // Navigation that came from outside (outline, search, heat strip, typed page, keyboard).
  useEffect(() => {
    if (!layoutReady || !initialScrollDoneRef.current) return;
    if (currentPage === lastPageRef.current) return;
    lastPageRef.current = currentPage;
    scrollToPage(currentPage);
  }, [currentPage, layoutReady, scrollToPage]);

  // The page being read follows the scroll position.
  const handleScroll = useCallback(() => {
    if (frameRef.current) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0;
      const el = scrollRef.current;
      if (!el || rows.length === 0) return;

      setScrollTop(el.scrollTop);
      if (selectedRange) onTextSelection(null);

      const topRow = rows[findRow(rows, el.scrollTop)];
      anchorRef.current = {
        page: topRow.pages[0],
        frac: Math.min(1, Math.max(0, (el.scrollTop - topRow.top) / Math.max(1, topRow.height))),
      };

      if (suppressEmitRef.current) return;

      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 4;
      const readingRow = atBottom
        ? rows[rows.length - 1]
        : rows[findRow(rows, el.scrollTop + el.clientHeight * READING_LINE)];
      const page = readingRow.pages[0];
      if (page !== lastPageRef.current) {
        lastPageRef.current = page;
        onPageChange(page);
      }
    });
  }, [rows, selectedRange, onTextSelection, onPageChange]);

  useEffect(
    () => () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      if (suppressTimerRef.current) clearTimeout(suppressTimerRef.current);
    },
    [],
  );

  // ── Which rows are mounted ───────────────────────────────────────────────
  const { firstVisible, lastVisible } = useMemo(() => {
    if (rows.length === 0) return { firstVisible: 0, lastVisible: -1 };
    const overscan = size.height * OVERSCAN_VIEWPORTS;
    return {
      firstVisible: findRow(rows, Math.max(0, scrollTop - overscan)),
      lastVisible: findRow(rows, scrollTop + size.height + overscan),
    };
  }, [rows, scrollTop, size.height]);

  // ── Search highlighting inside mounted pages ─────────────────────────────
  const customTextRenderer = useMemo(() => {
    const trimmed = searchQuery?.trim();
    if (!trimmed) return undefined;
    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(${escaped})`, "gi");
    return ({ str }: { str: string }) =>
      str.replace(
        regex,
        `<mark class="bg-amber-300 dark:bg-amber-400 text-slate-950 font-bold rounded-xs px-0.5 ring-2 ring-amber-500/80 shadow-xs">$&</mark>`,
      );
  }, [searchQuery]);

  // ── Text selection → normalised rects on the page it started in ──────────
  const handleMouseUp = useCallback(() => {
    const selection = window.getSelection();
    const clear = () => {
      if (selectedRange) onTextSelection(null);
    };
    if (!selection || selection.isCollapsed || !selection.rangeCount) return clear();

    const toElement = (node: Node | null) =>
      node instanceof Element ? node : (node?.parentElement ?? null);
    const fullRange = selection.getRangeAt(0);
    // The range's start is the top of the selection whichever way the user dragged.
    const pageEl =
      toElement(fullRange.startContainer)?.closest<HTMLElement>("[data-page-number]") ??
      toElement(fullRange.endContainer)?.closest<HTMLElement>("[data-page-number]");
    if (!pageEl) return clear();

    const pageNumber = Number(pageEl.dataset.pageNumber);
    const pageRect = pageEl.getBoundingClientRect();
    if (!pageNumber || pageRect.width === 0 || pageRect.height === 0) return clear();

    // A drag that runs on into the next page is trimmed to the page it started on, so the saved
    // highlight, key point or AI question never carries text from a different page.
    const range = fullRange.cloneRange();
    const textLayer = pageEl.querySelector(".react-pdf__Page__textContent");
    if (textLayer) {
      const bounds = document.createRange();
      bounds.selectNodeContents(textLayer);
      if (range.compareBoundaryPoints(Range.END_TO_END, bounds) > 0) {
        range.setEnd(bounds.endContainer, bounds.endOffset);
      }
    }

    const text = range.toString().trim();
    if (!text) return clear();

    const normalized: NormalizedRect[] = Array.from(range.getClientRects())
      // a selection that runs on into the next page must not leak its lines into this one
      .filter((r) => {
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        return cx >= pageRect.left && cx <= pageRect.right && cy >= pageRect.top && cy <= pageRect.bottom;
      })
      .map((r) => ({
        x: Math.max(0, Math.min(1, (r.left - pageRect.left) / pageRect.width)),
        y: Math.max(0, Math.min(1, (r.top - pageRect.top) / pageRect.height)),
        w: Math.max(0, Math.min(1, r.width / pageRect.width)),
        h: Math.max(0, Math.min(1, r.height / pageRect.height)),
        page: pageNumber,
      }))
      .filter((r) => r.w > 0.005 && r.h > 0.005);
    if (normalized.length === 0) return clear();

    const bounds = range.getBoundingClientRect();
    onTextSelection({
      text,
      pageNumber,
      rects: normalized,
      boundingRect: { top: bounds.top, left: bounds.left, width: bounds.width, height: bounds.height },
    });
  }, [selectedRange, onTextSelection]);

  // Dismiss the selection toolbar on outside click or resize.
  useEffect(() => {
    const dismiss = () => {
      if (selectedRange) onTextSelection(null);
    };
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (
        target.closest(".selection-toolbar") ||
        target.closest(".react-pdf__Page__textContent") ||
        target.closest(".textLayer") ||
        target.closest(".react-pdf__Page")
      ) {
        return;
      }
      dismiss();
    };
    window.addEventListener("resize", dismiss, { passive: true });
    window.addEventListener("orientationchange", dismiss, { passive: true });
    document.addEventListener("mousedown", onMouseDown);
    return () => {
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("orientationchange", dismiss);
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [selectedRange, onTextSelection]);

  const spotlightInView =
    !!focusSpotlight &&
    lastVisible >= firstVisible &&
    focusSpotlight.page >= rows[firstVisible].pages[0] &&
    focusSpotlight.page <= rows[lastVisible].pages[rows[lastVisible].pages.length - 1];

  const innerWidth = Math.max(rowWidth + (size.width < 640 ? 16 : 48), size.width);

  return (
    <div className="relative h-full w-full">
      {spotlightInView && focusSpotlight && (
        <div className="absolute top-4 left-1/2 z-30 flex max-w-lg -translate-x-1/2 items-center gap-2.5 rounded-xl border border-rose-400 bg-rose-600/95 px-4 py-2 text-white shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-200">
          <Flame className="size-4 shrink-0 animate-bounce text-amber-200" />
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-xs font-bold leading-tight">Focus Priority: {focusSpotlight.title}</span>
            {focusSpotlight.reason && (
              <span className="line-clamp-1 text-[11px] leading-tight text-rose-100/90">{focusSpotlight.reason}</span>
            )}
            {focusSpotlight.quote && (
              <span className="line-clamp-1 font-serif text-[10px] italic text-amber-100">
                &ldquo;{focusSpotlight.quote}&rdquo;
              </span>
            )}
          </div>
          {onDismissFocusSpotlight && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Dismiss focus hint"
              className="ml-1 size-5 shrink-0 rounded text-white/80 hover:bg-rose-500 hover:text-white"
              onClick={onDismissFocusSpotlight}
            >
              <X className="size-3" />
            </Button>
          )}
        </div>
      )}

      {selectedRange && (
        <SelectionToolbar
          key={`${selectedRange.pageNumber}-${selectedRange.text}-${selectedRange.boundingRect.left}-${selectedRange.boundingRect.top}`}
          selection={selectedRange}
          onHighlight={(color, noteText) => onHighlight(color, noteText)}
          onAddKeyPoint={(title, quote, pageNum) => onAddKeyPoint(title, quote, pageNum)}
          onAskAi={(text, pageNum) => onAskAi(text, pageNum)}
          onClose={() => onTextSelection(null)}
        />
      )}

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        onMouseUp={handleMouseUp}
        tabIndex={0}
        role="document"
        aria-label="Document pages"
        className="h-full w-full select-text overflow-auto bg-muted/30 outline-none"
      >
        <Document
          file={fileUrl}
          onLoadSuccess={handleLoadSuccess}
          onLoadError={onLoadError}
          loading={
            <div className="flex min-h-[500px] w-full flex-col items-center justify-center gap-4">
              <Skeleton className="h-[750px] w-[min(650px,90%)] rounded-xl border border-border/40 shadow-lg" />
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-4 animate-spin text-primary" />
                <span>Opening document…</span>
              </div>
            </div>
          }
          error={
            <div className="mx-auto my-16 flex min-h-[400px] max-w-md flex-col items-center justify-center rounded-2xl border border-destructive/20 bg-card p-8 text-center shadow-sm">
              <AlertTriangle className="mb-3 size-10 text-destructive" />
              <h3 className="mb-1 text-sm font-semibold text-foreground">Failed to display PDF</h3>
              <p className="mb-4 text-xs text-muted-foreground">
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
          className="block"
        >
          {layoutReady && pageWidth > 0 ? (
            <div className="relative" style={{ height: totalHeight, width: innerWidth }}>
              {rows.slice(firstVisible, lastVisible + 1).map((row) => (
                <div
                  key={row.index}
                  className="absolute left-0 right-0 flex justify-center"
                  style={{ top: row.top, height: row.height, gap: COL_GAP }}
                >
                  {row.pages.map((pageNumber) => (
                    <PdfPageView
                      key={pageNumber}
                      pageNumber={pageNumber}
                      width={pageWidth}
                      height={Math.round(pageWidth * ratioOf(pageNumber))}
                      rotation={rotation}
                      annotations={annotations}
                      customTextRenderer={customTextRenderer}
                      isSpotlight={focusSpotlight?.page === pageNumber}
                      onUpdateAnnotation={onUpdateAnnotation}
                      onDeleteAnnotation={onDeleteAnnotation}
                      onRatio={handlePageRatio}
                    />
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex min-h-[400px] w-full items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-4 animate-spin text-primary" />
              <span>Preparing pages…</span>
            </div>
          )}
        </Document>
      </div>
    </div>
  );
}
