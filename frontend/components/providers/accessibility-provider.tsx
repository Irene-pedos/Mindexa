// frontend/components/providers/accessibility-provider.tsx
"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";

interface AccessibilityContextType {
  isSimpleMode: boolean;
  isLargeText: boolean;
  isReducedMotion: boolean;
  isScreenReaderMode: boolean;
  extraTimePercent: number;
}

const AccessibilityContext = createContext<AccessibilityContextType>({
  isSimpleMode: false,
  isLargeText: false,
  isReducedMotion: false,
  isScreenReaderMode: false,
  extraTimePercent: 0,
});

export function AccessibilityProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const profile = user?.profile;

  // Initialize from user profile or fallback to localStorage cached user
  const isSimpleMode = Boolean(profile?.simple_mode_enabled);
  const isLargeText = Boolean(profile?.large_text_default);
  const isReducedMotion = Boolean(profile?.reduced_motion_default);
  const isScreenReaderMode = Boolean(profile?.requires_screen_reader_mode);
  const extraTimePercent = profile?.extra_time_percent || 0;

  useEffect(() => {
    if (typeof document === "undefined") return;

    const root = document.documentElement;
    const body = document.body;

    // Synchronize simple-mode
    if (isSimpleMode) {
      root.classList.add("simple-mode");
      body.classList.add("simple-mode");
    } else {
      root.classList.remove("simple-mode");
      body.classList.remove("simple-mode");
    }

    // Synchronize large-text
    if (isLargeText) {
      root.classList.add("large-text");
      body.classList.add("large-text");
    } else {
      root.classList.remove("large-text");
      body.classList.remove("large-text");
    }

    // Synchronize reduced-motion
    if (isReducedMotion) {
      root.classList.add("reduced-motion");
      body.classList.add("reduced-motion");
    } else {
      root.classList.remove("reduced-motion");
      body.classList.remove("reduced-motion");
    }

    // Synchronize screen-reader-mode
    if (isScreenReaderMode) {
      root.classList.add("screen-reader-mode");
      body.classList.add("screen-reader-mode");
    } else {
      root.classList.remove("screen-reader-mode");
      body.classList.remove("screen-reader-mode");
    }
  }, [isSimpleMode, isLargeText, isReducedMotion, isScreenReaderMode]);

  const value = useMemo(
    () => ({
      isSimpleMode,
      isLargeText,
      isReducedMotion,
      isScreenReaderMode,
      extraTimePercent,
    }),
    [isSimpleMode, isLargeText, isReducedMotion, isScreenReaderMode, extraTimePercent]
  );

  return (
    <AccessibilityContext.Provider value={value}>
      {children}
    </AccessibilityContext.Provider>
  );
}

export function useAccessibility() {
  return useContext(AccessibilityContext);
}
