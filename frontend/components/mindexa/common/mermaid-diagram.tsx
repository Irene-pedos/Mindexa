"use client";

import React, { useEffect, useRef, useState, useId } from "react";
import { GitBranch, ArrowRight, ArrowDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface MermaidDiagramProps {
  code: string;
}

/**
 * Robust Mermaid syntax sanitizer & auto-repairer.
 * Handles common LLM errors:
 * - Markdown fences (```mermaid ... ```)
 * - Missing diagram headers (defaults to flowchart TD)
 * - Unquoted parentheses/brackets/colons/slashes inside node labels (e.g. A[Step (Details)] -> A["Step (Details)"])
 * - Malformed arrows (-- >, == >, -. ->)
 */
function sanitizeAndRepairMermaid(raw: string): string {
  if (!raw) return "";
  let code = raw.trim();

  // 1. Strip markdown fences and language specifier
  code = code.replace(/^```(?:mermaid)?/i, "").replace(/```$/i, "").trim();

  // 2. Normalize arrows
  code = code
    .replace(/--\s+>/g, "-->")
    .replace(/==\s+>/g, "==>")
    .replace(/-\.\s+->/g, "-.->");

  // 3. Ensure a valid diagram header is present on line 1
  const validHeaders = [
    "flowchart",
    "graph",
    "sequencediagram",
    "classdiagram",
    "statediagram",
    "erdiagram",
    "pie",
    "gantt",
    "gitgraph",
    "journey",
    "mindmap",
  ];
  const firstLine = code.split("\n")[0].trim().toLowerCase();
  const hasValidHeader = validHeaders.some((h) => firstLine.startsWith(h));

  if (!hasValidHeader) {
    code = `flowchart TD\n${code}`;
  }

  // 4. Auto-quote node labels with special characters like parentheses, colons, or slashes
  // Matches node patterns like ID[Text without quotes] -> ID["Text without quotes"]
  const lines = code.split("\n");
  const processedLines = lines.map((line, idx) => {
    if (idx === 0 && hasValidHeader) return line;

    // Quote square bracket labels: A[Text] -> A["Text"]
    let fixed = line.replace(/([a-zA-Z0-9_-]+)\[([^"\]\n]+)\]/g, (match, id, label) => {
      const trimmed = label.trim();
      return `${id}["${trimmed}"]`;
    });

    // Quote round bracket labels: A(Text) -> A("Text")
    fixed = fixed.replace(/([a-zA-Z0-9_-]+)\(([^"\)\n]+)\)/g, (match, id, label) => {
      const trimmed = label.trim();
      return `${id}("${trimmed}")`;
    });

    // Quote curly bracket decision labels: A{Text} -> A{"Text"}
    fixed = fixed.replace(/([a-zA-Z0-9_-]+)\{([^"\}\n]+)\}/g, (match, id, label) => {
      const trimmed = label.trim();
      return `${id}{"${trimmed}"}`;
    });

    return fixed;
  });

  return processedLines.join("\n");
}

type Rgb = [number, number, number];

/**
 * Resolve a CSS custom property (e.g. "--primary") to a concrete RGB colour.
 *
 * Mermaid's theme parser understands only concrete colours: handing it "hsl(var(--muted) / 0.5)"
 * throws "Unsupported color format", which made every diagram fall back to the plain flow view.
 * The browser itself can resolve any CSS colour (hsl, oklch, ...), so a 1x1 canvas converts it.
 */
function cssVarToRgb(varName: string, fallback: Rgb): Rgb {
  try {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    if (!raw) return fallback;
    const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    if (!ctx) return fallback;
    ctx.fillStyle = "#010203"; // an invalid colour leaves this unchanged, which tells us it failed
    ctx.fillStyle = raw;
    if (ctx.fillStyle === "#010203") return fallback;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return [r, g, b];
  } catch {
    return fallback;
  }
}

/** `amount` of `a` mixed into `b`, as "#rrggbb" (Mermaid needs opaque colours, not "x / 0.5"). */
function mixHex(a: Rgb, b: Rgb, amount: number): string {
  const channel = (i: 0 | 1 | 2) =>
    Math.round(a[i] * amount + b[i] * (1 - amount))
      .toString(16)
      .padStart(2, "0");
  return `#${channel(0)}${channel(1)}${channel(2)}`;
}

/** Mermaid theme built from the app's current (light or dark) colours. */
function buildMermaidThemeVariables(): Record<string, string> {
  const foreground = cssVarToRgb("--foreground", [23, 23, 23]);
  const background = cssVarToRgb("--background", [255, 255, 255]);
  const card = cssVarToRgb("--card", background);
  const primary = cssVarToRgb("--primary", [37, 99, 235]);
  const border = cssVarToRgb("--border", [228, 228, 231]);
  const muted = cssVarToRgb("--muted", [244, 244, 245]);
  const mutedForeground = cssVarToRgb("--muted-foreground", [113, 113, 122]);

  return {
    primaryColor: mixHex(primary, background, 0.15),
    primaryTextColor: mixHex(foreground, foreground, 1),
    primaryBorderColor: mixHex(primary, background, 0.5),
    lineColor: mixHex(mutedForeground, mutedForeground, 1),
    secondaryColor: mixHex(muted, background, 0.5),
    tertiaryColor: mixHex(card, card, 1),
    background: mixHex(background, background, 1),
    nodeBorder: mixHex(border, border, 1),
    clusterBkg: mixHex(muted, background, 0.3),
    titleColor: mixHex(foreground, foreground, 1),
    edgeLabelBackground: mixHex(card, card, 1),
    // A fixed stack, not "inherit": Mermaid sizes each box from its own text measurement, so a
    // font that differs from the one the page draws (e.g. inside a monospace container) clips labels.
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    fontSize: "13px",
  };
}

/**
 * Parses raw text/mermaid into structured node flow items for visual fallback.
 *
 * Node ids (B, C, ...) mean nothing to a student, so ids are replaced by the label given where
 * the node is defined (`B["Check if stack is full"]`), wherever it appears.
 */
function extractFlowNodes(raw: string): Array<{ from: string; to: string; label?: string }> {
  const steps: Array<{ from: string; to: string; label?: string }> = [];
  const lines = raw.split("\n");

  // id -> label, from definitions like A["Start"], B(Text), C{"Decision?"}
  const labels = new Map<string, string>();
  for (const match of raw.matchAll(/([A-Za-z0-9_-]+)\s*(?:\[\[?|\(\(?|\{)\s*"?([^"\]\)\}\n]+?)"?\s*(?:\]\]?|\)\)?|\})/g)) {
    if (!labels.has(match[1])) labels.set(match[1], match[2].trim());
  }
  const nameOf = (id: string) => labels.get(id) ?? id;

  const edge =
    /([A-Za-z0-9_-]+)\s*(?:(?:\[\[?|\(\(?|\{)[^\n]*?(?:\]\]?|\)\)?|\}))?\s*(?:-->|==>|-\.->|->)\s*(?:\|([^|\n]+)\|)?\s*([A-Za-z0-9_-]+)/;
  for (const line of lines) {
    const arrowMatch = line.match(edge);
    if (arrowMatch) {
      steps.push({
        from: nameOf(arrowMatch[1]).trim(),
        to: nameOf(arrowMatch[3]).trim(),
        label: arrowMatch[2]?.trim(),
      });
    }
  }

  // If no arrows matched, split by lines or numbered items
  if (steps.length === 0) {
    const cleanLines = lines
      .map((l) => l.replace(/^[0-9]+[.)\s]+/, "").replace(/^[a-zA-Z0-9_-]+\["?(.*?)"?\]/, "$1").trim())
      .filter((l) => l && !l.startsWith("flowchart") && !l.startsWith("graph") && !l.startsWith("```"));

    for (let i = 0; i < cleanLines.length - 1; i++) {
      steps.push({ from: cleanLines[i], to: cleanLines[i + 1] });
    }
  }

  return steps;
}

export function MermaidDiagram({ code }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const reactId = useId();
  const baseId = `mermaid-${reactId.replace(/[^A-Za-z0-9_-]/g, "")}`;
  // Mermaid needs a fresh element id for every render() call, but a new id on every React render
  // (the old Date.now()) re-triggered the effect forever, so count renders instead.
  const renderCountRef = useRef(0);
  const [error, setError] = useState<boolean>(false);
  const [rendered, setRendered] = useState(false);

  const sanitizedCode = React.useMemo(() => sanitizeAndRepairMermaid(code), [code]);
  const fallbackSteps = React.useMemo(() => extractFlowNodes(code), [code]);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      if (!sanitizedCode) return;
      try {
        const mermaid = (await import("mermaid")).default;

        mermaid.initialize({
          startOnLoad: false,
          theme: "base",
          themeVariables: buildMermaidThemeVariables(),
          // Diagram text is model output derived from lecturer uploads and student input, and the SVG
          // is injected as HTML below. "strict" sanitises labels and disables click/javascript: links.
          securityLevel: "strict",
          flowchart: { htmlLabels: true, curve: "basis" },
        });

        renderCountRef.current += 1;
        const { svg } = await mermaid.render(`${baseId}-${renderCountRef.current}`, sanitizedCode);

        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
          const svgEl = containerRef.current.querySelector("svg");
          if (svgEl) {
            svgEl.removeAttribute("width");
            svgEl.removeAttribute("height");
            // Full width for wide diagrams, but a small one should not be blown up to fill the card.
            svgEl.style.maxWidth = "min(100%, 640px)";
            svgEl.style.height = "auto";
          }
          setRendered(true);
          setError(false);
        }
      } catch (err) {
        if (!cancelled) {
          console.warn("Mermaid rendering failed; falling back to visual flow cards:", err);
          setError(true);
        }
      }
    }

    render();
    return () => {
      cancelled = true;
    };
  }, [sanitizedCode, baseId]);

  // ── Fallback Visual Flow View ──────────────────────────────────────────────
  // Only after a real failure. While the diagram is still rendering the real container below
  // must stay mounted: returning the fallback here (as before) removed the element Mermaid writes
  // its SVG into, so a diagram that rendered fine could never be shown.
  if (error) {
    // Unique list of connected stages
    const stages: string[] = [];
    fallbackSteps.forEach((s) => {
      if (!stages.includes(s.from)) stages.push(s.from);
      if (!stages.includes(s.to)) stages.push(s.to);
    });

    return (
      <Card className="my-3.5 border border-border/70 bg-card/60 backdrop-blur-xs p-4 rounded-xl space-y-3.5 shadow-2xs">
        <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
            <GitBranch className="size-3.5 text-primary" />
            <span>Process Workflow Diagram</span>
          </div>
          <Badge variant="outline" className="text-[10px] font-normal py-0 px-2 text-muted-foreground border-border/60">
            Flow View
          </Badge>
        </div>

        {stages.length > 0 ? (
          <div className="flex flex-col sm:flex-row flex-wrap items-center justify-center gap-2 py-2">
            {stages.map((stage, idx) => (
              <React.Fragment key={idx}>
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-background border border-border/80 shadow-2xs text-xs font-medium text-foreground max-w-xs text-center">
                  <span className="size-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center shrink-0">
                    {idx + 1}
                  </span>
                  <span className="truncate">{stage}</span>
                </div>
                {idx < stages.length - 1 && (
                  <div className="text-muted-foreground/60 shrink-0">
                    <ArrowRight className="hidden sm:block size-4" />
                    <ArrowDown className="sm:hidden size-4 my-0.5" />
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        ) : (
          <div className="p-3 bg-muted/20 rounded-lg text-xs font-mono whitespace-pre-wrap text-muted-foreground">
            {code}
          </div>
        )}
      </Card>
    );
  }

  // ── Standard Render with Skeleton ──────────────────────────────────────────
  return (
    <Card className="my-3.5 border border-border/60 bg-muted/20 p-4 rounded-xl space-y-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-foreground border-b border-border/40 pb-2">
        <GitBranch className="size-3.5 text-primary" />
        <span>Visual Diagram</span>
      </div>

      {!rendered && (
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

      <div
        ref={containerRef}
        className="overflow-x-auto w-full flex items-center justify-center py-1 [&_svg]:max-w-full [&_svg]:h-auto"
      />
    </Card>
  );
}
