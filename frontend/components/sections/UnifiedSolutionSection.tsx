// frontend/components/sections/UnifiedSolutionSection.tsx
import { TypographyH2, TypographyP } from "@/components/ui/typography";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { InView } from "@/components/ui/in-view";
import ShinyText from "@/components/ShinyText";
import { Shield, TrendingUp, Brain, Briefcase } from "lucide-react";

const features = [
  {
    icon: Shield,
    title: "Structural Security",
    description: "As academic institutions increasingly adopt digital assessment methods.",
  },
  {
    icon: TrendingUp,
    title: "Evaluation Transparency",
    description: "As academic institutions increasingly adopt digital assessment methods.",
  },
  {
    icon: Brain,
    title: "Intelligent Assistance",
    description: "As academic institutions increasingly adopt digital assessment methods.",
  },
  {
    icon: Briefcase,
    title: "Operational Cohesion",
    description: "As academic institutions increasingly adopt digital assessment methods.",
  },
];

export default function UnifiedSolutionSection() {
  return (
    <section id="solution" className="py-15 bg-background">
      <div className="container mx-auto px-6 max-w-7xl">
        <div className="grid lg:grid-cols-12 gap-16 items-center">
          
          {/* Left Side - Text + Features */}
          <div className="lg:col-span-7 space-y-10">
            <InView>
              <TypographyH2 className="text-foreground tracking-tight">
                A Deliberate and{" "}
                <ShinyText 
                  text="Unified" 
                  speed={4} 
                  shineColor="oklch(0.488 0.243 264.376)" 
                  color="oklch(0.148 0.004 228.8)"
                />{" "}
                Academic Solution
              </TypographyH2>
            </InView>

            <TypographyP className="text-muted-foreground max-w-2xl text-[17px] leading-relaxed">
              Mindexa Platform is architected as a single, coherent academic environment where assessment, learning, oversight, and analysis coexist seamlessly. It replaces disjointed tools with a unified system that prioritizes integrity, traceability, and clarity.
            </TypographyP>

            {/* Features List using Item component */}
            <div className="space-y-8 pt-2">
              {features.map((feature, index) => (
                <InView key={index} delay={index * 80}>
                  <Item variant="outline" size="sm" className="border-border hover:border-primary/30 transition-colors">
                    <ItemMedia variant="icon">
                      <feature.icon className="h-8 w-8 text-primary" />
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle className="text-foreground">{feature.title}</ItemTitle>
                      <ItemDescription className="text-muted-foreground">
                        {feature.description}
                      </ItemDescription>
                    </ItemContent>
                  </Item>
                </InView>
              ))}
            </div>
          </div>

          {/* Right Side - Image */}
          <div className="lg:col-span-5">
            <InView>
              <div className="relative h-[600px] w-full rounded-3xl overflow-hidden shadow-xl border border-border">
                <img
                        src="https://images.unsplash.com/photo-1524178232363-1fb2b075b655"
                        alt="Students focused during digital exam"
                        className="object-cover h-full w-full"
                      />
              </div>
            </InView>
          </div>
        </div>
      </div>
    </section>
  );
}