"use client";

import React, { useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { cn } from "@/lib/utils";

interface MathRendererProps {
  math: string;
  block?: boolean;
  className?: string;
}

/**
 * Safe KaTeX Math Renderer component.
 * Renders LaTeX formulas with safe error fallback if LaTeX syntax is malformed.
 */
export function MathRenderer({ math, block = false, className }: MathRendererProps) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(math, {
        displayMode: block,
        throwOnError: false,
        strict: false,
      });
    } catch (err) {
      console.warn("KaTeX render error:", err);
      return `<span class="text-destructive font-mono text-xs font-semibold">[Math Error: ${math}]</span>`;
    }
  }, [math, block]);

  if (block) {
    return (
      <div
        className={cn("my-3 overflow-x-auto py-2 px-3 text-center rounded-lg bg-muted/20", className)}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  return (
    <span
      className={cn("inline-block align-middle px-0.5", className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/**
 * Regex for math parsing:
 * 1. Block math: \$\$([\s\S]*?)\$\$
 * 2. Inline math: \$([^\$\s](?:[^\$]*?[^\$\s])?)\$
 * Excludes escaped dollars (\$) and currency formats like $100, $5.99.
 */
export const INLINE_MATH_REGEX = /(?<!\\)\$(?!\s)(.*?)(?<!\s)\$(?!\d)/g;
export const BLOCK_MATH_REGEX = /\$\$([\s\S]+?)\$\$/g;

/**
 * Helper to render string containing mixed text, LaTeX formulas ($...$, $$...$$), bold, and code.
 */
export function renderRichMathText(text: string): React.ReactNode {
  if (!text) return null;

  // First split by block math $$...$$
  const blockParts = text.split(/(\$\$[\s\S]+?\$\$)/g);

  return blockParts.map((blockPart, blockIdx) => {
    if (blockPart.startsWith("$$") && blockPart.endsWith("$$") && blockPart.length > 4) {
      const formula = blockPart.slice(2, -2).trim();
      return <MathRenderer key={`block-${blockIdx}`} math={formula} block={true} />;
    }

    // Next, split by inline math $...$
    // Ensure we don't match currency amounts like $50 or $100.00
    const inlineParts = blockPart.split(/(?<!\\)\$(?!\s)([\S]|[\S][\s\S]*?[\S])\$(?!\d)/g);

    return (
      <React.Fragment key={`text-block-${blockIdx}`}>
        {inlineParts.map((part, inlineIdx) => {
          // If odd index from regex capture group, it's a matched formula
          if (inlineIdx % 2 === 1) {
            // Check if it's currency or invalid
            if (/^\d+(?:,\d{3})*(?:\.\d+)?$/.test(part)) {
              return `$${part}$`;
            }
            return <MathRenderer key={`inline-${inlineIdx}`} math={part} block={false} />;
          }

          // Unescape any escaped \$ to literal $
          const unescaped = part.replace(/\\\$/g, "$");
          return <span key={`plain-${inlineIdx}`}>{unescaped}</span>;
        })}
      </React.Fragment>
    );
  });
}
