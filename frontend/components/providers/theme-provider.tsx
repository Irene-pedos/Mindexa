"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { usePathname } from "next/navigation";

export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  const pathname = usePathname();
  const isLandingPage = pathname === "/";

  // When on the landing page, guarantee dark mode class is stripped immediately
  React.useEffect(() => {
    if (isLandingPage && typeof document !== "undefined") {
      document.documentElement.classList.remove("dark");
    }
  }, [isLandingPage]);

  return (
    <NextThemesProvider
      {...props}
      forcedTheme={isLandingPage ? "light" : props.forcedTheme}
    >
      {children}
    </NextThemesProvider>
  );
}