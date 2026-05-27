// components/mindexa/assessment/group-builder-dnd.tsx
"use client";

import React, { useState, useEffect } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  defaultDropAnimationSideEffects,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle, 
  CardFooter 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { 
  Users, 
  Plus, 
  Trash2, 
  GripVertical, 
  UserPlus, 
  Search,
  ChevronRight,
  ShieldCheck,
  CheckCircle2
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { lecturerApi, LecturerCourseRosterItem } from "@/lib/api/lecturer";
import { cn } from "@/lib/utils";

interface GroupMember {
  id: string; // student user id
  name: string;
  email: string;
  is_leader?: boolean;
}

interface Group {
  id: string;
  name: string;
  members: GroupMember[];
}

interface GroupBuilderDndProps {
  courseId?: string;
  initialGroups?: Group[];
  maxGroupSize: number;
  onSave: (groups: Group[]) => void;
}

function SortableMember({ member, groupId, isOverlay = false }: { member: GroupMember, groupId: string, isOverlay?: boolean }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({
    id: `${groupId}:${member.id}`,
    data: {
      type: "Member",
      member,
      groupId
    }
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2 p-2 rounded-lg border bg-card hover:bg-accent/50 transition-colors group relative",
        isDragging && "opacity-50 grayscale",
        isOverlay && "shadow-xl border-primary ring-2 ring-primary/20 cursor-grabbing"
      )}
    >
      <div {...attributes} {...listeners} className="cursor-grab">
        <GripVertical className="size-3.5 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-semibold truncate">{member.name}</div>
        <div className="text-[9px] text-muted-foreground truncate">{member.email}</div>
      </div>
      {member.is_leader && (
        <ShieldCheck className="size-3 text-primary shrink-0" />
      )}
    </div>
  );
}

