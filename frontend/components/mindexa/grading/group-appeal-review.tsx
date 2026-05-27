// components/mindexa/grading/group-appeal-review.tsx
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { 
  Scale, 
  MessageSquare, 
  CheckCircle2, 
  XCircle,
  Clock,
  User as UserIcon,
  ShieldAlert,
  ArrowRight,
  Gavel,
  History,
  Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

interface GroupAppealReviewProps {
  appeal: any;
  onResolve: (approve: boolean, decision: string, feedback?: string) => Promise<void>;
}

export function GroupAppealReview({
  appeal,
  onResolve
}: GroupAppealReviewProps) {
  const [decision, setDecision] = useState("");
  const [feedback, setFeedback] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const handleResolve = async (approve: boolean) => {
    if (!decision.trim() || isProcessing) return;
    setIsProcessing(true);
    try {
      await onResolve(approve, decision, feedback);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Card className="border-2 border-primary/10 shadow-none overflow-hidden h-full flex flex-col">
      <CardHeader className="py-5 px-6 border-b bg-muted/20">
        <div className="flex items-center justify-between">
           <div className="flex items-center gap-2">
             <div className="p-2 rounded-xl bg-primary text-primary-foreground shadow-sm">
               <Scale className="size-5" />
             </div>
             <div>
               <CardTitle className="text-base font-bold uppercase tracking-tight">Active Group Appeal</CardTitle>
               <CardDescription className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">
                 Formal review request from {appeal.group_name}
               </CardDescription>
             </div>
           </div>
           <Badge variant="outline" className="h-6 bg-background text-[10px] font-black uppercase tracking-widest px-2">
             Ref: {appeal.id.substring(0, 8)}
           </Badge>
        </div>
      </CardHeader>

      <CardContent className="p-6 space-y-8 flex-1">
        <div className="space-y-3">
          <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground block">Grounds for Appeal</Label>
          <div className="p-5 rounded-2xl bg-background border shadow-sm relative italic text-sm leading-relaxed text-foreground/80">
             &quot;{appeal.statement}&quot;
             <div className="absolute -top-3 -left-3 size-8 rounded-full bg-muted border flex items-center justify-center text-muted-foreground">
                <MessageSquare className="size-4" />
             </div>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground px-1 font-medium">
             <Clock className="size-3" />
             Initiated {formatDistanceToNow(new Date(appeal.created_at), { addSuffix: true })} by {appeal.initiated_by_name}
          </div>
        </div>

        <div className="space-y-4 pt-6 border-t border-dashed">
          <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground block">Member Support</Label>
          <div className="grid grid-cols-2 gap-3">
             {appeal.approvals.map((app: any, i: number) => (
               <div key={i} className="flex items-center justify-between p-2.5 rounded-xl border bg-muted/5">
                  <div className="flex items-center gap-2 overflow-hidden">
                     <div className="size-6 rounded-full bg-background border flex items-center justify-center text-[10px] font-bold shrink-0">
                        {app.student_name.charAt(0)}
                     </div>
                     <span className="text-[11px] font-bold truncate">{app.student_name}</span>
                  </div>
                  {app.status === "APPROVED" ? (
                    <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
                  ) : (
                    <Clock className="size-3.5 text-muted-foreground shrink-0" />
                  )}
               </div>
             ))}
          </div>
        </div>

        <div className="space-y-6 pt-6 border-t border-primary/10 bg-primary/5 -mx-6 px-6">
           <div className="space-y-4">
              <div className="flex items-center gap-2">
                 <Gavel className="size-4 text-primary" />
                 <h4 className="text-xs font-black uppercase tracking-widest text-primary">Final Resolution</h4>
              </div>

              <div className="space-y-2">
                 <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Decision Summary</Label>
                 <Textarea 
                   value={decision}
                   onChange={(e) => setDecision(e.target.value)}
                   className="min-h-[100px] text-sm bg-background border-2 rounded-xl"
                   placeholder="Enter the official verdict for this appeal..."
                 />
              </div>

              <div className="space-y-2">
                 <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Constructive Feedback (Optional)</Label>
                 <Textarea 
                   value={feedback}
                   onChange={(e) => setFeedback(e.target.value)}
                   className="min-h-[80px] text-xs bg-background border-2 rounded-xl"
                   placeholder="Additional pedagogical context for the group..."
                 />
              </div>
           </div>
        </div>
      </CardContent>

      <CardFooter className="p-6 border-t bg-muted/20 flex gap-4">
         <Button 
           variant="outline" 
           onClick={() => handleResolve(false)}
           disabled={isProcessing || !decision.trim()}
           className="flex-1 h-12 rounded-xl text-xs font-black uppercase tracking-widest gap-2 border-2 border-destructive/20 text-destructive hover:bg-destructive/5"
         >
           {isProcessing ? <Loader2 className="size-4 animate-spin" /> : <XCircle className="size-4" />}
           Dismiss Appeal
         </Button>
         <Button 
           onClick={() => handleResolve(true)}
           disabled={isProcessing || !decision.trim()}
           className="flex-1 h-12 rounded-xl text-xs font-black uppercase tracking-widest gap-2 bg-emerald-600 hover:bg-emerald-700 shadow-lg"
         >
           {isProcessing ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
           Grant Appeal
         </Button>
      </CardFooter>
    </Card>
  );
}
