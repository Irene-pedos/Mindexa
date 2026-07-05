// components/mindexa/assessment/group-csv-import.tsx
"use client";

import React, { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, X } from "lucide-react";
import { toast } from "sonner";
import { groupWorkApi, GroupCsvRow } from "@/lib/api/group-work";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface GroupCsvImportProps {
  assessmentId?: string;
  onImport: (groups: any[]) => void;
}

export function GroupCsvImport({ assessmentId, onImport }: GroupCsvImportProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [importResult, setImportResult] = useState<any | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file || !assessmentId) return;

    setIsProcessing(true);
    try {
      // Basic CSV parsing for preview/validation
      const text = await file.text();
      const lines = text.split("\n");
      const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
      
      const rows: GroupCsvRow[] = lines.slice(1).filter(l => l.trim()).map(line => {
        const values = line.split(",").map(v => v.trim());
        const row: any = {};
        headers.forEach((header, i) => {
          if (header === "student_id") row.student_id = values[i];
          if (header === "group_name") row.group_name = values[i];
          if (header === "role") row.group_role = values[i];
          if (header === "leader") row.is_leader = values[i]?.toLowerCase() === "true";
        });
        return row;
      });

      if (rows.length === 0) {
        toast.error("CSV file is empty or invalid format.");
        return;
      }

      // Call API to validate
      const res = await groupWorkApi.importGroupsCsv(assessmentId, rows);
      const normalized = {
        is_valid: (res.error_count || 0) === 0,
        groups: (res.valid_groups || []).map((vg: any) => ({
          name: vg.name,
          members: (vg.members || []).map((m: any) => ({
            student_id: m.student_id,
            is_leader: !!m.is_leader
          }))
        })),
        errors: (res.errors || []).map((err: any) => 
          `Row ${err.row_number || "?"}: ${err.reason || "Validation error for student ID " + err.student_id}`
        )
      };
      setImportResult(normalized);
      
      if (normalized.is_valid) {
        toast.success(`CSV validated: ${normalized.groups.length} groups found.`);
      } else {
        toast.error("CSV has validation errors. Please review below.");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to process CSV file.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirm = () => {
    if (importResult && importResult.is_valid) {
      onImport(importResult.groups);
      setFile(null);
      setImportResult(null);
    }
  };

  return (
    <div className="space-y-4">
      {!importResult ? (
        <Card className="border-dashed border-2 shadow-none">
          <CardContent className="flex flex-col items-center justify-center py-10 gap-4">
            <div className="p-4 rounded-full bg-muted">
              <FileSpreadsheet className="size-8 text-muted-foreground" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-semibold">Upload Group Assignments</p>
              <p className="text-xs text-muted-foreground">
                CSV format: student_id, group_name, [role], [leader]
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="hidden"
                id="group-csv-upload"
              />
              <Button
                variant="outline"
                size="sm"
                className="h-9 rounded-lg"
                asChild
              >
                <label htmlFor="group-csv-upload" className="cursor-pointer">
                  {file ? file.name : "Select CSV File"}
                </label>
              </Button>
              {file && (
                <Button
                  size="sm"
                  className="h-9 rounded-lg"
                  onClick={handleUpload}
                  disabled={isProcessing}
                >
                  {isProcessing ? "Processing..." : "Validate CSV"}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border shadow-none overflow-hidden">
          <CardHeader className="py-3 border-b bg-muted/20">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">CSV Import Result</CardTitle>
              <Button variant="ghost" size="icon-xs" onClick={() => setImportResult(null)}>
                <X className="size-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[300px]">
              <div className="p-4 space-y-4">
                {importResult.errors && importResult.errors.length > 0 && (
                  <div className="p-3 rounded-lg bg-destructive/5 border border-destructive/10 space-y-1">
                    <div className="flex items-center gap-2 text-destructive">
                      <AlertCircle className="size-4" />
                      <span className="text-xs font-bold uppercase tracking-wider">Validation Errors</span>
                    </div>
                    <ul className="list-disc pl-5 text-[11px] text-destructive/80">
                      {importResult.errors.map((err: string, i: number) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="h-8 text-[10px]">Group Name</TableHead>
                      <TableHead className="h-8 text-[10px]">Students</TableHead>
                      <TableHead className="h-8 text-[10px] text-right">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {importResult.groups.map((g: any, i: number) => (
                      <TableRow key={i} className="text-xs">
                        <TableCell className="py-2 font-medium">{g.name}</TableCell>
                        <TableCell className="py-2">
                          <div className="flex flex-wrap gap-1">
                            {g.members.map((m: any, j: number) => (
                              <Badge key={j} variant="outline" className="text-[9px] px-1.5 h-4">
                                {m.student_id} {m.is_leader && "👑"}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="py-2 text-right">
                          <CheckCircle2 className="size-4 text-emerald-500 ml-auto" />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </ScrollArea>
          </CardContent>
          <CardFooter className="py-3 border-t bg-muted/10 flex justify-end gap-3">
            <Button variant="ghost" size="sm" onClick={() => setImportResult(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!importResult.is_valid}
              onClick={handleConfirm}
              className="rounded-lg h-8 px-4"
            >
              Apply Grouping
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  );
}