export function GroupBuilderDnd({ courseId, initialGroups = [], maxGroupSize, onSave }: GroupBuilderDndProps) {
  const [unassigned, setUnassigned] = useState<GroupMember[]>([]);
  const [groups, setGroups] = useState<Group[]>(initialGroups.length > 0 ? initialGroups : [
    { id: "group-1", name: "Group 1", members: [] }
  ]);
  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeMember, setActiveMember] = useState<GroupMember | null>(null);
  const [loading, setLoading] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    async function loadRoster() {
      if (!courseId) return;
      setLoading(true);
      try {
        const detail = await lecturerApi.getWorkspaceDetail(courseId);
        // Filter out students already in initialGroups
        const assignedIds = new Set(initialGroups.flatMap(g => g.members.map(m => m.id)));
        const students = detail.roster
          .filter(s => !assignedIds.has(s.student_id))
          .map(s => ({
            id: s.student_id,
            name: s.name,
            email: s.email
          }));
        setUnassigned(students);
      } catch (err) {
        console.error("Failed to load roster", err);
      } finally {
        setLoading(false);
      }
    }
    loadRoster();
  }, [courseId]);

  const addGroup = () => {
    setGroups([
      ...groups,
      { id: `group-${Date.now()}`, name: `Group ${groups.length + 1}`, members: [] }
    ]);
  };

  const removeGroup = (groupId: string) => {
    const group = groups.find(g => g.id === groupId);
    if (group) {
      setUnassigned([...unassigned, ...group.members]);
      setGroups(groups.filter(g => g.id !== groupId));
    }
  };

  const handleDragStart = (event: any) => {
    const { active } = event;
    setActiveId(active.id);
    setActiveMember(active.data.current.member);
  };

  const handleDragOver = (event: any) => {
    const { active, over } = event;
    if (!over) return;

    const activeData = active.data.current;
    const overData = over.data.current;

    const activeGroupId = activeData.groupId;
    const overGroupId = overData?.groupId || (over.id.startsWith("group-") ? over.id : (over.id === "unassigned" ? "unassigned" : null));

    if (!overGroupId || activeGroupId === overGroupId) return;

    // Logic to move between containers
    setGroups(prevGroups => {
      const newGroups = [...prevGroups];
      const unassignedList = [...unassigned];

      // Remove from source
      let memberToMove: GroupMember;
      if (activeGroupId === "unassigned") {
        const idx = unassignedList.findIndex(m => m.id === activeData.member.id);
        memberToMove = unassignedList.splice(idx, 1)[0];
        setUnassigned(unassignedList);
      } else {
        const sourceGroup = newGroups.find(g => g.id === activeGroupId)!;
        const idx = sourceGroup.members.findIndex(m => m.id === activeData.member.id);
        memberToMove = sourceGroup.members.splice(idx, 1)[0];
      }

      // Add to destination
      if (overGroupId === "unassigned") {
        setUnassigned([...unassignedList, memberToMove]);
      } else {
        const destGroup = newGroups.find(g => g.id === overGroupId);
        if (destGroup && destGroup.members.length < maxGroupSize) {
          destGroup.members.push(memberToMove);
        } else {
          // If destination is full, put back to source (already handled by state update pattern if we return original)
          // For simplicity in this DND implementation, we just allow it and let UI show warning
          if (destGroup) destGroup.members.push(memberToMove);
        }
      }

      return newGroups;
    });
  };

  const handleDragEnd = (event: any) => {
    setActiveId(null);
    setActiveMember(null);
  };

  const filteredUnassigned = unassigned.filter(s => 
    s.name.toLowerCase().includes(search.toLowerCase()) || 
    s.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[600px]">
        {/* UNASSIGNED LIST */}
        <div className="lg:col-span-4 flex flex-col h-full border rounded-2xl bg-muted/30 overflow-hidden">
          <div className="p-4 border-b bg-background space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
                <Users className="size-4" />
                Unassigned Students
              </h3>
              <Badge variant="secondary">{unassigned.length}</Badge>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                placeholder="Search students..."
                className="pl-8 h-8 text-xs rounded-full bg-muted/50 border-none"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <ScrollArea className="flex-1 p-3">
            <SortableContext
              id="unassigned"
              items={unassigned.map(m => `unassigned:${m.id}`)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2 min-h-[50px]">
                {filteredUnassigned.map(member => (
                  <SortableMember key={member.id} member={member} groupId="unassigned" />
                ))}
                {unassigned.length === 0 && !loading && (
                  <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
                    <CheckCircle2 className="size-8 opacity-20" />
                    <p className="text-[11px] font-medium uppercase tracking-widest">All students assigned</p>
                  </div>
                )}
              </div>
            </SortableContext>
          </ScrollArea>
        </div>

        {/* GROUPS GRID */}
        <div className="lg:col-span-8 flex flex-col h-full gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h3 className="text-sm font-bold uppercase tracking-wider">Group Assignments</h3>
              <Badge variant="outline" className="text-[10px]">Max {maxGroupSize} / group</Badge>
            </div>
            <Button variant="outline" size="sm" onClick={addGroup} className="h-8 rounded-lg">
              <Plus className="size-4 mr-2" /> Add Group
            </Button>
          </div>
          
          <ScrollArea className="flex-1 border rounded-2xl p-4 bg-muted/10">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-10">
              {groups.map((group) => (
                <Card key={group.id} className={cn(
                  "shadow-none border transition-all",
                  group.members.length > maxGroupSize ? "border-destructive/50" : "hover:border-primary/30"
                )}>
                  <CardHeader className="py-3 px-4 border-b flex flex-row items-center justify-between bg-muted/20">
                    <Input
                      value={group.name}
                      onChange={(e) => setGroups(groups.map(g => g.id === group.id ? { ...g, name: e.target.value } : g))}
                      className="h-6 text-xs font-bold w-32 border-none bg-transparent focus-visible:ring-0 p-0"
                    />
                    <div className="flex items-center gap-2">
                      <Badge variant={group.members.length > maxGroupSize ? "destructive" : "secondary"} className="text-[9px] h-4">
                        {group.members.length}/{maxGroupSize}
                      </Badge>
                      <Button variant="ghost" size="icon-xs" onClick={() => removeGroup(group.id)} className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="p-3">
                    <SortableContext
                      id={group.id}
                      items={group.members.map(m => `${group.id}:${m.id}`)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-1.5 min-h-[80px]">
                        {group.members.map(member => (
                          <SortableMember key={member.id} member={member} groupId={group.id} />
                        ))}
                        {group.members.length === 0 && (
                          <div className="h-20 border border-dashed rounded-lg flex items-center justify-center text-muted-foreground text-[10px] uppercase tracking-widest bg-muted/5">
                            Drag students here
                          </div>
                        )}
                      </div>
                    </SortableContext>
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>

          <div className="flex justify-end gap-3 pt-2">
             <Button variant="ghost" size="sm" onClick={() => onSave(groups)}>Reset</Button>
             <Button size="sm" className="h-9 px-6 rounded-lg font-bold" onClick={() => onSave(groups)}>Save Group Assignments</Button>
          </div>
        </div>
      </div>

      <DragOverlay dropAnimation={{
        sideEffects: defaultDropAnimationSideEffects({
          styles: {
            active: {
              opacity: '0.5',
            },
          },
        }),
      }}>
        {activeId && activeMember ? (
          <div className="w-64">
            <SortableMember member={activeMember} groupId={activeId.split(':')[0]} isOverlay />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
