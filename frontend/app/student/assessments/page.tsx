// app/student/assessments/page.tsx
"use client"

import React, { useState, useEffect } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Calendar, Clock, BookOpen, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"
import { assessmentApi } from "@/lib/api/assessment"
import { Skeleton } from "@/components/ui/skeleton"

export default function StudentAssessmentsPage() {
  const [assessments, setAssessments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [filterType, setFilterType] = useState<string>("all")
  const [filterStatus, setFilterStatus] = useState<string>("all")

  useEffect(() => {
    async function load() {
      try {
        const data = await assessmentApi.getAssessments()
        // API returns AssessmentListResponse with an 'items' array
        const items = data.items || []
        setAssessments(items)
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const filteredAssessments = assessments
    .filter((ass) => {
      const matchesSearch = ass.title?.toLowerCase().includes(searchTerm.toLowerCase()) || false
      const matchesType = filterType === "all" || ass.type === filterType
      
      // Hide if window has ended (and not completed)
      const now = new Date();
      const hasEnded = ass.window_end && new Date(ass.window_end) < now;
      if (hasEnded && ass.status !== "completed") return false;

      const matchesStatus = filterStatus === "all" || ass.status === filterStatus
      return matchesSearch && matchesType && matchesStatus
    })

  const getStatusInfo = (assessment: any) => {
    const now = new Date();
    const start = assessment.window_start ? new Date(assessment.window_start) : null;
    const end = assessment.window_end ? new Date(assessment.window_end) : null;

    if (assessment.status === "completed") {
      return { label: "Completed", variant: "outline" as const, color: "border-blue-500 text-blue-500", available: false };
    }

    if (start && now < start) {
      return { 
        label: `Opens ${start.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`, 
        variant: "secondary" as const, 
        color: "bg-amber-100 text-amber-700", 
        available: false 
      };
    }

    if (end && now > end) {
      return { label: "Closed", variant: "destructive" as const, color: "", available: false };
    }

    return { label: "Available Now", variant: "default" as const, color: "bg-emerald-600 hover:bg-emerald-700", available: true };
  };

  const getTypeColor = (type: string) => {
    if (type === "CAT" || type === "summative") return "text-red-500"
    if (type === "formative" || type === "homework") return "text-emerald-500"
    return "text-amber-500"
  }

  const renderAssessmentCard = (assessment: any) => {
    const status = getStatusInfo(assessment);
    
    return (
      <Card key={assessment.id} className={cn(
        "hover:shadow-md transition-all duration-200 group",
        !status.available && "opacity-80"
      )}>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <CardTitle className="text-xl">{assessment.title}</CardTitle>
              <CardDescription className="flex items-center gap-2">
                <BookOpen className="size-4" />
                {assessment.id.slice(0, 8)}
              </CardDescription>
            </div>
            <Badge variant={status.variant} className={status.color}>
              {status.label}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
            <div className="flex items-center gap-3">
              <Calendar className="size-5 text-muted-foreground" />
              <div>
                <div className="font-medium">
                  {assessment.window_start 
                    ? new Date(assessment.window_start).toLocaleDateString() 
                    : "Anytime"}
                </div>
                <div className="text-muted-foreground">
                  {assessment.window_end ? `Until ${new Date(assessment.window_end).toLocaleDateString()}` : "No deadline"}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Clock className="size-5 text-muted-foreground" />
              <div>
                <div className="font-medium">{assessment.duration_minutes || 90} min</div>
                <div className="text-muted-foreground">
                  {assessment.is_closed_book ? "Closed Book" : "Open Book"} • {assessment.is_supervised ? "Supervised" : "Unsupervised"}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between md:justify-end gap-4">
              <div className="text-right">
                <div className={cn("font-semibold uppercase", getTypeColor(assessment.type))}>
                  {assessment.type}
                </div>
                <div className="text-xs text-muted-foreground">{assessment.total_marks || 100} marks</div>
              </div>

              <Button asChild={status.available} size="lg" className="font-medium" disabled={!status.available}>
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
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Assessments</h1>
          <p className="text-muted-foreground mt-1">
            All your academic assessments in one secure place
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <Input
            placeholder="Search assessments..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-80"
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
                <CardContent className="py-16 text-center">
                  <p className="text-muted-foreground">No assessments match your current filters.</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="active" className="mt-6">
          <div className="grid gap-6">
            {loading ? (
              <Skeleton className="h-32 w-full" />
            ) : filteredAssessments.length > 0 ? (
              filteredAssessments.map(renderAssessmentCard)
            ) : (
              <Card>
                <CardContent className="py-16 text-center">
                  <p className="text-muted-foreground">No active assessments.</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Quick Integrity Notice */}
      <Card className="border-amber-500/30 bg-amber-50 dark:bg-amber-950/30">
        <CardContent className="p-6 flex items-start gap-4">
          <AlertTriangle className="size-6 text-amber-600 mt-0.5" />
          <div>
            <p className="font-medium">All assessments are protected by Mindexa Integrity Guard.</p>
            <p className="text-sm text-muted-foreground mt-1">
              Fullscreen mode, tab monitoring, and activity logging are enforced on supervised assessments.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
