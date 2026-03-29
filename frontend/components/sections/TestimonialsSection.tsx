// frontend/components/sections/TestimonialsSection.tsx
import { TypographyH2, TypographyP } from "@/components/ui/typography";
import { TestimonialCard, TestimonialAuthor } from "@/components/ui/testimonial-card";
import { InView } from "@/components/ui/in-view";

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

export default function TestimonialsSection() {
  return (
    <section className="py-16 bg-background">
      <div className="container mx-auto px-6 max-w-7xl">
        
        {/* Header */}
        <div className="text-center mb-12">
          <InView>
            <TypographyH2 className="text-foreground tracking-tight">
              Trusted by Academic Communities
            </TypographyH2>
          </InView>
          <TypographyP className="mt-4 text-muted-foreground max-w-2xl mx-auto text-base">
            Lecturers and students from partner institutions highlight Mindexa’s clarity, fairness, and reliability in managing assessments and academic workflows.
          </TypographyP>
        </div>

        {/* Infinite Marquee */}
        <div className="relative overflow-hidden group">
          <div className="flex overflow-hidden p-2 [--gap:1.25rem] [gap:var(--gap)] flex-row [--duration:45s]">
            <div className="flex shrink-0 justify-around [gap:var(--gap)] animate-marquee flex-row hover:[animation-play-state:paused] group-hover:[animation-play-state:paused]">
              {[...Array(3)].map((_, setIndex) => (
                testimonials.map((testimonial, i) => (
                  <TestimonialCard
                    key={`${setIndex}-${i}`}
                    author={testimonial.author}
                    text={testimonial.text}
                  />
                ))
              ))}
            </div>
          </div>

          {/* Fade edges */}
          <div className="pointer-events-none absolute inset-y-0 left-0 w-1/4 bg-gradient-to-r from-background to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-1/4 bg-gradient-to-l from-background to-transparent" />
        </div>
      </div>
    </section>
  );
}