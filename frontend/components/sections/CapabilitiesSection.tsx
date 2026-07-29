// frontend/components/sections/CapabilitiesSection.tsx
"use client";

import React from "react";
import { Shield, BookOpen, Scale, Users, Award, Eye, Sparkles, ChevronRight } from "lucide-react";
import Image from "next/image";
import { motion } from "motion/react";

const capabilities = [
  {
    icon: Shield,
    title: "Secure Assessments and Examinations",
    description: "Assessments are delivered within controlled environments that enforce timing constraints, randomized content delivery, continuous activity logging, and strict submission protocols.",
  },
  {
    icon: BookOpen,
    title: "Homework and Assignment Management",
    description: "Lecturers can issue assignments with defined criteria, deadlines, and grading structures. Students benefit from clear submission workflows and structured feedback channels.",
  },
  {
    icon: Scale,
    title: "Appeals and Re-Evaluation Framework",
    description: "Mindexa introduces a formalized appeal mechanism that ensures accountability. Each appeal is documented, reviewed through a defined process, and resolved transparently.",
  },
  {
    icon: Users,
    title: "Role-Based Dashboards",
    description: "Tailored interfaces for Students, Lecturers, and Administrators with live integrity monitoring and real-time analytics.",
  },
  {
    icon: Award,
    title: "Rubric-Based Evaluation",
    description: "Lecturers define detailed rubrics that the AI uses for consistent and fair semantic analysis of open-ended answers.",
  },
  {
    icon: Eye,
    title: "Live Proctoring Bar",
    description: "Persistent real-time integrity monitoring visible during every assessment with behavioral biometrics.",
  },
];

const row1Capabilities = capabilities;
const row2Capabilities = [
  capabilities[3],
  capabilities[4],
  capabilities[5],
  capabilities[0],
  capabilities[1],
  capabilities[2],
];

interface CapabilityCardProps {
  cap: typeof capabilities[number];
}

function CapabilityCard({ cap }: CapabilityCardProps) {
  return (
    <motion.div
      whileHover={{ y: -6, scale: 1.02 }}
      transition={{ type: "spring", stiffness: 350, damping: 25 }}
      className="w-[280px] md:w-[320px] shrink-0 p-5 rounded-xl border border-border/85 bg-card hover:border-primary/30 transition-all duration-300 flex flex-col gap-3 group/card cursor-pointer hover:shadow-lg hover:shadow-primary/5"
    >
      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary transition-all duration-300 group-hover/card:bg-primary group-hover/card:text-primary-foreground">
        <cap.icon className="h-4.5 w-4.5 transition-transform duration-300 group-hover/card:scale-110 group-hover/card:rotate-6" />
      </div>
      <div className="space-y-1">
        <h4 className="text-sm font-semibold text-foreground leading-tight tracking-tight transition-colors duration-300 group-hover/card:text-primary">
          {cap.title}
        </h4>
        <p className="text-xs text-muted-foreground leading-relaxed font-normal">
          {cap.description}
        </p>
      </div>
    </motion.div>
  );
}

export default function CapabilitiesSection() {
  const [isRow1Hovered, setIsRow1Hovered] = React.useState(false);
  const [isRow2Hovered, setIsRow2Hovered] = React.useState(false);

  return (
    <section id="capabilities" className="py-20 md:py-28 bg-background overflow-hidden relative">
      {/* Subtle ambient light gradient background */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_-10%,rgba(30,50,90,0.02),transparent_70%)] dark:bg-[radial-gradient(circle_at_50%_-10%,rgba(120,119,198,0.04),transparent_70%)] pointer-events-none" />

      <div className="container mx-auto px-6 max-w-7xl relative z-10">
        
        {/* Title */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="mb-12 text-left"
        >
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-normal border border-primary/20 mb-3">
            <Sparkles className="w-3.5 h-3.5 animate-pulse" />
            <span>Platform Capabilities</span>
          </div>
          
          <h2 className="text-3xl md:text-5xl font-semibold tracking-tight text-foreground leading-tight">
            Core Capabilities of Mindexa
          </h2>
          <p className="text-sm md:text-base text-muted-foreground mt-3 max-w-2xl font-normal leading-relaxed">
            Explore the advanced toolset engineered to defend assessment integrity, simplify academic operations, and deliver institutional clarity.
          </p>
        </motion.div>
      </div>

      {/* Double Row Infinite Marquee Scroll */}
      <div className="relative flex w-full flex-col gap-6 items-center justify-center overflow-hidden py-4">
        
        {/* Row 1 - Anticlockwise (Right to Left) */}
        <div 
          onMouseEnter={() => setIsRow1Hovered(true)}
          onMouseLeave={() => setIsRow1Hovered(false)}
          className="group flex overflow-hidden w-full [--gap:1.5rem] [gap:var(--gap)] flex-row [--duration:70s]"
        >
          <div 
            className="flex shrink-0 justify-around [gap:var(--gap)] animate-marquee flex-row"
            style={{ animationPlayState: isRow1Hovered ? "paused" : "running" }}
          >
            {row1Capabilities.map((cap, i) => (
              <CapabilityCard key={`row1-1-${i}`} cap={cap} />
            ))}
          </div>
          <div 
            className="flex shrink-0 justify-around [gap:var(--gap)] animate-marquee flex-row" 
            style={{ animationPlayState: isRow1Hovered ? "paused" : "running" }}
            aria-hidden="true"
          >
            {row1Capabilities.map((cap, i) => (
              <CapabilityCard key={`row1-2-${i}`} cap={cap} />
            ))}
          </div>
        </div>

        {/* Row 2 - Clockwise (Left to Right) */}
        <div 
          onMouseEnter={() => setIsRow2Hovered(true)}
          onMouseLeave={() => setIsRow2Hovered(false)}
          className="group flex overflow-hidden w-full [--gap:1.5rem] [gap:var(--gap)] flex-row [--duration:70s]"
        >
          <div 
            className="flex shrink-0 justify-around [gap:var(--gap)] animate-marquee flex-row"
            style={{ 
              animationPlayState: isRow2Hovered ? "paused" : "running",
              animationDirection: "reverse"
            }}
          >
            {row2Capabilities.map((cap, i) => (
              <CapabilityCard key={`row2-1-${i}`} cap={cap} />
            ))}
          </div>
          <div 
            className="flex shrink-0 justify-around [gap:var(--gap)] animate-marquee flex-row"
            style={{ 
              animationPlayState: isRow2Hovered ? "paused" : "running",
              animationDirection: "reverse"
            }}
            aria-hidden="true"
          >
            {row2Capabilities.map((cap, i) => (
              <CapabilityCard key={`row2-2-${i}`} cap={cap} />
            ))}
          </div>
        </div>

        {/* Elegant side fades */}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-background via-background/80 to-transparent z-10" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-background via-background/80 to-transparent z-10" />
      </div>

      <div className="container mx-auto px-6 max-w-7xl relative z-10">
        {/* Bottom Bar */}
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
          className="mt-12 flex flex-col sm:flex-row items-center justify-between gap-4 bg-muted/40 rounded-xl px-6 py-4 border border-border/80"
        >
          <p className="text-xs md:text-sm text-muted-foreground max-w-2xl font-normal leading-normal">
            Every capability is designed with security and institutional compliance at its core.
          </p>

          <div className="flex-shrink-0">
            <a
              href="#"
              className="inline-flex items-center gap-1.5 text-xs md:text-sm font-medium text-primary hover:text-primary/80 transition-colors whitespace-nowrap group"
            >
              Explore all features
              <ChevronRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
            </a>
          </div>
        </motion.div>
      </div>
    </section>
  );
}