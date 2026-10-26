"use client";

import { Copy, Download, Printer, RefreshCw, Share2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { downloadTextFile } from "@/lib/download-text-file";

interface DeleteConversationDialogProps {
  open: boolean;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DeleteConversationDialog({ open, deleting, onCancel, onConfirm }: DeleteConversationDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold text-destructive">
            <Trash2 className="size-4" />
            Delete Conversation
          </DialogTitle>
          <DialogDescription className="text-xs">
            Are you sure you want to delete this conversation? This will permanently remove the chat thread from your
            history.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={deleting} className="text-xs">
            Cancel
          </Button>
          <Button variant="destructive" size="sm" onClick={onConfirm} disabled={deleting} className="gap-1.5 text-xs">
            {deleting && <RefreshCw className="size-3 animate-spin" />}
            Delete Chat
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ShareConversationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transcript: string;
  onCopy: (text: string, id: string, successMessage?: string) => void;
}

/** Conversations are private to the student, so sharing means copying the text, not a link. */
export function ShareConversationDialog({ open, onOpenChange, transcript, onCopy }: ShareConversationDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Share2 className="size-4 text-primary" />
            Share Conversation
          </DialogTitle>
          <DialogDescription className="text-xs">
            Your chats are private. Copy this conversation as formatted text to send to peers or a study group.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="narrow-scrollbar-dark max-h-48 overflow-y-auto whitespace-pre-wrap rounded-xl border border-border/50 bg-muted/30 p-3 font-mono text-[11px] text-muted-foreground">
            {transcript}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="default"
            size="sm"
            onClick={() => onCopy(transcript, "share-transcript", "Conversation copied to clipboard!")}
            className="gap-1.5 text-xs"
          >
            <Copy className="size-3.5" />
            Copy Markdown
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ExportConversationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  markdown: string;
  plainText: string;
}

interface ExportOption {
  key: string;
  badge: React.ReactNode;
  title: string;
  description: string;
  icon: React.ReactNode;
  run: () => void;
}

export function ExportConversationDialog({ open, onOpenChange, markdown, plainText }: ExportConversationDialogProps) {
  const options: ExportOption[] = [
    {
      key: "md",
      badge: (
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">MD</span>
      ),
      title: "Markdown Document",
      description: "Formatted with headings and references",
      icon: <Download className="size-4 text-muted-foreground" />,
      run: () => {
        downloadTextFile("AI_Tutor_Study_Chat.md", markdown);
        toast.success("Downloaded conversation as Markdown (.md)");
      },
    },
    {
      key: "txt",
      badge: (
        <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-xs font-bold text-muted-foreground">TXT</span>
      ),
      title: "Plain Text (.txt)",
      description: "Simple raw transcript for any device",
      icon: <Download className="size-4 text-muted-foreground" />,
      run: () => {
        downloadTextFile("AI_Tutor_Study_Chat.txt", plainText, "text/plain;charset=utf-8;");
        toast.success("Downloaded conversation as Plain Text (.txt)");
      },
    },
    {
      key: "pdf",
      badge: (
        <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
          <Printer className="size-4" />
        </span>
      ),
      title: "Print to PDF",
      description: "Print view or save as PDF via browser",
      icon: <Printer className="size-4 text-muted-foreground" />,
      run: () => window.print(),
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Download className="size-4 text-primary" />
            Export Conversation
          </DialogTitle>
          <DialogDescription className="text-xs">
            Download your study dialogue for offline revision or printing.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-2.5 py-2">
          {options.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => {
                option.run();
                onOpenChange(false);
              }}
              className="flex items-center justify-between rounded-xl border bg-card p-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <span className="flex items-center gap-2.5">
                {option.badge}
                <span>
                  <span className="block text-xs font-semibold text-foreground">{option.title}</span>
                  <span className="block text-[10px] text-muted-foreground">{option.description}</span>
                </span>
              </span>
              {option.icon}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
