"use client";

import React, { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { MathRenderer } from "@/components/mindexa/common/math-renderer";
import {
  Sigma,
  Copy,
  Check,
  Sparkles,
  BookOpen,
  HelpCircle,
  Maximize2,
} from "lucide-react";
import { toast } from "sonner";

// Dynamically import MathLive with SSR disabled to prevent server-side DOM errors
const MathLiveClientComponent = dynamic(
  () =>
    import("mathlive").then(() => {
      // Define a custom wrapper component once mathlive is loaded in browser
      return function MathLiveField({
        value,
        onChange,
      }: {
        value: string;
        onChange: (latex: string) => void;
      }) {
        const fieldRef = useRef<any>(null);

        useEffect(() => {
          if (fieldRef.current && fieldRef.current.value !== value) {
            fieldRef.current.value = value;
          }
        }, [value]);

        useEffect(() => {
          const el = fieldRef.current;
          if (!el) return;
          const handler = () => {
            onChange(el.value || "");
          };
          el.addEventListener("input", handler);
          return () => el.removeEventListener("input", handler);
        }, [onChange]);

        return React.createElement(
          "math-field",
          {
            ref: fieldRef,
            style: {
              display: "block",
              width: "100%",
              minHeight: "56px",
              padding: "12px 16px",
              borderRadius: "12px",
              border: "1px solid var(--border)",
              backgroundColor: "var(--background)",
              color: "var(--foreground)",
              fontSize: "1.15rem",
              outline: "none",
            },
          },
          value
        );
      };
    }),
  { ssr: false, loading: () => <div className="p-4 text-xs text-muted-foreground animate-pulse">Loading visual math editor...</div> }
);

interface MathSymbolItem {
  label: string;
  latex: string;
  category: "basic" | "calculus" | "greek" | "logic" | "matrices";
}

const SYMBOL_PALETTE: MathSymbolItem[] = [
  // Basic
  { label: "Fraction", latex: "\\frac{a}{b}", category: "basic" },
  { label: "Square Root", latex: "\\sqrt{x}", category: "basic" },
  { label: "N-th Root", latex: "\\sqrt[n]{x}", category: "basic" },
  { label: "Power", latex: "x^{n}", category: "basic" },
  { label: "Subscript", latex: "x_{i}", category: "basic" },
  { label: "Plus-Minus", latex: "\\pm", category: "basic" },
  { label: "Multiply", latex: "\\times", category: "basic" },
  { label: "Divide", latex: "\\div", category: "basic" },

  // Calculus
  { label: "Definite Integral", latex: "\\int_{a}^{b} f(x) \\, dx", category: "calculus" },
  { label: "Derivative", latex: "\\frac{df}{dx}", category: "calculus" },
  { label: "Partial Diff", latex: "\\frac{\\partial f}{\\partial x}", category: "calculus" },
  { label: "Summation", latex: "\\sum_{i=1}^{n} x_i", category: "calculus" },
  { label: "Product", latex: "\\prod_{i=1}^{n} x_i", category: "calculus" },
  { label: "Limit", latex: "\\lim_{x \\to 0}", category: "calculus" },
  { label: "Infinity", latex: "\\infty", category: "calculus" },

  // Greek
  { label: "Alpha", latex: "\\alpha", category: "greek" },
  { label: "Beta", latex: "\\beta", category: "greek" },
  { label: "Gamma", latex: "\\gamma", category: "greek" },
  { label: "Delta", latex: "\\Delta", category: "greek" },
  { label: "Theta", latex: "\\theta", category: "greek" },
  { label: "Lambda", latex: "\\lambda", category: "greek" },
  { label: "Pi", latex: "\\pi", category: "greek" },
  { label: "Sigma", latex: "\\sigma", category: "greek" },
  { label: "Omega", latex: "\\Omega", category: "greek" },

  // Logic & Sets
  { label: "Less/Equal", latex: "\\leq", category: "logic" },
  { label: "Greater/Equal", latex: "\\geq", category: "logic" },
  { label: "Not Equal", latex: "\\neq", category: "logic" },
  { label: "Approx", latex: "\\approx", category: "logic" },
  { label: "Element of", latex: "\\in", category: "logic" },
  { label: "Subset", latex: "\\subset", category: "logic" },
  { label: "Union", latex: "\\cup", category: "logic" },
  { label: "Intersection", latex: "\\cap", category: "logic" },
  { label: "For All", latex: "\\forall", category: "logic" },
  { label: "Exists", latex: "\\exists", category: "logic" },

  // Matrices & Sets
  { label: "2x2 Matrix", latex: "\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}", category: "matrices" },
  { label: "3x3 Matrix", latex: "\\begin{pmatrix} a & b & c \\\\ d & e & f \\\\ g & h & i \\end{pmatrix}", category: "matrices" },
  { label: "Real Numbers", latex: "\\mathbb{R}", category: "matrices" },
  { label: "Integers", latex: "\\mathbb{Z}", category: "matrices" },
  { label: "Complex", latex: "\\mathbb{C}", category: "matrices" },
];

export interface MathEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialLatex?: string;
  onInsert: (formattedSnippet: string) => void;
}

