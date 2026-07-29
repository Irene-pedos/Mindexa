// frontend/components/sections/TestimonialsSection.tsx
"use client";

import React from "react";
import { Sparkles } from "lucide-react";
import { TestimonialCard, TestimonialAuthor } from "@/components/ui/testimonial-card";
import { motion } from "motion/react";

const testimonials: Array<{
  author: TestimonialAuthor;
  text: string;
}> = [
  {
    author: {
      name: "John Smith",
      handle: "Lecturer at RP Huye College",
      avatar: "",
    },
    text: "Mindexa Platform is a modern, secure, and intelligent academic assessment and learning platform designed to solve critical challenges faced by colleges and universities in the digital education era.",
  },
  {
    author: {
      name: "Dr. Amina Khan",
      handle: "Professor at University of Nairobi",
      avatar: "",
    },
    text: "The explainable AI grading and full audit trail have completely transformed how we handle assessments. Students now trust the process and grading disputes have dropped significantly.",
  },
  {
    author: {
      name: "Prof. Michael Chen",
      handle: "Head of Computer Science, Stanford",
      avatar: "",
    },
    text: "Mindexa’s real-time integrity monitoring and lockdown features give us peace of mind. The platform is built with academic rigor in mind.",
  },
  {
    author: {
      name: "Sarah Thompson",
      handle: "Student Representative, MIT",
      avatar: "",
    },
    text: "For the first time, I feel the grading is fair and transparent. The AI explanations help me understand exactly where I lost marks.",
  },
  {
    author: {
      name: "Dr. Elena Rodriguez",
      handle: "Dean of Engineering, Cambridge",
      avatar: "",
    },
    text: "Mindexa has restored confidence across our faculty. The combination of behavioral monitoring and explainable AI is exactly what higher education needed.",
  },
  {
    author: {
      name: "James Okello",
      handle: "Lecturer at Makerere University",
      avatar: "",
    },
    text: "The appeals system with full audit trail is a game-changer. Students finally trust the grading process.",
  },
  {
    author: {
      name: "Dr. Priya Sharma",
      handle: "Associate Professor, IIT Delhi",
      avatar: "",
    },
    text: "The platform’s focus on transparency and fairness has improved both student satisfaction and faculty efficiency.",
  },
];

const row1Testimonials = testimonials;
const row2Testimonials = [
  testimonials[3],
  testimonials[4],
  testimonials[5],
  testimonials[6],
  testimonials[0],
  testimonials[1],
  testimonials[2],
];

export default function TestimonialsSection() {
  const [isRow1Hovered, setIsRow1Hovered] = React.useState(false);
  const [isRow2Hovered, setIsRow2Hovered] = React.useState(false);

  return (
    <section id="testimonials" className="py-20 md:py-28 bg-background overflow-hidden relative">
      {/* Subtle ambient light gradient background */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_110%,rgba(30,50,90,0.02),transparent_70%)] dark:bg-[radial-gradient(circle_at_50%_110%,rgba(120,119,198,0.04),transparent_70%)] pointer-events-none" />

      <div className="container mx-auto px-6 max-w-7xl relative z-10">
        
        {/* Header */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-normal border border-primary/20 mb-3">
            <Sparkles className="w-3.5 h-3.5 animate-pulse" />
            <span>Community Voice</span>
          </div>
          
          <h2 className="text-3xl md:text-5xl font-semibold tracking-tight text-foreground leading-tight">
            Trusted by Academic Communities
          </h2>
          <p className="text-sm md:text-base text-muted-foreground mt-3 max-w-2xl mx-auto font-normal leading-relaxed">
            Lecturers and students from partner institutions highlight Mindexa’s clarity, fairness, and reliability in managing assessments and academic workflows.
          </p>
        </motion.div>
      </div>

      {/* Double Row Infinite Marquee Scroll */}
      <div className="relative flex w-full flex-col gap-6 items-center justify-center overflow-hidden py-4">
        
        {/* Row 1 - Anticlockwise (Right to Left) */}
        <div 
          onMouseEnter={() => setIsRow1Hovered(true)}
          onMouseLeave={() => setIsRow1Hovered(false)}
          className="group flex overflow-hidden w-full [--gap:1.5rem] [gap:var(--gap)] flex-row [--duration:75s]"
        >
          <div 
            className="flex shrink-0 justify-around [gap:var(--gap)] animate-marquee flex-row"
            style={{ animationPlayState: isRow1Hovered ? "paused" : "running" }}
          >
            {row1Testimonials.map((testimonial, i) => (
              <motion.div
                key={`row1-1-${i}`}
                whileHover={{ y: -6, scale: 1.02 }}
                transition={{ type: "spring", stiffness: 350, damping: 25 }}
                className="cursor-pointer hover:shadow-lg hover:shadow-primary/[0.02] rounded-lg"
              >
                <TestimonialCard
                  author={testimonial.author}
                  text={testimonial.text}
                />
              </motion.div>
            ))}
          </div>
          <div 
            className="flex shrink-0 justify-around [gap:var(--gap)] animate-marquee flex-row" 
            style={{ animationPlayState: isRow1Hovered ? "paused" : "running" }}
            aria-hidden="true"
          >
            {row1Testimonials.map((testimonial, i) => (
              <motion.div
                key={`row1-2-${i}`}
                whileHover={{ y: -6, scale: 1.02 }}
                transition={{ type: "spring", stiffness: 350, damping: 25 }}
                className="cursor-pointer hover:shadow-lg hover:shadow-primary/[0.02] rounded-lg"
              >
                <TestimonialCard
                  author={testimonial.author}
                  text={testimonial.text}
                />
              </motion.div>
            ))}
          </div>
        </div>

        {/* Row 2 - Clockwise (Left to Right) */}
        <div 
          onMouseEnter={() => setIsRow2Hovered(true)}
          onMouseLeave={() => setIsRow2Hovered(false)}
          className="group flex overflow-hidden w-full [--gap:1.5rem] [gap:var(--gap)] flex-row [--duration:75s]"
        >
          <div 
            className="flex shrink-0 justify-around [gap:var(--gap)] animate-marquee flex-row"
            style={{ 
              animationPlayState: isRow2Hovered ? "paused" : "running",
              animationDirection: "reverse"
            }}
          >
            {row2Testimonials.map((testimonial, i) => (
              <motion.div
                key={`row2-1-${i}`}
                whileHover={{ y: -6, scale: 1.02 }}
                transition={{ type: "spring", stiffness: 350, damping: 25 }}
                className="cursor-pointer hover:shadow-lg hover:shadow-primary/[0.02] rounded-lg"
              >
                <TestimonialCard
                  author={testimonial.author}
                  text={testimonial.text}
                />
              </motion.div>
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
            {row2Testimonials.map((testimonial, i) => (
              <motion.div
                key={`row2-2-${i}`}
                whileHover={{ y: -6, scale: 1.02 }}
                transition={{ type: "spring", stiffness: 350, damping: 25 }}
                className="cursor-pointer hover:shadow-lg hover:shadow-primary/[0.02] rounded-lg"
              >
                <TestimonialCard
                  author={testimonial.author}
                  text={testimonial.text}
                />
              </motion.div>
            ))}
          </div>
        </div>

        {/* Elegant side fades */}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-background via-background/80 to-transparent z-10" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-background via-background/80 to-transparent z-10" />
      </div>

    </section>
  );
}