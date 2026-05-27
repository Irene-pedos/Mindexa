// components/mindexa/grading/group-submission-review.tsx
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
import { Input } from "@/components/ui/input";
import { 
  Users, 
  CheckCircle2, 
  Clock, 
  AlertTriangle,
  FileText,
  Activity,
  MessageSquare,
  ShieldCheck,
  Award,
  ArrowLeft,
  ChevronDown,
  Info,
  ExternalLink,
  History,
  FileBadge,
  Save
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatDistanceToNow } from "date-fns";

interface GroupSubmissionReviewProps {
  submission: any;
  onGrade: (score: number, feedback?: string) => Promise<void>;
  onRelease: () => Promise<void>;
  onAssignReassessment: () => Promise<void>;
  onClose: () => void;
}

export function GroupSubmissionReview({
  submission,
  onGrade,
  onRelease,
  onAssignReassessment,
  onClose
}: GroupSubmissionReviewProps) {
  const [score, setScore] = useState<string>(submission.score?.toString() || "");
  const [feedback, setFeedback] = useState<string>(submission.lecturer_feedback || "");
  const [isSubmitting, setIsProcessing] = useState(false);

  const handleGrade = async () => {
    const scoreNum = parseFloat(score);
    if (isNaN(scoreNum)) return;
    setIsProcessing(true);
    try {
      await onGrade(scoreNum, feedback);
    } finally {
      setIsProcessing(false);
    }
  };

  const isGraded = submission.status === "GRADED";
  const isFailed = isGraded && submission.score < (submission.assessment.passing_marks || 50);

  return (
    <div className="flex flex-col h-full bg-muted/10 animate-in fade-in slide-in-from-right-4 duration-300">
      {/* Header */}
      <div className="bg-background border-b px-8 py-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-6">
          <Button variant="ghost" size="icon-sm" onClick={onClose} className="rounded-full">
            <ArrowLeft className="size-4" />
          </Button>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold tracking-tight">{submission.group_name}</h2>
              <Badge variant="outline" className="h-5 text-[9px] font-bold uppercase bg-primary/5 text-primary border-primary/20">
                Group Submission
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground font-medium mt-0.5">
              {submission.assessment_title} • {submission.member_count} Members
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
           {isGraded ? (
              <Button 
                onClick={onRelease} 
                className="bg-emerald-600 hover:bg-emerald-700 h-9 rounded-lg text-xs font-bold gap-2 shadow-md px-6"
              >
                <CheckCircle2 className="size-3.5" />
                Release Result
              </Button>
           ) : (
              <Button 
                onClick={handleGrade} 
                disabled={!score || isSubmitting}
                className="h-9 rounded-lg text-xs font-bold gap-2 shadow-md px-6"
              >
                {isSubmitting ? <Clock className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                Confirm Shared Mark
              </Button>
           )}
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex">
        <div className="flex-1 flex flex-col min-w-0">
          <Tabs defaultValue="answers" className="flex-1 flex flex-col">
            <div className="bg-background border-b px-8">
              <TabsList className="h-12 bg-transparent gap-8 p-0">
                <TabsTrigger value="answers" className="h-full rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs font-bold uppercase tracking-widest px-0">
                  Collective Work
                </TabsTrigger>
                <TabsTrigger value="discussion" className="h-full rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs font-bold uppercase tracking-widest px-0">
                  Group Discussion
                </TabsTrigger>
                <TabsTrigger value="activity" className="h-full rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs font-bold uppercase tracking-widest px-0">
                  Participation Log
                </TabsTrigger>
              </TabsList>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-8 max-w-4xl mx-auto space-y-12 pb-32">
                
                <TabsContent value="answers" className="mt-0 focus-visible:ring-0 space-y-8">
                  {submission.questions.map((q: any, idx: number) => {
                    const answer = submission.answers.find((a: any) => a.question_id === q.id);
                    return (
                      <Card key={q.id} className="border shadow-none overflow-hidden group">
                        <CardHeader className="py-4 border-b bg-muted/10 group-hover:bg-muted/20 transition-colors">
                          <div className="flex justify-between items-start">
                             <div className="flex gap-4">
                               <span className="text-primary/40 font-black text-2xl tabular-nums leading-none">
                                 {(idx + 1).toString().padStart(2, '0')}
                               </span>
                               <div className="space-y-1">
                                 <p className="font-semibold text-[15px] leading-relaxed">{q.text}</p>
                                 <Badge variant="outline" className="h-5 text-[9px] font-bold uppercase tracking-widest bg-background">
                                   {q.marks} Marks
                                 </Badge>
                               </div>
                             </div>
                          </div>
                        </CardHeader>
                        <CardContent className="p-6 space-y-6">
                           <div className="space-y-2">
                             <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                               <ShieldCheck className="size-3 text-primary" /> 
                               Unified Response
                             </Label>
                             <div className="p-4 rounded-xl bg-muted/5 border-2 border-muted leading-relaxed text-sm font-medium">
                               {answer?.answer_content || <em className="text-muted-foreground opacity-50">No answer recorded</em>}
                             </div>
                           </div>
                           
                           {answer?.notes_content && (
                             <div className="space-y-2 pt-4 border-t border-dashed">
                               <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                                 <Info className="size-3" /> 
                                 Collaboration Notes
                               </Label>
                               <p className="text-[13px] text-muted-foreground italic px-2">
                                 &quot;{answer.notes_content}&quot;
                               </p>
                             </div>
                           )}
                        </CardContent>
                        <CardFooter className="py-2.5 px-6 border-t bg-muted/5 flex items-center justify-between">
                           {answer ? (
                             <div className="flex items-center gap-2">
                               <div className="size-6 rounded-full bg-muted flex items-center justify-center border text-[9px] font-bold text-muted-foreground">
                                 {answer.last_modified_by_name?.charAt(0)}
                               </div>
                               <span className="text-[10px] font-bold text-muted-foreground">
                                 Last edit by {answer.last_modified_by_name} • {formatDistanceToNow(new Date(answer.last_modified_at), { addSuffix: true })}
                               </span>
                             </div>
                           ) : (
                             <span className="text-[10px] italic text-muted-foreground">Not edited</span>
                           )}
                        </CardFooter>
                      </Card>
                    );
                  })}
                </TabsContent>

                <TabsContent value="discussion" className="mt-0 focus-visible:ring-0">
                  <div className="space-y-6">
                    {submission.comments.map((comment: any) => (
                      <div key={comment.id} className="flex gap-4">
                        <Avatar className="size-8 border shadow-none bg-muted">
                           <AvatarFallback className="text-[10px] font-bold">
                             {comment.student_name.substring(0, 2).toUpperCase()}
                           </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 space-y-1.5">
                           <div className="flex items-center gap-2">
                             <span className="text-xs font-black uppercase tracking-tight text-foreground/80">{comment.student_name}</span>
                             <span className="text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}</span>
                           </div>
                           <div className="p-4 rounded-2xl bg-background border shadow-sm text-sm leading-relaxed">
                             {comment.body}
                           </div>
                        </div>
                      </div>
                    ))}
                    {submission.comments.length === 0 && (
                      <div className="text-center py-20 opacity-40 space-y-3">
                         <MessageSquare className="size-12 mx-auto text-muted-foreground" />
                         <p className="text-[11px] font-bold uppercase tracking-[0.2em]">No collaborative discussion recorded</p>
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="activity" className="mt-0 focus-visible:ring-0">
                   <div className="space-y-6">
                     <div className="relative pl-6">
                        <div className="absolute left-1 top-0 bottom-0 w-0.5 bg-muted rounded-full" />
                        <div className="space-y-8">
                           {submission.activities.map((act: any) => (
                             <div key={act.id} className="relative">
                               <div className="absolute -left-6 top-1.5 size-3.5 rounded-full bg-background border-2 border-primary ring-4 ring-background" />
                               <div className="space-y-1">
                                 <p className="text-sm font-bold leading-none">
                                   <span className="uppercase tracking-tighter text-foreground">{act.student_name}</span>
                                   <span className="text-muted-foreground mx-2 font-medium capitalize">
                                     {act.activity_type.toLowerCase().replace(/_/g, " ")}
                                   </span>
                                 </p>
                                 <p className="text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(act.created_at), { addSuffix: true })}</p>
                               </div>
                             </div>
                           ))}
                        </div>
                     </div>
                   </div>
                </TabsContent>

              </div>
            </ScrollArea>
          </Tabs>
        </div>

        {/* Sidebar: Grading Controls */}
        <div className="w-96 border-l bg-background p-8 space-y-8 overflow-y-auto">
          <div className="space-y-6">
             <div className="flex items-center gap-2">
               <Award className="size-5 text-primary" />
               <h3 className="font-bold uppercase tracking-widest text-sm">Evaluation Control</h3>
             </div>

             <div className="space-y-4 pt-4 border-t">
               <div className="space-y-2">
                 <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Assign Shared Score (%)</Label>
                 <div className="relative group">
                   <Input 
                     type="number"
                     value={score}
                     onChange={(e) => setScore(e.target.value)}
                     className="h-16 text-3xl font-black text-center pr-12 rounded-2xl border-2 focus:border-primary/50 shadow-sm"
                     placeholder="0"
                     min={0}
                     max={100}
                   />
                   <span className="absolute right-6 top-1/2 -translate-y-1/2 text-muted-foreground font-black text-xl">%</span>
                 </div>
                 <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-tight text-muted-foreground px-1">
                   <span>Scale: 0 - 100</span>
                   <span className="text-primary">Target: {submission.assessment.total_marks} Marks</span>
                 </div>
               </div>

               <div className="space-y-2">
                 <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Lecturer Feedback</Label>
                 <Textarea 
                   value={feedback}
                   onChange={(e) => setFeedback(e.target.value)}
                   className="min-h-[150px] text-sm leading-relaxed p-4 bg-muted/5 border-2 rounded-2xl resize-none"
                   placeholder="Provide qualitative feedback for the entire group..."
                 />
               </div>
             </div>

             {isGraded && (
               <div className="space-y-4 pt-6 border-t animate-in zoom-in-95">
                 <div className={cn(
                   "p-4 rounded-2xl border-2 flex items-center gap-4",
                   isFailed ? "bg-destructive/5 border-destructive/20" : "bg-emerald-50 border-emerald-100"
                 )}>
                   <div className={cn(
                     "size-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm",
                     isFailed ? "bg-destructive text-white" : "bg-emerald-500 text-white"
                   )}>
                      <FileBadge className="size-6" />
                   </div>
                   <div>
                      <p className="text-[10px] font-black uppercase tracking-widest opacity-60 leading-none">Result Finalized</p>
                      <p className={cn(
                        "text-lg font-black mt-1",
                        isFailed ? "text-destructive" : "text-emerald-700"
                      )}>
                        {isFailed ? "FAILURE" : "PASSED"}
                      </p>
                   </div>
                 </div>

                 {isFailed && (
                   <Card className="border-2 border-amber-200 bg-amber-50/50 shadow-none overflow-hidden">
                     <CardHeader className="py-3 px-4 border-b border-amber-100 flex-row items-center gap-2 bg-amber-100/30">
                        <AlertTriangle className="size-3.5 text-amber-600" />
                        <CardTitle className="text-[10px] font-black uppercase tracking-widest text-amber-800">Remedial Action</CardTitle>
                     </CardHeader>
                     <CardContent className="p-4 space-y-3">
                        <p className="text-[11px] text-amber-900 leading-relaxed font-medium">
                          This group has scored below the passing mark. You can assign a reassessment attempt.
                        </p>
                        <Button 
                          onClick={onAssignReassessment} 
                          className="w-full bg-amber-600 hover:bg-amber-700 h-10 rounded-xl text-[10px] font-black uppercase tracking-widest gap-2 shadow-md"
                        >
                          <History className="size-3.5" />
                          Assign Reassessment
                        </Button>
                     </CardContent>
                   </Card>
                 )}
               </div>
             )}
          </div>

          <div className="pt-8 mt-auto border-t">
             <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-xl border">
                <Users className="size-4 text-muted-foreground shrink-0" />
                <p className="text-[10px] text-muted-foreground font-medium leading-relaxed">
                  Grades assigned here are automatically reflected in the academic records of all <strong>{submission.member_count} members</strong>.
                </p>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
