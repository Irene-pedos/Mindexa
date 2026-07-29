// frontend/components/sections/RedefiningSection.tsx
"use client";

import React from "react";
import { ChevronRight, Info, Target, Cpu, Users } from "lucide-react";
import Image from "next/image";
import { motion, Variants } from "motion/react";

import { useEffect, useRef } from "react";
import { useInView, useMotionValue, useSpring } from "motion/react";

const stats = [
  { value: 10, suffix: "k+", label: "Assessments Conducted" },
  { value: 1, suffix: "k+", label: "Students Served" },
  { value: 5, suffix: "+", label: "Institutions Engaged" },
];

function CountUp({ value, suffix }: { value: number; suffix: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const motionValue = useMotionValue(0);
  const springValue = useSpring(motionValue, {
    damping: 30,
    stiffness: 80,
  });
  const isInView = useInView(ref, { once: true, amount: 0.5 });

  useEffect(() => {
    if (isInView) {
      motionValue.set(value);
    }
  }, [isInView, motionValue, value]);

  useEffect(() => {
    return springValue.on("change", (latest) => {
      if (ref.current) {
        ref.current.textContent = Math.floor(latest).toString();
      }
    });
  }, [springValue]);

  return (
    <span className="inline-flex items-center">
      <span ref={ref}>0</span>
      <span>{suffix}</span>
    </span>
  );
}

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.12,
      delayChildren: 0.15,
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 25 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: [0.16, 1, 0.3, 1], // easeOutQuart
    },
  },
};

