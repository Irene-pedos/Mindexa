// components/mindexa/group-work/group-intro-card.tsx
"use client";

import React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Users, 
  Calendar as CalendarIcon, 
  Clock, 
  FileText, 
  BookOpen, 
  User as UserIcon,
  ShieldAlert
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface GroupIntroCardProps {
  assessment: any;
  groupName: string;
}

export function GroupIntroCard({ assessment, groupName }: GroupIntroCardProps) {
  const now = new Date();
  const end = assessment.window_end ? new Date(assessment.window_end) : null;
  const isUrgent = end && (end.getTime() - now.getTime()) < 24 * 60 * 60 * 1000;

  return (
    <Card className="border shadow-none overflow-hidden">
      <CardHeader className="bg-primary/5 border-b py-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-primary text-primary-foreground shadow-sm">
                <Users className="size-5" />
              </div>
              <div>
                <CardTitle className="text-2xl font-bold tracking-tight">{assessment.title}</CardTitle>
                <CardDescription className="flex items-center gap-2 text-sm mt-0.5">
                  <BookOpen className="size-3.5" /> {assessment.course_name} ({assessment.course_code}) {assessment.academic_year && `• ${assessment.academic_year}`}
                </CardDescription>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
             <Badge variant="secondary" className="h-7 px-3 bg-background border shadow-none text-[11px] font-bold uppercase tracking-wider">
               Group: {groupName}
             </Badge>
             <Badge variant="outline" className={cn(
               "h-7 px-3 border shadow-none text-[11px] font-bold uppercase tracking-wider",
               isUrgent ? "text-destructive border-destructive/20 bg-destructive/5 animate-pulse" : "text-primary border-primary/20 bg-primary/5"
             )}>
               <Clock className="size-3 mr-1.5" /> 
               {end ? `Deadline: ${format(end, "MMM d, HH:mm")}` : "No deadline"}
             </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
          <div className="md:col-span-8 space-y-6">
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <FileText className="size-3.5" /> Assessment Overview
              </h3>
              <p className="text-sm leading-relaxed text-foreground/80">
                {assessment.description || "This is a collaborative assessment. You must work with your group members to provide a unified submission. Every member is required to participate in the workspace."}
              </p>
            </div>

            {assessment.instructions && (
              <div className="p-4 rounded-2xl bg-muted/30 border border-border/50 space-y-3">
                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Lecturer Instructions</h4>
                <p className="text-[13px] leading-relaxed italic text-muted-foreground">
                  &quot;{assessment.instructions}&quot;
                </p>
              </div>
            )}
          </div>

          <div className="md:col-span-4 space-y-6 border-l pl-8">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block">Assigned By</span>
                <div className="flex items-center gap-2.5">
                   <div className="size-8 rounded-full bg-muted flex items-center justify-center border text-muted-foreground">
                     <UserIcon className="size-4" />
                   </div>
                   <div className="text-sm font-semibold">{assessment.lecturer_name || "Course Lecturer"}</div>
                </div>
              </div>

              <div className="pt-4 border-t space-y-3">
                 <div className="flex items-center justify-between text-sm">
                   <span className="text-muted-foreground">Total Marks</span>
                   <span className="font-bold">{assessment.total_marks}</span>
                 </div>
                 <div className="flex items-center justify-between text-sm">
                   <span className="text-muted-foreground">Grading Mode</span>
                   <Badge variant="outline" className="text-[9px] font-bold uppercase tracking-widest px-1.5 h-4">Shared Mark</Badge>
                 </div>
                 {assessment.require_all_member_approval && (
                    <div className="flex items-center gap-2 text-[10px] text-amber-600 font-bold uppercase mt-2">
                      <ShieldAlert className="size-3" /> All members must approve
                    </div>
                 )}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
