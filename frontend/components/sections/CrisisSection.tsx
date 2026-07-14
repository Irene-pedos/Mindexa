// frontend/components/sections/CrisisSection.tsx
"use client";

import React from "react";
import { ShieldAlert, Workflow, BookOpen, Cpu } from "lucide-react";
import Image from "next/image";

const problems = [
  {
    icon: ShieldAlert,
    title: "Assessment Environments at Risk",
    desc: "Digital examinations often lack sufficient controls, enabling manipulation, copy-paste attempts, and unauthorized assistance during assessments.",
  },
  {
    icon: Workflow,
    title: "Disconnected Academic Workflows",
    desc: "Lecturers and students are forced to navigate multiple uncoordinated systems, resulting in operational friction, manual data transfers, and transcription errors.",
  },
  {
    icon: BookOpen,
    title: "Excessive Academic Burden",
    desc: "Manual grading, fragmented feedback loops, and heavy administrative overhead consume valuable institutional hours that should be spent on instruction.",
  },
  {
    icon: Cpu,
    title: "Misaligned Use of AI Technologies",
    desc: "Unregulated AI usage introduces academic integrity risks, cheats the learning process, and undermines the authenticity of student evaluations.",
  },
];

export default function CrisisSection() {
  return (
    <section id="crisis" className="min-h-screen lg:h-screen flex flex-col justify-center py-8 lg:py-12 overflow-hidden bg-background border-y border-zinc-200/50 dark:border-zinc-800/40 relative">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,100;1,200;1,300;1,400;1,500;1,600;1,700;1,800;1,900&display=swap');
      
        #crisis, #crisis * {
          font-family: 'Poppins', sans-serif;
        }
      `}</style>

      <div className="w-full max-w-5xl px-6 mx-auto z-10 text-center">
        {/* Title Block */}
        <div className="max-w-2xl mx-auto mb-8 text-center">
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Institutional Challenges in Digital Assessment
          </h1>
          <p className="text-xs md:text-sm text-zinc-500 dark:text-zinc-400 mt-2 max-w-xl mx-auto font-normal leading-relaxed">
            As academic institutions adopt digital assessment methods, critical weaknesses emerge. Existing platforms lack robust safeguards, leading to systemic malpractice, fragmented workflows, and faculty burnout.
          </p>
        </div>

        {/* Core Side-by-Side Content */}
        <div className="grid lg:grid-cols-12 gap-8 items-center max-w-4xl mx-auto">
          {/* Left Column: Overwhelmed Lecturer Image */}
          <div className="lg:col-span-5 flex justify-center w-full">
            <div className="relative w-full max-w-[280px] h-[220px] sm:h-[280px] lg:h-[320px] rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 shadow-sm">
              <Image
                src="/images/Lecturer overwhelmed.png"
                alt="Overwhelmed lecturer"
                fill
                priority
                className="object-cover animate-in fade-in duration-300"
              />
            </div>
          </div>

          {/* Right Column: Problems list */}
          <div className="lg:col-span-7 text-left space-y-4">
            <div>
              <h2 className="text-lg md:text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                A Growing Crisis in Digital Evaluation
              </h2>
              <p className="text-xs md:text-sm text-zinc-500 dark:text-zinc-400 font-normal leading-relaxed mt-1">
                Foundational issues degrade evaluation quality, placing immense burden on educators while undermining the validity of academic achievements.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 mt-4">
              {problems.map((problem, index) => (
                <FeatureItem
                  key={index}
                  icon={problem.icon}
                  title={problem.title}
                  desc={problem.desc}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

interface FeatureItemProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
}

function FeatureItem({ icon: Icon, title, desc }: FeatureItemProps) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-xl border border-zinc-200/60 dark:border-zinc-850 bg-white/40 dark:bg-zinc-900/10 backdrop-blur-sm hover:bg-white dark:hover:bg-zinc-900/30 transition-colors">
      <div className="size-8 flex items-center justify-center bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded shrink-0">
        <Icon className="w-4 h-4 text-zinc-700 dark:text-zinc-350" />
      </div>
      <div className="space-y-0.5">
        <h3 className="text-xs font-semibold text-zinc-850 dark:text-zinc-150">{title}</h3>
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-normal leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}
