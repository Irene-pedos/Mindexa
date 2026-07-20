// components/mindexa/group-work/group-comments-panel.tsx
"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  MessageSquare, 
  Send, 
  User as UserIcon, 
  Clock, 
  MoreHorizontal,
  Hash
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";

interface GroupComment {
  id: string;
  student_id: string;
  student_name: string;
  student_avatar?: string;
  body: string;
  question_id?: string;
  created_at: string;
}

interface GroupCommentsPanelProps {
  comments: GroupComment[];
  onPostComment: (body: string, questionId?: string) => Promise<void>;
  currentUserId: string;
  activeQuestionId?: string;
}

export function GroupCommentsPanel({ 
  comments, 
  onPostComment, 
  currentUserId,
  activeQuestionId
}: GroupCommentsPanelProps) {
  const [newComment, setNewComment] = useState("");
  const [isPosting, setIsPosting] = useState(false);
  const [filterType, setFilterType] = useState<"current" | "all">("all");
  const scrollRef = useRef<HTMLDivElement>(null);

  const filteredComments = useMemo(() => {
    if (filterType === "current" && activeQuestionId) {
      return comments.filter((c) => c.question_id === activeQuestionId);
    }
    return comments;
  }, [comments, filterType, activeQuestionId]);

  // Auto-scroll to bottom when new comments arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filteredComments]);

  const handlePost = async () => {
    if (!newComment.trim() || isPosting) return;
    setIsPosting(true);
    try {
      await onPostComment(newComment, activeQuestionId);
      setNewComment("");
    } catch (err) {
      console.error("Failed to post comment", err);
    } finally {
      setIsPosting(false);
    }
  };

  return (
    <Card className="border shadow-none h-full flex flex-col overflow-hidden">
      <CardHeader className="py-4 px-5 border-b bg-muted/10">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                <MessageSquare className="size-4" />
              </div>
              <CardTitle className="text-sm font-bold uppercase tracking-wider">Group Discussion</CardTitle>
            </div>
            {activeQuestionId && filterType === "current" && (
              <div className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground bg-background px-2 py-0.5 rounded border border-dashed animate-pulse">
                <Hash className="size-2.5" /> Filtered by Question
              </div>
            )}
          </div>
          
          {activeQuestionId && (
            <div className="flex rounded-lg bg-muted p-1 w-full border">
              <button
                type="button"
                onClick={() => setFilterType("all")}
                className={cn(
                  "flex-1 text-[10px] font-black uppercase tracking-wider py-1.5 px-2 rounded-md transition-all",
                  filterType === "all" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                All Chat
              </button>
              <button
                type="button"
                onClick={() => setFilterType("current")}
                className={cn(
                  "flex-1 text-[10px] font-black uppercase tracking-wider py-1.5 px-2 rounded-md transition-all",
                  filterType === "current" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                This Question
              </button>
            </div>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="flex-1 p-0 overflow-hidden">
        <div className="h-full overflow-y-auto p-4 space-y-6" ref={scrollRef}>
          {filteredComments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center gap-3 opacity-40">
              <MessageSquare className="size-12 text-muted-foreground" />
              <div className="space-y-1">
                <p className="text-sm font-bold uppercase tracking-widest animate-pulse">No discussion found</p>
                <p className="text-[10px] max-w-[200px]">No messages match the current filter criteria.</p>
              </div>
            </div>
          ) : (
            filteredComments.map((comment) => {
              const isMe = comment.student_id === currentUserId;
              return (
                <div 
                  key={comment.id} 
                  className={cn(
                    "flex gap-3 group",
                    isMe ? "flex-row-reverse" : "flex-row"
                  )}
                >
                  <Avatar className="size-8 shrink-0 border bg-muted shadow-none mt-0.5">
                    <AvatarImage src={comment.student_avatar} />
                    <AvatarFallback className="text-[10px] font-bold">
                      {comment.student_name.substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>

                  <div className={cn(
                    "flex flex-col max-w-[80%]",
                    isMe ? "items-end" : "items-start"
                  )}>
                    <div className="flex items-center gap-2 mb-1 px-1">
                       <span className="text-[10px] font-black uppercase tracking-tight text-foreground/70">
                         {isMe ? "You" : comment.student_name}
                       </span>
                       <span className="text-[9px] text-muted-foreground">
                         {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                       </span>
                    </div>

                    <div className={cn(
                      "p-3 rounded-2xl text-[13px] leading-relaxed shadow-sm",
                      isMe 
                        ? "bg-primary text-primary-foreground rounded-tr-none" 
                        : "bg-muted/50 border border-border/50 text-foreground rounded-tl-none"
                    )}>
                      {comment.body}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </CardContent>

      <CardFooter className="p-4 border-t bg-muted/5">
        <div className="flex flex-col gap-3 w-full">
           <div className="relative group">
              <Textarea 
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Type your message or share an idea..."
                className="min-h-[80px] bg-background text-[13px] leading-relaxed pr-12 rounded-xl border-2 focus:border-primary/50 transition-all resize-none shadow-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handlePost();
                  }
                }}
              />
              <Button 
                onClick={handlePost}
                disabled={!newComment.trim() || isPosting}
                size="icon" 
                className={cn(
                  "absolute bottom-3 right-3 size-8 rounded-lg shadow-md transition-all",
                  newComment.trim() ? "bg-primary scale-100" : "bg-muted text-muted-foreground scale-90 opacity-50"
                )}
              >
                <Send className="size-4" />
              </Button>
           </div>
           <div className="flex items-center justify-between px-1">
             <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
               <Clock className="size-2.5" /> All members are notified
             </p>
             <p className="text-[9px] text-muted-foreground italic">Shift + Enter for new line</p>
           </div>
        </div>
      </CardFooter>
    </Card>
  );
}
