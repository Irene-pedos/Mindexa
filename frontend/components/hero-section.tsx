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

      <main className="overflow-hidden bg-white min-h-screen relative">
        {/* Light subtle background pattern */}
        <div aria-hidden className="absolute inset-0 isolate opacity-40">
          <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:60px_60px]" />
        </div>

        <section
          id="home"
          className="relative min-h-screen flex items-center pt-20 pb-16"
        >
          <div className="mx-auto max-w-7xl px-6 w-full">
            <div className="grid lg:grid-cols-12 gap-12 items-center">
              {/* Center Content */}
              <div className="lg:col-span-7">
                <AnimatedGroup variants={transitionVariants}>
                  <Link
                    href="#"
                    className="mx-auto flex w-fit items-center gap-3 rounded-full border bg-white px-5 py-2 text-sm shadow-sm hover:shadow transition-all duration-300"
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
                  <TypographyH2 className="text-balance text-5xl md:text-6xl  leading-none font-semibold tracking-tighter text-slate-950">
                    Powering the{" "}
                    <ShinyText
                      text="Secure Future"
                      speed={8}
                      shineColor="oklch(0.488 0.243 264.376)"
                      color="oklch(0.148 0.004 228.8)"
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
                  className="mx-auto mt-8 max-w-3xl  text-lg md:text-xl text-slate-700"
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
                    <Link href="#get-started">Get Started</Link>
                  </Button>

                  <Button
                    asChild
                    size="lg"
                    variant="outline"
                    className="rounded-full px-8 text-base font-medium"
                  >
                    <Link href="#demo">
                      See it in action <PlayCircle className="ml-2 h-5 w-5" />
                    </Link>
                  </Button>
                </AnimatedGroup>
              </div>

              {/* Right Side - Image Card with Skeleton fallback */}
              <div className="lg:col-span-5 flex justify-center lg:justify-end">
                <InView>
                  <div className="relative h-[500px] w-full rounded-3xl overflow-hidden shadow-l border border-border">
                    <img
                      src="https://images.unsplash.com/photo-1524178232363-1fb2b075b655"
                      alt="Students focused during digital exam"
                      className="object-cover h-full w-full"
                    />
                  </div>
                </InView>
              </div>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
