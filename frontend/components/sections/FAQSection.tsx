// frontend/components/sections/FAQSection.tsx
"use client";

import React from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import Link from "next/link";
import { HelpCircle, ChevronRight } from "lucide-react";
import { motion } from "motion/react";
import { BlurredStagger } from "@/components/text-reveal-faqs";

const faqItems = [
  {
    id: "item-1",
    question: "Is Mindexa only for online exams?",
    answer: "No. Mindexa supports both fully online and hybrid assessment modes. It works seamlessly with in-person, remote, and blended learning environments.",
  },
  {
    id: "item-2",
    question: "How does Mindexa prevent cheating?",
    answer: "From a technical perspective, Mindexa is developed using a modern, scalable technology stack. The backend is built with FastAPI, providing high-performance RESTful APIs and clean system logic. The frontend is developed using Next.js, delivering a fast, responsive, and user-friendly interface.",
  },
  {
    id: "item-3",
    question: "Does Mindexa use AI to grade students automatically?",
    answer: "Yes. Our Autonomous Grading Engine uses Retrieval-Augmented Generation (RAG) with LangChain to perform deep semantic analysis against lecturer-defined rubrics and returns detailed, traceable explanations.",
  },
  {
    id: "item-4",
    question: "Is the platform difficult to use?",
    answer: "No. Mindexa is designed with simplicity and usability in mind. The interface follows an F-shape scanning pattern and includes clear guidance, making it intuitive for both students and lecturers.",
  },
  {
    id: "item-5",
    question: "Can lecturers customize the grading rubrics?",
    answer: "Absolutely. Lecturers have full control to define detailed rubrics, weightings, and evaluation criteria. The AI strictly follows these rubrics for consistent and fair grading.",
  },
  {
    id: "item-6",
    question: "Is student data secure?",
    answer: "Security is the foundation of Mindexa. All data is encrypted at rest and in transit, with strict role-based access control and regular security audits.",
  },
];
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 15 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: [0.16, 1, 0.3, 1] as const,
    },
  },
};

export default function FAQSection() {
  return (
    <section id="faq" className="py-20 md:py-28 bg-background overflow-hidden relative border-t border-border">
      {/* Subtle ambient light gradient background */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_90%,rgba(30,50,90,0.02),transparent_70%)] dark:bg-[radial-gradient(circle_at_20%_90%,rgba(120,119,198,0.05),transparent_70%)] pointer-events-none" />

      <div className="container mx-auto px-6 max-w-7xl relative z-10">
        <div className="grid gap-12 lg:grid-cols-5 items-start">
          
          {/* Left Column - Heading + Intro */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="lg:col-span-2 text-left space-y-4"
          >
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-normal border border-primary/20">
              <HelpCircle className="w-3.5 h-3.5 animate-pulse" />
              <span>Common Questions</span>
            </div>

            <h2 className="text-3xl md:text-4xl font-semibold tracking-tight text-foreground leading-tight">
              Address concerns, reduce uncertainty, and establish trust.
            </h2>

            <p className="text-sm md:text-base text-muted-foreground leading-relaxed font-normal">
              Mindexa Platform is a modern, secure, and intelligent academic assessment and learning platform designed to solve critical challenges faced by colleges and universities in the digital education era.
            </p>

            <div className="pt-4 hidden lg:block">
              <p className="text-xs md:text-sm text-muted-foreground">
                Can’t find what you’re looking for? Reach out to our{" "}
                <Link href="#" className="text-primary font-medium hover:underline inline-flex items-center gap-0.5 group">
                  support team <ChevronRight className="w-3 h-3 transition-transform duration-300 group-hover:translate-x-0.5" />
                </Link>
              </p>
            </div>
          </motion.div>

          {/* Right Column - Accordion */}
          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
            variants={containerVariants}
            className="lg:col-span-3 w-full"
          >
            <Accordion type="single" collapsible className="w-full border-none space-y-2">
              {faqItems.map((item) => (
                <motion.div key={item.id} variants={itemVariants}>
                  <AccordionItem
                    value={item.id}
                    className="border-b border-border/80 transition-all duration-300 data-[state=open]:bg-muted/40 data-[state=open]:border-primary/20 data-[state=open]:shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] data-[state=open]:px-4 data-[state=open]:rounded-xl"
                  >
                    <AccordionTrigger className="cursor-pointer text-left text-sm md:text-base font-medium py-4 px-2 hover:no-underline hover:text-primary transition-all duration-200 group">
                      <span className="group-hover:translate-x-0.5 transition-transform duration-200">{item.question}</span>
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground text-xs md:text-sm leading-relaxed px-2 pb-4">
                      <BlurredStagger text={item.answer} />
                    </AccordionContent>
                  </AccordionItem>
                </motion.div>
              ))}
            </Accordion>

            {/* Mobile support link */}
            <p className="mt-6 lg:hidden text-xs md:text-sm text-muted-foreground text-left">
              Can’t find what you’re looking for? Contact our{" "}
              <Link href="#" className="text-primary font-medium hover:underline inline-flex items-center gap-0.5 group">
                support team <ChevronRight className="w-3.5 h-3.5 transition-transform duration-300 group-hover:translate-x-0.5" />
              </Link>
            </p>
          </motion.div>

        </div>
      </div>
    </section>
  );
}