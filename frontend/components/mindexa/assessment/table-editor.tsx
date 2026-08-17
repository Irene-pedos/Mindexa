"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table as TableIcon,
  Plus,
  Trash2,
  Columns,
  Rows,
  Eye,
  Edit3,
} from "lucide-react";
import { TableContextViewer, StructuredTableData } from "@/components/mindexa/common/table-context-viewer";
import { cn } from "@/lib/utils";

interface TableEditorProps {
  initialData?: StructuredTableData | null;
  onChange: (data: StructuredTableData | null) => void;
  titleLabel?: string;
  description?: string;
  isAnswerTemplate?: boolean;
}

const DEFAULT_TABLE: StructuredTableData = {
  title: "",
  headers: ["Item / Description", "Debit ($)", "Credit ($)"],
  rows: [
    ["Initial Balance", "5,000", ""],
    ["Service Revenue", "", "2,500"],
  ],
};

export function TableEditor({
  initialData,
  onChange,
  titleLabel = "Table Title (Optional)",
  description = "Define a structured table with columns and rows for this question.",
  isAnswerTemplate = false,
}: TableEditorProps) {
  const [data, setData] = useState<StructuredTableData>(
    initialData || DEFAULT_TABLE
  );
  const [prevInitialData, setPrevInitialData] = useState(initialData);

  if (initialData !== prevInitialData) {
    setPrevInitialData(initialData);
    if (initialData) {
      setData(initialData);
    }
  }

  const [previewMode, setPreviewMode] = useState(false);

  const handleTitleChange = (val: string) => {
    const updated = { ...data, title: val };
    setData(updated);
    onChange(updated);
  };

  const handleHeaderChange = (colIdx: number, val: string) => {
    const newHeaders = [...data.headers];
    newHeaders[colIdx] = val;
    const updated = { ...data, headers: newHeaders };
    setData(updated);
    onChange(updated);
  };

  const handleCellChange = (rowIdx: number, colIdx: number, val: string) => {
    const newRows = data.rows.map((row, rI) => {
      if (rI !== rowIdx) return row;
      const newRow = [...row];
      newRow[colIdx] = val;
      return newRow;
    });
    const updated = { ...data, rows: newRows };
    setData(updated);
    onChange(updated);
  };

  const addColumn = () => {
    const newHeaders = [...data.headers, `Column ${data.headers.length + 1}`];
    const newRows = data.rows.map((row) => [...row, ""]);
    const updated = { ...data, headers: newHeaders, rows: newRows };
    setData(updated);
    onChange(updated);
  };

  const removeColumn = (colIdx: number) => {
    if (data.headers.length <= 1) return;
    const newHeaders = data.headers.filter((_, idx) => idx !== colIdx);
    const newRows = data.rows.map((row) => row.filter((_, idx) => idx !== colIdx));
    const updated = { ...data, headers: newHeaders, rows: newRows };
    setData(updated);
    onChange(updated);
  };

  const addRow = () => {
    const emptyRow = new Array(data.headers.length).fill("");
    const newRows = [...data.rows, emptyRow];
    const updated = { ...data, rows: newRows };
    setData(updated);
    onChange(updated);
  };

  const removeRow = (rowIdx: number) => {
    if (data.rows.length <= 1) return;
    const newRows = data.rows.filter((_, idx) => idx !== rowIdx);
    const updated = { ...data, rows: newRows };
    setData(updated);
    onChange(updated);
  };

  const handleClear = () => {
    onChange(null);
  };

  return (
    <Card className="border border-border/80 bg-card/60 shadow-xs rounded-2xl">
      <CardHeader className="py-3.5 px-4 border-b border-border/60 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-xs font-bold flex items-center gap-1.5 uppercase tracking-wide">
            <TableIcon className="size-4 text-primary" />
            {isAnswerTemplate ? "Student Answer Table Grid Template" : "Question Stem Reference Table"}
          </CardTitle>
          <CardDescription className="text-[11px] mt-0.5">{description}</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            type="button"
            className="h-7 text-xs rounded-lg gap-1"
            onClick={() => setPreviewMode(!previewMode)}
          >
            {previewMode ? <Edit3 className="size-3" /> : <Eye className="size-3" />}
            {previewMode ? "Edit Grid" : "Preview"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            type="button"
            className="h-7 text-xs rounded-lg text-muted-foreground hover:text-destructive"
            onClick={handleClear}
          >
            Remove Table
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-4 space-y-4">
        {previewMode ? (
          <TableContextViewer data={data} />
        ) : (
          <>
            <div>
              <Label className="text-[11px] font-semibold text-muted-foreground mb-1 block">
                {titleLabel}
              </Label>
              <Input
                value={data.title || ""}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="e.g. Trial Balance as of December 31, 2025 (or $f(x)$ data)"
                className="h-8 text-xs rounded-xl"
              />
            </div>

            {/* Column Headers */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
                  <Columns className="size-3.5" /> Column Headers ({data.headers.length})
                </Label>
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={addColumn}
                  className="h-6 text-[11px] rounded-md gap-1 px-2"
                >
                  <Plus className="size-3" /> Add Column
                </Button>
              </div>

              <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${data.headers.length}, minmax(0, 1fr))` }}>
                {data.headers.map((header, idx) => (
                  <div key={idx} className="flex items-center gap-1">
                    <Input
                      value={header}
                      onChange={(e) => handleHeaderChange(idx, e.target.value)}
                      placeholder={`Header ${idx + 1}`}
                      className="h-7 text-xs font-semibold rounded-lg bg-muted/30"
                    />
                    {data.headers.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        type="button"
                        onClick={() => removeColumn(idx)}
                        className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Rows & Cells */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
                  <Rows className="size-3.5" /> Rows ({data.rows.length})
                </Label>
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={addRow}
                  className="h-6 text-[11px] rounded-md gap-1 px-2"
                >
                  <Plus className="size-3" /> Add Row
                </Button>
              </div>

              <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                {data.rows.map((row, rIdx) => (
                  <div key={rIdx} className="flex items-center gap-1.5">
                    <div
                      className="flex-1 grid gap-1.5"
                      style={{ gridTemplateColumns: `repeat(${data.headers.length}, minmax(0, 1fr))` }}
                    >
                      {row.map((cell, cIdx) => (
                        <Input
                          key={cIdx}
                          value={cell}
                          onChange={(e) => handleCellChange(rIdx, cIdx, e.target.value)}
                          placeholder="Cell value..."
                          className="h-7 text-xs rounded-lg"
                        />
                      ))}
                    </div>
                    {data.rows.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        type="button"
                        onClick={() => removeRow(rIdx)}
                        className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
