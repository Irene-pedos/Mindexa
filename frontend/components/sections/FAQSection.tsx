// frontend/components/sections/FAQSection.tsx
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { TypographyH3, TypographyP } from "@/components/ui/typography";
import Link from "next/link";
import { InView } from "@/components/ui/in-view";
import { BlurredStagger } from "@/components/text-reveal-faqs"; // adjust path if needed

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

export default function FAQSection() {
  return (
    <section className="py-6 bg-background">
      <div className="container mx-auto px-6 max-w-7xl">
        <div className="grid gap-12 md:grid-cols-5">
          
          {/* Left Column - Heading + Intro */}
          <div className="md:col-span-2">
            <InView>
              <TypographyH3 className="text-foreground tracking-tight text-3xl">
                Address concerns, reduce uncertainty, and establish trust.
              </TypographyH3>
            </InView>

            <TypographyP className="mt-6 text-muted-foreground text-[15px] leading-relaxed">
              Mindexa Platform is a modern, secure, and intelligent academic assessment and learning platform designed to solve critical challenges faced by colleges and universities in the digital education era.
            </TypographyP>

            <p className="mt-8 hidden md:block text-sm text-muted-foreground">
              Can’t find what you’re looking for? Reach out to our{" "}
              <Link href="#" className="text-primary font-medium hover:underline">
                support team
              </Link>{" "}
              for assistance.
            </p>
          </div>

          {/* Right Column - Accordion */}
          <div className="md:col-span-3">
            <Accordion type="single" collapsible className="w-full">
              {faqItems.map((item) => (
                <AccordionItem
                  key={item.id}
                  value={item.id}
                  className="border-b border-border"
                >
                  <AccordionTrigger className="text-left text-base font-medium py-5 hover:no-underline">
                    {item.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground text-[15px] leading-relaxed pb-6">
                    <BlurredStagger text={item.answer} />
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>

            {/* Mobile support link */}
            <p className="mt-8 md:hidden text-sm text-muted-foreground">
              Can’t find what you’re looking for? Contact our{" "}
              <Link href="#" className="text-primary font-medium hover:underline">
                support team
              </Link>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}