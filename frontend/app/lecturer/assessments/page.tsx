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
  Loader2,
  Calendar,
  Clock,
  FileText,
  Filter,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import Link from "next/link";
import { assessmentApi } from "@/lib/api/assessment";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
        sort: sortBy
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
    if (!confirm(`Are you sure you want to delete ${selectedIds.length} assessments?`)) return;
    
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
    if (selectedIds.length === assessments.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(assessments.map(a => a.id));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const filteredAssessments = assessments.filter((a) =>
    a.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const StatusBadge = ({ status }: { status: string }) => {
    const statusStyles: Record<string, string> = {
      DRAFT: "bg-muted text-muted-foreground",
      PUBLISHED: "bg-blue-100 text-blue-700 border-blue-200",
      ACTIVE: "bg-emerald-100 text-emerald-700 border-emerald-200",
      CLOSED: "bg-amber-100 text-amber-700 border-amber-200",
      ARCHIVED: "bg-gray-100 text-gray-700 border-gray-200",
    };

    return (
      <Badge variant="outline" className={cn("font-medium", statusStyles[status])}>
        {status}
      </Badge>
    );
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  const AssessmentTable = ({ items }: { items: any[] }) => (
    <div className="space-y-4">
      {selectedIds.length > 0 && (
        <div className="flex items-center justify-between bg-muted/50 p-2 rounded-lg border px-4">
          <span className="text-sm font-medium">{selectedIds.length} items selected</span>
          <Button variant="destructive" size="sm" onClick={handleBulkDelete}>
            <Trash2 className="mr-2 size-4" /> Delete Selected
          </Button>
        </div>
      )}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]">
                <Checkbox 
                  checked={items.length > 0 && selectedIds.length === items.length}
                  onCheckedChange={toggleSelectAll}
                />
              </TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Course</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Marks</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Schedule / Window</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-10 text-muted-foreground">
                  No assessments found.
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow key={item.id} className={cn(selectedIds.includes(item.id) && "bg-muted/50")}>
                  <TableCell>
                    <Checkbox 
                      checked={selectedIds.includes(item.id)}
                      onCheckedChange={() => toggleSelect(item.id)}
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    <div>{item.title}</div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm font-medium">
                      {item.course_name || "N/A"}
                    </div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {item.course_code || ""}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px] font-bold uppercase">
                      {item.assessment_type}
                    </Badge>
                  </TableCell>
                  <TableCell>{item.total_marks} Marks</TableCell>
                  <TableCell>{item.duration_minutes} Mins</TableCell>
                  <TableCell>
                    {item.window_start && item.window_end ? (
                      <div className="text-xs space-y-1">
                        <div className="flex items-center gap-1">
                          <Calendar className="size-3" />
                          {new Date(item.window_start).toLocaleDateString()}
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="size-3 text-muted-foreground" />
                          {new Date(item.window_start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(item.window_end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground italic">Not scheduled</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={item.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="icon" asChild title="View / Edit">
                        <Link href={item.status === 'DRAFT' ? `/lecturer/assessments/new?draft=${item.id}` : `/lecturer/assessments/${item.id}/edit`}>
                          <Edit className="size-4" />
                        </Link>
                      </Button>
                      <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDelete(item.id)} title="Delete">
                        <Trash2 className="size-4" />
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
        <div className="flex items-center justify-between py-4">
          <p className="text-sm text-muted-foreground">
            Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, totalCount)} of {totalCount} assessments
          </p>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              <ChevronLeft className="size-4 mr-2" /> Previous
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              Next <ChevronRight className="size-4 ml-2" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Manage Assessments</h1>
          <p className="text-muted-foreground mt-1">Create, edit, and monitor your academic assessments</p>
        </div>
        <Button size="lg" asChild>
          <Link href="/lecturer/assessments/new">
            <Plus className="mr-2 size-5" /> Create Assessment
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex flex-col gap-1">
              <CardTitle>Your Assessments</CardTitle>
              <CardDescription>Browse all assessments filtered by status</CardDescription>
            </div>
            
            <div className="flex flex-wrap items-center gap-3">
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-40">
                  <ArrowUpDown className="mr-2 size-3.5 text-muted-foreground" />
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest First</SelectItem>
                  <SelectItem value="oldest">Oldest First</SelectItem>
                  <SelectItem value="title">Title A-Z</SelectItem>
                </SelectContent>
              </Select>

              <div className="relative w-full md:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input 
                  placeholder="Search assessments..." 
                  className="pl-10" 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-4">
              <Skeleton className="h-10 w-full rounded-md" />
              <div className="border rounded-md">
                {[1, 2, 3, 4, 5].map((i) => (
                   <div key={i} className="p-4 border-b last:border-0 flex gap-4">
                     <Skeleton className="h-12 w-full" />
                   </div>
                ))}
              </div>
            </div>
          ) : (
            <Tabs value={statusTab} onValueChange={(v) => { setStatusTab(v); setPage(1); }} className="space-y-6">
              <TabsList className="bg-muted/50 p-1">
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="DRAFT">Drafts</TabsTrigger>
                <TabsTrigger value="PUBLISHED">Published</TabsTrigger>
                <TabsTrigger value="ACTIVE">Active</TabsTrigger>
                <TabsTrigger value="CLOSED">Closed</TabsTrigger>
              </TabsList>

              <TabsContent value={statusTab}>
                <AssessmentTable items={filteredAssessments} />
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
