"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { CheckCircle, Lock, X, Loader2 } from "lucide-react";

interface BulkActionsToolbarProps {
  selectedCount: number;
  onBulkApprove: () => void;
  onBulkSuspend: () => void;
  onClearSelection: () => void;
  isSubmitting?: boolean;
}

export function BulkActionsToolbar({
  selectedCount,
  onBulkApprove,
  onBulkSuspend,
  onClearSelection,
  isSubmitting = false,
}: BulkActionsToolbarProps) {
  return (
    <AnimatePresence>
      {selectedCount > 0 && (
        <motion.div
          initial={{ y: 80, opacity: 0, scale: 0.96 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 80, opacity: 0, scale: 0.96 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="fixed bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] sm:w-auto max-w-xl"
        >
          <div className="bg-background/95 backdrop-blur-md border border-border shadow-2xl rounded-2xl sm:rounded-full px-4 sm:px-6 py-2.5 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-6">
            {/* Selected Count Indicator */}
            <div className="flex items-center gap-2.5 self-center sm:self-auto sm:pr-4 sm:border-r sm:border-border/60">
              <span className="bg-primary text-primary-foreground size-5 rounded-full flex items-center justify-center text-[10px] font-bold">
                {selectedCount}
              </span>
              <span className="text-xs font-semibold text-foreground whitespace-nowrap">
                {selectedCount} {selectedCount === 1 ? "Account" : "Accounts"} Selected
              </span>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-center gap-2 w-full sm:w-auto flex-wrap sm:flex-nowrap">
              <Button
                size="sm"
                variant="outline"
                className="h-8 px-3.5 rounded-full border-emerald-500/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10 text-xs font-semibold"
                onClick={onBulkApprove}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <Loader2 className="size-3.5 animate-spin mr-1.5" />
                ) : (
                  <CheckCircle className="size-3.5 mr-1.5" />
                )}
                Approve Access
              </Button>

              <Button
                size="sm"
                variant="outline"
                className="h-8 px-3.5 rounded-full border-rose-500/30 text-rose-700 dark:text-rose-400 hover:bg-rose-500/10 text-xs font-semibold"
                onClick={onBulkSuspend}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <Loader2 className="size-3.5 animate-spin mr-1.5" />
                ) : (
                  <Lock className="size-3.5 mr-1.5" />
                )}
                Suspend
              </Button>

              <Button
                size="sm"
                variant="ghost"
                className="h-8 px-3 rounded-full text-xs font-medium text-muted-foreground hover:text-foreground"
                onClick={onClearSelection}
                disabled={isSubmitting}
              >
                <X className="size-3.5 mr-1" /> Deselect
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
