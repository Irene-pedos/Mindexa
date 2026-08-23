// frontend/components/mindexa/study-reader/pdf-canvas.tsx
"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
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
import { AlertTriangle, Loader2 } from "lucide-react";
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
  onTextSelection: (selection: SelectionRangeInfo | null) => void;
  onHighlight: (color: AnnotationColor, noteText?: string) => void;
  onAddKeyPoint: (title: string, quote: string, pageNumber: number) => void;
  onAskAi: (selectedText: string, pageNumber: number) => void;
  onUpdateAnnotation: (id: string, updates: { color?: AnnotationColor; note_text?: string }) => void;
  onDeleteAnnotation: (id: string) => void;
  onLoadSuccess: (pdf: any) => void;
  onLoadError: (error: Error) => void;
  onPageChange: (page: number) => void;
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
  onTextSelection,
  onHighlight,
  onAddKeyPoint,
  onAskAi,
  onUpdateAnnotation,
  onDeleteAnnotation,
  onLoadSuccess,
  onLoadError,
  onPageChange,
}: PdfCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const page1WrapperRef = useRef<HTMLDivElement>(null);
  const page2WrapperRef = useRef<HTMLDivElement>(null);

  const [containerWidth, setContainerWidth] = useState<number>(800);
  const [containerHeight, setContainerHeight] = useState<number>(900);

  // Track page rendered aspect ratio (default standard A4 1.414)
  const [pageAspectRatio, setPageAspectRatio] = useState<number>(1.414);

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

  // Compute calculated scale / width for rendering
  const computedPageWidth = useMemo(() => {
    const isRotatedSideways = rotation === 90 || rotation === 270;
    const padding = containerWidth < 640 ? 24 : 64;
    const availableWidth = Math.max(320, containerWidth - padding);

    if (twoPageView && numPages > 1) {
      const halfWidth = (availableWidth - 24) / 2;
      if (zoomMode === "fit-width") return halfWidth;
      if (zoomMode === "fit-page") return Math.min(halfWidth, (containerHeight - 80) * 0.7);
      return halfWidth * (zoom / 100);
    }

    if (zoomMode === "fit-width") {
      return availableWidth;
    }

    if (zoomMode === "fit-page") {
      const targetHeight = Math.max(400, containerHeight - 64);
      const ratio = isRotatedSideways ? 1 / pageAspectRatio : pageAspectRatio;
      const estimatedWidth = targetHeight / ratio;
      return Math.min(availableWidth, estimatedWidth);
    }

    const baseWidth = Math.min(availableWidth, 760);
    return baseWidth * (zoom / 100);
  }, [containerWidth, containerHeight, zoomMode, zoom, rotation, twoPageView, numPages, pageAspectRatio]);

  const computedPageHeight = useMemo(() => {
    const isRotatedSideways = rotation === 90 || rotation === 270;
    const ratio = isRotatedSideways ? 1 / pageAspectRatio : pageAspectRatio;
    return computedPageWidth * ratio;
  }, [computedPageWidth, pageAspectRatio, rotation]);

  const secondPage = twoPageView && currentPage < numPages ? currentPage + 1 : null;

  // Handle PDF Page load success to calibrate aspect ratio
  const handlePageLoadSuccess = useCallback((pageData: any) => {
    const { width, height } = pageData;
    if (width > 0 && height > 0) {
      setPageAspectRatio(height / width);
    }
  }, []);

  // Text selection handler: extracts text and normalizes coordinates to 0..1
  const handleMouseUp = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) {
      return;
    }

    const selectedText = selection.toString().trim();
    if (!selectedText || selectedText.length === 0) {
      return;
    }

    const range = selection.getRangeAt(0);
    const clientRects = Array.from(range.getClientRects());
    if (clientRects.length === 0) return;

    // Determine which page the selection is on
    let targetPageNum = currentPage;
    let pageWrapper = page1WrapperRef.current;

    const commonAncestor = range.commonAncestorContainer;
    const commonElement = commonAncestor.nodeType === Node.ELEMENT_NODE
      ? (commonAncestor as Element)
      : commonAncestor.parentElement;

    if (page2WrapperRef.current && secondPage && commonElement && page2WrapperRef.current.contains(commonElement)) {
      targetPageNum = secondPage;
      pageWrapper = page2WrapperRef.current;
    }

    if (!pageWrapper) return;

    const pageRect = pageWrapper.getBoundingClientRect();
    if (pageRect.width === 0 || pageRect.height === 0) return;

    // Calculate viewport-normalized coordinates for each rect
    const normalizedRects: NormalizedRect[] = clientRects.map((r) => ({
      x: Math.max(0, Math.min(1, (r.left - pageRect.left) / pageRect.width)),
      y: Math.max(0, Math.min(1, (r.top - pageRect.top) / pageRect.height)),
      w: Math.max(0.01, Math.min(1, r.width / pageRect.width)),
      h: Math.max(0.01, Math.min(1, r.height / pageRect.height)),
      page: targetPageNum,
    }));

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
  }, [currentPage, secondPage, onTextSelection]);

  return (
    <div
      ref={containerRef}
      onMouseUp={handleMouseUp}
      className="relative w-full h-full overflow-auto flex flex-col items-center justify-start p-4 sm:p-8 bg-muted/30 select-text"
      tabIndex={0}
    >
      {/* Floating Selection Toolbar when text is selected */}
      {selectedRange && (
        <SelectionToolbar
          selection={selectedRange}
          onHighlight={(color, noteText) => onHighlight(color, noteText)}
          onAddKeyPoint={(title, quote, pageNum) => onAddKeyPoint(title, quote, pageNum)}
          onAskAi={(text, pageNum) => onAskAi(text, pageNum)}
          onClose={() => onTextSelection(null)}
        />
      )}

      <Document
        file={fileUrl}
        onLoadSuccess={onLoadSuccess}
        onLoadError={onLoadError}
        loading={
          <div className="flex flex-col items-center justify-center min-h-[600px] w-full gap-4">
            <Skeleton className="w-[min(650px,90%)] h-[800px] rounded-xl shadow-lg border border-border/40" />
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-4 animate-spin text-primary" />
              <span>Rendering PDF pages…</span>
            </div>
          </div>
        }
        error={
          <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center bg-card rounded-2xl border border-destructive/20 shadow-sm max-w-md my-auto">
            <AlertTriangle className="size-10 text-destructive mb-3" />
            <h3 className="text-sm font-semibold text-foreground mb-1">Failed to display PDF</h3>
            <p className="text-xs text-muted-foreground mb-4">
              The PDF could not be rendered. It may be corrupt or encrypted.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.location.reload()}
              className="text-xs"
            >
              Retry
            </Button>
          </div>
        }
        className="flex items-start justify-center gap-6 my-auto py-4"
      >
        {/* Page 1 (Current Page) */}
        <div
          ref={page1WrapperRef}
          className={cn(
            "paper-sheet relative rounded-md shadow-2xl border border-border/50 bg-card overflow-hidden transition-all duration-150",
            "ring-1 ring-black/5 dark:ring-white/5"
          )}
          style={{ width: computedPageWidth, height: computedPageHeight }}
        >
          {/* Highlight Layer for Page 1 */}
          <HighlightLayer
            pageNumber={currentPage}
            annotations={annotations}
            pageWidth={computedPageWidth}
            pageHeight={computedPageHeight}
            onUpdateAnnotation={onUpdateAnnotation}
            onDeleteAnnotation={onDeleteAnnotation}
          />

          <Page
            pageNumber={currentPage}
            width={computedPageWidth}
            rotate={rotation}
            renderTextLayer={true}
            renderAnnotationLayer={true}
            onLoadSuccess={handlePageLoadSuccess}
            className="pdf-page-render max-w-full"
            loading={
              <Skeleton
                className="w-full rounded-md"
                style={{ height: computedPageHeight }}
              />
            }
          />
        </div>

        {/* Page 2 (Two-page spread on wide screens) */}
        {secondPage && (
          <div
            ref={page2WrapperRef}
            className={cn(
              "paper-sheet relative rounded-md shadow-2xl border border-border/50 bg-card overflow-hidden transition-all duration-150 hidden md:block",
              "ring-1 ring-black/5 dark:ring-white/5"
            )}
            style={{ width: computedPageWidth, height: computedPageHeight }}
          >
            {/* Highlight Layer for Page 2 */}
            <HighlightLayer
              pageNumber={secondPage}
              annotations={annotations}
              pageWidth={computedPageWidth}
              pageHeight={computedPageHeight}
              onUpdateAnnotation={onUpdateAnnotation}
              onDeleteAnnotation={onDeleteAnnotation}
            />

            <Page
              pageNumber={secondPage}
              width={computedPageWidth}
              rotate={rotation}
              renderTextLayer={true}
              renderAnnotationLayer={true}
              className="pdf-page-render max-w-full"
              loading={
                <Skeleton
                  className="w-full rounded-md"
                  style={{ height: computedPageHeight }}
                />
              }
            />
          </div>
        )}
      </Document>
    </div>
  );
}
