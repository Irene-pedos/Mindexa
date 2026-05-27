// app/lecturer/assessments/page.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Plus,
  Search,
  Eye,
  Edit,
  Trash2,
  Calendar,
  Clock,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  BookOpen,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import Link from "next/link";
import { assessmentApi } from "@/lib/api/assessment";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/interfaces-skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

export default function ManageAssessmentsPage() {
  const [assessments, setAssessments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState("newest");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [totalCount, setTotalCount] = useState(0);
  const [statusTab, setStatusTab] = useState("all");

  const fetchAssessments = useCallback(async () => {
    setLoading(true);
    try {
      const response = await assessmentApi.getAssessments({
        status: statusTab === "all" ? undefined : statusTab,
        page: page,
        page_size: pageSize,
        sort: sortBy,
      });
      setAssessments(response.items || []);
      setTotalCount(response.total || 0);
    } catch (err: any) {
      toast.error(err.message || "Failed to load assessments");
    } finally {
      setLoading(false);
    }
  }, [statusTab, page, pageSize, sortBy]);

  useEffect(() => {
    fetchAssessments();
  }, [fetchAssessments]);

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this assessment?")) return;
    try {
      await assessmentApi.deleteAssessment(id);
      toast.success("Assessment deleted successfully");
      fetchAssessments();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete assessment");
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (
      !confirm(
        `Are you sure you want to delete ${selectedIds.length} assessments?`,
      )
    )
      return;

    let successCount = 0;
    let failCount = 0;

    setLoading(true);
    for (const id of selectedIds) {
      try {
        await assessmentApi.deleteAssessment(id);
        successCount++;
      } catch (e) {
        failCount++;
      }
    }

    if (successCount > 0) toast.success(`Deleted ${successCount} assessments`);
    if (failCount > 0) toast.error(`Failed to delete ${failCount} assessments`);

    setSelectedIds([]);
    fetchAssessments();
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === assessments.length && assessments.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(assessments.map((a) => a.id));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  };

  const filteredAssessments = assessments.filter((a) =>
    a.title.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const StatusBadge = ({ status }: { status: string }) => {
    const statusStyles: Record<string, string> = {
      DRAFT: "bg-muted text-muted-foreground",
      PUBLISHED: "bg-primary/10 text-primary border-primary/20",
      ACTIVE: "bg-emerald-50 text-emerald-700 border-emerald-200",
      CLOSED: "bg-muted text-foreground border-border",
      ARCHIVED: "bg-transparent text-muted-foreground border-border",
    };

    return (
      <Badge
        variant="outline"
        className={cn(
          "font-semibold text-[9px] px-2 py-0 h-4.5 rounded-full uppercase",
          statusStyles[status],
        )}
      >
        {status}
      </Badge>
    );
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  const AssessmentTable = ({ items }: { items: any[] }) => (
    <div className="space-y-3">
      {selectedIds.length > 0 && (
        <div className="flex items-center justify-between bg-primary/5 p-1.5 rounded-xl border border-primary/10 px-4">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-primary/80">
            {selectedIds.length} Assessments Selected
          </span>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleBulkDelete}
            className="h-6 px-3 rounded-lg text-[9px] font-bold uppercase shadow-none"
          >
            <Trash2 className="mr-1 size-3" /> Batch Delete
          </Button>
        </div>
      )}
      <div className="rounded-2xl border border-muted/30 overflow-hidden bg-background">
        <Table>
          <TableHeader className="bg-muted/20">
            <TableRow className="hover:bg-transparent border-none">
              <TableHead className="w-[40px] px-4">
                <Checkbox
                  checked={
                    items.length > 0 && selectedIds.length === items.length
                  }
                  onCheckedChange={toggleSelectAll}
                />
              </TableHead>
              <TableHead className="text-[10px] font-semibold uppercase tracking-wider h-10">
                Examination Node
              </TableHead>
              <TableHead className="text-[10px] font-semibold uppercase tracking-wider h-10">
                Academic Context
              </TableHead>
              <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-center h-10">
                Protocol
              </TableHead>
              <TableHead className="text-[10px] font-semibold uppercase tracking-wider h-10">
                Metrics
              </TableHead>
              <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-center h-10">
                Status
              </TableHead>
              <TableHead className="text-right text-[10px] font-semibold uppercase tracking-wider pr-4 h-10">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center py-24 text-muted-foreground"
                >
                  <div className="flex flex-col items-center gap-3">
                    <BookOpen className="size-10 opacity-10" />
                    <p className="text-xs font-medium uppercase tracking-widest opacity-60">
                      Registry is Empty
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow
                  key={item.id}
                  className={cn(
                    "group transition-colors h-14 border-muted/10",
                    selectedIds.includes(item.id) && "bg-muted/30",
                  )}
                >
                  <TableCell className="px-4">
                    <Checkbox
                      checked={selectedIds.includes(item.id)}
                      onCheckedChange={() => toggleSelect(item.id)}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="font-semibold text-xs leading-snug text-foreground/90">
                      {item.title}
                    </div>
                    {item.window_start && (
                      <div className="text-[9px] text-muted-foreground mt-0.5 font-medium flex items-center gap-1 uppercase tracking-tight">
                        <Clock className="size-2.5" />{" "}
                        {new Date(item.window_start).toLocaleDateString(
                          undefined,
                          { month: "short", day: "numeric" },
                        )}{" "}
                        at{" "}
                        {new Date(item.window_start).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="text-[11px] font-semibold text-foreground/70 uppercase truncate max-w-[180px]">
                      {item.course_name || "GLOBAL UNIT"}
                    </div>
                    <div className="text-[9px] text-muted-foreground font-mono mt-0.5 opacity-80">
                      {item.course_code || "OFFICIAL"}
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge
                      variant="outline"
                      className="text-[8px] font-bold uppercase tracking-tight h-4.5 px-2 rounded-md border-muted/50 text-muted-foreground/80"
                    >
                      {item.assessment_type}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="text-xs font-semibold text-foreground/80">
                      {item.total_marks} pts
                    </div>
                    <div className="text-[9px] text-muted-foreground font-medium uppercase">
                      {item.duration_minutes} min
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <StatusBadge status={item.status} />
                  </TableCell>
                  <TableCell className="text-right pr-4">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        asChild
                        className="h-7 w-7 rounded-lg hover:bg-muted/80"
                      >
                        <Link
                          href={
                            item.status === "DRAFT"
                              ? `/lecturer/assessments/new?draft=${item.id}`
                              : `/lecturer/assessments/${item.id}/edit`
                          }
                        >
                          <Edit className="size-3.5 text-muted-foreground" />
                        </Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive h-7 w-7 rounded-lg hover:bg-red-50"
                        onClick={() => handleDelete(item.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            Records {(page - 1) * pageSize + 1} –{" "}
            {Math.min(page * pageSize, totalCount)} of {totalCount}
          </p>
          <div className="flex gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="h-8 px-3 rounded-xl font-semibold text-[10px] uppercase shadow-none border-muted/40"
            >
              <ChevronLeft className="size-3.5 mr-1" /> Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="h-8 px-3 rounded-xl font-semibold text-[10px] uppercase shadow-none border-muted/40"
            >
              Next <ChevronRight className="size-3.5 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4 max-w-7xl mx-auto p-4 md:p-6 pb-20">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-0.5">
          <h1 className="text-3xl font-semibold tracking-tight">Assessments</h1>
          <p className="text-muted-foreground text-s tracking-tight">
            Governance, evaluation, and real-time monitoring registry
          </p>
        </div>
        <Button
          size="sm"
          asChild
          className="h-9 rounded-full px-5 gap-2 shadow-none font-semibold text-xs tracking-tight"
        >
          <Link href="/lecturer/assessments/new">
            <Plus className="size-4" /> Register New Assessment
          </Link>
        </Button>
      </div>

      <Card className="shadow-none border rounded-2xl overflow-hidden bg-background/50">
        <CardHeader className="pb-3 border-b bg-muted/5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-0.5">
              <CardTitle className="text-sm font-semibold tracking-tight">
                Institutional Registry
              </CardTitle>
              <CardDescription className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                Examination workflow audit and control node
              </CardDescription>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-36 h-8 text-[11px] rounded-xl bg-background border-muted/60 shadow-none font-medium">
                  <ArrowUpDown className="mr-1.5 size-3 text-muted-foreground/60" />
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="newest" className="text-xs font-medium">
                    Newest First
                  </SelectItem>
                  <SelectItem value="oldest" className="text-xs font-medium">
                    Oldest First
                  </SelectItem>
                  <SelectItem value="title" className="text-xs font-medium">
                    Alphabetical
                  </SelectItem>
                </SelectContent>
              </Select>

              <div className="relative w-full md:w-64">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/60" />
                <Input
                  placeholder="Filter records..."
                  className="pl-8 h-8 text-[11px] rounded-xl bg-background border-muted/60 focus-visible:ring-1 shadow-none font-medium"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-4">
          {loading ? (
            <div className="space-y-4">
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="w-20 h-7 rounded-xl" />
                ))}
              </div>
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="w-full h-14 rounded-xl" />
                ))}
              </div>
            </div>
          ) : (
            <Tabs
              value={statusTab}
              onValueChange={(v) => {
                setStatusTab(v);
                setPage(1);
              }}
              className="space-y-4"
            >
              <TabsList className="bg-muted/30 p-0.5 rounded-xl w-fit h-8">
                <TabsTrigger
                  value="all"
                  className="text-[10px] font-semibold uppercase tracking-tight px-4 h-7 rounded-lg"
                >
                  All
                </TabsTrigger>
                <TabsTrigger
                  value="DRAFT"
                  className="text-[10px] font-semibold uppercase tracking-tight px-4 h-7 rounded-lg"
                >
                  Drafts
                </TabsTrigger>
                <TabsTrigger
                  value="PUBLISHED"
                  className="text-[10px] font-semibold uppercase tracking-tight px-4 h-7 rounded-lg"
                >
                  Published
                </TabsTrigger>
                <TabsTrigger
                  value="ACTIVE"
                  className="text-[10px] font-semibold uppercase tracking-tight px-4 h-7 rounded-lg"
                >
                  Active
                </TabsTrigger>
                <TabsTrigger
                  value="CLOSED"
                  className="text-[10px] font-semibold uppercase tracking-tight px-4 h-7 rounded-lg"
                >
                  Closed
                </TabsTrigger>
              </TabsList>

              <TabsContent
                value={statusTab}
                className="mt-0 outline-none border-none"
              >
                <AssessmentTable items={filteredAssessments} />
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
