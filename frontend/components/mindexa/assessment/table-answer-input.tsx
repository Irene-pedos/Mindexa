"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Table as TableIcon, Eye, Edit3, Sigma } from "lucide-react";
import { TableContextViewer, StructuredTableData } from "@/components/mindexa/common/table-context-viewer";
import { renderRichMathText } from "@/components/mindexa/common/math-renderer";
import { MathEditorDialog } from "@/components/mindexa/common/math-editor-dialog";
import { cn } from "@/lib/utils";

interface TableAnswerInputProps {
  template?: StructuredTableData | null;
  value?: string; // serialized JSON or raw string
  onChange: (jsonSerializedValue: string) => void;
  disabled?: boolean;
}

export function TableAnswerInput({
  template,
  value,
  onChange,
  disabled = false,
}: TableAnswerInputProps) {
  const getInitialData = (): StructuredTableData => {
    if (value) {
      try {
        const parsed = JSON.parse(value);
        if (parsed && parsed.headers && Array.isArray(parsed.headers)) {
          return parsed;
        }
      } catch (e) {
        // Not JSON
      }
    }
    if (template && template.headers && template.headers.length > 0) {
      return {
        title: template.title || "Student Response Table",
        headers: template.headers,
        rows:
          template.rows && template.rows.length > 0
            ? template.rows
            : [new Array(template.headers.length).fill("")],
      };
    }
    return {
      title: "Response Table",
      headers: ["Column 1", "Column 2", "Column 3"],
      rows: [["", "", ""]],
    };
  };

  const [tableData, setTableData] = useState<StructuredTableData>(getInitialData);
  const [prevValue, setPrevValue] = useState(value);
  const [prevTemplate, setPrevTemplate] = useState(template);
  const [previewMode, setPreviewMode] = useState(false);
  const [activeCell, setActiveCell] = useState<{ rowIdx: number; colIdx: number } | null>(null);
  const [mathDialogOpen, setMathDialogOpen] = useState(false);

  if (value !== prevValue || template !== prevTemplate) {
    setPrevValue(value);
    setPrevTemplate(template);
    if (value) {
      try {
        const parsed = JSON.parse(value);
        if (parsed && parsed.headers && Array.isArray(parsed.headers)) {
          setTableData(parsed);
        }
      } catch (e) {
        // Not JSON
      }
    } else if (template && template.headers && template.headers.length > 0) {
      setTableData({
        title: template.title || "Student Response Table",
        headers: template.headers,
        rows:
          template.rows && template.rows.length > 0
            ? template.rows
            : [new Array(template.headers.length).fill("")],
      });
    }
  }

  const updateTable = (newTable: StructuredTableData) => {
    setTableData(newTable);
    onChange(JSON.stringify({ type: "table", ...newTable }));
  };

  const handleCellChange = (rowIdx: number, colIdx: number, val: string) => {
    if (disabled) return;
    const newRows = tableData.rows.map((row, rI) => {
      if (rI !== rowIdx) return row;
      const newRow = [...row];
      newRow[colIdx] = val;
      return newRow;
    });
    updateTable({ ...tableData, rows: newRows });
  };

  const handleInsertMathIntoCell = (formattedMath: string) => {
    if (!activeCell) {
      // Default to last row, first column or 0,0
      const rIdx = Math.max(0, tableData.rows.length - 1);
      const cIdx = 0;
      const currentCell = tableData.rows[rIdx]?.[cIdx] || "";
      handleCellChange(rIdx, cIdx, currentCell ? `${currentCell} ${formattedMath}` : formattedMath);
    } else {
      const currentCell = tableData.rows[activeCell.rowIdx]?.[activeCell.colIdx] || "";
      handleCellChange(
        activeCell.rowIdx,
        activeCell.colIdx,
        currentCell ? `${currentCell} ${formattedMath}` : formattedMath
      );
    }
    setMathDialogOpen(false);
  };

  const addRow = () => {
    if (disabled) return;
    const emptyRow = new Array(tableData.headers.length).fill("");
    updateTable({ ...tableData, rows: [...tableData.rows, emptyRow] });
  };

  const removeRow = (rowIdx: number) => {
    if (disabled || tableData.rows.length <= 1) return;
    const newRows = tableData.rows.filter((_, idx) => idx !== rowIdx);
    updateTable({ ...tableData, rows: newRows });
  };

  return (
    <div className="space-y-3 p-3.5 rounded-2xl border border-border bg-card/50 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
          <TableIcon className="size-4 text-primary" />
          <span>{tableData.title || "Structured Table Response"}</span>
        </Label>
        <div className="flex items-center gap-2">
          {!disabled && (
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => setMathDialogOpen(true)}
              className="h-7 text-xs rounded-lg gap-1 border-primary/20 text-primary hover:bg-primary/5"
            >
              <Sigma className="size-3.5" /> Insert Equation
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            type="button"
            className="h-7 text-xs rounded-lg gap-1"
            onClick={() => setPreviewMode(!previewMode)}
          >
            {previewMode ? <Edit3 className="size-3" /> : <Eye className="size-3" />}
            {previewMode ? "Edit Cells" : "Preview Table"}
          </Button>
          {!disabled && (
            <Button
              variant="default"
              size="sm"
              type="button"
              onClick={addRow}
              className="h-7 text-xs rounded-lg gap-1 px-2.5"
            >
              <Plus className="size-3" /> Add Row
            </Button>
          )}
        </div>
      </div>

      {previewMode ? (
        <div className="p-2 border rounded-xl bg-background/80">
          <TableContextViewer data={tableData} />
        </div>
      ) : (
        <div className="rounded-xl border border-border/80 overflow-hidden bg-background shadow-xs">
          <Table className="w-full text-xs">
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                {tableData.headers.map((header, idx) => (
                  <TableHead
                    key={idx}
                    className="font-semibold text-foreground/90 px-3 py-2 border-r last:border-r-0 border-border/40"
                  >
                    {renderRichMathText(header || `Col ${idx + 1}`)}
                  </TableHead>
                ))}
                {!disabled && <TableHead className="w-10 px-2 py-2 text-center">Action</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {tableData.rows.map((row, rIdx) => (
                <TableRow key={rIdx} className="hover:bg-muted/10">
                  {row.map((cell, cIdx) => {
                    const isFocused =
                      activeCell?.rowIdx === rIdx && activeCell?.colIdx === cIdx;
                    return (
                      <TableCell
                        key={cIdx}
                        className={cn(
                          "p-1 border-r last:border-r-0 border-border/40 transition-colors",
                          isFocused && "bg-primary/[0.04]"
                        )}
                      >
                        <Input
                          value={cell}
                          onFocus={() => setActiveCell({ rowIdx: rIdx, colIdx: cIdx })}
                          onChange={(e) => handleCellChange(rIdx, cIdx, e.target.value)}
                          disabled={disabled}
                          placeholder="Type text, number or formula ($x^2$)..."
                          className="h-7 text-xs border-0 bg-transparent focus-visible:ring-1 focus-visible:ring-primary rounded-none shadow-none"
                        />
                      </TableCell>
                    );
                  })}
                  {!disabled && (
                    <TableCell className="p-1 text-center">
                      {tableData.rows.length > 1 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          type="button"
                          onClick={() => removeRow(rIdx)}
                          className="size-6 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {mathDialogOpen && (
        <MathEditorDialog
          open={mathDialogOpen}
          onOpenChange={setMathDialogOpen}
          onInsert={handleInsertMathIntoCell}
        />
      )}
    </div>
  );
}
