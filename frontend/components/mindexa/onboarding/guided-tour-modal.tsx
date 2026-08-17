// frontend/components/mindexa/onboarding/guided-tour-modal.tsx
"use client";

import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
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
  HelpCircle,
  Loader2,
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

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
  bottom: number;
  right: number;
}

export function GuidedTourModal() {
  const { user, updateTourProgress } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const [isOpen, setIsOpen] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const [windowSize, setWindowSize] = useState({ width: 1200, height: 800 });

  const tooltipRef = useRef<HTMLDivElement>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const role = (user?.role?.toLowerCase() || "student") as "student" | "lecturer" | "admin";
  const cleanRole = role === "admin" || (role as string) === "super_admin" ? "admin" : role;
  const tourConfig = ROLE_TOURS[cleanRole] || ROLE_TOURS.student;
  const totalSteps = tourConfig.steps.length;

  const currentStep: TourStep = tourConfig.steps[currentStepIndex] || tourConfig.steps[0];
  const StepIcon = ICON_MAP[currentStep?.iconName] || Compass;
  const progressPercent = Math.round(((currentStepIndex + 1) / totalSteps) * 100);

  // Determine device & role variant
  const tourVariant = useMemo(() => {
    const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
    if (cleanRole === "student") return isMobile ? "student_mobile" : "student_desktop";
    if (cleanRole === "lecturer") return isMobile ? "lecturer_mobile" : "lecturer_desktop";
    return "admin_desktop";
  }, [cleanRole]);

  // Window size tracking
  useEffect(() => {
    const handleResize = () => {
      setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    };
    if (typeof window !== "undefined") {
      handleResize();
      window.addEventListener("resize", handleResize);
      return () => window.removeEventListener("resize", handleResize);
    }
  }, []);

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
      (user.onboarding_completed || cleanRole === "admin");

    if (shouldAutoOpen) {
      const savedStep = typeof user.onboarding_tour_step === "number" ? user.onboarding_tour_step : 0;
      setCurrentStepIndex(Math.min(Math.max(0, savedStep), totalSteps - 1));
      setIsOpen(true);
    }
  }, [user, cleanRole, totalSteps, pathname]);

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

  // Locate and measure target DOM element
  const updateTargetRect = useCallback(() => {
    if (!isOpen || !currentStep) {
      setTargetRect(null);
      return;
    }

    const selector = currentStep.targetSelector;
    const fallback = currentStep.fallbackSelector;

    let el = selector ? document.querySelector(selector) : null;
    if (!el && fallback) {
      el = document.querySelector(fallback);
    }

    if (el) {
      const rect = el.getBoundingClientRect();
      setTargetRect({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        bottom: rect.bottom,
        right: rect.right,
      });
    } else {
      setTargetRect(null);
    }
  }, [isOpen, currentStep]);

  // Handle route matching, target polling, and smooth scrolling
  useEffect(() => {
    if (!isOpen || !currentStep) return;

    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }

    let attempts = 0;
    const maxAttempts = 30; // 30 * 80ms = 2.4s max wait

    const findAndScrollElement = () => {
      const selector = currentStep.targetSelector;
      const fallback = currentStep.fallbackSelector;

      let el = selector ? document.querySelector(selector) : null;
      if (!el && fallback) {
        el = document.querySelector(fallback);
      }

      if (el) {
        setIsNavigating(false);
        el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
        const rect = el.getBoundingClientRect();
        setTargetRect({
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
          bottom: rect.bottom,
          right: rect.right,
        });
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
        }
      } else {
        attempts++;
        if (attempts >= maxAttempts) {
          setIsNavigating(false);
          setTargetRect(null);
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
          }
        }
      }
    };

    // Initial check
    findAndScrollElement();

    // Start polling in case of route transition or async component render
    pollIntervalRef.current = setInterval(findAndScrollElement, 80);

    // Track layout shifts via scroll & resize
    const handleScrollOrResize = () => {
      updateTargetRect();
    };

    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [isOpen, currentStep, pathname, updateTargetRect]);

  const handleComplete = useCallback(async () => {
    setIsSaving(true);
    try {
      await updateTourProgress(totalSteps - 1, true, tourVariant);
      setIsOpen(false);
      setTargetRect(null);
    } finally {
      setIsSaving(false);
    }
  }, [updateTourProgress, totalSteps, tourVariant]);

  const goToStep = useCallback(
    async (nextIndex: number) => {
      if (nextIndex < 0 || nextIndex >= totalSteps) return;

      const nextStep = tourConfig.steps[nextIndex];
      setCurrentStepIndex(nextIndex);

      if (nextStep?.path && nextStep.path !== pathname) {
        setIsNavigating(true);
        router.push(nextStep.path);
      }

      await updateTourProgress(nextIndex, false, tourVariant);
    },
    [totalSteps, tourConfig.steps, pathname, router, updateTourProgress, tourVariant]
  );

  const handleNext = useCallback(async () => {
    if (currentStepIndex < totalSteps - 1) {
      await goToStep(currentStepIndex + 1);
    } else {
      await handleComplete();
    }
  }, [currentStepIndex, totalSteps, goToStep, handleComplete]);

  const handlePrevious = useCallback(async () => {
    if (currentStepIndex > 0) {
      await goToStep(currentStepIndex - 1);
    }
  }, [currentStepIndex, goToStep]);

  const handleDismiss = useCallback(async () => {
    setIsOpen(false);
    setTargetRect(null);
    await updateTourProgress(currentStepIndex, false, tourVariant);
  }, [currentStepIndex, updateTourProgress, tourVariant]);

  // Keyboard navigation
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

  // Tooltip position calculation with collision-aware auto-flipping
  const tooltipStyle = useMemo(() => {
    const isMobile = windowSize.width < 768;

    if (isMobile) {
      return {
        position: "fixed" as const,
        bottom: 16,
        left: 16,
        right: 16,
        maxWidth: "calc(100vw - 32px)",
        zIndex: 101,
      };
    }

    const cardWidth = Math.min(420, windowSize.width - 32);
    const cardHeight = 360; // estimated max height
    const gap = 14;
    const padding = 16;

    if (!targetRect) {
      // Fallback: center in viewport
      return {
        position: "fixed" as const,
        top: Math.max(padding, (windowSize.height - cardHeight) / 2),
        left: Math.max(padding, (windowSize.width - cardWidth) / 2),
        width: cardWidth,
        zIndex: 101,
      };
    }

    const preferred = currentStep?.placement || "bottom";
    const centerX = targetRect.left + targetRect.width / 2;
    const centerY = targetRect.top + targetRect.height / 2;

    let computedTop = 0;
    let computedLeft = 0;

    if (preferred.startsWith("bottom")) {
      const bottomSpace = windowSize.height - targetRect.bottom - gap;
      if (bottomSpace >= 280 || targetRect.top < 280) {
        // Fits below
        computedTop = targetRect.bottom + gap;
      } else {
        // Flip to top
        computedTop = targetRect.top - gap - cardHeight;
      }
      computedLeft = preferred === "bottom-start" ? targetRect.left : centerX - cardWidth / 2;
    } else if (preferred.startsWith("top")) {
      const topSpace = targetRect.top - gap;
      if (topSpace >= 280 || windowSize.height - targetRect.bottom < 280) {
        // Fits above
        computedTop = targetRect.top - gap - cardHeight;
      } else {
        // Flip to bottom
        computedTop = targetRect.bottom + gap;
      }
      computedLeft = preferred === "top-start" ? targetRect.left : centerX - cardWidth / 2;
    } else if (preferred === "right") {
      const rightSpace = windowSize.width - targetRect.right - gap;
      if (rightSpace >= cardWidth) {
        computedLeft = targetRect.right + gap;
        computedTop = centerY - cardHeight / 2;
      } else {
        // Flip to left or bottom
        computedLeft = targetRect.left - gap - cardWidth;
        computedTop = centerY - cardHeight / 2;
      }
    } else {
      computedLeft = targetRect.left - gap - cardWidth;
      computedTop = centerY - cardHeight / 2;
    }

    // Clamp inside viewport
    const finalLeft = Math.max(padding, Math.min(windowSize.width - cardWidth - padding, computedLeft));
    const finalTop = Math.max(padding, Math.min(windowSize.height - cardHeight - padding, computedTop));

    return {
      position: "fixed" as const,
      top: finalTop,
      left: finalLeft,
      width: cardWidth,
      zIndex: 101,
    };
  }, [windowSize, targetRect, currentStep]);

  if (!isOpen || !currentStep) return null;

  const spotlightPadding = 6;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-title"
      className="fixed inset-0 z-[100] pointer-events-auto select-none"
    >
      {/* Spotlight Cutout Window or Graceful Fallback Backdrop */}
      {targetRect ? (
        <>
          {/* Spotlight cutout rect with massive shadow dimming everything outside */}
          <div
            style={{
              position: "fixed",
              top: Math.max(0, targetRect.top - spotlightPadding),
              left: Math.max(0, targetRect.left - spotlightPadding),
              width: targetRect.width + spotlightPadding * 2,
              height: targetRect.height + spotlightPadding * 2,
              boxShadow: "0 0 0 9999px rgba(15, 23, 42, 0.65)",
            }}
            className="rounded-xl ring-2 ring-primary/80 ring-offset-2 ring-offset-background pointer-events-none transition-all duration-300 ease-out z-[100]"
          />
          {/* Clickable backdrop overlay to capture outside clicks */}
          <div
            onClick={handleDismiss}
            className="fixed inset-0 z-[99] bg-transparent cursor-pointer"
            aria-label="Click to dismiss tour"
          />
        </>
      ) : (
        <div
          onClick={handleDismiss}
          className="fixed inset-0 z-[99] bg-slate-950/60 backdrop-blur-[2px] transition-opacity duration-300"
        />
      )}

      {/* Anchored Tooltip Card */}
      <div
        ref={tooltipRef}
        style={tooltipStyle}
        className="pointer-events-auto rounded-2xl border border-border/80 bg-card text-card-foreground shadow-2xl overflow-hidden transition-all duration-300 ease-out animate-in fade-in zoom-in-95"
      >
        {/* Header Strip */}
        <div className="bg-muted/40 px-5 py-4 border-b border-border/60">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-sm shrink-0">
                {isNavigating ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <StepIcon className="size-4" />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-primary">
                    {tourConfig.roleName} Tour
                  </span>
                  <Badge variant="outline" className="text-[10px] font-medium h-4 px-1.5 bg-background/80">
                    {currentStep.badge}
                  </Badge>
                </div>
                <h2 id="tour-title" className="text-sm sm:text-base font-bold text-foreground truncate">
                  {currentStep.title}
                </h2>
              </div>
            </div>

            <button
              onClick={handleDismiss}
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Close tour"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* Progress Line */}
          <div className="mt-3 flex items-center gap-2.5">
            <Progress value={progressPercent} className="h-1 flex-1 bg-muted" />
            <span className="text-[11px] font-semibold text-muted-foreground whitespace-nowrap">
              {currentStepIndex + 1}/{totalSteps}
            </span>
          </div>
        </div>

        {/* Body Content */}
        <div className="p-5 space-y-3.5 max-h-[50vh] sm:max-h-[380px] overflow-y-auto">
          <div>
            <p className="text-xs font-semibold text-primary/90">{currentStep.subtitle}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {currentStep.description}
            </p>
          </div>

          {/* Key Takeaways Card */}
          {currentStep.highlights && currentStep.highlights.length > 0 && (
            <div className="rounded-xl border border-border/70 bg-muted/25 p-3 space-y-1.5">
              <span className="text-[10px] font-bold text-foreground uppercase tracking-wider block">
                Key Highlights
              </span>
              <ul className="space-y-1.5">
                {currentStep.highlights.map((highlight, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-xs text-foreground/90 leading-snug">
                    <div className="mt-0.5 flex size-3.5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Check className="size-2.5 stroke-[2.5]" />
                    </div>
                    <span>{highlight}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Contextual Tip */}
          {currentStep.tip && (
            <div className="flex items-start gap-2 rounded-xl border border-border/60 bg-muted/30 p-2.5 text-xs text-muted-foreground">
              <HelpCircle className="size-3.5 shrink-0 text-primary mt-0.5" />
              <span className="leading-relaxed">
                <strong className="font-semibold text-foreground">Tip:</strong> {currentStep.tip}
              </span>
            </div>
          )}
        </div>

        {/* Footer Navigation Bar */}
        <div className="flex items-center justify-between gap-3 border-t border-border/60 bg-muted/30 px-5 py-3">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDismiss}
              className="text-xs text-muted-foreground hover:text-foreground h-8 px-2"
            >
              Resume Later
            </Button>

            {/* Step Dots */}
            <div className="hidden sm:flex items-center gap-1 pl-1">
              {tourConfig.steps.map((step, idx) => (
                <button
                  key={step.id}
                  onClick={() => goToStep(idx)}
                  className={cn(
                    "h-1.5 rounded-full transition-all duration-300",
                    idx === currentStepIndex
                      ? "w-5 bg-primary"
                      : idx < currentStepIndex
                      ? "w-1.5 bg-primary/40"
                      : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/50"
                  )}
                  aria-label={`Jump to step ${idx + 1}`}
                />
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentStepIndex === 0 || isNavigating}
              onClick={handlePrevious}
              className="text-xs h-8 px-2.5 gap-1"
            >
              <ArrowLeft className="size-3" />
              <span>Back</span>
            </Button>

            <Button
              size="sm"
              onClick={handleNext}
              disabled={isSaving || isNavigating}
              className="text-xs font-semibold h-8 px-3.5 gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm"
            >
              {isNavigating ? (
                <>
                  <Loader2 className="size-3 animate-spin" />
                  <span>Loading...</span>
                </>
              ) : currentStepIndex === totalSteps - 1 ? (
                <>
                  <span>Finish Tour</span>
                  <Check className="size-3" />
                </>
              ) : (
                <>
                  <span>Next Step</span>
                  <ArrowRight className="size-3" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
