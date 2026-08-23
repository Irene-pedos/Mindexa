// frontend/components/mindexa/study-reader/hooks/use-pdf-document.ts
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { pdfjs } from "react-pdf";
import { ReaderSource, PdfOutlineItem, SearchMatch } from "../types";
import { studentApi } from "@/lib/api/student";

// Configure PDF.js worker
if (typeof window !== "undefined" && !pdfjs.GlobalWorkerOptions.workerSrc) {
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
}

interface UsePdfDocumentReturn {
  fileUrl: string | null;
  loading: boolean;
  error: string | null;
  numPages: number;
  pdfDoc: any | null;
  outline: PdfOutlineItem[];
  searchMatches: SearchMatch[];
  currentMatchIndex: number;
  isSearching: boolean;
  searchQuery: string;
  setPdfDoc: (doc: any) => void;
  onDocumentLoadSuccess: (pdf: any) => Promise<void>;
  onDocumentLoadError: (err: Error) => void;
  search: (query: string) => Promise<void>;
  clearSearch: () => void;
  nextMatch: () => number | null; // returns target pageNumber
  prevMatch: () => number | null; // returns target pageNumber
  goToMatch: (index: number) => number | null; // returns target pageNumber
}

export function usePdfDocument(source: ReaderSource): UsePdfDocumentReturn {
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [pdfDoc, setPdfDoc] = useState<any | null>(null);
  const [outline, setOutline] = useState<PdfOutlineItem[]>([]);
  
  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMatches, setSearchMatches] = useState<SearchMatch[]>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1);
  const [isSearching, setIsSearching] = useState(false);

  const activeSearchRef = useRef<number>(0);

  // Fetch blob and generate object URL
  useEffect(() => {
    let active = true;
    let createdUrl: string | null = null;

    async function loadBlob() {
      try {
        setLoading(true);
        setError(null);

        // Check if file is PDF
        const isPdf =
          source.extension?.toLowerCase().includes("pdf") ||
          source.mimeType === "application/pdf";

        const isImage =
          source.mimeType?.startsWith("image/") ||
          ["png", "jpg", "jpeg", "webp", "svg", "gif"].includes(
            source.extension?.toLowerCase().replace(".", "")
          );

        if (!isPdf && !isImage) {
          setError("unsupported_type");
          setLoading(false);
          return;
        }

        const isPersonal = source.kind === "student_resource";
        const blob = await studentApi.getResourceBlob(source.id, isPersonal);

        if (!active) return;

        createdUrl = window.URL.createObjectURL(blob);
        setFileUrl(createdUrl);
      } catch (err: any) {
        if (!active) return;
        setError(err.message || "Failed to load document content");
      } finally {
        if (active) setLoading(false);
      }
    }

    loadBlob();

    return () => {
      active = false;
      if (createdUrl) {
        window.URL.revokeObjectURL(createdUrl);
      }
    };
  }, [source.id, source.kind, source.extension, source.mimeType]);

  // Recursively process PDF outline items and resolve target page numbers
  const processOutlineItems = useCallback(
    async (rawItems: any[], doc: any): Promise<PdfOutlineItem[]> => {
      const result: PdfOutlineItem[] = [];

      for (const item of rawItems) {
        let pageNumber: number | undefined;

        try {
          if (typeof item.dest === "string") {
            const destArray = await doc.getDestination(item.dest);
            if (destArray && destArray[0]) {
              const pageIndex = await doc.getPageIndex(destArray[0]);
              pageNumber = pageIndex + 1;
            }
          } else if (Array.isArray(item.dest) && item.dest[0]) {
            const pageIndex = await doc.getPageIndex(item.dest[0]);
            pageNumber = pageIndex + 1;
          }
        } catch {
          // If destination cannot be resolved, leave pageNumber undefined
        }

        const processed: PdfOutlineItem = {
          title: item.title || "Untitled Section",
          pageNumber,
          dest: item.dest,
        };

        if (item.items && item.items.length > 0) {
          processed.items = await processOutlineItems(item.items, doc);
        }

        result.push(processed);
      }

      return result;
    },
    []
  );

  const onDocumentLoadSuccess = useCallback(
    async (pdf: any) => {
      setPdfDoc(pdf);
      setNumPages(pdf.numPages);
      try {
        const rawOutline = await pdf.getOutline();
        if (rawOutline && rawOutline.length > 0) {
          const resolved = await processOutlineItems(rawOutline, pdf);
          setOutline(resolved);
        } else {
          setOutline([]);
        }
      } catch {
        setOutline([]);
      }
    },
    [processOutlineItems]
  );

  const onDocumentLoadError = useCallback((err: Error) => {
    setError(err.message || "Failed to parse PDF document");
  }, []);

  // Search across all pages in the PDF
  const search = useCallback(
    async (query: string) => {
      const trimmed = query.trim();
      setSearchQuery(trimmed);

      if (!trimmed || !pdfDoc) {
        setSearchMatches([]);
        setCurrentMatchIndex(-1);
        setIsSearching(false);
        return;
      }

      const searchId = ++activeSearchRef.current;
      setIsSearching(true);

      const matches: SearchMatch[] = [];
      const lowerQuery = trimmed.toLowerCase();

      try {
        for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
          if (activeSearchRef.current !== searchId) return; // Stale search

          const page = await pdfDoc.getPage(pageNum);
          const textContent = await page.getTextContent();
          
          const fullPageText = textContent.items
            .map((item: any) => item.str || "")
            .join(" ");

          const lowerPageText = fullPageText.toLowerCase();
          let pos = 0;
          let matchIndexOnPage = 0;

          while ((pos = lowerPageText.indexOf(lowerQuery, pos)) !== -1) {
            const snippetStart = Math.max(0, pos - 35);
            const snippetEnd = Math.min(fullPageText.length, pos + lowerQuery.length + 35);
            const snippet = fullPageText.substring(snippetStart, snippetEnd);

            matches.push({
              pageNumber: pageNum,
              matchIndex: matches.length,
              snippet: (snippetStart > 0 ? "…" : "") + snippet + (snippetEnd < fullPageText.length ? "…" : ""),
              text: fullPageText.substring(pos, pos + lowerQuery.length),
            });

            matchIndexOnPage++;
            pos += lowerQuery.length;
          }
        }

        if (activeSearchRef.current === searchId) {
          setSearchMatches(matches);
          setCurrentMatchIndex(matches.length > 0 ? 0 : -1);
        }
      } catch (err) {
        console.error("PDF search error:", err);
      } finally {
        if (activeSearchRef.current === searchId) {
          setIsSearching(false);
        }
      }
    },
    [pdfDoc]
  );

  const clearSearch = useCallback(() => {
    setSearchQuery("");
    setSearchMatches([]);
    setCurrentMatchIndex(-1);
    setIsSearching(false);
  }, []);

  const nextMatch = useCallback((): number | null => {
    if (searchMatches.length === 0) return null;
    const nextIdx = (currentMatchIndex + 1) % searchMatches.length;
    setCurrentMatchIndex(nextIdx);
    return searchMatches[nextIdx].pageNumber;
  }, [searchMatches, currentMatchIndex]);

  const prevMatch = useCallback((): number | null => {
    if (searchMatches.length === 0) return null;
    const prevIdx = (currentMatchIndex - 1 + searchMatches.length) % searchMatches.length;
    setCurrentMatchIndex(prevIdx);
    return searchMatches[prevIdx].pageNumber;
  }, [searchMatches, currentMatchIndex]);

  const goToMatch = useCallback(
    (index: number): number | null => {
      if (index < 0 || index >= searchMatches.length) return null;
      setCurrentMatchIndex(index);
      return searchMatches[index].pageNumber;
    },
    [searchMatches]
  );

  return {
    fileUrl,
    loading,
    error,
    numPages,
    pdfDoc,
    outline,
    searchMatches,
    currentMatchIndex,
    isSearching,
    searchQuery,
    setPdfDoc,
    onDocumentLoadSuccess,
    onDocumentLoadError,
    search,
    clearSearch,
    nextMatch,
    prevMatch,
    goToMatch,
  };
}
