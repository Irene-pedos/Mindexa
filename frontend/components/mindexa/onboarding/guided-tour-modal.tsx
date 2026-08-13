// frontend/components/mindexa/onboarding/guided-tour-modal.tsx
"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { ROLE_TOURS, TourStep } from "./guided-tour-data";
import {
  LayoutDashboard,
  FileText,
  ShieldCheck,
  CheckCircle2,
  Trophy,
  Brain,
  PlusCircle,
  BookOpenCheck,
  Sparkles,
  ShieldAlert,
  Users,
  Building2,
  Accessibility,
  Activity,
  ArrowRight,
  ArrowLeft,
  X,
  Compass,
  Check,
  ExternalLink,
  ChevronRight,
  Sparkles as SparklesIcon,
  HelpCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

// Map icon names to Lucide icon components
const ICON_MAP: Record<string, React.ElementType> = {
  LayoutDashboard,
  FileText,
  ShieldCheck,
  CheckCircle2,
  Trophy,
  Brain,
  PlusCircle,
  BookOpenCheck,
  Sparkles,
  ShieldAlert,
  Users,
  Building2,
  Accessibility,
  Activity,
  Compass,
};

export function GuidedTourModal() {
  const { user, updateTourProgress } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const [isOpen, setIsOpen] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

  const role = (user?.role?.toLowerCase() || "student") as "student" | "lecturer" | "admin";
  const tourConfig = ROLE_TOURS[role] || ROLE_TOURS.student;
  const totalSteps = tourConfig.steps.length;

  // Determine device & role variant (e.g., student_mobile, student_desktop, lecturer_desktop, admin_desktop)
  const tourVariant = useMemo(() => {
    const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
    const cleanRole = role === "admin" || (role as string) === "super_admin" ? "admin" : role;
    if (cleanRole === "student") {
      return isMobile ? "student_mobile" : "student_desktop";
    }
    if (cleanRole === "lecturer") {
      return isMobile ? "lecturer_mobile" : "lecturer_desktop";
    }
    return "admin_desktop";
  }, [role]);

  // Initialize step from user's persisted state or listen for explicit trigger
  useEffect(() => {
    if (!user) return;

    // Do not auto-open on public onboarding or auth routes
    const excludedRoutes = ["/", "/login", "/signup", "/onboarding", "/forgot-password", "/reset-password"];
    const isExcluded = excludedRoutes.some((route) =>
      route === "/" ? pathname === "/" : pathname === route || pathname.startsWith(route + "/")
    );
    if (isExcluded) return;

    // Check if tour should auto-trigger on first dashboard visit after completing onboarding
    const shouldAutoOpen =
      !user.onboarding_tour_completed &&
      (user.onboarding_completed || role === "admin");

    if (shouldAutoOpen) {
      const savedStep = typeof user.onboarding_tour_step === "number" ? user.onboarding_tour_step : 0;
      setCurrentStepIndex(Math.min(Math.max(0, savedStep), totalSteps - 1));
      setIsOpen(true);
    }
  }, [user, role, totalSteps, pathname]);

  // Listen for custom event to open/replay tour from anywhere in the app
  useEffect(() => {
    const handleOpenTour = (event: CustomEvent<{ step?: number }>) => {
      const targetStep = event.detail?.step ?? (user?.onboarding_tour_step || 0);
      setCurrentStepIndex(Math.min(Math.max(0, targetStep), totalSteps - 1));
      setIsOpen(true);
    };

    window.addEventListener("mindexa-open-tour", handleOpenTour as EventListener);
    return () => {
      window.removeEventListener("mindexa-open-tour", handleOpenTour as EventListener);
    };
  }, [user, totalSteps]);

  const currentStep: TourStep = tourConfig.steps[currentStepIndex] || tourConfig.steps[0];
  const StepIcon = ICON_MAP[currentStep?.iconName] || Compass;
  const progressPercent = Math.round(((currentStepIndex + 1) / totalSteps) * 100);

  // Highlight active element in page matching data-tour selector
  useEffect(() => {
    if (!isOpen || !currentStep?.id) return;

    const targetElement = document.querySelector(`[data-tour="${currentStep.id}"]`);
    if (targetElement) {
      targetElement.scrollIntoView({ behavior: "smooth", block: "center" });
      targetElement.classList.add("ring-2", "ring-primary", "ring-offset-2", "ring-offset-background", "transition-all");

      return () => {
        targetElement.classList.remove("ring-2", "ring-primary", "ring-offset-2", "ring-offset-background", "transition-all");
      };
    }
  }, [isOpen, currentStep?.id]);

  const handleComplete = useCallback(async () => {
    setIsSaving(true);
    try {
      await updateTourProgress(totalSteps - 1, true, tourVariant);
      setIsOpen(false);
    } finally {
      setIsSaving(false);
    }
  }, [updateTourProgress, totalSteps, tourVariant]);

  const handleNext = useCallback(async () => {
    if (currentStepIndex < totalSteps - 1) {
      const nextIndex = currentStepIndex + 1;
      setCurrentStepIndex(nextIndex);
      await updateTourProgress(nextIndex, false, tourVariant);
    } else {
      await handleComplete();
    }
  }, [currentStepIndex, totalSteps, updateTourProgress, tourVariant, handleComplete]);

  const handlePrevious = useCallback(async () => {
    if (currentStepIndex > 0) {
      const prevIndex = currentStepIndex - 1;
      setCurrentStepIndex(prevIndex);
      await updateTourProgress(prevIndex, false, tourVariant);
    }
  }, [currentStepIndex, updateTourProgress, tourVariant]);

  const handleDismiss = useCallback(async () => {
    setIsOpen(false);
    // Persist current progress so they can resume right here next time
    await updateTourProgress(currentStepIndex, false, tourVariant);
  }, [currentStepIndex, updateTourProgress, tourVariant]);

  // Keyboard navigation (ArrowLeft, ArrowRight, Escape)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleDismiss();
      } else if (e.key === "ArrowRight") {
        handleNext();
      } else if (e.key === "ArrowLeft") {
        handlePrevious();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleDismiss, handleNext, handlePrevious]);

  const handleNavigateToTarget = () => {
    if (currentStep?.path) {
      router.push(currentStep.path);
    }
  };

  if (!isOpen || !currentStep) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-background/80 backdrop-blur-md animate-in fade-in-50 duration-200"
    >
      <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl transition-all dark:bg-card">
        {/* Top Header Glow Banner */}
        <div className="relative bg-gradient-to-r from-primary/15 via-primary/5 to-transparent px-6 py-5 border-b border-border/60">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/25">
                <StepIcon className="size-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                    {tourConfig.roleName} Tour
                  </span>
                  <Badge variant="outline" className="text-[11px] font-medium bg-background/50">
                    {currentStep.badge}
                  </Badge>
                </div>
                <h2 id="tour-title" className="text-lg font-bold text-foreground sm:text-xl">
                  {currentStep.title}
                </h2>
              </div>
            </div>

            <button
              onClick={handleDismiss}
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Close tour"
            >
              <X className="size-5" />
            </button>
          </div>

          {/* Progress Bar & Counter */}
          <div className="mt-4 flex items-center gap-3">
            <Progress value={progressPercent} className="h-1.5 flex-1 bg-muted" />
            <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
              Step {currentStepIndex + 1} of {totalSteps}
            </span>
          </div>
        </div>

        {/* Modal Body */}
        <div className="space-y-5 p-6 sm:p-7">
          <div>
            <p className="text-sm font-medium text-primary/90">{currentStep.subtitle}</p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {currentStep.description}
            </p>
          </div>

          {/* Key Highlights Bullet Card */}
          <div className="rounded-xl border border-border/70 bg-muted/30 p-4">
            <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide flex items-center gap-1.5">
              <SparklesIcon className="size-3.5 text-primary" /> Key Takeaways
            </h3>
            <ul className="mt-2.5 space-y-2">
              {currentStep.highlights.map((highlight, idx) => (
                <li key={idx} className="flex items-start gap-2 text-xs text-foreground/90 leading-normal">
                  <div className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Check className="size-2.5 stroke-[3]" />
                  </div>
                  <span>{highlight}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Contextual Tip */}
          {currentStep.tip && (
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3.5 text-xs text-amber-900 dark:text-amber-200">
              <HelpCircle className="size-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
              <span className="leading-relaxed">
                <strong className="font-semibold">Pro-tip:</strong> {currentStep.tip}
              </span>
            </div>
          )}

          {/* Step Navigator Dots */}
          <div className="flex items-center justify-center gap-1.5 pt-2">
            {tourConfig.steps.map((step, idx) => (
              <button
                key={step.id}
                onClick={async () => {
                  setCurrentStepIndex(idx);
                  await updateTourProgress(idx, false, role);
                }}
                className={cn(
                  "h-2 rounded-full transition-all duration-300",
                  idx === currentStepIndex
                    ? "w-8 bg-primary"
                    : idx < currentStepIndex
                    ? "w-2 bg-primary/40"
                    : "w-2 bg-muted-foreground/30 hover:bg-muted-foreground/50"
                )}
                aria-label={`Jump to step ${idx + 1}: ${step.title}`}
              />
            ))}
          </div>
        </div>

        {/* Modal Footer Controls */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-border/60 bg-muted/20 px-6 py-4">
          <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-start">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDismiss}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Resume Later
            </Button>
            {currentStep.path && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleNavigateToTarget}
                className="text-xs flex items-center gap-1.5"
              >
                <span>{currentStep.actionLabel || "Go to Page"}</span>
                <ExternalLink className="size-3" />
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <Button
              variant="outline"
              size="sm"
              disabled={currentStepIndex === 0}
              onClick={handlePrevious}
              className="text-xs flex items-center gap-1"
            >
              <ArrowLeft className="size-3.5" />
              <span>Back</span>
            </Button>

            <Button
              size="sm"
              onClick={handleNext}
              disabled={isSaving}
              className="text-xs font-semibold flex items-center gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground px-4 shadow-sm"
            >
              {currentStepIndex === totalSteps - 1 ? (
                <>
                  <span>Complete Tour</span>
                  <Check className="size-3.5" />
                </>
              ) : (
                <>
                  <span>Next Step</span>
                  <ArrowRight className="size-3.5" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
