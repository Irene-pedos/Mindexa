// frontend/components/mindexa/study-reader/image-canvas.tsx
"use client";

import React, { useState } from "react";
import Image from "next/image";
import { ZoomIn, ZoomOut, RotateCw, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ImageCanvasProps {
  url: string;
  title: string;
}

export function ImageCanvas({ url, title }: ImageCanvasProps) {
  const [scale, setScale] = useState(100);
  const [rotation, setRotation] = useState(0);

  const zoomIn = () => setScale((s) => Math.min(s + 25, 400));
  const zoomOut = () => setScale((s) => Math.max(s - 25, 25));
  const reset = () => {
    setScale(100);
    setRotation(0);
  };
  const rotate = () => setRotation((r) => (r + 90) % 360);

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center overflow-auto p-4 sm:p-8 bg-muted/20">
      {/* Floating Image Controls */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 bg-card/90 backdrop-blur-md border border-border/60 shadow-lg rounded-full px-3 py-1.5">
        <Button variant="ghost" size="icon" className="size-7 rounded-full" onClick={zoomOut} title="Zoom out">
          <ZoomOut className="size-3.5" />
        </Button>
        <span className="text-xs font-semibold tabular-nums px-2 min-w-12 text-center text-foreground">
          {scale}%
        </span>
        <Button variant="ghost" size="icon" className="size-7 rounded-full" onClick={zoomIn} title="Zoom in">
          <ZoomIn className="size-3.5" />
        </Button>
        <div className="w-px h-4 bg-border/60 mx-1" />
        <Button variant="ghost" size="icon" className="size-7 rounded-full" onClick={rotate} title="Rotate clockwise">
          <RotateCw className="size-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="size-7 rounded-full" onClick={reset} title="Reset view">
          <RefreshCw className="size-3.5" />
        </Button>
      </div>

      {/* Image Display Sheet */}
      <div
        className="transition-transform duration-200 ease-out max-w-full max-h-full flex items-center justify-center"
        style={{
          transform: `scale(${scale / 100}) rotate(${rotation}deg)`,
        }}
      >
        <div className="bg-card p-2 rounded-xl shadow-xl border border-border/40">
          <Image
            src={url}
            alt={title}
            width={1200}
            height={900}
            unoptimized
            className="max-w-full max-h-[80vh] object-contain rounded-lg"
          />
        </div>
      </div>
    </div>
  );
}
