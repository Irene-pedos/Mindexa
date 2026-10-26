"use client";

import { useEffect, useRef } from "react";
import { BookOpen, CheckCircle2, ChevronDown, FileText, Plus, RefreshCw, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ScopeCatalog } from "@/lib/tutor-chat";

interface ScopePickerProps {
  selectedId: string | null;
  /** Label of the current scope; null means general knowledge. */
  label: string | null;
  catalog: ScopeCatalog;
  loading: boolean;
  isUploading: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (id: string | null) => void;
  /** A course was chosen (also used to point the revision center at it). */
  onCourseChosen: (workspaceId: string) => void;
  onUpload: (file: File) => void;
  onDeletePersonal: (id: string) => void;
}

const rowBase =
  "flex w-full items-center gap-2 rounded-lg border p-2 text-left text-xs transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";
const rowSelected = "border-primary bg-primary/10 font-semibold text-primary";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1.5 px-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
      {children}
    </div>
  );
}

function ScopeRow({
  selected,
  icon,
  title,
  subtitle,
  onClick,
}: {
  selected: boolean;
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(rowBase, selected && rowSelected)}
    >
      {icon}
      <span className="min-w-0 flex-1 text-left font-medium">
        <span className="block truncate">{title}</span>
        {subtitle && <span className="block truncate text-[10px] font-normal text-muted-foreground">{subtitle}</span>}
      </span>
      {selected && <CheckCircle2 className="size-3.5 shrink-0 text-primary" />}
    </button>
  );
}

/**
 * "Active knowledge scope" dropdown: general knowledge, an enrolled course, one course material,
 * or one of the student's own uploads. Rows are buttons, so the whole picker works by keyboard.
 */
export function ScopePicker({
  selectedId,
  label,
  catalog,
  loading,
  isUploading,
  open,
  onOpenChange,
  onSelect,
  onCourseChosen,
  onUpload,
  onDeletePersonal,
}: ScopePickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Close on a click outside, or Escape.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) onOpenChange(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onOpenChange]);

  const choose = (id: string | null) => {
    onSelect(id);
    onOpenChange(false);
  };
  const toggle = (id: string) => choose(selectedId === id ? null : id);

  return (
    <div className="relative shrink-0 border-b border-border/30 p-2" ref={containerRef}>
      <div className="px-1 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        Active Knowledge Scope
      </div>
      <Button
        variant="outline"
        size="sm"
        aria-haspopup="true"
        aria-expanded={open}
        className={cn(
          "h-8 w-full justify-between gap-1.5 rounded-lg border-zinc-200 bg-background px-2.5 text-xs font-semibold",
          selectedId && "border-primary bg-primary/5 text-primary"
        )}
        onClick={() => onOpenChange(!open)}
      >
        <span className="flex items-center gap-1.5 truncate">
          <FileText className="size-3.5 shrink-0 text-primary" />
          <span className="max-w-[190px] truncate text-left">{label || "General Knowledge"}</span>
        </span>
        <ChevronDown className="ml-1 size-3 shrink-0 opacity-60" />
      </Button>

      {open && (
        <div className="absolute left-2 right-2 top-full z-50 mt-1 rounded-xl border bg-popover p-3 text-popover-foreground shadow-xl animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="narrow-scrollbar-dark max-h-72 space-y-3 overflow-y-auto pr-1 text-left">
            <ScopeRow
              selected={!selectedId}
              icon={<Sparkles className="size-3.5 shrink-0 text-amber-500" />}
              title="General Knowledge"
              subtitle="No course context"
              onClick={() => choose(null)}
            />

            {catalog.workspaces.length > 0 && (
              <div>
                <SectionTitle>Enrolled Courses</SectionTitle>
                <div className="space-y-1">
                  {catalog.workspaces.map((ws) => (
                    <ScopeRow
                      key={ws.id}
                      selected={selectedId === ws.id}
                      icon={<BookOpen className="size-3.5 shrink-0 text-indigo-500" />}
                      title={`${ws.code}: ${ws.title}`}
                      subtitle={ws.language === "RW" ? "Kinyarwanda (Disabled)" : "All course materials"}
                      onClick={() => {
                        toggle(ws.id);
                        onCourseChosen(ws.id);
                      }}
                    />
                  ))}
                </div>
              </div>
            )}

            <div>
              <SectionTitle>Lecturer Materials</SectionTitle>
              {loading ? (
                <div className="py-1 pl-2 text-xs text-muted-foreground">Loading materials...</div>
              ) : catalog.materials.length === 0 ? (
                <div className="py-1 pl-2 text-xs text-muted-foreground">No materials uploaded.</div>
              ) : (
                <div className="space-y-1">
                  {catalog.materials.map((file) => (
                    <ScopeRow
                      key={file.id}
                      selected={selectedId === file.id}
                      icon={<FileText className="size-3.5 shrink-0 text-blue-500" />}
                      title={file.display_name || file.original_filename}
                      subtitle={file.course_code}
                      onClick={() => toggle(file.id)}
                    />
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between px-1">
                <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Personal Files</div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 px-1.5 text-[10px] text-primary"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                >
                  {isUploading ? (
                    <RefreshCw className="mr-1 size-2.5 animate-spin" />
                  ) : (
                    <Plus className="mr-1 size-2.5" />
                  )}
                  Upload
                </Button>
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept=".pdf,.docx,.txt"
                  aria-label="Upload a personal study file"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) onUpload(file);
                    event.target.value = "";
                  }}
                />
              </div>
              {catalog.personal.length === 0 ? (
                <div className="py-1 pl-2 text-xs text-muted-foreground">No personal files.</div>
              ) : (
                <div className="space-y-1">
                  {catalog.personal.map((file) => {
                    const name = file.display_name || file.original_filename;
                    return (
                      <div key={file.id} className="group flex items-center gap-1">
                        <div className="min-w-0 flex-1">
                          <ScopeRow
                            selected={selectedId === file.id}
                            icon={<FileText className="size-3.5 shrink-0 text-emerald-500" />}
                            title={name}
                            onClick={() => toggle(file.id)}
                          />
                        </div>
                        <button
                          type="button"
                          aria-label={`Delete ${name}`}
                          onClick={() => onDeletePersonal(file.id)}
                          className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-100 hover:text-destructive focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 sm:opacity-0 sm:group-hover:opacity-100"
                        >
                          <X className="size-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
