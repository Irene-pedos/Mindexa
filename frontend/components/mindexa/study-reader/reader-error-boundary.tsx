// frontend/components/mindexa/study-reader/reader-error-boundary.tsx
"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RotateCcw, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  onBack?: () => void;
  title?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ReaderErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("StudyReader ErrorBoundary caught error:", error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center select-none animate-in fade-in duration-200">
          <div className="max-w-md w-full p-8 rounded-3xl bg-card border border-border/60 shadow-2xl space-y-5 flex flex-col items-center">
            <div className="size-12 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center border border-destructive/20">
              <AlertTriangle className="size-6" />
            </div>

            <div className="space-y-1.5 text-center">
              <h2 className="text-base font-semibold text-foreground">
                Study Workspace Encountered an Error
              </h2>
              <p className="text-xs text-muted-foreground leading-relaxed">
                The reader ran into an unexpected issue while rendering{" "}
                {this.props.title ? `"${this.props.title}"` : "this document"}.
              </p>
            </div>

            {this.state.error && (
              <div className="w-full text-left p-3 rounded-xl bg-muted/40 border border-border/40 text-[11px] font-mono text-muted-foreground overflow-x-auto max-h-24 no-scrollbar">
                {this.state.error.message || "Unknown rendering exception"}
              </div>
            )}

            <div className="flex items-center gap-2 pt-2 w-full">
              {this.props.onBack && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={this.props.onBack}
                  className="flex-1 text-xs gap-1.5 h-9 rounded-xl border-border/60"
                >
                  <ArrowLeft className="size-3.5" />
                  <span>Return</span>
                </Button>
              )}

              <Button
                variant="default"
                size="sm"
                onClick={this.handleReset}
                className="flex-1 text-xs gap-1.5 h-9 rounded-xl shadow-xs"
              >
                <RotateCcw className="size-3.5" />
                <span>Try Again</span>
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
