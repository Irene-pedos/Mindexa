"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  AnnotationColor,
  FocusResponse,
  KeyPointConfidence,
  KeyPointTag,
  ReaderSidebarTab,
  ReaderSource,
  ZoomMode,
} from "./types";
import { useReaderProgress } from "./hooks/use-reader-progress";
import { usePdfDocument } from "./hooks/use-pdf-document";
import { useAnnotations } from "./hooks/use-annotations";
import { ReaderTopBar } from "./reader-top-bar";
import { PdfCanvas } from "./pdf-canvas";
import { ImageCanvas } from "./image-canvas";
import { StudyRail } from "./study-rail";
import { PageHeatStrip } from "./page-heat-strip";
import { studentApi } from "@/lib/api/student";
import { studyReaderApi } from "@/lib/api/study-reader";
import { Button } from "@/components/ui/button";
import {
  FileText,
  Download,
  AlertCircle,
  X,
  Eye,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface StudyReaderProps {
  source: ReaderSource;
  onBack: () => void;
}

export function StudyReader({ source, onBack }: StudyReaderProps) {
  const { progress, updateProgress, isLoaded: isProgressLoaded } = useReaderProgress(
    source.kind,
    source.id
  );

  const {
    fileUrl,
    loading: isPdfLoading,
    error: pdfError,
    numPages,
    outline,
    searchMatches,
    currentMatchIndex,
    isSearching,
    searchQuery,
    onDocumentLoadSuccess,
    onDocumentLoadError,
    search,
    clearSearch,
    nextMatch,
    prevMatch,
    goToMatch,
  } = usePdfDocument(source);

  const {
    annotations,
    keyPoints,
    selectedRange,
    setSelectedRange,
    clearSelection,
    addAnnotation,
    updateAnnotation,
    deleteAnnotation,
    addKeyPoint,
    updateKeyPoint,
    deleteKeyPoint,
    exportRevisionSheet,
  } = useAnnotations(source);

  // Focus mode & chrome visibility
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [isChromeVisible, setIsChromeVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Active right rail tab (null = closed)
  const [activeSidebarTab, setActiveSidebarTab] = useState<ReaderSidebarTab | null>(null);

  // Ask AI active highlighted excerpt
  const [selectedAiText, setSelectedAiText] = useState<string | null>(null);

  // Weakness focus data & heatmap
  const [focusData, setFocusData] = useState<FocusResponse | null>(null);

  const loadFocusData = useCallback(async () => {
    try {
      const data = await studyReaderApi.getFocus(source.kind, source.id);
      setFocusData(data);
    } catch {
      // Graceful fallback
    }
  }, [source.kind, source.id]);

  useEffect(() => {
    let mounted = true;
    studyReaderApi.getFocus(source.kind, source.id)
      .then((data) => {
        if (mounted) {
          setFocusData(data);
        }
      })
      .catch(() => {});

    return () => {
      mounted = false;
    };
  }, [source.kind, source.id]);

  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const serverProgressTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Determine file formats
  const isPdf =
    source.extension?.toLowerCase().includes("pdf") ||
    source.mimeType === "application/pdf";

  const isImage =
    source.mimeType?.startsWith("image/") ||
    ["png", "jpg", "jpeg", "webp", "svg", "gif"].includes(
      source.extension?.toLowerCase().replace(".", "")
    );

  // Synchronize numPages with progress once PDF loads
  const handlePdfLoaded = useCallback(
    async (pdf: any) => {
      await onDocumentLoadSuccess(pdf);
      updateProgress({ numPages: pdf.numPages });
    },
    [onDocumentLoadSuccess, updateProgress]
  );

  // Page navigation with debounced server progress sync
  const handlePageChange = useCallback(
    (page: number) => {
      const validPage = Math.max(1, Math.min(page, numPages || 1));
      updateProgress({ page: validPage });

      // Debounce server progress save
      if (serverProgressTimerRef.current) {
        clearTimeout(serverProgressTimerRef.current);
      }
      serverProgressTimerRef.current = setTimeout(() => {
        studyReaderApi.saveProgress(source.kind, source.id, {
          last_page: validPage,
          last_scale: progress.zoom,
          page_count_seen: validPage,
        }).catch(() => {});
      }, 1200);
    },
    [numPages, updateProgress, source.kind, source.id, progress.zoom]
  );

  // Zoom handlers
  const handleZoomChange = useCallback(
    (zoom: number, mode?: ZoomMode) => {
      updateProgress({
        zoom,
        zoomMode: mode || "custom",
      });
    },
    [updateProgress]
  );

  // Rotate handler
  const handleRotate = useCallback(() => {
    const nextRotation = ((progress.rotation + 90) % 360) as 0 | 90 | 180 | 270;
    updateProgress({ rotation: nextRotation });
  }, [progress.rotation, updateProgress]);

  // Two-page view toggle
  const handleToggleTwoPageView = useCallback(() => {
    updateProgress({ twoPageView: !progress.twoPageView });
  }, [progress.twoPageView, updateProgress]);

  // Toggle fullscreen
  const handleToggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }, []);

  // Listen for native fullscreen changes
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  // Toggle focus mode
  const handleToggleFocusMode = useCallback(() => {
    setIsFocusMode((prev) => {
      const next = !prev;
      if (!next) {
        setIsChromeVisible(true);
      }
      return next;
    });
  }, []);

  // Idle focus mode chrome auto-hide
  useEffect(() => {
    if (!isFocusMode) {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      return;
    }

    const resetTimer = () => {
      setIsChromeVisible(true);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => {
        setIsChromeVisible(false);
      }, 3500);
    };

    idleTimerRef.current = setTimeout(() => {
      setIsChromeVisible(false);
    }, 3500);

    const handleActivity = () => {
      resetTimer();
    };

    window.addEventListener("mousemove", handleActivity);
    window.addEventListener("keydown", handleActivity);
    window.addEventListener("touchstart", handleActivity);

    return () => {
      window.removeEventListener("mousemove", handleActivity);
      window.removeEventListener("keydown", handleActivity);
      window.removeEventListener("touchstart", handleActivity);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [isFocusMode]);

  // Search match navigation helpers
  const handleSelectSearchMatch = useCallback(
    (index: number) => {
      const targetPage = goToMatch(index);
      if (targetPage) {
        handlePageChange(targetPage);
      }
    },
    [goToMatch, handlePageChange]
  );

  const handleNextMatch = useCallback(() => {
    const targetPage = nextMatch();
    if (targetPage) {
      handlePageChange(targetPage);
    }
  }, [nextMatch, handlePageChange]);

  const handlePrevMatch = useCallback(() => {
    const targetPage = prevMatch();
    if (targetPage) {
      handlePageChange(targetPage);
    }
  }, [prevMatch, handlePageChange]);

  // Highlight action from SelectionToolbar
  const handleHighlight = useCallback(
    (color: AnnotationColor, noteText?: string) => {
      if (!selectedRange) return;
      addAnnotation({
        page_number: selectedRange.pageNumber,
        color,
        selected_text: selectedRange.text,
        rects: selectedRange.rects,
        note_text: noteText,
      });
      clearSelection();
    },
    [selectedRange, addAnnotation, clearSelection]
  );

  // Add Key Point action from SelectionToolbar
  const handleAddKeyPointFromSelection = useCallback(
    (title: string, quote: string, pageNum: number) => {
      addKeyPoint({
        title,
        quote,
        page_number: pageNum,
        tag: "other",
        confidence: "got_it",
      });
      clearSelection();
    },
    [addKeyPoint, clearSelection]
  );

  // Ask AI action from SelectionToolbar
  const handleAskAiFromSelection = useCallback(
    (text: string, _pageNum: number) => {
      setSelectedAiText(text);
      setActiveSidebarTab("ask");
      clearSelection();
    },
    [clearSelection]
  );

  // Download handler
  const handleDownload = useCallback(async () => {
    const filename = source.downloadFilename || source.title || "document";
    try {
      if (source.kind === "student_resource") {
        await studentApi.downloadPersonalResource(source.id, filename);
      } else {
        await studentApi.downloadMaterial(source.id, filename);
      }
      toast.success("Download started");
    } catch {
      toast.error("Failed to download file");
    }
  }, [source]);

  // Keyboard navigation shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (e.key === "ArrowLeft" || e.key === "PageUp" || e.key === "h") {
        e.preventDefault();
        handlePageChange(progress.page - 1);
      } else if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === "l") {
        e.preventDefault();
        handlePageChange(progress.page + 1);
      } else if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        handleZoomChange(Math.min(300, progress.zoom + 15), "custom");
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        handleZoomChange(Math.max(25, progress.zoom - 15), "custom");
      } else if (e.key === "0") {
        e.preventDefault();
        handleZoomChange(100, "fit-width");
      } else if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        handleRotate();
      } else if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        handleToggleFocusMode();
      } else if (e.key === "/" || (e.ctrlKey && e.key === "f") || (e.metaKey && e.key === "f")) {
        e.preventDefault();
        setActiveSidebarTab("search");
      } else if (e.key === "w" || e.key === "W") {
        e.preventDefault();
        setActiveSidebarTab("focus");
      } else if (e.key === "q" || e.key === "Q") {
        e.preventDefault();
        setActiveSidebarTab("check");
      } else if (e.key === "k" || e.key === "K") {
        e.preventDefault();
        setActiveSidebarTab("keypoints");
      } else if (e.key === "a" || e.key === "A") {
        e.preventDefault();
        setActiveSidebarTab("ask");
      } else if (e.key === "Escape") {
        if (selectedRange) {
          clearSelection();
        } else if (isFocusMode) {
          setIsFocusMode(false);
        } else if (activeSidebarTab !== null) {
          setActiveSidebarTab(null);
        } else {
          onBack();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    progress.page,
    progress.zoom,
    isFocusMode,
    activeSidebarTab,
    selectedRange,
    handlePageChange,
    handleZoomChange,
    handleRotate,
    handleToggleFocusMode,
    clearSelection,
    onBack,
  ]);

  // Loading state
  if (!isProgressLoaded || isPdfLoading) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-center p-6 gap-4 animate-in fade-in duration-200">
        <Loader2 className="size-8 animate-spin text-primary" />
        <div className="space-y-1 text-center">
          <p className="text-sm font-semibold text-foreground">Preparing Revision Workspace…</p>
          <p className="text-xs text-muted-foreground">{source.title}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onBack} className="mt-2 text-xs">
          Cancel
        </Button>
      </div>
    );
  }

  // Unsupported file type state
  if (pdfError === "unsupported_type" || (!isPdf && !isImage)) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col">
        <header className="h-14 border-b px-4 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={onBack} className="gap-2 text-xs">
            <X className="size-4" /> Exit
          </Button>
          <span className="text-xs font-semibold text-foreground truncate max-w-sm">
            {source.title}
          </span>
          <Button size="sm" onClick={handleDownload} className="text-xs gap-1.5">
            <Download className="size-3.5" /> Download
          </Button>
        </header>
        <div className="flex-1 flex items-center justify-center p-6 bg-muted/20">
          <div className="max-w-md w-full bg-card p-8 rounded-2xl border border-border/60 shadow-lg text-center space-y-4">
            <FileText className="size-14 mx-auto text-muted-foreground/30" />
            <div className="space-y-1.5">
              <h2 className="text-base font-semibold text-foreground">Preview Not Available</h2>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Files with extension <code className="font-mono text-primary font-bold">.{source.extension?.replace(".", "")}</code> cannot be rendered in the study reader. You can download the file directly to your device.
              </p>
            </div>
            <Button onClick={handleDownload} className="w-full text-xs font-semibold gap-2">
              <Download className="size-4" /> Download File
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col select-none overflow-hidden">
      {/* Top Navigation Bar */}
      <div
        className={cn(
          "transition-all duration-300 transform",
          isFocusMode && !isChromeVisible ? "-translate-y-full opacity-0 pointer-events-none" : "translate-y-0 opacity-100"
        )}
      >
        <ReaderTopBar
          source={source}
          currentPage={progress.page}
          numPages={numPages || progress.numPages}
          zoom={progress.zoom}
          zoomMode={progress.zoomMode}
          rotation={progress.rotation}
          twoPageView={progress.twoPageView}
          isFocusMode={isFocusMode}
          isFullscreen={isFullscreen}
          activeSidebarTab={activeSidebarTab}
          hasMatches={searchMatches.length > 0}
          onPageChange={handlePageChange}
          onZoomChange={handleZoomChange}
          onRotate={handleRotate}
          onToggleTwoPageView={handleToggleTwoPageView}
          onToggleFocusMode={handleToggleFocusMode}
          onToggleFullscreen={handleToggleFullscreen}
          onToggleSidebarTab={(tab) =>
            setActiveSidebarTab((prev) => (prev === tab ? null : tab))
          }
          onDownload={handleDownload}
          onBack={onBack}
        />
      </div>

      {/* Floating Exit Focus Button when Chrome is Hidden */}
      {isFocusMode && !isChromeVisible && (
        <div className="fixed top-3 right-4 z-50 animate-in fade-in duration-200">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setIsFocusMode(false);
              setIsChromeVisible(true);
            }}
            className="h-8 px-3 text-xs font-medium rounded-full shadow-lg border border-border/60 gap-1.5 backdrop-blur-md bg-card/85 hover:bg-card text-foreground"
          >
            <Eye className="size-3.5 text-primary" />
            <span>Exit Focus (F)</span>
          </Button>
        </div>
      )}

      {/* Workspace Body */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Main Canvas Area */}
        <main className="flex-1 h-full overflow-hidden relative flex flex-col">
          {fileUrl ? (
            isPdf ? (
              <PdfCanvas
                fileUrl={fileUrl}
                currentPage={progress.page}
                numPages={numPages || progress.numPages}
                zoom={progress.zoom}
                zoomMode={progress.zoomMode}
                rotation={progress.rotation}
                twoPageView={progress.twoPageView}
                annotations={annotations}
                selectedRange={selectedRange}
                onTextSelection={setSelectedRange}
                onHighlight={handleHighlight}
                onAddKeyPoint={handleAddKeyPointFromSelection}
                onAskAi={handleAskAiFromSelection}
                onUpdateAnnotation={updateAnnotation}
                onDeleteAnnotation={deleteAnnotation}
                onLoadSuccess={handlePdfLoaded}
                onLoadError={onDocumentLoadError}
                onPageChange={handlePageChange}
              />
            ) : isImage ? (
              <ImageCanvas url={fileUrl} title={source.title} />
            ) : null
          ) : (
            <div className="flex items-center justify-center h-full p-8 text-center">
              <AlertCircle className="size-8 text-muted-foreground mb-2" />
              <p className="text-xs text-muted-foreground">Unable to stream file source.</p>
            </div>
          )}

          {/* Minimap Page Heat Strip for PDFs */}
          {isPdf && (
            <PageHeatStrip
              numPages={numPages || progress.numPages}
              currentPage={progress.page}
              heatmap={focusData?.heatmap || []}
              onSelectPage={handlePageChange}
            />
          )}
        </main>

        {/* Study Rail (6 Tabs: Focus, Quiz, Key Points, Ask AI, Outline, Search) */}
        {activeSidebarTab !== null && (
          <StudyRail
            source={source}
            activeTab={activeSidebarTab}
            onTabChange={setActiveSidebarTab}
            onClose={() => setActiveSidebarTab(null)}
            outline={outline}
            numPages={numPages || progress.numPages}
            currentPage={progress.page}
            onSelectPage={handlePageChange}
            searchQuery={searchQuery}
            searchMatches={searchMatches}
            currentMatchIndex={currentMatchIndex}
            isSearching={isSearching}
            onSearch={search}
            onClearSearch={clearSearch}
            onNextMatch={handleNextMatch}
            onPrevMatch={handlePrevMatch}
            onSelectMatch={handleSelectSearchMatch}
            keyPoints={keyPoints}
            onAddKeyPoint={(p: {
              title: string;
              quote?: string;
              page_number: number;
              tag?: KeyPointTag;
              confidence?: KeyPointConfidence;
            }) => addKeyPoint(p)}
            onUpdateKeyPoint={updateKeyPoint}
            onDeleteKeyPoint={deleteKeyPoint}
            onExportRevisionSheet={exportRevisionSheet}
            selectedAiText={selectedAiText}
            onClearSelectedAiText={() => setSelectedAiText(null)}
            onPageCheckCompleted={loadFocusData}
          />
        )}
      </div>
    </div>
  );
}
