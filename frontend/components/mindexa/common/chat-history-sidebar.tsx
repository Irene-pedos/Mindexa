"use client";

import React, { useState, useMemo } from "react";
import {
  Plus,
  Search,
  Pin,
  PinOff,
  Edit2,
  Trash2,
  Archive,
  Brain,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  X,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export interface ChatSessionItem {
  id: string;
  title: string;
  created_at: string;
  is_pinned?: boolean;
  is_archived?: boolean;
}

interface ChatHistorySidebarProps {
  sessions: ChatSessionItem[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
  onRenameSession: (id: string, newTitle: string) => void;
  onDeleteSession: (id: string) => void;
  onTogglePinSession: (id: string) => void;
  onToggleArchiveSession: (id: string) => void;
  memories?: string[];
  onAddMemory?: (memory: string) => void;
  onDeleteMemory?: (index: number) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  className?: string;
}

export function ChatHistorySidebar({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewChat,
  onRenameSession,
  onDeleteSession,
  onTogglePinSession,
  onToggleArchiveSession,
  memories = [],
  onAddMemory,
  onDeleteMemory,
  isCollapsed,
  onToggleCollapse,
  className,
}: ChatHistorySidebarProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [showMemoriesModal, setShowMemoriesModal] = useState(false);
  const [newMemoryText, setNewMemoryText] = useState("");

  const filteredSessions = useMemo(() => {
    return sessions.filter((s) =>
      s.title.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [sessions, searchTerm]);

  const pinnedSessions = useMemo(
    () => filteredSessions.filter((s) => s.is_pinned && !s.is_archived),
    [filteredSessions]
  );
  const activeSessions = useMemo(
    () => filteredSessions.filter((s) => !s.is_pinned && !s.is_archived),
    [filteredSessions]
  );

  const handleStartRename = (session: ChatSessionItem) => {
    setEditingSessionId(session.id);
    setEditingTitle(session.title);
  };

  const handleSaveRename = () => {
    if (editingSessionId && editingTitle.trim()) {
      onRenameSession(editingSessionId, editingTitle.trim());
      toast.success("Conversation renamed");
    }
    setEditingSessionId(null);
  };

  const handleAddMemorySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newMemoryText.trim() && onAddMemory) {
      onAddMemory(newMemoryText.trim());
      setNewMemoryText("");
      toast.success("AI memory stored successfully");
    }
  };

  return (
    <div
      className={cn(
        "relative flex flex-col h-full bg-card/60 border-r border-border/60 transition-all duration-200 select-none",
        isCollapsed ? "w-12" : "w-64",
        className
      )}
    >
      {/* Collapse/Expand Toggle Button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onToggleCollapse}
        className="absolute -right-3 top-3 size-6 rounded-full border border-border bg-background shadow-xs text-muted-foreground hover:text-foreground z-20"
        aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {isCollapsed ? <ChevronRight className="size-3.5" /> : <ChevronLeft className="size-3.5" />}
      </Button>

      {/* Header Controls */}
      <div className="p-3 border-b border-border/60 space-y-2">
        <Button
          onClick={onNewChat}
          size="sm"
          className={cn(
            "w-full h-8.5 font-medium text-xs justify-start gap-2 shadow-xs transition-all",
            isCollapsed && "px-0 justify-center"
          )}
        >
          <Plus className="size-4 shrink-0" />
          {!isCollapsed && <span>New Chat</span>}
        </Button>

        {!isCollapsed && (
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search conversations..."
              className="h-8 text-xs pl-8 pr-3 rounded-lg bg-background/80 border-border/60"
            />
          </div>
        )}
      </div>

      {/* Main Conversations List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-3 font-sans">
        {isCollapsed ? (
          <div className="space-y-2 pt-2 flex flex-col items-center">
            {filteredSessions.slice(0, 8).map((session) => (
              <Button
                key={session.id}
                variant={session.id === activeSessionId ? "secondary" : "ghost"}
                size="icon"
                onClick={() => onSelectSession(session.id)}
                title={session.title}
                className="size-8 rounded-lg"
              >
                <MessageSquare className="size-4" />
              </Button>
            ))}
          </div>
        ) : (
          <>
            {/* Pinned Section */}
            {pinnedSessions.length > 0 && (
              <div className="space-y-1">
                <div className="px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  <Pin className="size-3 text-primary" /> Pinned
                </div>
                {pinnedSessions.map((s) => (
                  <ChatItemRow
                    key={s.id}
                    session={s}
                    isActive={s.id === activeSessionId}
                    isEditing={s.id === editingSessionId}
                    editingTitle={editingTitle}
                    setEditingTitle={setEditingTitle}
                    onSelect={() => onSelectSession(s.id)}
                    onSaveRename={handleSaveRename}
                    onStartRename={() => handleStartRename(s)}
                    onTogglePin={() => onTogglePinSession(s.id)}
                    onToggleArchive={() => onToggleArchiveSession(s.id)}
                    onDelete={() => onDeleteSession(s.id)}
                  />
                ))}
              </div>
            )}

            {/* Recent Chats Section */}
            <div className="space-y-1">
              <div className="px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Recent Chats
              </div>
              {activeSessions.length === 0 ? (
                <p className="px-2 py-4 text-xs text-muted-foreground/60 italic text-center">
                  No conversations found.
                </p>
              ) : (
                activeSessions.map((s) => (
                  <ChatItemRow
                    key={s.id}
                    session={s}
                    isActive={s.id === activeSessionId}
                    isEditing={s.id === editingSessionId}
                    editingTitle={editingTitle}
                    setEditingTitle={setEditingTitle}
                    onSelect={() => onSelectSession(s.id)}
                    onSaveRename={handleSaveRename}
                    onStartRename={() => handleStartRename(s)}
                    onTogglePin={() => onTogglePinSession(s.id)}
                    onToggleArchive={() => onToggleArchiveSession(s.id)}
                    onDelete={() => onDeleteSession(s.id)}
                  />
                ))
              )}
            </div>
          </>
        )}
      </div>

      {/* Footer & AI Memory Manager */}
      {!isCollapsed && (
        <div className="p-3 border-t border-border/60 bg-muted/20">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowMemoriesModal(true)}
            className="w-full h-8 text-xs font-medium justify-between border-border/60"
          >
            <span className="flex items-center gap-1.5 text-primary">
              <Brain className="size-3.5" /> AI Memory
            </span>
            <Badge variant="secondary" className="text-[10px] h-4 px-1.5 bg-primary/10 text-primary">
              {memories.length}
            </Badge>
          </Button>
        </div>
      )}

      {/* AI Memory Manager Modal */}
      <Dialog open={showMemoriesModal} onOpenChange={setShowMemoriesModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
              <Brain className="size-4 text-primary" /> Stored AI Context & Memories
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-xs text-muted-foreground">
              The AI remembers these preferences and key context facts across conversations.
            </p>

            <form onSubmit={handleAddMemorySubmit} className="flex gap-2">
              <Input
                value={newMemoryText}
                onChange={(e) => setNewMemoryText(e.target.value)}
                placeholder="e.g. Prefer concise responses with code examples"
                className="h-8 text-xs"
              />
              <Button type="submit" size="sm" className="h-8 text-xs font-medium px-3">
                Add
              </Button>
            </form>

            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {memories.length === 0 ? (
                <p className="text-xs text-muted-foreground/60 italic py-2">No AI memories stored yet.</p>
              ) : (
                memories.map((m, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2 rounded-lg border border-border/60 bg-muted/20 text-xs text-foreground"
                  >
                    <span>{m}</span>
                    {onDeleteMemory && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onDeleteMemory(idx)}
                        className="size-6 text-muted-foreground hover:text-destructive"
                      >
                        <X className="size-3" />
                      </Button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
          <DialogFooter>
            <Button size="sm" onClick={() => setShowMemoriesModal(false)} className="text-xs font-medium">
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ChatItemRow({
  session,
  isActive,
  isEditing,
  editingTitle,
  setEditingTitle,
  onSelect,
  onSaveRename,
  onStartRename,
  onTogglePin,
  onToggleArchive,
  onDelete,
}: {
  session: ChatSessionItem;
  isActive: boolean;
  isEditing: boolean;
  editingTitle: string;
  setEditingTitle: (val: string) => void;
  onSelect: () => void;
  onSaveRename: () => void;
  onStartRename: () => void;
  onTogglePin: () => void;
  onToggleArchive: () => void;
  onDelete: () => void;
}) {
  if (isEditing) {
    return (
      <div className="flex items-center gap-1 p-1 rounded-lg border border-primary/40 bg-background">
        <Input
          value={editingTitle}
          onChange={(e) => setEditingTitle(e.target.value)}
          autoFocus
          className="h-6 text-xs px-1.5 border-none focus-visible:ring-0"
          onKeyDown={(e) => {
            if (e.key === "Enter") onSaveRename();
          }}
        />
        <Button size="icon" variant="ghost" onClick={onSaveRename} className="size-6 text-emerald-500">
          <Check className="size-3" />
        </Button>
      </div>
    );
  }

  return (
    <div
      onClick={onSelect}
      className={cn(
        "group relative flex items-center justify-between p-2 rounded-lg text-xs transition-colors cursor-pointer select-none",
        isActive
          ? "bg-primary/10 text-primary font-medium"
          : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
      )}
    >
      <div className="flex items-center gap-2 truncate pr-6">
        <MessageSquare className="size-3.5 shrink-0 opacity-70" />
        <span className="truncate">{session.title}</span>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="icon"
            className="size-6 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground"
          >
            <MoreVertical className="size-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-36 text-xs shadow-lg">
          <DropdownMenuItem onClick={onStartRename} className="text-xs">
            <Edit2 className="size-3 mr-2" /> Rename
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onTogglePin} className="text-xs">
            {session.is_pinned ? (
              <>
                <PinOff className="size-3 mr-2" /> Unpin
              </>
            ) : (
              <>
                <Pin className="size-3 mr-2" /> Pin
              </>
            )}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onToggleArchive} className="text-xs">
            <Archive className="size-3 mr-2" /> {session.is_archived ? "Unarchive" : "Archive"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onDelete} className="text-xs text-destructive focus:text-destructive">
            <Trash2 className="size-3 mr-2" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
