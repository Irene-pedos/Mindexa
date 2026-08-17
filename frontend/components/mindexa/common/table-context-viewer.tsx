"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { renderRichMathText } from "@/components/mindexa/common/math-renderer";
import { Table as TableIcon } from "lucide-react";

export interface StructuredTableData {
  title?: string;
  headers: string[];
  rows: string[][];
}

interface TableContextViewerProps {
  data: StructuredTableData | any;
  className?: string;
}

export function TableContextViewer({ data, className }: TableContextViewerProps) {
  if (!data || !data.headers || !Array.isArray(data.headers) || data.headers.length === 0) {
    return null;
  }

  const { title, headers, rows = [] } = data;

  return (
    <div className={cn("my-3 rounded-xl border border-border/80 overflow-hidden bg-card/60 shadow-xs", className)}>
      {title && (
        <div className="flex items-center gap-2 px-3.5 py-2 border-b border-border/60 bg-muted/30 text-xs font-semibold text-foreground/90">
          <TableIcon className="size-3.5 text-primary" />
          <span>{renderRichMathText(title)}</span>
        </div>
      )}
      <div className="overflow-x-auto max-w-full">
        <Table className="w-full text-xs">
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              {headers.map((header: string, idx: number) => (
                <TableHead
                  key={idx}
                  className="font-semibold text-foreground/90 px-3 py-2 border-r last:border-r-0 border-border/40 text-left"
                >
                  {renderRichMathText(header || "")}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={headers.length}
                  className="text-center py-4 text-xs text-muted-foreground italic"
                >
                  No rows in table
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row: string[], rIdx: number) => (
                <TableRow
                  key={rIdx}
                  className={cn("hover:bg-muted/20 transition-colors", rIdx % 2 === 1 && "bg-muted/10")}
                >
                  {row.map((cell: string, cIdx: number) => (
                    <TableCell
                      key={cIdx}
                      className="px-3 py-2 border-r last:border-r-0 border-border/40 text-foreground/80"
                    >
                      {renderRichMathText(cell || "")}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
