"use client";

import React, { useState, useEffect } from "react";
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
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import Link from "next/link";
import { assessmentApi } from "@/lib/api/assessment";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function ManageAssessmentsPage() {
  const [assessments, setAssessments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  const fetchAssessments = async () => {
    setLoading(true);
    try {
      const response = await assessmentApi.getAssessments();
      setAssessments(response.items || []);
    } catch (err: any) {
      toast.error(err.message || "Failed to load assessments");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAssessments();
  }, []);

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

  const AssessmentTable = ({ items }: { items: any[] }) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Title</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Marks</TableHead>
          <TableHead>Schedule / Window</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.length === 0 ? (
          <TableRow>
            <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
              No assessments found in this category.
            </TableCell>
          </TableRow>
        ) : (
          items.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="font-medium">
                <div>{item.title}</div>
                <div className="text-xs text-muted-foreground font-normal">
                  {item.subject || "No subject"} • {item.target_class || "No class"}
                </div>
              </TableCell>
              <TableCell>
                <Badge variant="outline" className="text-[10px] font-bold uppercase">
                  {item.assessment_type}
                </Badge>
              </TableCell>
              <TableCell>{item.total_marks} Marks</TableCell>
              <TableCell>
                {item.window_start ? (
                  <div className="text-xs space-y-1">
                    <div className="flex items-center gap-1">
                      <Calendar className="size-3" />
                      {new Date(item.window_start).toLocaleDateString()}
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="size-3" />
                      {new Date(item.window_start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
            <CardTitle>Your Assessments</CardTitle>
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
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Loader2 className="size-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Loading assessments...</p>
            </div>
          ) : (
            <Tabs defaultValue="all" className="space-y-6">
              <TabsList className="bg-muted/50 p-1">
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="DRAFT">Drafts</TabsTrigger>
                <TabsTrigger value="PUBLISHED">Published</TabsTrigger>
                <TabsTrigger value="ACTIVE">Active</TabsTrigger>
                <TabsTrigger value="CLOSED">Closed</TabsTrigger>
              </TabsList>

              <TabsContent value="all">
                <AssessmentTable items={filteredAssessments} />
              </TabsContent>
              <TabsContent value="DRAFT">
                <AssessmentTable items={filteredAssessments.filter(a => a.status === 'DRAFT')} />
              </TabsContent>
              <TabsContent value="PUBLISHED">
                <AssessmentTable items={filteredAssessments.filter(a => a.status === 'PUBLISHED')} />
              </TabsContent>
              <TabsContent value="ACTIVE">
                <AssessmentTable items={filteredAssessments.filter(a => a.status === 'ACTIVE')} />
              </TabsContent>
              <TabsContent value="CLOSED">
                <AssessmentTable items={filteredAssessments.filter(a => a.status === 'CLOSED')} />
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
