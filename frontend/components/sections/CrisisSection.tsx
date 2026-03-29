// frontend/components/sections/CrisisSection.tsx
import { TypographyH2, TypographyP } from "@/components/ui/typography";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InView } from "@/components/ui/in-view";
import { AlertTriangle, Link2Off, Clock, ZapOff } from "lucide-react";

const problems = [
  {
    icon: AlertTriangle,
    title: "Assessment Environments at Risk",
    desc: "Digital examinations often lack sufficient controls, enabling manipulation and unauthorized assistance during assessments.",
  },
  {
    icon: Link2Off,
    title: "Disconnected Academic Workflows",
    desc: "Lecturers and students are forced to navigate multiple uncoordinated systems, reducing efficiency and increasing errors.",
  },
  {
    icon: Clock,
    title: "Excessive Academic Burden",
    desc: "Manual grading, fragmented feedback processes, and administrative overhead consume valuable instructional time.",
  },
  {
    icon: ZapOff,
    title: "Misaligned Use of AI Technologies",
    desc: "Unregulated AI usage introduces ethical risks and undermines the authenticity of student performance.",
  },
];

export default function CrisisSection() {
  return (
    <section id="crisis" className="py-20 bg-background">
      <div className="container mx-auto px-6 max-w-7xl">
        
        {/* Title and Description */}
        <div className="text-center mb-10">
          <InView>
            <TypographyH2 className="text-foreground tracking-tight">
              A Growing Crisis in Digital Academic Evaluation
            </TypographyH2>
          </InView>
          <TypographyP className="mt-6 text-lg text-muted-foreground max-w-4xl mx-auto">
            As academic institutions increasingly adopt digital assessment methods, foundational weaknesses have emerged. Existing platforms often lack robust safeguards against malpractice.
          </TypographyP>
        </div>

        {/* Layout: Image Left + 2x2 Cards Right */}
        <div className="grid lg:grid-cols-12 gap-10 items-center">
          
          {/* Left: Image */}
          <div className="lg:col-span-5">
            <InView>
              <div className="rounded-2xl h-[425px] overflow-hidden shadow-lg border border-border">
                <img
                        src="https://images.unsplash.com/photo-1524178232363-1fb2b075b655"
                        alt="Students focused during digital exam"
                        className="object-cover h-full w-full"
                      />
              </div>
            </InView>
          </div>

          {/* Right: 2×2 Grid */}
          <div className="lg:col-span-7 grid grid-cols-1 md:grid-cols-2 gap-4">
            {problems.map((problem, index) => (
              <InView key={index} delay={index * 80}>
                <Card className="h-full border border-border hover:border-primary/30 transition-colors bg-card">
                  <CardHeader className="pb-2">
                    <problem.icon className="h-6 w-6 text-primary mb-2" />
                    <CardTitle className="text-lg text-foreground">{problem.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <TypographyP className="text-muted-foreground">
                      {problem.desc}
                    </TypographyP>
                  </CardContent>
                </Card>
              </InView>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}