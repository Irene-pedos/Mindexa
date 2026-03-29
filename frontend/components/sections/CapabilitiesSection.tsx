'use client';

// frontend/components/sections/CapabilitiesSection.tsx
import { TypographyH2, TypographyP } from "@/components/ui/typography";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
import Autoplay from "embla-carousel-autoplay";
import { InView } from "@/components/ui/in-view";
import { Shield, BookOpen, Scale, Users, Award, Eye } from "lucide-react";
import { ChevronRight } from "lucide-react";

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

export default function CapabilitiesSection() {
  return (
    <section id="capabilities" className="py-15 bg-background">
      <div className="container mx-auto px-6 max-w-7xl">
        
        {/* Title */}
        <div className="mb-6">
          <InView>
            <TypographyH2 className="text-foreground tracking-tight">
              Core Capabilities of Mindexa Platform
            </TypographyH2>
          </InView>
        </div>

        {/* Carousel with Autoplay */}
        
          <Carousel
            plugins={[
              Autoplay({
                delay: 2500,
              }),
            ]}
            opts={{
              align: "start",
              loop: true,
            }}
            className="w-full"
          >
            <CarouselContent className="-ml-2 md:-ml-4">
              {capabilities.map((cap, index) => (
                <CarouselItem key={index} className="pl-2 md:pl-4 basis-full md:basis-1/2 lg:basis-1/3">
                  <Card className="h-full border border-border bg-card hover:border-primary/30 transition-all duration-300">
                    <CardHeader className="">
                      <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                        <cap.icon className="h-5 w-5 text-primary" />
                      </div>
                      <CardTitle className="text-l text-foreground leading-tight">
                        {cap.title}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <TypographyP className="text-muted-foreground text-[15px] leading-relaxed">
                        {cap.description}
                      </TypographyP>
                    </CardContent>
                  </Card>
                </CarouselItem>
              ))}
            </CarouselContent>
          </Carousel>
        

        {/* Bottom Bar */}
        <div className="mt-12 flex flex-col sm:flex-row items-center justify-between gap-6 bg-muted/60 rounded-2xl px-8 py-5 border border-border">
          <TypographyP className="text-muted-foreground text-sm max-w-2xl">
            Assessments are delivered within controlled environments that enforce timing constraints.
          </TypographyP>

          <div className="flex-shrink-0">
            <a
              href="#"
              className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors whitespace-nowrap"
            >
              View all
              <ChevronRight className="h-4 w-4" />
            </a>
          </div>
        </div>

      </div>
    </section>
  );
}