"use client";

import { Card } from "@/components/ui/card";
import { Users, UserCheck, CheckCircle2, Lock, ArrowUpRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusFilter, UserStats } from "./types";

interface UserStatsCardsProps {
  stats: UserStats;
  currentStatusFilter: StatusFilter;
  onSelectStatusFilter: (status: StatusFilter) => void;
  loading?: boolean;
}

export function UserStatsCards({
  stats,
  currentStatusFilter,
  onSelectStatusFilter,
  loading = false,
}: UserStatsCardsProps) {
  const cards = [
    {
      id: "all" as StatusFilter,
      label: "Total Accounts",
      value: stats.total,
      badge: "Platform-wide",
      badgeColor: "bg-muted text-muted-foreground",
      icon: Users,
      color: "text-primary",
      bgColor: "bg-primary/10 dark:bg-primary/15",
      borderColor: "hover:border-primary/50",
      activeRing: "ring-1.5 ring-primary/40 border-primary/60 bg-primary/[0.03] dark:bg-primary/[0.05]",
    },
    {
      id: "PENDING_APPROVAL" as StatusFilter,
      label: "Awaiting Review",
      value: stats.pending,
      badge: stats.pending > 0 ? "Action required" : "Cleared",
      badgeColor: stats.pending > 0 ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/20" : "bg-muted text-muted-foreground",
      icon: UserCheck,
      color: "text-amber-600 dark:text-amber-400",
      bgColor: "bg-amber-500/10 dark:bg-amber-500/15",
      borderColor: "hover:border-amber-500/50",
      activeRing: "ring-1.5 ring-amber-500/40 border-amber-500/60 bg-amber-500/[0.03] dark:bg-amber-500/[0.05]",
      alertDot: stats.pending > 0,
    },
    {
      id: "ACTIVE" as StatusFilter,
      label: "Active Accounts",
      value: stats.active,
      badge: "Operational",
      badgeColor: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
      icon: CheckCircle2,
      color: "text-emerald-600 dark:text-emerald-400",
      bgColor: "bg-emerald-500/10 dark:bg-emerald-500/15",
      borderColor: "hover:border-emerald-500/50",
      activeRing: "ring-1.5 ring-emerald-500/40 border-emerald-500/60 bg-emerald-500/[0.03] dark:bg-emerald-500/[0.05]",
    },
    {
      id: "SUSPENDED" as StatusFilter,
      label: "Suspended",
      value: stats.suspended,
      badge: "Restricted",
      badgeColor: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20",
      icon: Lock,
      color: "text-rose-600 dark:text-rose-400",
      bgColor: "bg-rose-500/10 dark:bg-rose-500/15",
      borderColor: "hover:border-rose-500/50",
      activeRing: "ring-1.5 ring-rose-500/40 border-rose-500/60 bg-rose-500/[0.03] dark:bg-rose-500/[0.05]",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
      {cards.map((card) => {
        const Icon = card.icon;
        const isActive = currentStatusFilter === card.id;

        return (
          <Card
            key={card.id}
            onClick={() => onSelectStatusFilter(card.id)}
            role="button"
            tabIndex={0}
            aria-pressed={isActive}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelectStatusFilter(card.id);
              }
            }}
            className={cn(
              "group relative overflow-hidden rounded-xl border border-border/80 bg-card p-3 sm:py-3 sm:px-3.5 transition-all duration-200 cursor-pointer shadow-2xs select-none hover:shadow-xs",
              card.borderColor,
              isActive ? card.activeRing : "hover:-translate-y-0.5"
            )}
          >
            <div className="flex items-center justify-between gap-2.5">
              <div className="flex items-center gap-3 min-w-0">
                {/* Compact Icon */}
                <div
                  className={cn(
                    "size-9 sm:size-10 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105 border border-transparent group-hover:border-current/20",
                    card.bgColor,
                    card.color
                  )}
                >
                  <Icon className="size-4 sm:size-4.5" />
                </div>

                {/* Values & Label */}
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider truncate">
                      {card.label}
                    </span>
                    {card.alertDot && (
                      <span className="size-1.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
                    )}
                  </div>
                  <div className="flex items-baseline gap-2 mt-0.5">
                    <span
                      className={cn(
                        "text-lg sm:text-2xl font-extrabold tracking-tight tabular-nums",
                        card.color
                      )}
                    >
                      {loading ? "—" : card.value}
                    </span>
                    <span
                      className={cn(
                        "text-[9px] font-semibold px-1.5 py-0.2 rounded-md border hidden sm:inline-block truncate",
                        card.badgeColor
                      )}
                    >
                      {card.badge}
                    </span>
                  </div>
                </div>
              </div>

              {/* Status indicator indicator pill */}
              <div className="shrink-0 flex items-center">
                {isActive ? (
                  <span className="size-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px]" title="Filtered">
                    <Check className="size-3 stroke-[2.5]" />
                  </span>
                ) : (
                  <ArrowUpRight className="size-3.5 text-muted-foreground/40 group-hover:text-foreground group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all duration-200" />
                )}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
