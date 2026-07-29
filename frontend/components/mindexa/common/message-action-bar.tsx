"use client";

import React, { useState } from "react";
import {
  Copy,
  Check,
  ThumbsUp,
  ThumbsDown,
  RefreshCw,
  Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface MessageActionBarProps {
  content: string;
  onRegenerate?: () => void;
  onStop?: () => void;
  isStreaming?: boolean;
  className?: string;
}

export function MessageActionBar({
  content,
  onRegenerate,
  onStop,
  isStreaming,
  className,
}: MessageActionBarProps) {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<"like" | "dislike" | null>(null);

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    toast.success("Response copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFeedback = (type: "like" | "dislike") => {
    if (feedback === type) {
      setFeedback(null);
    } else {
      setFeedback(type);
      toast.success(type === "like" ? "Feedback recorded! Thanks." : "Feedback noted.");
    }
  };

  return (
    <TooltipProvider>
      <div className={cn("flex items-center gap-1 opacity-90 hover:opacity-100 transition-opacity", className)}>
        {/* Copy Button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCopy}
              className="size-7 text-muted-foreground hover:text-foreground"
              aria-label="Copy response"
            >
              {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p className="text-[10px]">Copy response</p>
          </TooltipContent>
        </Tooltip>

        {/* Like Feedback */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleFeedback("like")}
              className={cn(
                "size-7 text-muted-foreground hover:text-foreground",
                feedback === "like" && "text-emerald-500 bg-emerald-500/10"
              )}
              aria-label="Helpful"
            >
              <ThumbsUp className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p className="text-[10px]">Helpful</p>
          </TooltipContent>
        </Tooltip>

        {/* Dislike Feedback */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleFeedback("dislike")}
              className={cn(
                "size-7 text-muted-foreground hover:text-foreground",
                feedback === "dislike" && "text-rose-500 bg-rose-500/10"
              )}
              aria-label="Not helpful"
            >
              <ThumbsDown className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p className="text-[10px]">Not helpful</p>
          </TooltipContent>
        </Tooltip>

        {/* Regenerate Button */}
        {onRegenerate && !isStreaming && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onRegenerate}
                className="size-7 text-muted-foreground hover:text-foreground"
                aria-label="Regenerate response"
              >
                <RefreshCw className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-[10px]">Regenerate response</p>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Stop Generating Button */}
        {isStreaming && onStop && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={onStop}
                className="h-7 px-2 text-[10px] font-medium text-destructive border-destructive/30 hover:bg-destructive/10 flex items-center gap-1"
                aria-label="Stop generating"
              >
                <Square className="size-3 fill-destructive" /> Stop Generating
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-[10px]">Halt model generation</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
}
