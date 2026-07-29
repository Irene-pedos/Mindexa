// frontend/components/sections/CrisisSection.tsx
"use client";

import React from "react";
import { ShieldAlert, Workflow, BookOpen, Cpu } from "lucide-react";
import Image from "next/image";
import { motion, Variants } from "motion/react";

const problems = [
  {
    icon: ShieldAlert,
    title: "Assessment Environments at Risk",
    desc: "Digital examinations often lack sufficient controls, enabling manipulation, copy-paste attempts, and unauthorized assistance during assessments.",
    badge: "Security Gap",
    colorClass: "text-red-600 dark:text-red-400 bg-red-50/50 dark:bg-red-950/10 border-red-100 dark:border-red-900/30",
  },
  {
    icon: Workflow,
    title: "Disconnected Academic Workflows",
    desc: "Lecturers and students are forced to navigate multiple uncoordinated systems, resulting in operational friction, manual data transfers, and transcription errors.",
    badge: "Friction",
    colorClass: "text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/10 border-blue-100 dark:border-blue-900/30",
  },
  {
    icon: BookOpen,
    title: "Excessive Academic Burden",
    desc: "Manual grading, fragmented feedback loops, and heavy administrative overhead consume valuable institutional hours that should be spent on instruction.",
    badge: "Time Sink",
    colorClass: "text-amber-600 dark:text-amber-400 bg-amber-50/50 dark:bg-amber-950/10 border-amber-100 dark:border-amber-900/30",
  },
  {
    icon: Cpu,
    title: "Misaligned Use of AI Technologies",
    desc: "Unregulated AI usage introduces academic integrity risks, cheats the learning process, and undermines the authenticity of student evaluations.",
    badge: "AI Exploits",
    colorClass: "text-violet-600 dark:text-violet-400 bg-violet-50/50 dark:bg-violet-950/10 border-violet-100 dark:border-violet-900/30",
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

interface FeatureItemProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
  badge: string;
  colorClass: string;
}

function FeatureItem({ icon: Icon, title, desc, badge, colorClass }: FeatureItemProps) {
  return (
    <motion.div
      whileHover={{ y: -4, scale: 1.01 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      className="relative flex gap-3.5 p-4.5 rounded-xl border border-border/60 bg-card hover:bg-muted/5 hover:border-primary/20 transition-all duration-300 group cursor-pointer hover:shadow-md hover:shadow-primary/[0.02]"
    >
      <div className={`size-10 flex items-center justify-center rounded-lg border shrink-0 transition-all duration-300 group-hover:scale-105 group-hover:rotate-3 ${colorClass}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="space-y-1">
        <div className="flex items-center gap-1.5">
          <h4 className="text-sm md:text-base font-medium text-foreground tracking-tight transition-colors duration-300 group-hover:text-primary">
            {title}
          </h4>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-normal shrink-0 ${colorClass}`}>
            {badge}
          </span>
        </div>
        <p className="text-xs md:text-[13px] text-muted-foreground leading-relaxed font-normal">
          {desc}
        </p>
      </div>
    </motion.div>
  );
}

export default function CrisisSection() {
  return (
    <section id="crisis" className="w-full lg:h-screen lg:min-h-0 flex flex-col justify-center py-12 md:py-20 lg:py-0 bg-background border-y border-border overflow-hidden relative">
      {/* Subtle ambient light gradient background */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_-20%,rgba(30,50,90,0.03),transparent_70%)] dark:bg-[radial-gradient(circle_at_50%_-20%,rgba(120,119,198,0.05),transparent_70%)] pointer-events-none" />

      <div className="container mx-auto px-6 max-w-7xl relative z-10">
        
        {/* Title Block */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-3xl mx-auto mb-8 lg:mb-14 text-center"
        >
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-destructive/10 text-destructive text-xs font-normal border border-destructive/20 mb-3">
            <ShieldAlert className="w-3.5 h-3.5 animate-bounce" />
            <span>Institutional Challenges</span>
          </div>
          
          <h2 className="text-3xl md:text-5xl font-semibold tracking-tight text-foreground leading-tight">
            Challenges in Digital Assessment
          </h2>
          
          <p className="text-sm md:text-base text-muted-foreground mt-3 max-w-2xl mx-auto font-normal leading-relaxed">
            As academic institutions adopt digital evaluation, critical structural vulnerabilities emerge. Legacy platforms lack safeguards, leading to systemic compromise, administrative overhead, and student disconnect.
          </p>
        </motion.div>

        {/* Core Side-by-Side Content */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          
          {/* Left Column: Overwhelmed Lecturer Image & Stats Overlay */}
          <motion.div 
            initial={{ opacity: 0, x: -30, scale: 0.98 }}
            whileInView={{ opacity: 1, x: 0, scale: 1 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            whileHover={{ scale: 1.01 }}
            className="lg:col-span-5 flex justify-center w-full group/image"
          >
            <div className="relative w-full aspect-[4/3] sm:aspect-square lg:h-[420px] xl:h-[480px] lg:w-full rounded-2xl overflow-hidden border border-border/80 bg-muted/40 shadow-sm transition-shadow duration-500 hover:shadow-xl">
              <Image
                src="/images/Lecturer overwhelmed.png"
                alt="Academic stress and administrative burden"
                fill
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                priority
                className="object-cover transition-transform duration-700 group-hover/image:scale-[1.03]"
              />
              
              {/* Subtle overlay gradient */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
              
              {/* Overlay Stat widget (descriptive and modern) */}
              <motion.div 
                initial={{ opacity: 0, y: 15, scale: 0.95 }}
                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.4, duration: 0.6, type: "spring" }}
                whileHover={{ y: -2, scale: 1.02 }}
                className="absolute bottom-4 left-4 right-4 bg-background/95 backdrop-blur-md border border-border p-4 rounded-xl shadow-md flex items-center gap-3 cursor-pointer transition-all duration-300 hover:border-destructive/30"
              >
                <div className="size-10 rounded-lg bg-destructive/10 flex items-center justify-center text-destructive shrink-0">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium text-foreground">Operational Stress Alert</p>
                  <p className="text-[11px] text-muted-foreground leading-normal mt-0.5">Lecturers lose up to 15+ hours/week on administrative overhead and grading.</p>
                </div>
              </motion.div>
            </div>
          </motion.div>

          {/* Right Column: Problems list */}
          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
            variants={containerVariants}
            className="lg:col-span-7 space-y-4"
          >
            <div className="space-y-2 text-left">
              <h3 className="text-xl md:text-2xl font-medium tracking-tight text-foreground">
                A Growing Risk to Academic Integrity
              </h3>
              <p className="text-sm text-muted-foreground font-normal leading-relaxed">
                Foundational issues compromise evaluation authenticity, placing a heavy burden on educators while undermining student degrees.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
              {problems.map((problem, index) => (
                <motion.div key={index} variants={itemVariants}>
                  <FeatureItem
                    icon={problem.icon}
                    title={problem.title}
                    desc={problem.desc}
                    badge={problem.badge}
                    colorClass={problem.colorClass}
                  />
                </motion.div>
              ))}
            </div>
          </motion.div>
          
        </div>
      </div>
    </section>
  );
}