export function MathEditorDialog({
  open,
  onOpenChange,
  initialLatex = "",
  onInsert,
}: MathEditorDialogProps) {
  const [latex, setLatex] = useState(
    initialLatex || "\\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}"
  );
  const [isBlockMode, setIsBlockMode] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleSymbolClick = (symbolLatex: string) => {
    setLatex((prev) => (prev ? `${prev} ${symbolLatex}` : symbolLatex));
  };

  const handleCopy = () => {
    const formatted = isBlockMode ? `$$${latex}$$` : `$${latex}$`;
    navigator.clipboard.writeText(formatted);
    setCopied(true);
    toast.success("LaTeX copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleInsertSnippet = () => {
    if (!latex.trim()) {
      toast.error("Please enter a formula before inserting");
      return;
    }
    const formatted = isBlockMode ? `$$${latex}$$` : `$${latex}$`;
    onInsert(formatted);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl rounded-3xl p-6 border border-border bg-card">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <Sigma className="size-5 text-primary" />
            LaTeX Math Formula & Equation Editor
          </DialogTitle>
          <DialogDescription className="text-xs">
            Build mathematical formulas visually or edit raw LaTeX. The generated formula will be rendered seamlessly across assessments and student dashboards with KaTeX.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Symbol Palette */}
          <div>
            <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">
              Symbol & Equation Palette
            </Label>
            <Tabs defaultValue="basic" className="w-full">
              <TabsList className="grid grid-cols-5 h-8 rounded-xl bg-muted/60 p-0.5">
                <TabsTrigger value="basic" className="text-[10px] font-semibold rounded-lg">
                  Basic
                </TabsTrigger>
                <TabsTrigger value="calculus" className="text-[10px] font-semibold rounded-lg">
                  Calculus
                </TabsTrigger>
                <TabsTrigger value="greek" className="text-[10px] font-semibold rounded-lg">
                  Greek
                </TabsTrigger>
                <TabsTrigger value="logic" className="text-[10px] font-semibold rounded-lg">
                  Logic/Sets
                </TabsTrigger>
                <TabsTrigger value="matrices" className="text-[10px] font-semibold rounded-lg">
                  Matrices
                </TabsTrigger>
              </TabsList>

              {(["basic", "calculus", "greek", "logic", "matrices"] as const).map((cat) => (
                <TabsContent key={cat} value={cat} className="mt-2">
                  <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-1.5 rounded-xl border border-muted/50 bg-muted/10">
                    {SYMBOL_PALETTE.filter((s) => s.category === cat).map((s, idx) => (
                      <Button
                        key={idx}
                        variant="outline"
                        size="sm"
                        className="h-8 px-2.5 text-xs font-mono rounded-lg hover:border-primary/50 hover:bg-primary/5 gap-1.5"
                        onClick={() => handleSymbolClick(s.latex)}
                      >
                        <MathRenderer math={s.latex} />
                        <span className="text-[9px] text-muted-foreground font-sans">({s.label})</span>
                      </Button>
                    ))}
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </div>

          {/* Interactive MathLive Editor */}
          <div>
            <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">
              Visual Editor (Click & Type)
            </Label>
            <MathLiveClientComponent value={latex} onChange={setLatex} />
          </div>

          {/* Raw LaTeX Input */}
          <div>
            <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">
              Raw LaTeX Code
            </Label>
            <Textarea
              value={latex}
              onChange={(e) => setLatex(e.target.value)}
              placeholder="e.g. \int_{0}^{\infty} e^{-x^2} dx = \frac{\sqrt{\pi}}{2}"
              className="font-mono text-xs min-h-[60px] rounded-xl"
            />
          </div>

          {/* Live KaTeX Render Preview */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Rendered Preview
              </Label>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[10px] font-semibold rounded-lg"
                  onClick={() => setIsBlockMode(!isBlockMode)}
                >
                  Mode: {isBlockMode ? "Display / Block ($$...$$)" : "Inline ($...$)"}
                </Button>
              </div>
            </div>
            <div className="p-4 rounded-xl border border-muted bg-muted/20 min-h-[64px] flex items-center justify-center">
              {latex.trim() ? (
                <MathRenderer math={latex} block={isBlockMode} />
              ) : (
                <span className="text-xs text-muted-foreground italic">Type LaTeX above to see live preview</span>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopy}
            className="rounded-xl text-xs gap-1.5"
          >
            {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
            {copied ? "Copied" : "Copy LaTeX"}
          </Button>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="rounded-xl text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleInsertSnippet}
              className="rounded-xl text-xs font-semibold px-5"
            >
              Insert into Question
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
