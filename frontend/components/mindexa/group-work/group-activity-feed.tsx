// components/mindexa/group-work/group-activity-feed.tsx
"use client";

import React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { 
  Activity, 
  User as UserIcon, 
  Clock, 
  FileEdit, 
  MessageSquare, 
  CheckCircle2, 
  XCircle,
  ArrowRight,
  ShieldCheck,
  Zap
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ActivityLog {
  id: string;
  student_id: string;
  student_name: string;
  activity_type: string;
  details?: any;
  created_at: string;
}

interface GroupActivityFeedProps {
  activities: ActivityLog[];
}

export function GroupActivityFeed({ activities }: GroupActivityFeedProps) {
  const getIcon = (type: string) => {
    switch (type.toUpperCase()) {
      case "ANSWER_EDITED": return <FileEdit className="size-3 text-blue-500" />;
      case "COMMENT_ADDED": return <MessageSquare className="size-3 text-primary" />;
      case "SUBMISSION_APPROVED": return <CheckCircle2 className="size-3 text-emerald-500" />;
      case "SUBMISSION_REJECTED": return <XCircle className="size-3 text-destructive" />;
      case "SUBMISSION_FINALIZED": return <ShieldCheck className="size-3 text-primary" />;
      default: return <Zap className="size-3 text-muted-foreground" />;
    }
  };

  const getLabel = (type: string) => {
    return type.replace(/_/g, " ").toLowerCase();
  };

  return (
    <Card className="border shadow-none h-full flex flex-col">
      <CardHeader className="py-4 px-5 border-b bg-muted/10">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
            <Activity className="size-4 text-primary" />
            Live Audit Trail
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="flex-1 p-0 overflow-hidden">
        <ScrollArea className="h-full">
           <div className="p-4 relative">
             <div className="absolute left-6 top-6 bottom-6 w-px bg-border/50 z-0" />
             <div className="space-y-6 relative z-10">
                {activities.length === 0 ? (
                  <div className="py-20 text-center space-y-2 opacity-40">
                    <Activity className="size-10 mx-auto text-muted-foreground" />
                    <p className="text-[10px] font-bold uppercase tracking-widest">No activity recorded</p>
                  </div>
                ) : (
                  activities.map((activity, idx) => (
                    <div key={activity.id} className="flex gap-4 group">
                      <div className="size-5 rounded-full bg-background border-2 border-muted flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                        {getIcon(activity.activity_type)}
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center justify-between gap-4">
                           <p className="text-[11px] leading-none">
                             <span className="font-black text-foreground uppercase tracking-tight">{activity.student_name}</span>
                             <span className="text-muted-foreground mx-1.5">•</span>
                             <span className="text-muted-foreground font-medium capitalize">{getLabel(activity.activity_type)}</span>
                           </p>
                           <span className="text-[9px] text-muted-foreground tabular-nums whitespace-nowrap">
                             {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
                           </span>
                        </div>
                        {activity.details?.question_title && (
                          <div className="p-2 rounded-lg bg-muted/30 text-[10px] text-muted-foreground border border-transparent group-hover:border-border/50 transition-colors truncate">
                             Target: {activity.details.question_title}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
             </div>
           </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
