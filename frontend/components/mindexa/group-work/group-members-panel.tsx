// components/mindexa/group-work/group-members-panel.tsx
"use client";

import React from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  Users, 
  CheckCircle2, 
  Clock, 
  Activity,
  ShieldCheck,
  AlertCircle
} from "lucide-react";
import { cn } from "@/lib/utils";

interface GroupMember {
  id: string;
  name: string;
  avatar_url?: string;
  is_leader: boolean;
  participation_count: number;
  approval_status: "PENDING" | "APPROVED" | "REJECTED" | "CHANGES_REQUESTED";
  is_online?: boolean;
}

interface GroupMembersPanelProps {
  members: GroupMember[];
  requireApproval: boolean;
}

export function GroupMembersPanel({ members, requireApproval }: GroupMembersPanelProps) {
  return (
    <Card className="border shadow-none h-full flex flex-col">
      <CardHeader className="py-4 px-5 border-b bg-muted/10">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
            <Users className="size-4 text-primary" />
            Group Members
          </CardTitle>
          <Badge variant="secondary" className="h-5 text-[10px] tabular-nums">
            {members.length} Total
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-4 flex-1">
        <div className="space-y-3">
          {members.map((member) => (
            <div 
              key={member.id}
              className={cn(
                "flex items-center gap-3 p-3 rounded-xl border transition-all duration-200",
                member.is_online ? "bg-background border-primary/20 shadow-sm" : "bg-muted/5 border-transparent opacity-80"
              )}
            >
              <div className="relative">
                <Avatar className="size-9 border shadow-none bg-primary/5">
                  <AvatarImage src={member.avatar_url} />
                  <AvatarFallback className="text-[11px] font-bold">
                    {member.name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                {member.is_online && (
                  <span className="absolute bottom-0 right-0 size-2.5 bg-emerald-500 rounded-full border-2 border-background ring-1 ring-emerald-500/20" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <div className="text-[13px] font-bold truncate">{member.name}</div>
                  {member.is_leader && (
                    <ShieldCheck className="size-3 text-primary" />
                  )}
                </div>
                <div className="flex items-center gap-2.5 mt-0.5">
                   <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                     <Activity className="size-2.5 text-primary" />
                     {member.participation_count} actions
                   </div>
                   {member.is_online && (
                     <div className="text-[9px] font-black uppercase text-emerald-600 tracking-tight animate-pulse">Online</div>
                   )}
                </div>
              </div>

              {requireApproval && (
                <div className="shrink-0 flex flex-col items-end gap-1">
                  {member.approval_status === "APPROVED" ? (
                    <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-600">
                      <CheckCircle2 className="size-3" />
                      <span className="hidden sm:inline uppercase">Approved</span>
                    </div>
                  ) : (member.approval_status === "REJECTED" || member.approval_status === "CHANGES_REQUESTED") ? (
                    <div className="flex items-center gap-1 text-[10px] font-bold text-destructive">
                      <AlertCircle className="size-3 text-destructive" />
                      <span className="hidden sm:inline uppercase tracking-tight">Changes Requested</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground">
                      <Clock className="size-3" />
                      <span className="hidden sm:inline uppercase tracking-tight">Waiting</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {requireApproval && members.every(m => m.approval_status === "APPROVED") && (
          <div className="mt-6 p-4 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center gap-3">
             <div className="size-8 rounded-full bg-emerald-500 flex items-center justify-center text-white shrink-0 shadow-sm">
               <CheckCircle2 className="size-5" />
             </div>
             <div>
               <p className="text-xs font-bold text-emerald-900">Consensus Achieved</p>
               <p className="text-[10px] text-emerald-700">All members have digitally approved this submission.</p>
             </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
