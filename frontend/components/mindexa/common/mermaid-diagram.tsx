"use client";

import React, { useEffect, useRef, useState, useId } from "react";
import { GitBranch, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";

interface MermaidDiagramProps {
  code: string;
}

/**
 * Real Mermaid diagram renderer.
 *
 * Uses mermaid.render() (async, browser-only) to convert the raw Mermaid
 * syntax string into an inline SVG, then injects it into the DOM.
 *
 * • Initialised once per component mount with a neutral theme that matches
 *   the app's dark/light mode via CSS variable overrides.
 * • Each diagram gets a unique ID (React useId + timestamp) so multiple
 *   diagrams on the same page never clash.
 * • A try/catch around mermaid.render() ensures a clean fallback message
 *   is shown if the AI produced malformed Mermaid syntax — the rest of the
 *   lesson section continues to render normally.
 * • Dynamic import keeps Mermaid out of the server bundle (it is browser-only).
 */
export function MermaidDiagram({ code }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const reactId = useId();
  // useId can contain colons which are invalid in Mermaid diagram IDs
  const diagramId = `mermaid-${reactId.replace(/:/g, "")}-${Date.now()}`;
  const [error, setError] = useState<string | null>(null);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      try {
        // Dynamic import — Mermaid uses browser APIs and must not run on the server.
        const mermaid = (await import("mermaid")).default;

        mermaid.initialize({
          startOnLoad: false,
          theme: "base",
          themeVariables: {
            // Map to CSS variables so the diagram respects dark/light mode
            primaryColor: "hsl(var(--primary) / 0.15)",
            primaryTextColor: "hsl(var(--foreground))",
            primaryBorderColor: "hsl(var(--border))",
            lineColor: "hsl(var(--muted-foreground))",
            secondaryColor: "hsl(var(--muted) / 0.5)",
            tertiaryColor: "hsl(var(--card))",
            background: "hsl(var(--background))",
            nodeBorder: "hsl(var(--border))",
            clusterBkg: "hsl(var(--muted) / 0.3)",
            titleColor: "hsl(var(--foreground))",
            edgeLabelBackground: "hsl(var(--card))",
            fontFamily: "inherit",
            fontSize: "13px",
          },
          securityLevel: "loose",
          flowchart: { htmlLabels: true, curve: "basis" },
        });

        const { svg } = await mermaid.render(diagramId, code.trim());

        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
          // Make the SVG responsive
          const svgEl = containerRef.current.querySelector("svg");
          if (svgEl) {
            svgEl.removeAttribute("width");
            svgEl.removeAttribute("height");
            svgEl.style.maxWidth = "100%";
            svgEl.style.height = "auto";
          }
          setRendered(true);
        }
      } catch (err) {
        if (!cancelled) {
          const msg =
            err instanceof Error ? err.message : "Diagram could not be rendered.";
          setError(msg);
        }
      }
    }

    render();
    return () => {
      cancelled = true;
    };
  }, [code, diagramId]);

  // ── Error fallback ────────────────────────────────────────────────────────
  if (error) {
    return (
      <Card className="my-3.5 border border-amber-500/30 bg-amber-500/5 p-4 rounded-xl">
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="size-4 text-amber-500 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
              Diagram could not be rendered
            </p>
            <p className="text-[11px] text-muted-foreground">
              The diagram definition produced by the AI contains a syntax error.
              The rest of the lesson content is unaffected.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  // ── Loading skeleton ──────────────────────────────────────────────────────
  return (
    <Card className="my-3.5 border border-border/60 bg-muted/20 p-4 rounded-xl space-y-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-foreground border-b border-border/40 pb-2">
        <GitBranch className="size-4 text-primary" />
        <span>Visual Diagram</span>
      </div>

      {/* Loading skeleton — shown until SVG is injected */}
      {!rendered && !error && (
        <div className="flex items-center justify-center py-6">
          <div className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="size-1.5 rounded-full bg-primary/40 animate-bounce"
                style={{ animationDelay: `${i * 120}ms` }}
              />
            ))}
          </div>
        </div>
      )}

      {/* The mermaid SVG is injected here by useEffect */}
      <div
        ref={containerRef}
        className="overflow-x-auto w-full flex items-center justify-center py-1 [&_svg]:max-w-full [&_svg]:h-auto"
      />
    </Card>
  );
}
