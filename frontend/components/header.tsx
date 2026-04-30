// frontend/components/hero-section/header.tsx
"use client";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import React from "react";
import { cn } from "@/lib/utils";
import Image from "next/image";

const menuItems = [
  { name: "Home", href: "#home" },
  { name: "Crisis", href: "#crisis" },
  { name: "Solution", href: "#solution" },
  { name: "Capabilities", href: "#capabilities" },
  { name: "About", href: "#about" },
];

export const HeroHeader = ({
  className,
  isAbsolute = false,
  isTransparent = false,
}: {
  className?: string;
  isAbsolute?: boolean;
  isTransparent?: boolean;
}) => {
  const [menuState, setMenuState] = React.useState(false);
  const [isScrolled, setIsScrolled] = React.useState(false);
  const [activeSection, setActiveSection] = React.useState("home");

  React.useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);

      // Active section highlighting
      const sections = [...menuItems]
        .map((item) => item.href.substring(1))
        .reverse();
      for (const section of sections) {
        const element = document.getElementById(section);
        if (element) {
          const rect = element.getBoundingClientRect();
          // 200px threshold to account for the fixed header height
          if (rect.top <= 200) {
            setActiveSection(section);
            break;
          }
        }
      }
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleSmoothScroll = (
    e: React.MouseEvent<HTMLAnchorElement>,
    href: string,
  ) => {
    if (href.startsWith("#")) {
      e.preventDefault();
      const targetId = href.substring(1);
      const elem = document.getElementById(targetId);
      if (elem) {
        elem.scrollIntoView({ behavior: "smooth" });
        setMenuState(false); // Close mobile menu if open
        setActiveSection(targetId);
      }
    }
  };

  return (
    <header>
      <nav
        data-state={menuState && "active"}
        className={cn(
          isAbsolute ? "absolute" : "fixed",
          "z-20 w-full px-2 transition-all duration-100",
          className,
        )}
      >
        <div
          className={cn(
            "mx-auto mt-2 max-w-6xl px-6 transition-all duration-300 lg:px-12",
            isScrolled
              ? "bg-background/80 max-w-4xl rounded-2xl border backdrop-blur-lg lg:px-5"
              : isTransparent
                ? "bg-transparent"
                : "bg-transparent",
          )}
        >
          <div className="relative flex flex-wrap items-center justify-between gap-10 py-3 lg:gap-0 lg:py-4">
            <div className="flex w-full justify-between lg:w-auto">
              <Link
                href="/"
                aria-label="home"
                className="flex items-center space-x-2"
              >
                <Image
                  src={
                    isScrolled
                      ? "/icons/logo/mindexa-logo.svg"
                      : isTransparent
                        ? "/icons/logo/mindexa-logo.svg"
                        : "/icons/logo/mindexa-logo.svg"
                  }
                  alt="Logo"
                  width={90}
                  height={20}
                  style={{ height: "auto" }}
                  className={cn(
                    !isScrolled && isTransparent && "brightness-0 invert",
                  )}
                />
              </Link>

              <button
                onClick={() => setMenuState(!menuState)}
                aria-label={menuState === true ? "Close Menu" : "Open Menu"}
                className="relative z-20 -m-2.5 -mr-4 block cursor-pointer p-2.5 lg:hidden"
              >
                <Menu
                  className={cn(
                    "in-data-[state=active]:rotate-180 in-data-[state=active]:scale-0 in-data-[state=active]:opacity-0 m-auto size-6 duration-200",
                    !isScrolled && isTransparent && "text-white",
                  )}
                />
                <X
                  className={cn(
                    "in-data-[state=active]:rotate-0 in-data-[state=active]:scale-100 in-data-[state=active]:opacity-100 absolute inset-0 m-auto size-6 -rotate-180 scale-0 opacity-0 duration-200",
                    !isScrolled && isTransparent && "text-white",
                  )}
                />
              </button>
            </div>

            <div className="absolute inset-0 m-auto hidden size-fit lg:block">
              <ul className="flex gap-8 text-sm">
                {menuItems.map((item, index) => (
                  <li key={index}>
                    <Link
                      href={item.href}
                      onClick={(e) => handleSmoothScroll(e, item.href)}
                      className={cn(
                        "hover:text-foreground block duration-150 transition-colors",
                        isScrolled
                          ? activeSection === item.href.substring(1)
                            ? "text-primary font-medium"
                            : "text-muted-foreground"
                          : isTransparent
                            ? activeSection === item.href.substring(1)
                              ? "text-white font-bold"
                              : "text-white/80 hover:text-white"
                            : activeSection === item.href.substring(1)
                              ? "text-primary font-medium"
                              : "text-muted-foreground",
                      )}
                    >
                      <span>{item.name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div
              className={cn(
                "bg-background in-data-[state=active]:block lg:in-data-[state=active]:flex mb-6 hidden w-full flex-wrap items-center justify-end space-y-8 rounded-3xl border p-6 shadow-2xl shadow-zinc-300/20 md:flex-nowrap lg:m-0 lg:flex lg:w-fit lg:gap-6 lg:space-y-0 lg:border-transparent lg:bg-transparent lg:p-0 lg:shadow-none dark:shadow-none dark:lg:bg-transparent",
                !isScrolled &&
                  isTransparent &&
                  "bg-black/50 backdrop-blur-lg border-white/10 lg:bg-transparent lg:backdrop-blur-none lg:border-transparent",
              )}
            >
              <div className="lg:hidden">
                <ul className="space-y-6 text-base">
                  {menuItems.map((item, index) => (
                    <li key={index}>
                      <Link
                        href={item.href}
                        onClick={(e) => handleSmoothScroll(e, item.href)}
                        className={cn(
                          "hover:text-foreground block duration-150",
                          isScrolled
                            ? activeSection === item.href.substring(1)
                              ? "text-primary font-medium"
                              : "text-muted-foreground"
                            : isTransparent
                              ? activeSection === item.href.substring(1)
                                ? "text-white font-bold"
                                : "text-white/80"
                              : activeSection === item.href.substring(1)
                                ? "text-primary font-medium"
                                : "text-muted-foreground",
                        )}
                      >
                        <span>{item.name}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex w-full flex-col space-y-3 sm:flex-row sm:gap-3 sm:space-y-0 md:w-fit">
                <Button
                  asChild
                  variant={
                    isScrolled ? "outline" : isTransparent ? "ghost" : "outline"
                  }
                  size="sm"
                  className={cn(
                    isScrolled && "lg:hidden",
                    !isScrolled &&
                      isTransparent &&
                      "text-white hover:bg-white/10",
                  )}
                >
                  <Link href="login">Login</Link>
                </Button>
                <Button
                  asChild
                  size="sm"
                  className={cn(
                    isScrolled && "lg:hidden",
                    !isScrolled &&
                      isTransparent &&
                      "bg-white text-black hover:bg-white/90",
                  )}
                >
                  <Link href="signup">Sign Up</Link>
                </Button>
                <Button
                  asChild
                  size="sm"
                  className={cn(isScrolled ? "lg:inline-flex" : "hidden")}
                >
                  <Link href="signup">Get Started</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </nav>
    </header>
  );
};
