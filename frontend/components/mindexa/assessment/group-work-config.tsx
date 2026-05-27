// components/mindexa/assessment/group-work-config.tsx
"use client";

import React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Users, Info, Settings2, HelpCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface GroupWorkConfig {
  max_group_size: number;
  group_assignment_mode: "AUTOMATIC" | "MANUAL";
  question_distribution_mode: "SHARED" | "PER_GROUP";
  require_all_member_approval: boolean;
  require_all_member_participation: boolean;
  appeal_window_days: number;
}

interface GroupWorkConfigProps {
  config: GroupWorkConfig;
  onConfigChange: (updates: Partial<GroupWorkConfig>) => void;
}

export function GroupWorkConfigSection({ config, onConfigChange }: GroupWorkConfigProps) {
  // Safe fallbacks for potentially undefined config
  const safeConfig = {
    max_group_size: config?.max_group_size ?? 4,
    group_assignment_mode: config?.group_assignment_mode ?? "AUTOMATIC",
    question_distribution_mode: config?.question_distribution_mode ?? "SHARED",
    require_all_member_approval: config?.require_all_member_approval ?? true,
    require_all_member_participation: config?.require_all_member_participation ?? true,
    appeal_window_days: config?.appeal_window_days ?? 7,
  };

  // Ensure onConfigChange is a function
  const handleChange = (updates: Partial<GroupWorkConfig>) => {
    if (typeof onConfigChange === 'function') {
      onConfigChange(updates);
    } else {
      console.error("GroupWorkConfigSection: onConfigChange is not a function", onConfigChange);
    }
  };

  return (
    <Card className="border-2 border-primary/10 shadow-none overflow-hidden">
      <CardHeader className="bg-primary/5 border-b py-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
            <Users className="size-4" />
          </div>
          <div>
            <CardTitle className="text-base font-semibold">Group Work Configuration</CardTitle>
            <CardDescription className="text-xs">
              Define how students will collaborate and how groups are managed
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Assignment & Size */}
          <div className="space-y-6">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Group Assignment Mode
                </Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="size-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs text-[10px]">
                      <p><strong>Automatic:</strong> System assigns students to groups randomly.</p>
                      <p className="mt-1"><strong>Manual:</strong> You assign students via drag-and-drop or CSV upload.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Select
                value={safeConfig.group_assignment_mode}
                onValueChange={(v: "AUTOMATIC" | "MANUAL") =>
                  handleChange({ group_assignment_mode: v })
                }
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AUTOMATIC">Automatic Generation</SelectItem>
                  <SelectItem value="MANUAL">Manual Assignment</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Max Group Size
              </Label>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  min={2}
                  max={50}
                  value={safeConfig.max_group_size}
                  onChange={(e) =>
                    handleChange({ max_group_size: parseInt(e.target.value) || 2 })
                  }
                  className="h-9 w-24"
                />
                <span className="text-xs text-muted-foreground">Students per group</span>
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Appeal Window
              </Label>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  min={0}
                  max={30}
                  value={safeConfig.appeal_window_days}
                  onChange={(e) =>
                    handleChange({ appeal_window_days: parseInt(e.target.value) || 0 })
                  }
                  className="h-9 w-24"
                />
                <span className="text-xs text-muted-foreground">Days after results release</span>
              </div>
            </div>
          </div>

          {/* Rules & Distribution */}
          <div className="space-y-6">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Question Distribution
                </Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="size-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs text-[10px]">
                      <p><strong>Shared:</strong> Every group gets exactly the same questions.</p>
                      <p className="mt-1"><strong>Per-Group:</strong> You can assign different questions to different groups.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Select
                value={safeConfig.question_distribution_mode}
                onValueChange={(v: "SHARED" | "PER_GROUP") =>
                  handleChange({ question_distribution_mode: v })
                }
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SHARED">Same for all groups</SelectItem>
                  <SelectItem value="PER_GROUP">Different per group</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-4 pt-2">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-0.5">
                  <Label className="text-sm">Require All-Member Participation</Label>
                  <p className="text-[10px] text-muted-foreground">
                    Every member must contribute (edit/comment) before submission
                  </p>
                </div>
                <Switch
                  checked={safeConfig.require_all_member_participation}
                  onCheckedChange={(v) => handleChange({ require_all_member_participation: v })}
                />
              </div>

              <div className="flex items-start justify-between gap-4">
                <div className="space-y-0.5">
                  <Label className="text-sm">Require All-Member Approval</Label>
                  <p className="text-[10px] text-muted-foreground">
                    Final submission requires a digital signature from every group member
                  </p>
                </div>
                <Switch
                  checked={safeConfig.require_all_member_approval}
                  onCheckedChange={(v) => handleChange({ require_all_member_approval: v })}
                />
              </div>
            </div>
          </div>
        </div>

        {safeConfig.question_distribution_mode === "PER_GROUP" && (
          <div className="mt-4 p-4 rounded-xl bg-amber-50 border border-amber-200 flex gap-3">
            <Info className="size-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-amber-900">Per-Group Questioning Enabled</p>
              <p className="text-[11px] text-amber-800 leading-relaxed">
                In Step 3 (Questions), you will see tabs for each group. You must ensure every group has questions assigned totaling the assessment&apos;s total marks.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
