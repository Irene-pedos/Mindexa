// components/mindexa/grading/group-submission-list.tsx
"use client";

import React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Users, 
  Eye, 
  CheckCircle2, 
  Clock, 
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  RefreshCcw,
  MessageSquare
} from "lucide-react";
import { cn } from "@/lib/utils";

interface GroupSubmissionSummary {
  id: string; // submission_id
  group_id: string;
  group_name: string;
  assessment_id: string;
  assessment_title: string;
  member_count: number;
  status: "DRAFT" | "READY_FOR_APPROVAL" | "APPROVED" | "SUBMITTED" | "GRADED" | "APPEALED" | "REASSESSMENT_ASSIGNED";
  score?: number;
  max_score?: number;
  submitted_at?: string;
  has_active_appeal: boolean;
}

interface GroupSubmissionListProps {
  submissions: GroupSubmissionSummary[];
  onReview: (submission: GroupSubmissionSummary) => void;
  loading?: boolean;
}

export function GroupSubmissionList({ 
  submissions, 
  onReview, 
  loading 
}: GroupSubmissionListProps) {
  const getStatusBadge = (status: string, hasAppeal: boolean) => {
    if (hasAppeal) return <Badge variant="destructive" className="bg-red-50 text-red-700 border-red-200 gap-1"><AlertTriangle className="size-3" /> Appealed</Badge>;
    
    switch (status) {
      case "SUBMITTED":
        return <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200">Pending Review</Badge>;
      case "GRADED":
        return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200"><CheckCircle2 className="size-3 mr-1" /> Graded</Badge>;
      case "REASSESSMENT_ASSIGNED":
        return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Reassessment</Badge>;
      case "APPROVED":
        return <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">Ready to Submit</Badge>;
      default:
        return <Badge variant="ghost" className="bg-muted text-muted-foreground italic">{status.toLowerCase().replace(/_/g, " ")}</Badge>;
    }
  };

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <Table>
        <TableHeader className="bg-muted/30">
          <TableRow>
            <TableHead className="w-[200px] text-[10px] font-black uppercase tracking-widest px-6">Group Identity</TableHead>
            <TableHead className="text-[10px] font-black uppercase tracking-widest">Members</TableHead>
            <TableHead className="text-[10px] font-black uppercase tracking-widest">Submission Status</TableHead>
            <TableHead className="text-[10px] font-black uppercase tracking-widest">Mark / Grade</TableHead>
            <TableHead className="text-[10px] font-black uppercase tracking-widest text-right px-6">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={5} className="py-20 text-center">
                 <RefreshCcw className="size-8 animate-spin mx-auto text-primary opacity-20 mb-3" />
                 <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Synchronizing Queue...</p>
              </TableCell>
            </TableRow>
          ) : submissions.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="py-20 text-center">
                 <Users className="size-10 mx-auto text-muted-foreground opacity-20 mb-3" />
                 <p className="text-sm font-medium text-muted-foreground">No group submissions found in this category.</p>
              </TableCell>
            </TableRow>
          ) : (
            submissions.map((sub) => (
              <TableRow key={sub.id} className="group hover:bg-muted/5 transition-colors">
                <TableCell className="px-6">
                   <div className="flex items-center gap-3">
                      <div className="size-8 rounded-lg bg-primary/5 flex items-center justify-center border border-primary/10 text-primary font-bold text-xs shadow-sm">
                        {sub.group_name.charAt(0)}
                      </div>
                      <div className="flex flex-col">
                         <span className="text-sm font-bold text-foreground leading-none">{sub.group_name}</span>
                         <span className="text-[10px] text-muted-foreground mt-1 truncate max-w-[150px]">{sub.assessment_title}</span>
                      </div>
                   </div>
                </TableCell>
                <TableCell>
                   <div className="flex items-center gap-1.5 text-xs font-medium">
                      <Users className="size-3.5 text-muted-foreground" />
                      {sub.member_count} Members
                   </div>
                </TableCell>
                <TableCell>
                   {getStatusBadge(sub.status, sub.has_active_appeal)}
                </TableCell>
                <TableCell>
                   {sub.status === "GRADED" || sub.status === "REASSESSMENT_ASSIGNED" ? (
                      <div className="flex flex-col">
                        <span className="text-sm font-black tabular-nums text-emerald-600">{sub.score} / {sub.max_score}</span>
                        <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-tighter">Verified</span>
                      </div>
                   ) : (
                      <span className="text-xs text-muted-foreground font-medium italic opacity-60">Pending</span>
                   )}
                </TableCell>
                <TableCell className="text-right px-6">
                   <Button 
                     onClick={() => onReview(sub)}
                     size="sm" 
                     className="h-8 rounded-lg text-[10px] font-black uppercase tracking-widest gap-2"
                   >
                     {sub.status === "GRADED" ? "Review Result" : "Evaluate Work"}
                     <ArrowRight className="size-3" />
                   </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
