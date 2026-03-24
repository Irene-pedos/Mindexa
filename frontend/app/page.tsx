// app/page.tsx
import Header from "@/components/shared/Header";
import {
  TypographyH1,
  TypographyH2,
  TypographyP,
  TypographyLead,
} from "@/components/ui/typography";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ArrowRight, PlayCircle } from "lucide-react";
// import { Skeleton } from "@/components/ui/skeleton"; // ready for loading states

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />

      {/* Hero */}
      <section className="relative min-h-screen pt-32 pb-24 px-6 md:px-12 bg-gradient-to-b from-background to-muted/20">
        {/* Background image with overlay */}
        <div className="absolute inset-0">
          <img
            src="https://images.stockcake.com/public/f/5/d/f5db6eda-b0ca-4d3c-b40b-f7295e813232/students-studying-together-stockcake.jpg" // realistic student group
            alt="Students collaborating in modern academic environment"
            className="h-full w-full object-cover brightness-50 contrast-125"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
        </div>

        <div className="relative container mx-auto max-w-7xl">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            {/* Left content */}
            <div className="space-y-8">
              <TypographyH1 className="!text-left !leading-tight">
                The Future of Academic Integrity.
              </TypographyH1>

              <TypographyLead className="!text-left">
                Secure. Intelligent. Fair.
              </TypographyLead>

              <TypographyP className="text-lg md:text-xl text-muted-foreground max-w-3xl">
                Conduct cheating-free assessments with real-time AI monitoring
                and autonomous grading.
              </TypographyP>

              <div className="flex flex-wrap gap-6">
                <Button size="lg" className="rounded-full px-8">
                  Get Started <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  className="rounded-full px-8"
                >
                  See it in action <PlayCircle className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Right - Assistant Card (using Card, compact feel) */}
            <Card className="border-border/50 bg-card/80 backdrop-blur-md max-w-md mx-auto lg:mx-0 shadow-xl">
              <CardHeader>
                <CardTitle>Intelligent Learning Assistant</CardTitle>
                <CardDescription>
                  AI-powered homework assistant that helps students understand
                  concepts, improve structure, and receive learning guidance
                  without providing direct answers.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="link" className="px-0">
                  Discover More →
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Stats - pill style */}
          <div className="mt-20 flex flex-wrap justify-center gap-6 md:gap-12">
            <div className="rounded-full bg-muted/50 px-8 py-4 text-center min-w-[140px]">
              <p className="text-3xl font-bold">99.9%</p>
              <p className="text-sm text-muted-foreground">Integrity Rate</p>
            </div>
            <div className="rounded-full bg-muted/50 px-8 py-4 text-center min-w-[140px]">
              <p className="text-3xl font-bold">50k+</p>
              <p className="text-sm text-muted-foreground">Assessments</p>
            </div>
            <div className="rounded-full bg-muted/50 px-8 py-4 text-center min-w-[140px]">
              <p className="text-3xl font-bold">120+</p>
              <p className="text-sm text-muted-foreground">Institutions</p>
            </div>
          </div>
        </div>
      </section>

      {/* Crisis Section */}
      <section className="py-32 border-t border-border bg-background">
        <div className="container mx-auto px-6 max-w-7xl">
          <TypographyH2 className="text-center mb-12">
            A Growing Crisis in Digital Academic Evaluation
          </TypographyH2>

          <TypographyP className="text-center text-lg text-muted-foreground max-w-4xl mx-auto mb-16">
            As academic institutions increasingly adopt digital assessment
            methods, foundational weaknesses have emerged. Existing platforms
            often lack robust safeguards against malpractice, offer limited
            transparency in grading and appeals, and burden lecturers with
            fragmented tools that compromise efficiency. The uncontrolled use of
            generative technologies further erodes trust in assessment outcomes.
          </TypographyP>

          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left - Image */}
            <div className="relative rounded-2xl overflow-hidden shadow-2xl">
              <img
                src="https://theeducatorsroom.com/wp-content/uploads/2024/03/AdobeStock_427379670-1200x800.jpeg"
                alt="Frustrated lecturer in digital assessment environment"
                className="w-full h-auto object-cover brightness-90"
              />
            </div>

            {/* Right - 4 Cards */}
            <div className="grid gap-6 md:grid-cols-2">
              <Card className="bg-card/90 border-border/50">
                <CardHeader>
                  <CardTitle>Assessment Environments at Risk</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Digital examinations often lack sufficient controls, enabling
                  manipulation and unauthorized assistance during assessments.
                </CardContent>
              </Card>

              <Card className="bg-card/90 border-border/50">
                <CardHeader>
                  <CardTitle>Disconnected Academic Workflows</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Lecturers and students are forced to navigate uncoordinated
                  systems, reducing efficiency and increasing errors.
                </CardContent>
              </Card>

              <Card className="bg-card/90 border-border/50">
                <CardHeader>
                  <CardTitle>Excessive Academic Burden</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Manual grading, fragmented feedback processes, and
                  administrative overhead consume valuable instructional time.
                </CardContent>
              </Card>

              <Card className="bg-card/90 border-border/50">
                <CardHeader>
                  <CardTitle>Misaligned Use of AI Technologies</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Unregulated AI usage introduces ethical risks and undermines
                  the authenticity of student performance.
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