export default function RedefiningSection() {
  return (
    <section id="about" className="w-full lg:h-screen lg:min-h-0 flex flex-col justify-center py-12 md:py-20 lg:py-0 bg-background border-b border-border overflow-hidden relative">
      {/* Subtle ambient light gradient background */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_-10%,rgba(30,50,90,0.02),transparent_70%)] dark:bg-[radial-gradient(circle_at_20%_-10%,rgba(120,119,198,0.04),transparent_70%)] pointer-events-none" />

      <div className="container mx-auto px-6 max-w-7xl relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          
          {/* LEFT SIDE: Stats & Image */}
          <div className="lg:col-span-5 space-y-6 lg:space-y-8">
            
            {/* Stats */}
            <motion.div 
              initial={{ opacity: 0, y: 15 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="grid grid-cols-3 gap-4 border-b border-border/80 pb-6"
            >
              {stats.map((stat, i) => (
                <div key={i} className="space-y-0.5 text-left">
                  <span className="text-2xl md:text-3xl font-semibold tracking-tight text-foreground">
                    <CountUp value={stat.value} suffix={stat.suffix} />
                  </span>
                  <p className="text-[10px] md:text-xs text-muted-foreground font-normal leading-tight">{stat.label}</p>
                </div>
              ))}
            </motion.div>

            {/* Students Image */}
            <motion.div 
              initial={{ opacity: 0, x: -30, scale: 0.98 }}
              whileInView={{ opacity: 1, x: 0, scale: 1 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              whileHover={{ scale: 1.01 }}
              className="relative w-full aspect-[4/3] sm:aspect-square lg:h-[350px] xl:h-[400px] lg:w-full rounded-2xl overflow-hidden border border-border/80 bg-muted/40 shadow-sm transition-shadow duration-500 hover:shadow-xl group/img"
            >
              <Image
                src="/images/Redefining Academic Assessment2.png"
                alt="Academic Integrity Solution"
                fill
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                className="object-cover transition-transform duration-700 group-hover/img:scale-[1.03]"
              />
              
              {/* Subtle overlay gradient */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />

              {/* Overlay widget */}
              <motion.div 
                initial={{ opacity: 0, y: 15, scale: 0.95 }}
                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.4, duration: 0.6, type: "spring" }}
                whileHover={{ y: -2, scale: 1.02 }}
                className="absolute bottom-4 left-4 right-4 bg-background/95 backdrop-blur-md border border-border p-4 rounded-xl shadow-md flex items-center gap-3 cursor-pointer transition-all duration-300 hover:border-primary/30"
              >
                <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0 transition-transform duration-300">
                  <Users className="w-5 h-5 animate-pulse" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium text-foreground">Institutional Trust</p>
                  <p className="text-[11px] text-muted-foreground leading-normal mt-0.5">Trusted by top universities for defending academic credibility and workflow rigor.</p>
                </div>
              </motion.div>
            </motion.div>
          </div>

          {/* RIGHT SIDE: Bento Grid of Cards */}
          <div className="lg:col-span-7 space-y-6">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="text-left"
            >
              <h2 className="text-3xl md:text-5xl font-semibold tracking-tight text-foreground leading-tight">
                Redefining Academic Assessment
              </h2>
              <p className="text-sm md:text-base text-muted-foreground mt-3 font-normal leading-relaxed">
                Mindexa was created to address the growing disconnect between digital convenience and academic credibility, establishing a new standard of trust.
              </p>
            </motion.div>

            <motion.div 
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.2 }}
              variants={containerVariants}
              className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6"
            >
              {/* Card 1 */}
              <motion.div 
                variants={itemVariants} 
                whileHover={{ y: -6, scale: 1.01 }}
                transition={{ type: "spring", stiffness: 350, damping: 25 }}
                className="h-full"
              >
                <div className="h-full border border-border/80 bg-card hover:bg-muted/5 hover:border-primary/20 transition-all duration-300 p-5 rounded-xl flex flex-col justify-between group cursor-pointer hover:shadow-md">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm md:text-base font-semibold text-foreground tracking-tight transition-colors duration-300 group-hover:text-primary">
                        What is Mindexa
                      </h3>
                      <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary transition-all duration-300 group-hover:bg-primary group-hover:text-primary-foreground">
                        <Info className="w-4.5 h-4.5 transition-transform duration-300 group-hover:scale-110" />
                      </div>
                    </div>
                    <p className="text-xs md:text-sm text-muted-foreground leading-relaxed font-normal">
                      Mindexa is an institutional academic assessment operating system designed to safeguard examination integrity while unifying separate evaluation pipelines.
                    </p>
                  </div>
                  <div className="pt-4 mt-auto">
                    <a
                      href="#"
                      className="inline-flex items-center gap-1 text-xs md:text-sm font-medium text-primary hover:text-primary/80 transition-colors"
                    >
                      Read More <ChevronRight className="h-4 w-4 group-hover:translate-x-1 transition-transform duration-300" />
                    </a>
                  </div>
                </div>
              </motion.div>

              {/* Card 2 */}
              <motion.div 
                variants={itemVariants} 
                whileHover={{ y: -6, scale: 1.01 }}
                transition={{ type: "spring", stiffness: 350, damping: 25 }}
                className="h-full"
              >
                <div className="h-full border border-border/80 bg-card hover:bg-muted/5 hover:border-primary/20 transition-all duration-300 p-5 rounded-xl flex flex-col justify-between group cursor-pointer hover:shadow-md">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm md:text-base font-semibold text-foreground tracking-tight transition-colors duration-300 group-hover:text-primary">
                        Why Mindexa Exists
                      </h3>
                      <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary transition-all duration-300 group-hover:bg-primary group-hover:text-primary-foreground">
                        <Target className="w-4.5 h-4.5 transition-transform duration-300 group-hover:scale-110" />
                      </div>
                    </div>
                    <p className="text-xs md:text-sm text-muted-foreground leading-relaxed font-normal">
                      Mindexa was created to bridge the critical gap between online convenience and traditional evaluation standards, making cheating-free digital tests viable.
                    </p>
                  </div>
                  <div className="pt-4 mt-auto">
                    <a
                      href="#"
                      className="inline-flex items-center gap-1 text-xs md:text-sm font-medium text-primary hover:text-primary/80 transition-colors"
                    >
                      Read More <ChevronRight className="h-4 w-4 group-hover:translate-x-1 transition-transform duration-300" />
                    </a>
                  </div>
                </div>
              </motion.div>

              {/* Card 3 - Full width to complete bento look */}
              <motion.div 
                variants={itemVariants} 
                whileHover={{ y: -6, scale: 1.01 }}
                transition={{ type: "spring", stiffness: 350, damping: 25 }}
                className="sm:col-span-2"
              >
                <div className="border border-border/80 bg-card hover:bg-muted/5 hover:border-primary/20 transition-all duration-300 p-5 rounded-xl flex flex-col justify-between group cursor-pointer hover:shadow-md">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm md:text-base font-semibold text-foreground tracking-tight transition-colors duration-300 group-hover:text-primary">
                        How Mindexa is Built
                      </h3>
                      <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary transition-all duration-300 group-hover:bg-primary group-hover:text-primary-foreground">
                        <Cpu className="w-4.5 h-4.5 transition-transform duration-300 group-hover:scale-110" />
                      </div>
                    </div>
                    <p className="text-xs md:text-sm text-muted-foreground leading-relaxed font-normal">
                      Mindexa is engineered around clarity, auditability, and institutional security. Every feature is purpose-driven, every workflow traceable under full oversight, and every intelligent grading function explicitly constrained by lecturer-defined criteria.
                    </p>
                  </div>
                  <div className="pt-4 mt-auto">
                    <a
                      href="#"
                      className="inline-flex items-center gap-1 text-xs md:text-sm font-medium text-primary hover:text-primary/80 transition-colors"
                    >
                      Read More <ChevronRight className="h-4 w-4 group-hover:translate-x-1 transition-transform duration-300" />
                    </a>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          </div>

        </div>
      </div>
    </section>
  );
}
