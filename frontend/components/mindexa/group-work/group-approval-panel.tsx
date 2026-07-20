// components/mindexa/group-work/group-approval-panel.tsx
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
import { Label } from "@/components/ui/label";
import { 
  ShieldCheck, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  Info,
  ArrowRight,
  Loader2,
  FileCheck
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

interface GroupApprovalPanelProps {
  myStatus: "PENDING" | "APPROVED" | "REJECTED" | "CHANGES_REQUESTED";
  approvalCount: number;
  totalMembers: number;
  onApprove: (note?: string) => Promise<void>;
  onReject: (note: string) => Promise<void>;
  onSubmit: () => Promise<void>;
  isLeader: boolean;
  canSubmit: boolean;
  participationSatisfied: boolean;
}

export function GroupApprovalPanel({
  myStatus,
  approvalCount,
  totalMembers,
  onApprove,
  onReject,
  onSubmit,
  isLeader,
  canSubmit,
  participationSatisfied
}: GroupApprovalPanelProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);

  const handleApprove = async () => {
    setIsProcessing(true);
    try {
      await onApprove();
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!rejectNote.trim()) return;
    setIsProcessing(true);
    try {
      await onReject(rejectNote);
      setShowRejectForm(false);
    } finally {
      setIsProcessing(false);
    }
  };

  const percentage = (approvalCount / totalMembers) * 100;

  return (
    <Card className="border shadow-none overflow-hidden h-full flex flex-col">
      <CardHeader className="py-4 px-5 border-b bg-primary/5">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-primary text-primary-foreground shadow-sm">
            <ShieldCheck className="size-4" />
          </div>
          <CardTitle className="text-sm font-bold uppercase tracking-wider">Submission Gate</CardTitle>
        </div>
      </CardHeader>
      
      <CardContent className="p-6 space-y-6 flex-1">
        <div className="space-y-2">
           <div className="flex justify-between items-end mb-1">
             <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Approval Progress</span>
             <span className="text-xs font-bold tabular-nums">{approvalCount} / {totalMembers}</span>
           </div>
           <Progress value={percentage} className="h-2" />
        </div>

        {!participationSatisfied ? (
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex gap-3">
             <Info className="size-4 text-amber-600 shrink-0 mt-0.5" />
             <div className="space-y-1">
               <p className="text-[11px] font-bold text-amber-900 uppercase">Participation Required</p>
               <p className="text-[10px] text-amber-800 leading-relaxed">
                 You must make at least one meaningful contribution (edit or comment) before you can approve the submission.
               </p>
             </div>
          </div>
        ) : myStatus === "PENDING" ? (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
             <div className="p-4 rounded-xl bg-muted/30 border border-border/50 text-center space-y-2">
               <p className="text-xs font-semibold">Ready to sign off?</p>
               <p className="text-[10px] text-muted-foreground leading-relaxed">
                 By approving, you confirm that you have reviewed the group&apos;s responses and agree to submit them as final.
               </p>
             </div>
             
             {showRejectForm ? (
               <div className="space-y-3 p-4 border rounded-xl bg-destructive/5 border-destructive/10 animate-in zoom-in-95">
                 <Label className="text-[10px] font-bold uppercase text-destructive">Reason for Changes</Label>
                 <textarea 
                   value={rejectNote}
                   onChange={(e) => setRejectNote(e.target.value)}
                   className="w-full h-20 text-xs p-3 rounded-lg border-2 focus:border-destructive/50 bg-background resize-none"
                   placeholder="Describe what needs to be fixed..."
                 />
                 <div className="flex gap-2">
                   <Button variant="ghost" size="sm" onClick={() => setShowRejectForm(false)} className="flex-1 h-8 text-[10px] font-bold uppercase">Cancel</Button>
                   <Button variant="destructive" size="sm" onClick={handleReject} disabled={isProcessing || !rejectNote.trim()} className="flex-1 h-8 text-[10px] font-bold uppercase gap-1.5">
                     {isProcessing ? <Loader2 className="size-3 animate-spin" /> : <XCircle className="size-3" />}
                     Request Changes
                   </Button>
                 </div>
               </div>
             ) : (
               <div className="flex gap-3">
                 <Button variant="outline" size="sm" onClick={() => setShowRejectForm(true)} className="flex-1 h-10 text-[10px] font-bold uppercase gap-1.5 rounded-xl border-2">
                   <XCircle className="size-3.5 text-destructive" />
                   Request Changes
                 </Button>
                 <Button onClick={handleApprove} disabled={isProcessing} className="flex-1 h-10 text-[10px] font-bold uppercase gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 shadow-md">
                   {isProcessing ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
                   Approve All
                 </Button>
               </div>
             )}
          </div>
        ) : (
          <div className="p-6 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center text-center gap-3 bg-muted/5">
             {myStatus === "APPROVED" ? (
               <>
                 <div className="size-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-600">
                    <CheckCircle2 className="size-6" />
                 </div>
                 <div className="space-y-1">
                    <p className="text-xs font-bold uppercase tracking-widest text-emerald-700">You Approved</p>
                    <p className="text-[10px] text-muted-foreground">Waiting for remaining members to sign off.</p>
                 </div>
               </>
             ) : (
               <>
                 <div className="size-10 rounded-full bg-destructive/10 flex items-center justify-center text-destructive">
                    <AlertTriangle className="size-6" />
                 </div>
                 <div className="space-y-1">
                    <p className="text-xs font-bold uppercase tracking-widest text-destructive">Changes Requested</p>
                    <p className="text-[10px] text-muted-foreground">You requested updates. The group must fix the issues before you can re-approve.</p>
                 </div>
                 <Button variant="outline" size="sm" onClick={() => handleApprove()} className="mt-2 h-7 text-[9px] font-bold uppercase tracking-widest rounded-lg">Withdraw Request</Button>
               </>
             )}
          </div>
        )}
      </CardContent>

      <CardFooter className="p-4 border-t bg-muted/10">
        <div className="w-full space-y-4">
           {canSubmit && isLeader ? (
             <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
               <div className="flex items-center gap-2 p-3 bg-primary/5 rounded-xl border border-primary/20">
                  <FileCheck className="size-4 text-primary shrink-0" />
                  <p className="text-[10px] font-medium leading-relaxed">
                    <strong>Ready to Submit:</strong> As the group leader, you can now finalize the assessment. This action is irreversible.
                  </p>
               </div>
               <Button onClick={onSubmit} disabled={isProcessing} className="w-full h-12 rounded-xl text-xs font-black uppercase tracking-[0.2em] shadow-lg group">
                 {isProcessing ? <Loader2 className="size-4 animate-spin" /> : "Finalize Submission"}
                 <ArrowRight className="size-4 ml-2 group-hover:translate-x-1 transition-transform" />
               </Button>
             </div>
           ) : canSubmit ? (
              <div className="p-4 rounded-xl border-2 border-emerald-500/20 bg-emerald-50/30 text-center">
                 <p className="text-xs font-bold text-emerald-800 uppercase tracking-widest mb-1">Awaiting Leader</p>
                 <p className="text-[10px] text-emerald-700 font-medium">All approvals received. Waiting for the group leader to hit the final submit button.</p>
              </div>
           ) : (
             <Button disabled className="w-full h-12 rounded-xl text-xs font-black uppercase tracking-[0.2em] bg-muted text-muted-foreground opacity-50 cursor-not-allowed">
               Submission Locked
             </Button>
           )}
        </div>
      </CardFooter>
    </Card>
  );
}
