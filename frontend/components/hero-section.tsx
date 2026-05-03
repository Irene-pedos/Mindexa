// frontend/components/hero-section.tsx
"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TextEffect } from "@/components/ui/text-effect";
import { AnimatedGroup } from "@/components/ui/animated-group";
import { HeroHeader } from "./header";
import ShinyText from "@/components/ShinyText";
import { TypographyH2 } from "./ui/typography";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { InView } from "@/components/ui/in-view";
import { Variants } from "motion/react";

const transitionVariants: Variants = {
  hidden: { opacity: 0, filter: "blur(12px)", y: 12 },
  visible: {
    opacity: 1,
    filter: "blur(0px)",
    y: 0,
    transition: { type: "spring", bounce: 0.3, duration: 1.5 } as const,
  },
};

export default function HeroSection() {
  return (
    <>
      <HeroHeader />

      <main className="overflow-hidden min-h-screen relative">
        {/* Background Image */}
        <div className="absolute top-15 md:top-18 inset-x-4 md:inset-x-6 bottom-4 md:bottom-6 z-0 rounded-2xl md:rounded-[2.5rem] overflow-hidden">
          <img
            src="/images/hero-section-background.png"
            alt="Students focused during digital exam"
            className="object-cover h-full w-full brightness-50"
          />
          {/* Overlay to ensure text readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-white via-white/0 via-white/0 to-white/0" />
        </div>

        <section
          id="home"
          className="relative z-10 min-h-screen flex items-center pt-20 pb-16"
        >
          <div className="mx-auto max-w-7xl px-6 w-full">
            <div className="max-w-3xl">
              <AnimatedGroup variants={transitionVariants}>
                <Link
                  href="#about"
                  className=" flex w-fit items-center gap-3 rounded-full border bg-white/80 backdrop-blur-sm px-5 py-2 text-sm shadow-sm hover:shadow transition-all duration-300"
                >
                  <span className="text-slate-600">
                    Introducing Explainable AI Grading
                  </span>
                  <div className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
                    New
                  </div>
                </Link>
              </AnimatedGroup>

              {/* Headline with ShinyText */}
              <div className="mt-10">
                <TypographyH2 className="text-balance text-4xl sm:text-5xl md:text-6xl leading-tight md:leading-none font-semibold tracking-tighter text-white">
                  Powering the{" "}
                  <ShinyText
                    text="Secure Future"
                    speed={8}
                    shineColor="oklch(0.488 0.243 264.376)"
                    color="#ffffff"
                  />{" "}
                  of Academic Integrity.
                </TypographyH2>
              </div>

              {/* Subtitle */}
              <TextEffect
                per="line"
                preset="fade-in-blur"
                speedSegment={0.3}
                delay={0.5}
                as="p"
                className="mx-auto mt-6 md:mt-8 max-w-3xl text-base sm:text-lg md:text-xl text-white/90"
              >
                Conduct cheating-free assessments with real time AI monitoring
                and autonomous grading.
              </TextEffect>

              {/* CTAs */}
              <AnimatedGroup
                variants={{
                  container: {
                    visible: {
                      transition: {
                        staggerChildren: 0.05,
                        delayChildren: 0.75,
                      },
                    },
                  },
                  ...transitionVariants,
                }}
                className="mt-10 flex flex-col sm:flex-row gap-4"
              >
                <Button
                  asChild
                  size="lg"
                  className="rounded-full px-8 text-base font-medium"
                >
                  <Link href="/signup">Get Started</Link>
                </Button>

                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="rounded-full px-8 text-base font-medium bg-white/80 backdrop-blur-sm border-slate-300"
                >
                  <Link href="#demo">
                    See it in action <PlayCircle className="ml-2 h-5 w-5" />
                  </Link>
                </Button>
              </AnimatedGroup>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
