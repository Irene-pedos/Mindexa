// frontend/components/sections/RedefiningSection.tsx
import { TypographyH2, TypographyP } from "@/components/ui/typography";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InView } from "@/components/ui/in-view";
import { ChevronRight } from "lucide-react";

export default function RedefiningSection() {
  return (
    <section id="about" className="py-16 bg-background">
      <div className="container mx-auto px-6 max-w-7xl">
        <div className="grid lg:grid-cols-12 gap-10 items-start">
          {/* LEFT SIDE */}
          <div className="lg:col-span-5 space-y-10">
            {/* Stats - smaller size, one line */}
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
              <div>
                <div className="text-2xl font-semibold text-foreground">
                  10k+
                </div>
                <div className="text-muted-foreground mt-1">
                  Assessments conducted
                </div>
              </div>
              <div>
                <div className="text-2xl font-semibold text-foreground">
                  1k+
                </div>
                <div className="text-muted-foreground mt-1">
                  Students served
                </div>
              </div>
              <div>
                <div className="text-2xl font-semibold text-foreground">5+</div>
                <div className="text-muted-foreground mt-1">
                  Academic institutions engaged
                </div>
              </div>
            </div>

            {/* Students Image */}
            <InView>
              <div className="rounded-2xl h-[470px] overflow-hidden shadow border border-border">
                <img
                  src="/images/Redefining Academic Assessment2.png"
                  alt="Students focused during digital exam"
                  className="object-cover h-full w-full"
                />
              </div>
            </InView>
          </div>

          {/* RIGHT SIDE - Bento Grid */}
          <div className="lg:col-span-7 space-y-6">
            <InView>
              <TypographyH2 className="text-foreground text-2xl tracking-tight">
                Redefining Academic Assessment with Integrity
              </TypographyH2>
            </InView>

            <div className="grid md:grid-cols-2 gap-4">
              {/* Card 1 */}
              <InView delay={50}>
                <Card className="h-full border border-border hover:border-primary/30 transition-colors bg-card">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg text-foreground">
                      What is Mindexa Platform
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-muted-foreground text-sm leading-relaxed">
                    Mindexa is a comprehensive academic platform designed to
                    safeguard assessment integrity while simplifying the
                    academic workflow.
                  </CardContent>
                  <div className="px-6 pb-2">
                    <a
                      href="#"
                      className="inline-flex items-center text-sm font-medium text-primary hover:text-primary/80 transition-colors"
                    >
                      Read More <ChevronRight className="ml-1.5 h-4 w-4" />
                    </a>
                  </div>
                </Card>
              </InView>

              {/* Card 2 */}
              <InView delay={100}>
                <Card className="h-full border border-border hover:border-primary/30 transition-colors bg-card">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg text-foreground">
                      Why Mindexa Exists
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-muted-foreground text-sm leading-relaxed">
                    Mindexa was created to address the growing disconnect
                    between digital convenience and academic credibility.
                  </CardContent>
                  <div className="px-6 pb-2">
                    <a
                      href="#"
                      className="inline-flex items-center text-sm font-medium text-primary hover:text-primary/80 transition-colors"
                    >
                      Read More <ChevronRight className="ml-1.5 h-4 w-4" />
                    </a>
                  </div>
                </Card>
              </InView>

              {/* Card 3 - Full width to complete bento look */}
              <InView delay={150}>
                <Card className="border border-border hover:border-primary/30 transition-colors bg-card">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg text-foreground">
                      How Mindexa is Built
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-muted-foreground text-sm leading-relaxed">
                    Mindexa is engineered around clarity, discipline, and
                    responsibility. Every feature is purpose-driven, every
                    workflow traceable, and every intelligent function ethically
                    constrained.
                  </CardContent>
                  <div className="px-6 pb-2">
                    <a
                      href="#"
                      className="inline-flex items-center text-sm font-medium text-primary hover:text-primary/80 transition-colors"
                    >
                      Read More <ChevronRight className="ml-1.5 h-4 w-4" />
                    </a>
                  </div>
                </Card>
              </InView>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
