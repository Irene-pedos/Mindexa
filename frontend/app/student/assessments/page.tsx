// app/student/assessments/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar, Clock, BookOpen, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { assessmentApi } from "@/lib/api/assessment";
import { Skeleton } from "@/components/ui/skeleton";

export default function StudentAssessmentsPage() {
  const [assessments, setAssessments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  useEffect(() => {
    async function load() {
      try {
        const data = await assessmentApi.getAssessments();
        // API returns AssessmentListResponse with an 'items' array
        const items = data.items || [];
        setAssessments(items);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const filteredAssessments = assessments.filter((ass) => {
    const matchesSearch =
      ass.title?.toLowerCase().includes(searchTerm.toLowerCase()) || false;
    const matchesType =
      filterType === "all" || ass.assessment_type === filterType.toUpperCase();

    // Hide if window has ended (and not completed)
    const now = new Date();
    const hasEnded = ass.window_end && new Date(ass.window_end) < now;
    if (hasEnded && ass.status !== "COMPLETED") return false;

    const matchesStatus =
      filterStatus === "all" || ass.status === filterStatus.toUpperCase();
    return matchesSearch && matchesType && matchesStatus;
  });

  const getStatusInfo = (assessment: any) => {
    const now = new Date();
    const start = assessment.window_start
      ? new Date(assessment.window_start)
      : null;
    const end = assessment.window_end ? new Date(assessment.window_end) : null;

    if (assessment.status === "COMPLETED") {
      return {
        label: "Completed",
        variant: "outline" as const,
        color: "",
        available: false,
      };
    }

    if (start && now < start) {
      return {
        label: `Opens ${start.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`,
        variant: "secondary" as const,
        color: "",
        available: false,
      };
    }

    if (end && now > end) {
      return {
        label: "Closed",
        variant: "destructive" as const,
        color: "",
        available: false,
      };
    }

    return {
      label: "Available Now",
      variant: "default" as const,
      color: "",
      available: true,
    };
  };

  const getTypeColor = (type: string) => {
    const t = type?.toLowerCase();
    if (t === "cat" || t === "summative") return "text-primary font-bold";
    return "text-muted-foreground font-medium";
  };

  const renderAssessmentCard = (assessment: any) => {
    const status = getStatusInfo(assessment);

    return (
      <Card
        key={assessment.id}
        className={cn(
          "hover:shadow-md transition-all duration-200 group",
          !status.available && "opacity-80",
        )}
      >
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <CardTitle className="text-lg font-medium tracking-tight">
                {assessment.title}
              </CardTitle>
              <CardDescription className="flex items-center gap-2 text-xs">
                <BookOpen className="size-3.5" />
                {assessment.course_name ? `${assessment.course_name} (${assessment.course_code})` : "General Assessment"}
              </CardDescription>
            </div>
            <Badge variant={status.variant} className={status.color}>
              {status.label}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="flex items-center gap-3">
              <Calendar className="size-5 text-muted-foreground" />
              <div>
                <div className="font-medium">
                  {assessment.window_start
                    ? `${new Date(assessment.window_start).toLocaleDateString()} ${new Date(assessment.window_start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                    : "Anytime"}
                </div>
                <div className="text-muted-foreground">
                  {assessment.window_end
                    ? `Until ${new Date(assessment.window_end).toLocaleDateString()} ${new Date(assessment.window_end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                    : "No deadline"}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Clock className="size-5 text-muted-foreground" />
              <div>
                <div className="font-medium">
                  {assessment.duration_minutes || 90} min
                </div>
                <div className="text-muted-foreground">
                  {assessment.is_closed_book ? "Closed Book" : "Open Book"} •{" "}
                  {assessment.is_supervised ? "Supervised" : "Unsupervised"}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between md:justify-end gap-4">
              <div className="text-right">
                <div
                  className={cn(
                    "font-semibold uppercase",
                    getTypeColor(assessment.assessment_type),
                  )}
                >
                  {assessment.assessment_type}
                </div>
                <div className="text-xs text-muted-foreground">
                  {assessment.total_marks || 100} marks
                </div>
              </div>

              <Button
                asChild={status.available}
                size="default"
                className="font-medium px-6"
                disabled={!status.available}
              >
                {status.available ? (
                  <Link href={`/student/assessments/${assessment.id}/take`}>
                    Start Assessment
                  </Link>
                ) : (
                  <span>Locked</span>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Assessments</h1>
          <p className="text-muted-foreground mt-1">
            All your academic assessments in one secure place
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Input
            placeholder="Search assessments..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-72"
          />
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="CAT">CAT</SelectItem>
              <SelectItem value="formative">Formative</SelectItem>
              <SelectItem value="summative">Summative</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs defaultValue="all" className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-sm">
          <TabsTrigger value="all">All Assessments</TabsTrigger>
          <TabsTrigger value="active">Active</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-6">
          <div className="grid gap-6">
            {loading ? (
              <div className="space-y-4">
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            ) : filteredAssessments.length > 0 ? (
              filteredAssessments.map(renderAssessmentCard)
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground">
                    No assessments match your current filters.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="active" className="mt-6">
          <div className="grid gap-6">
            {loading ? (
              <Skeleton className="h-32 w-full" />
            ) : filteredAssessments.filter((a) => a.status === "ACTIVE")
                .length > 0 ? (
              filteredAssessments
                .filter((a) => a.status === "ACTIVE")
                .map(renderAssessmentCard)
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground">
                    No active assessments.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Quick Integrity Notice */}
      <Card className="border-border bg-muted/30">
        <CardContent className="p-4 flex items-start gap-3">
          <AlertTriangle className="size-5 text-amber-600 mt-0.5" />
          <div>
            <p className="font-medium">
              All assessments are protected by Mindexa Integrity Guard.
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Fullscreen mode, tab monitoring, and activity logging are enforced
              on supervised assessments.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
