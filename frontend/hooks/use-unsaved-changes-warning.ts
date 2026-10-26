"use client";

import { useEffect } from "react";

/**
 * Ask the browser to confirm before the page is closed, reloaded or navigated away from while
 * there is work that would be lost. Browsers show their own generic message; custom text is
 * ignored. Does nothing while `hasUnsavedChanges` is false.
 */
export function useUnsavedChangesWarning(hasUnsavedChanges: boolean): void {
  useEffect(() => {
    if (!hasUnsavedChanges) return;

    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = ""; // required by some browsers to trigger the prompt
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsavedChanges]);
}
