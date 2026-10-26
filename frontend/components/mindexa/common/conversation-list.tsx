"use client";

import { Pin, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ConversationListItem {
  id: string;
  title: string;
  /** Small caption under the title (module and date, message count...). */
  meta?: string;
}

interface ConversationListProps {
  items: ConversationListItem[];
  currentId: string | null;
  pinnedIds: ReadonlySet<string>;
  onOpen: (id: string) => void;
  onTogglePin: (id: string, event: React.MouseEvent) => void;
  onDelete: (id: string) => void;
  emptyText?: string;
  /** Block opening another conversation while one is loading. */
  disabled?: boolean;
}

/**
 * Saved-conversations list shared by the lecturer assistant and the student tutor. Each row is a
 * real button (keyboard and screen-reader friendly) with its pin/delete actions as siblings, not
 * nested inside it; the actions are always visible on touch screens, which have no hover, and
 * appear on hover or keyboard focus on desktop.
 */
export function ConversationList({
  items,
  currentId,
  pinnedIds,
  onOpen,
  onTogglePin,
  onDelete,
  emptyText = "No saved conversations yet.",
  disabled = false,
}: ConversationListProps) {
  if (items.length === 0) {
    return (
      <div className="my-2 rounded-lg border border-dashed border-border/40 bg-muted/30 p-4 text-center text-xs font-medium text-muted-foreground">
        {emptyText}
      </div>
    );
  }

  return (
    <ul className={cn("space-y-1", disabled && "pointer-events-none opacity-70")}>
      {items.map((item) => {
        const isPinned = pinnedIds.has(item.id);
        const isCurrent = currentId === item.id;

        return (
          <li
            key={item.id}
            className={cn(
              "group flex items-center gap-1 rounded-lg border transition-colors",
              isCurrent
                ? "border-border/50 bg-muted text-foreground"
                : "border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            )}
          >
            <button
              type="button"
              onClick={() => onOpen(item.id)}
              aria-current={isCurrent ? "true" : undefined}
              title={item.title}
              className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              {isPinned && <Pin className="size-3 shrink-0 fill-primary text-primary" aria-label="Pinned" />}
              <span className="min-w-0">
                <span className={cn("block truncate", isCurrent ? "font-semibold" : "font-medium")}>
                  {item.title}
                </span>
                {item.meta && (
                  <span className="block truncate text-[10px] uppercase tracking-wide text-muted-foreground/70">
                    {item.meta}
                  </span>
                )}
              </span>
            </button>

            <div className="flex shrink-0 items-center gap-0.5 pr-1 opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
              <button
                type="button"
                onClick={(e) => onTogglePin(item.id, e)}
                aria-label={isPinned ? `Unpin ${item.title}` : `Pin ${item.title}`}
                aria-pressed={isPinned}
                className="flex size-6 cursor-pointer items-center justify-center rounded text-muted-foreground hover:bg-muted-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <Pin className={cn("size-3", isPinned && "fill-primary text-primary")} />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(item.id);
                }}
                aria-label={`Delete ${item.title}`}
                className="flex size-6 cursor-pointer items-center justify-center rounded text-muted-foreground hover:bg-muted-foreground/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <Trash2 className="size-3" />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
