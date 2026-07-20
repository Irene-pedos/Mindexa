// frontend/components/sections/UnifiedSolutionSection.tsx
"use client";

import React from "react";
import { Shield, TrendingUp, Brain, Briefcase } from "lucide-react";
import Image from "next/image";
import { motion, Variants } from "motion/react";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import ShinyText from "@/components/ShinyText";

const features = [
  {
    icon: Shield,
    title: "Structural Security",
    description: "Conduct assessments in high-integrity, sandboxed environments that prevent unauthorized assistance.",
  },
  {
    icon: TrendingUp,
    title: "Evaluation Transparency",
    description: "Provide clear, explainable AI grading criteria that lecturers and students can trace step-by-step.",
  },
  {
    icon: Brain,
    title: "Intelligent Assistance",
    description: "Streamline grading workflows with semantic rubric matching and automated feedback suggestions.",
  },
  {
    icon: Briefcase,
    title: "Operational Cohesion",
    description: "Bridge the gap between student portfolios, administrative compliance, and academic records in a single system.",
  },
];

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.1,
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 15 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.4,
      ease: [0.215, 0.61, 0.355, 1], // easeOutCubic
    },
  },
};

export default function UnifiedSolutionSection() {
  return (
    <section id="solution" className="w-full lg:h-screen lg:min-h-0 flex flex-col justify-center py-12 md:py-20 lg:py-0 bg-background border-b border-border overflow-hidden relative">
      {/* Subtle ambient light gradient background */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_120%,rgba(30,50,90,0.03),transparent_70%)] dark:bg-[radial-gradient(circle_at_50%_120%,rgba(120,119,198,0.05),transparent_70%)] pointer-events-none" />

      <div className="container mx-auto px-6 max-w-7xl relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          
          {/* Left Side - Text + Features */}
          <div className="lg:col-span-7 space-y-6 lg:space-y-8">
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="space-y-3 text-left"
            >
              <h2 className="text-3xl md:text-5xl font-semibold tracking-tight text-foreground leading-tight">
                A Deliberate and{" "}
                <ShinyText
                  text="Unified"
                  speed={4}
                  shineColor="oklch(0.488 0.243 264.376)"
                  color="oklch(0.148 0.004 228.8)"
                />{" "}
                Academic Solution
              </h2>

              <p className="text-sm md:text-base text-muted-foreground max-w-2xl leading-relaxed font-normal">
                Mindexa Platform is architected as a single, coherent academic
                environment where assessment, learning, oversight, and analysis
                coexist seamlessly. It replaces disjointed tools with a unified
                system that prioritizes integrity, traceability, and clarity.
              </p>
            </motion.div>

            {/* Features List using Item component */}
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.2 }}
              variants={containerVariants}
              className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mt-6"
            >
              {features.map((feature, index) => (
                <motion.div key={index} variants={itemVariants}>
                  <Item
                    variant="outline"
                    size="xs"
                    className="border-border/60 bg-card hover:bg-muted/10 hover:border-border transition-all duration-300 group flex items-start p-4.5 rounded-xl"
                  >
                    <ItemMedia variant="icon" className="size-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0 mr-3.5 transition-all duration-300 group-hover:scale-[1.02]">
                      <feature.icon className="h-5 w-5" />
                    </ItemMedia>
                    <ItemContent className="space-y-1">
                      <ItemTitle className="text-sm md:text-base font-medium text-foreground tracking-tight">
                        {feature.title}
                      </ItemTitle>
                      <ItemDescription className="text-xs md:text-[13px] text-muted-foreground leading-relaxed font-normal">
                        {feature.description}
                      </ItemDescription>
                    </ItemContent>
                  </Item>
                </motion.div>
              ))}
            </motion.div>
          </div>

          {/* Right Side - Image */}
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="lg:col-span-5 flex justify-center w-full"
          >
            <div className="relative w-full aspect-[4/3] sm:aspect-square lg:h-[420px] xl:h-[480px] lg:w-full rounded-2xl overflow-hidden border border-border/80 bg-muted/40 shadow-sm">
              <Image
                src="/images/Unified Academic Solution.png"
                alt="Academic Solution"
                fill
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                className="object-cover"
              />
              
              {/* Subtle overlay gradient */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />

              {/* Overlay Stat widget (descriptive and modern) */}
              <div className="absolute bottom-4 left-4 right-4 bg-background/90 backdrop-blur-md border border-border p-4 rounded-xl shadow-md flex items-center gap-3">
                <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                  <Shield className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium text-foreground">Cohesive Environment</p>
                  <p className="text-[11px] text-muted-foreground leading-normal mt-0.5">Integrate courses, assessments, and grade reviews under one secure audit trail.</p>
                </div>
              </div>
            </div>
          </motion.div>
          
        </div>
      </div>
    </section>
  );
}
