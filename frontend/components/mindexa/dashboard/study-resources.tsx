// components/mindexa/dashboard/study-resources.tsx
"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, ArrowRight, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StudentResourceResponse } from "@/lib/api/student";
import Link from "next/link";

interface StudyResourcesProps {
  resources?: StudentResourceResponse[];
}

export function StudyResources({ resources = [] }: StudyResourcesProps) {
  const topResources = resources.slice(0, 3);

  return (
    <Card className="rounded-2xl border border-border/60 bg-card shadow-xs overflow-hidden">
      <CardHeader className="py-3 px-4 bg-muted/20 border-b border-border/40 flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="size-6 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <FileText className="size-3.5" />
          </div>
          <div>
            <CardTitle className="text-xs font-semibold text-foreground tracking-tight">
              Study Resources
            </CardTitle>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs font-medium px-2 text-primary hover:text-primary gap-1"
            asChild
          >
            <Link href="/student/resources">
              All Resources <ArrowRight className="size-3" />
            </Link>
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-3 sm:p-4 space-y-2.5">
        {topResources.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-xs text-muted-foreground font-medium">
              No resources uploaded yet.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2.5 h-7 text-xs font-medium"
              asChild
            >
              <Link href="/student/resources">
                <Upload className="mr-1.5 size-3" />
                Upload Resource
              </Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {topResources.map((res, i) => (
              <Link
                key={res.id || i}
                href={`/student/resources/${res.id}/read`}
                className="flex items-center justify-between p-3 rounded-xl border border-border/50 bg-background/80 hover:bg-muted/30 transition-all gap-3 group"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div className="size-7 rounded-lg bg-muted flex items-center justify-center shrink-0 border border-border/40 text-muted-foreground group-hover:text-primary transition-colors">
                    <FileText className="size-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs sm:text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                      {res.display_name || res.original_filename}
                    </div>
                    <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 uppercase font-medium mt-0.5">
                      <span>{res.file_extension}</span>
                      <span>•</span>
                      <span>
                        {res.file_size_bytes > 1024 * 1024
                          ? `${(res.file_size_bytes / (1024 * 1024)).toFixed(1)} MB`
                          : `${(res.file_size_bytes / 1024).toFixed(0)} KB`}
                      </span>
                    </div>
                  </div>
                </div>
                <ArrowRight className="size-3.5 text-muted-foreground/60 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}