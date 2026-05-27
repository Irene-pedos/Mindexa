// components/mindexa/assessment/group-question-editor.tsx
"use client";

import React, { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Users, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface GroupSummary {
  id: string;
  name: string;
  memberCount: number;
}

interface GroupQuestionEditorProps {
  groups: GroupSummary[];
  totalMarks: number;
  renderQuestionEditor: (groupId: string) => React.ReactNode;
  getGroupMarks: (groupId: string) => number;
}

export function GroupQuestionEditor({
  groups,
  totalMarks,
  renderQuestionEditor,
  getGroupMarks,
}: GroupQuestionEditorProps) {
  const [activeGroupId, setActiveGroupId] = useState(groups[0]?.id || "");

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center border-2 border-dashed rounded-2xl bg-muted/5 gap-4">
        <div className="p-4 rounded-full bg-muted">
          <Users className="size-10 text-muted-foreground opacity-20" />
        </div>
        <div className="max-w-xs space-y-1">
          <p className="text-sm font-semibold">No Groups Defined</p>
          <p className="text-xs text-muted-foreground">
            You must define groups in the Blueprint step before assigning group-specific questions.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <Users className="size-5 text-primary" />
            Per-Group Question Assignment
          </h3>
          <Badge variant="outline" className="h-7 px-3 text-[11px] font-bold bg-primary/5 text-primary border-primary/10 uppercase tracking-widest">
            {groups.length} Groups Total
          </Badge>
        </div>

        <Tabs value={activeGroupId} onValueChange={setActiveGroupId} className="w-full">
          <TabsList className="bg-muted/50 p-1 h-auto flex-wrap justify-start border overflow-x-auto no-scrollbar">
            {groups.map((group) => {
              const groupMarks = getGroupMarks(group.id);
              const isMarksMismatched = groupMarks !== totalMarks;
              
              return (
                <TabsTrigger
                  key={group.id}
                  value={group.id}
                  className={cn(
                    "rounded-lg px-4 py-2 text-xs font-semibold gap-2 transition-all",
                    "data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-primary"
                  )}
                >
                  <span className="truncate max-w-[120px]">{group.name}</span>
                  <Badge 
                    variant={isMarksMismatched ? "destructive" : "secondary"} 
                    className="text-[9px] px-1.5 h-4 tabular-nums"
                  >
                    {groupMarks}/{totalMarks}
                  </Badge>
                  {isMarksMismatched && (
                    <AlertTriangle className="size-3 text-destructive animate-pulse" />
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>

          <div className="mt-8 space-y-6">
            {groups.map((group) => (
              <TabsContent key={group.id} value={group.id} className="focus-visible:ring-0">
                <div className="space-y-4">
                  <div className="flex items-center justify-between bg-muted/20 p-4 rounded-xl border border-dashed">
                    <div className="space-y-0.5">
                      <p className="text-sm font-bold">Assigning questions for {group.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Current total for this group: <span className={cn("font-bold", getGroupMarks(group.id) !== totalMarks ? "text-destructive" : "text-emerald-600")}>{getGroupMarks(group.id)} / {totalMarks} Marks</span>
                      </p>
                    </div>
                    <Badge variant="outline" className="bg-background">
                      {group.memberCount} Members
                    </Badge>
                  </div>
                  
                  {renderQuestionEditor(group.id)}
                </div>
              </TabsContent>
            ))}
          </div>
        </Tabs>
      </div>

      {groups.some(g => getGroupMarks(g.id) !== totalMarks) && (
        <div className="p-4 rounded-xl bg-destructive/5 border border-destructive/10 flex gap-3 items-center">
          <AlertTriangle className="size-5 text-destructive shrink-0" />
          <p className="text-xs text-destructive font-medium">
            Some groups do not have enough questions to match the total marks ({totalMarks}). Please check all group tabs.
          </p>
        </div>
      )}
    </div>
  );
}
