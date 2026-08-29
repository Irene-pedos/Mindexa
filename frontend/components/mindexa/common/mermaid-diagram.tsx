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

/**
 * Parses raw text/mermaid into structured node flow items for visual fallback.
 */
function extractFlowNodes(raw: string): Array<{ from: string; to: string; label?: string }> {
  const steps: Array<{ from: string; to: string; label?: string }> = [];
  const lines = raw.split("\n");

  for (const line of lines) {
    const arrowMatch = line.match(/(?:\["?(.*?)"?\]|([a-zA-Z0-9_-]+))\s*(?:-->|==>|->)\s*(?:\|([^|]+)\|)?\s*(?:\["?(.*?)"?\]|([a-zA-Z0-9_-]+))/);
    if (arrowMatch) {
      const from = arrowMatch[1] || arrowMatch[2] || "Step";
      const edgeLabel = arrowMatch[3]?.trim();
      const to = arrowMatch[4] || arrowMatch[5] || "Next";
      if (from && to) {
        steps.push({ from: from.trim(), to: to.trim(), label: edgeLabel });
      }
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
  const diagramId = `mermaid-${reactId.replace(/:/g, "")}-${Date.now()}`;
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
          themeVariables: {
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
            fontSize: "12px",
          },
          securityLevel: "loose",
          flowchart: { htmlLabels: true, curve: "basis" },
        });

        const { svg } = await mermaid.render(diagramId, sanitizedCode);

        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
          const svgEl = containerRef.current.querySelector("svg");
          if (svgEl) {
            svgEl.removeAttribute("width");
            svgEl.removeAttribute("height");
            svgEl.style.maxWidth = "100%";
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
  }, [sanitizedCode, diagramId]);

  // ── Fallback Visual Flow View ──────────────────────────────────────────────
  if (error || (!rendered && fallbackSteps.length > 0)) {
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
