"use client";

import React, { useState, useMemo } from "react";
import { MermaidDiagram } from "@/components/mindexa/common/mermaid-diagram";
import {
  Copy,
  Check,
  Code,
  Table as TableIcon,
  Sparkles,
  BarChart2,
  FileText,
  CheckSquare,
  Globe,
  Search,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from "recharts";

interface RichMessageRendererProps {
  content: string;
  citations?: Array<{
    resource_name: string;
    resource_id?: string;
    page_number?: number | null;
    excerpt?: string;
  }>;
  className?: string;
}

/** Formatted inline text component for bold **text** and `code` */
function FormattedText({ text }: { text: string }) {
  if (!text) return null;

  // Split by bold (**...**) and inline code (`...`)
  const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g);

  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
          return (
            <strong key={i} className="font-semibold text-foreground">
              {part.slice(2, -2)}
            </strong>
          );
        }
        if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
          return (
            <code
              key={i}
              className="px-1.5 py-0.5 rounded bg-muted/80 font-mono text-[11px] text-primary"
            >
              {part.slice(1, -1)}
            </code>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

/** Real Markdown Table Renderer */
function MarkdownTableRenderer({ content }: { content: string }) {
  const { headers, rows } = useMemo(() => {
    const lines = content
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("|"));

    if (lines.length === 0) return { headers: [], rows: [] };

    const parseLine = (line: string) =>
      line
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim());

    const rawHeaders = parseLine(lines[0]);
    // Skip separator line (e.g. | --- | --- |)
    const startIndex = lines.length > 1 && lines[1].includes("---") ? 2 : 1;
    const rawRows = lines.slice(startIndex).map(parseLine);

    return { headers: rawHeaders, rows: rawRows };
  }, [content]);

  if (headers.length === 0) return null;

  return (
    <div className="my-3.5 overflow-x-auto rounded-xl border border-border/80 bg-card shadow-2xs">
      <table className="w-full text-left text-xs border-collapse font-sans">
        <thead className="bg-muted/60 text-muted-foreground font-semibold border-b border-border/70">
          <tr>
            {headers.map((h, i) => (
              <th
                key={i}
                className="px-3.5 py-2.5 font-semibold text-foreground border-r border-border/30 last:border-r-0"
              >
                <FormattedText text={h} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/40">
          {rows.map((row, rIdx) => (
            <tr key={rIdx} className="hover:bg-muted/30 transition-colors">
              {row.map((cell, cIdx) => (
                <td
                  key={cIdx}
                  className="px-3.5 py-2.5 text-foreground/90 border-r border-border/20 last:border-r-0 leading-relaxed"
                >
                  <FormattedText text={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Code block component with syntax header & copy button */
function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success("Code copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-3.5 overflow-hidden rounded-xl border border-border/80 bg-zinc-950 text-zinc-100 shadow-sm">
      <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/90 px-4 py-2 text-xs text-zinc-400 font-mono">
        <span className="flex items-center gap-1.5 font-medium text-zinc-300">
          <Code className="size-3.5 text-primary" />
          {language || "code"}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          className="h-6 px-2 text-[11px] font-sans text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
        >
          {copied ? (
            <>
              <Check className="size-3 text-emerald-400 mr-1" /> Copied
            </>
          ) : (
            <>
              <Copy className="size-3 mr-1" /> Copy
            </>
          )}
        </Button>
      </div>
      <pre className="p-4 overflow-x-auto text-xs font-mono leading-relaxed text-zinc-200">
        <code>{code}</code>
      </pre>
    </div>
  );
}



/** Inline Recharts Bar Chart Renderer for JSON chart blocks */
function ChartRenderer({ jsonStr }: { jsonStr: string }) {
  const chartData = useMemo(() => {
    try {
      const data = JSON.parse(jsonStr);
      if (Array.isArray(data)) return data;
      if (data.data && Array.isArray(data.data)) return data.data;
    } catch (e) {
      return null;
    }
    return null;
  }, [jsonStr]);

  if (!chartData) return null;

  return (
    <Card className="my-3.5 border border-border/60 bg-card/60 p-4 rounded-xl space-y-3 shadow-xs">
      <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
        <BarChart2 className="size-4 text-primary" />
        <span>Data Chart Visualization</span>
      </div>
      <div className="h-44 w-full pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <RechartsBarChart data={chartData} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(150,150,150,0.15)" />
            <XAxis dataKey="name" stroke="currentColor" className="text-[10px] text-muted-foreground" tickLine={false} axisLine={false} />
            <YAxis stroke="currentColor" className="text-[10px] text-muted-foreground" tickLine={false} axisLine={false} />
            <RechartsTooltip contentStyle={{ backgroundColor: "var(--background)", borderRadius: "8px", borderColor: "var(--border)", fontSize: "12px" }} />
            <Bar dataKey="value" fill="var(--primary)" radius={[4, 4, 0, 0]} maxBarSize={28} />
          </RechartsBarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

/** Markdown Paragraph & List Renderer with Big Headings & Separators */
function ParsedContentBlock({ text }: { text: string }) {
  const elements = useMemo(() => {
    if (!text) return [];

    const lines = text.split("\n");
    const result: React.ReactNode[] = [];
    let listItems: { text: string; indent: number }[] = [];
    let isNumberedList = false;

    const flushList = (keyPrefix: string) => {
      if (listItems.length > 0) {
        result.push(
          <div key={`list-${keyPrefix}`} className="my-2 space-y-1 pl-1">
            {listItems.map((item, idx) => (
              <div
                key={idx}
                className={cn(
                  "flex items-start gap-2 text-xs text-foreground/90 leading-relaxed",
                  item.indent > 0 && "ml-4"
                )}
              >
                {isNumberedList ? (
                  <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary mt-0.5">
                    {idx + 1}
                  </span>
                ) : (
                  <span className="size-1.5 rounded-full bg-primary shrink-0 mt-2" />
                )}
                <div className="flex-1">
                  <FormattedText text={item.text} />
                </div>
              </div>
            ))}
          </div>
        );
        listItems = [];
        isNumberedList = false;
      }
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (!trimmed) {
        flushList(`flush-${i}`);
        continue;
      }

      // Check Markdown Headers (# Heading 1, ## Heading 2, ### Heading 3)
      if (trimmed.startsWith("# ")) {
        flushList(`h1-${i}`);
        result.push(
          <h1 key={`h1-${i}`} className="mt-4 mb-2 text-base font-bold text-foreground tracking-tight border-b border-border/40 pb-1.5">
            <FormattedText text={trimmed.replace(/^#\s+/, "")} />
          </h1>
        );
        continue;
      }
      if (trimmed.startsWith("## ")) {
        flushList(`h2-${i}`);
        result.push(
          <h2 key={`h2-${i}`} className="mt-3.5 mb-1.5 text-sm font-bold text-foreground tracking-tight">
            <FormattedText text={trimmed.replace(/^##\s+/, "")} />
          </h2>
        );
        continue;
      }
      if (trimmed.startsWith("### ")) {
        flushList(`h3-${i}`);
        result.push(
          <h3 key={`h3-${i}`} className="mt-3 mb-1 text-xs font-bold text-foreground uppercase tracking-wide">
            <FormattedText text={trimmed.replace(/^###\s+/, "")} />
          </h3>
        );
        continue;
      }

      // Check Section Headers (e.g. **Strengths:**, **Weaknesses:**, **Feedback:**)
      const boldHeaderMatch = trimmed.match(/^(\*\*[^*:]+:\*\*|\*\*[^*:]+\*\*)$/);
      if (boldHeaderMatch) {
        flushList(`bh-${i}`);
        const headerText = trimmed.replace(/\*\*/g, "").trim();
        result.push(
          <div key={`bh-${i}`} className="mt-3 mb-1 flex items-center gap-2">
            <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">
              {headerText}
            </h4>
            <Separator className="flex-1 bg-border/40" />
          </div>
        );
        continue;
      }

      // Check List items (* item, - item, + item, 1. item)
      const listMatch = line.match(/^(\s*)([-*+]|(?:\d+\.))\s+(.*)$/);
      if (listMatch) {
        const indentLevel = listMatch[1].length;
        const marker = listMatch[2];
        const itemContent = listMatch[3];

        if (listItems.length === 0) {
          isNumberedList = /^\d+\./.test(marker);
        }
        listItems.push({ text: itemContent, indent: indentLevel > 2 ? 1 : 0 });
        continue;
      }

      // Standard paragraph line
      flushList(`para-${i}`);
      result.push(
        <p key={`p-${i}`} className="text-xs leading-relaxed text-foreground/90 my-1">
          <FormattedText text={trimmed} />
        </p>
      );
    }

    flushList("end");
    return result;
  }, [text]);

  return <div className="space-y-1 font-sans">{elements}</div>;
}

export function RichMessageRenderer({ content, citations, className }: RichMessageRendererProps) {
  // Parse content into blocks: code, table, mermaid, chart, gk_marker, text
  const blocks = useMemo(() => {
    if (!content) return [];

    let processedContent = content.trim();

    // 1. Unwrap markdown ```json ... ``` wrapper if it contains JSON
    if (processedContent.startsWith("```json")) {
      processedContent = processedContent.replace(/^```json\s*/i, "").replace(/\s*```$/, "").trim();
    } else if (processedContent.startsWith("```") && processedContent.endsWith("```")) {
      const match = processedContent.match(/^```[a-z]*\n([\s\S]*)\n```$/i);
      if (match && (match[1].trim().startsWith("{") || match[1].trim().startsWith("["))) {
        processedContent = match[1].trim();
      }
    }

    // 2. Unwrap JSON object string (e.g. {"explanation": "...", "strengths": [...]})
    if (processedContent.startsWith("{") && processedContent.endsWith("}")) {
      try {
        const obj = JSON.parse(processedContent);
        const textParts: string[] = [];
        if (obj.explanation && typeof obj.explanation === "string") textParts.push(obj.explanation);
        if (obj.summary && typeof obj.summary === "string") textParts.push(obj.summary);
        if (obj.analysis && typeof obj.analysis === "string") textParts.push(obj.analysis);
        if (obj.strengths && Array.isArray(obj.strengths)) {
          textParts.push(`**Topic Strengths:**\n${obj.strengths.map((s: string) => `- ${s}`).join("\n")}`);
        }
        if (obj.weaknesses && Array.isArray(obj.weaknesses)) {
          textParts.push(`**Improvement Areas:**\n${obj.weaknesses.map((w: string) => `- ${w}`).join("\n")}`);
        }
        if (obj.recommendations && Array.isArray(obj.recommendations)) {
          textParts.push(`**Actionable Recommendations:**\n${obj.recommendations.map((r: string) => `- ${r}`).join("\n")}`);
        }
        if (textParts.length > 0) {
          processedContent = textParts.join("\n\n");
        }
      } catch (e) {
        // Keep processedContent if not JSON
      }
    }

    const result: Array<{
      type: "text" | "code" | "mermaid" | "chart" | "table" | "gk_marker";
      content: string;
      language?: string;
    }> = [];

    const lines = processedContent.split("\n");
    let currentTextLines: string[] = [];
    let currentTableLines: string[] = [];
    let inCode = false;
    let codeLang = "";
    let codeLines: string[] = [];

    const flushText = () => {
      if (currentTextLines.length > 0) {
        result.push({ type: "text", content: currentTextLines.join("\n") });
        currentTextLines = [];
      }
    };

    const flushTable = () => {
      if (currentTableLines.length > 0) {
        result.push({ type: "table", content: currentTableLines.join("\n") });
        currentTableLines = [];
      }
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Check code blocks ```
      if (trimmed.startsWith("```")) {
        flushTable();
        if (inCode) {
          const codeStr = codeLines.join("\n");
          if (codeLang === "mermaid") {
            result.push({ type: "mermaid", content: codeStr });
          } else if (codeLang === "json:chart" || codeLang === "chart") {
            result.push({ type: "chart", content: codeStr });
          } else {
            result.push({ type: "code", content: codeStr, language: codeLang });
          }
          codeLines = [];
          inCode = false;
          codeLang = "";
        } else {
          flushText();
          inCode = true;
          codeLang = trimmed.replace("```", "").trim();
        }
        continue;
      }

      if (inCode) {
        codeLines.push(line);
        continue;
      }

      // Check General Knowledge Marker line
      if (
        trimmed.toLowerCase().includes("general knowledge:") ||
        trimmed.toLowerCase().includes("general knowledge")
      ) {
        const isHeader =
          trimmed.toLowerCase().startsWith("**general knowledge:**") ||
          trimmed.toLowerCase().startsWith("general knowledge:") ||
          trimmed.toLowerCase().startsWith("**general knowledge**:");

        if (isHeader) {
          flushTable();
          flushText();
          result.push({ type: "gk_marker", content: "General Knowledge" });
          const remainder = trimmed
            .replace(/^\*\*general knowledge:\*\*/i, "")
            .replace(/^general knowledge:/i, "")
            .replace(/^\*\*general knowledge\*\*:/i, "")
            .trim();
          if (remainder) {
            currentTextLines.push(remainder);
          }
          continue;
        }
      }

      // Check Table lines
      if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
        flushText();
        currentTableLines.push(trimmed);
      } else {
        flushTable();
        currentTextLines.push(line);
      }
    }

    flushTable();
    flushText();

    return result;
  }, [content]);

  return (
    <div className={cn("space-y-3 text-xs leading-relaxed text-foreground select-text", className)}>
      {blocks.map((block, i) => {
        if (block.type === "code") {
          return <CodeBlock key={i} language={block.language || "text"} code={block.content} />;
        }
        if (block.type === "mermaid") {
          return <MermaidDiagram key={i} code={block.content} />;
        }
        if (block.type === "chart") {
          return <ChartRenderer key={i} jsonStr={block.content} />;
        }
        if (block.type === "table") {
          return <MarkdownTableRenderer key={i} content={block.content} />;
        }
        if (block.type === "gk_marker") {
          return (
            <div key={i} className="my-3 flex items-center gap-3">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 text-[11px] font-semibold shrink-0">
                <Globe className="size-3 text-amber-500 shrink-0" />
                <span>General Knowledge</span>
              </div>
              <Separator className="flex-1 bg-border/40" />
            </div>
          );
        }

        // Render structured text with headings, lists, and formatted bold text
        return <ParsedContentBlock key={i} text={block.content} />;
      })}

      {/* Citations section if provided */}
      {citations && citations.length > 0 && (
        <div className="mt-3.5 pt-2.5 border-t border-border/40 space-y-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
            <FileText className="size-3 text-primary" /> Verified Citations ({citations.length})
          </span>
          <div className="flex flex-wrap gap-1.5">
            {citations.map((c, idx) => (
              <Badge
                key={idx}
                variant="outline"
                className="text-[10px] bg-background hover:bg-muted/40 font-normal px-2 py-0.5 border-border/60 flex items-center gap-1"
                title={c.excerpt}
              >
                <span>{c.resource_name}</span>
                {c.page_number && <span className="text-muted-foreground">(p. {c.page_number})</span>}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
