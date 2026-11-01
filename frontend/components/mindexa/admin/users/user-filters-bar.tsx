"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  X,
  RotateCw,
  LayoutList,
  LayoutGrid,
  FilterX,
  SlidersHorizontal,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { RoleFilter, StatusFilter, ViewMode } from "./types";
import { cn } from "@/lib/utils";

interface UserFiltersBarProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  roleFilter: RoleFilter;
  onRoleFilterChange: (role: RoleFilter) => void;
  statusFilter: StatusFilter;
  onStatusFilterChange: (status: StatusFilter) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onRefresh: () => void;
  isRefreshing?: boolean;
  totalFilteredCount: number;
}

export function UserFiltersBar({
  searchTerm,
  onSearchChange,
  roleFilter,
  onRoleFilterChange,
  statusFilter,
  onStatusFilterChange,
  viewMode,
  onViewModeChange,
  onRefresh,
  isRefreshing = false,
  totalFilteredCount,
}: UserFiltersBarProps) {
  const hasActiveFilters =
    searchTerm.trim().length > 0 || roleFilter !== "all" || statusFilter !== "all";

  const clearAllFilters = () => {
    onSearchChange("");
    onRoleFilterChange("all");
    onStatusFilterChange("all");
  };

  // Quick preset shortcuts
  const quickPresets = [
    {
      label: "All Accounts",
      active: roleFilter === "all" && statusFilter === "all",
      apply: () => {
        onRoleFilterChange("all");
        onStatusFilterChange("all");
      },
    },
    {
      label: "Pending Review",
      active: statusFilter === "PENDING_APPROVAL",
      apply: () => {
        onStatusFilterChange(statusFilter === "PENDING_APPROVAL" ? "all" : "PENDING_APPROVAL");
      },
      alert: true,
    },
    {
      label: "Students",
      active: roleFilter === "STUDENT",
      apply: () => {
        onRoleFilterChange(roleFilter === "STUDENT" ? "all" : "STUDENT");
      },
    },
    {
      label: "Faculty",
      active: roleFilter === "LECTURER" || roleFilter === "COORDINATOR",
      apply: () => {
        onRoleFilterChange(roleFilter === "LECTURER" ? "all" : "LECTURER");
      },
    },
    {
      label: "Admins",
      active: roleFilter === "ADMIN",
      apply: () => {
        onRoleFilterChange(roleFilter === "ADMIN" ? "all" : "ADMIN");
      },
    },
  ];

  return (
    <div className="space-y-3">
      {/* Search & Main Controls Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        {/* Search Input with Keyboard shortcut tag */}
        <div className="relative flex-1 min-w-0 group">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/70 group-focus-within:text-primary transition-colors pointer-events-none" />
          <Input
            type="text"
            placeholder="Search by name, email, department, student or staff ID..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9 pr-14 h-9.5 text-xs sm:text-sm rounded-xl border-border/80 bg-background/80 hover:bg-background focus-visible:bg-background focus-visible:ring-1 focus-visible:ring-primary shadow-2xs transition-all"
          />
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {searchTerm ? (
              <button
                onClick={() => onSearchChange("")}
                className="text-muted-foreground hover:text-foreground p-0.5 rounded-md transition-colors"
                aria-label="Clear search"
              >
                <X className="size-3.5" />
              </button>
            ) : (
              <kbd className="hidden md:inline-flex items-center gap-0.5 text-[9px] font-mono text-muted-foreground/60 border border-border/60 bg-muted/30 px-1.5 py-0.5 rounded select-none">
                /
              </kbd>
            )}
          </div>
        </div>

        {/* Filter Controls Row */}
        <div className="flex items-center gap-2 overflow-x-auto pb-0.5 sm:pb-0">
          {/* Role Filter */}
          <Select
            value={roleFilter}
            onValueChange={(val) => onRoleFilterChange(val as RoleFilter)}
          >
            <SelectTrigger className="h-9.5 min-w-[125px] sm:min-w-[135px] rounded-xl border-border/80 bg-background text-xs font-medium shadow-2xs hover:border-primary/40 transition-colors">
              <SelectValue placeholder="All Roles" />
            </SelectTrigger>
            <SelectContent align="end" className="rounded-xl shadow-lg p-1">
              <SelectItem value="all" className="text-xs font-medium">
                All Roles
              </SelectItem>
              <SelectItem value="ADMIN" className="text-xs font-semibold text-primary">
                Administrator
              </SelectItem>
              <SelectItem value="LECTURER" className="text-xs font-medium text-sky-600 dark:text-sky-400">
                Lecturer
              </SelectItem>
              <SelectItem value="COORDINATOR" className="text-xs font-medium text-purple-600 dark:text-purple-400">
                Coordinator
              </SelectItem>
              <SelectItem value="REVIEWER" className="text-xs font-medium text-indigo-600 dark:text-indigo-400">
                Reviewer
              </SelectItem>
              <SelectItem value="SUPERVISOR" className="text-xs font-medium text-amber-600 dark:text-amber-400">
                Supervisor
              </SelectItem>
              <SelectItem value="STUDENT" className="text-xs font-medium text-foreground">
                Student
              </SelectItem>
            </SelectContent>
          </Select>

          {/* Status Filter */}
          <Select
            value={statusFilter}
            onValueChange={(val) => onStatusFilterChange(val as StatusFilter)}
          >
            <SelectTrigger className="h-9.5 min-w-[125px] sm:min-w-[130px] rounded-xl border-border/80 bg-background text-xs font-medium shadow-2xs hover:border-primary/40 transition-colors">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent align="end" className="rounded-xl shadow-lg p-1">
              <SelectItem value="all" className="text-xs font-medium">
                All Statuses
              </SelectItem>
              <SelectItem value="ACTIVE" className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                Active
              </SelectItem>
              <SelectItem value="PENDING_APPROVAL" className="text-xs font-medium text-amber-600 dark:text-amber-400">
                Pending Review
              </SelectItem>
              <SelectItem value="SUSPENDED" className="text-xs font-medium text-rose-600 dark:text-rose-400">
                Suspended
              </SelectItem>
            </SelectContent>
          </Select>

          {/* Refresh Button */}
          <Button
            variant="outline"
            size="icon"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="h-9.5 w-9.5 shrink-0 rounded-xl border-border/80 bg-background shadow-2xs hover:bg-muted/60 hover:border-primary/40 transition-colors"
            title="Refresh accounts"
            aria-label="Refresh user list"
          >
            <RotateCw className={cn("size-3.5", isRefreshing && "animate-spin text-primary")} />
          </Button>

          {/* View Mode Switcher */}
          <div className="hidden sm:flex items-center rounded-xl border border-border/80 bg-background p-0.5 shadow-2xs">
            <button
              onClick={() => onViewModeChange("table")}
              className={cn(
                "p-1.5 rounded-lg transition-all",
                viewMode === "table"
                  ? "bg-muted text-foreground font-semibold shadow-2xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
              title="Table View"
              aria-label="Table View"
            >
              <LayoutList className="size-3.5" />
            </button>
            <button
              onClick={() => onViewModeChange("grid")}
              className={cn(
                "p-1.5 rounded-lg transition-all",
                viewMode === "grid"
                  ? "bg-muted text-foreground font-semibold shadow-2xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
              title="Card Grid View"
              aria-label="Card Grid View"
            >
              <LayoutGrid className="size-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Quick Filter Segment Chips & Active Filters Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-0.5">
        {/* Quick Filter Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {quickPresets.map((preset) => (
            <button
              key={preset.label}
              onClick={preset.apply}
              className={cn(
                "h-7 px-2.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all duration-150 flex items-center gap-1.5 border select-none",
                preset.active
                  ? "bg-primary text-primary-foreground border-primary shadow-2xs"
                  : "bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground border-border/60"
              )}
            >
              {preset.alert && !preset.active && (
                <span className="size-1.5 rounded-full bg-amber-500 animate-pulse" />
              )}
              {preset.label}
            </button>
          ))}
        </div>

        {/* Count & Clear All */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0 justify-between sm:justify-end">
          <span>
            Showing <strong className="font-semibold text-foreground">{totalFilteredCount}</strong> accounts
          </span>

          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="xs"
              onClick={clearAllFilters}
              className="h-6 text-[11px] text-muted-foreground hover:text-destructive font-medium px-2 gap-1 rounded-md"
            >
              <FilterX className="size-3" /> Reset
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
