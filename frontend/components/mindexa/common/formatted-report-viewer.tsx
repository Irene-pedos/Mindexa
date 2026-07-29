import React, { useMemo } from "react";
import {
  Award,
  AlertTriangle,
  Lightbulb,
  BarChart2,
  HelpCircle,
  Sparkles,
  ClipboardList,
  GraduationCap,
  Users,
  Building,
  CheckCircle,
  ChevronRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { RichMessageRenderer } from "@/components/mindexa/common/rich-message-renderer";

interface FormattedReportViewerProps {
  text: string;
}

interface Section {
  title: string;
  iconType: string;
  items: string[];
  paragraph: string;
}

export const FormattedReportViewer: React.FC<FormattedReportViewerProps> = ({ text }) => {
  const parsedData = useMemo(() => {
    if (!text) return null;

    const lines = text.split("\n");
    const metadata: Record<string, string> = {};
    const sections: Section[] = [];

    let currentSection: Section | null = null;
    let mainTitle = "Pedagogical Diagnostic Report";

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Extract main title if it's a top header
      if (
        (i < 3 && line.startsWith("##")) ||
        (line.startsWith("**") && line.endsWith("**") && !line.includes(":"))
      ) {
        mainTitle = line.replace(/[#*]/g, "").trim();
        continue;
      }

      // Check if it's metadata (e.g. **Course:** Advanced Computer Literacy)
      const metaMatch = line.match(/^\*\*([^*:]+):\*\*\s*(.*)$/);
      if (
        metaMatch &&
        !line.includes("Averages") &&
        !line.includes("Masteries") &&
        !line.includes("Areas") &&
        !line.includes("Trends") &&
        !line.includes("Recommendations") &&
        !line.includes("Limitations")
      ) {
        const key = metaMatch[1].trim();
        const value = metaMatch[2].trim();
        metadata[key] = value.replace(/\*\*/g, "");
        continue;
      }

      // Check if it's a section header (e.g. **Masteries:** or **Recommendations**)
      const sectionMatch = line.match(/^\*\*([^*:]+):\*\*/);
      if (sectionMatch) {
        if (currentSection) {
          sections.push(currentSection);
        }

        const title = sectionMatch[1].trim();
        const iconType = title.toLowerCase();

        const remainder = line.replace(/^\*\*([^*:]+):\*\*/, "").trim();

        currentSection = {
          title,
          iconType,
          items: [],
          paragraph: remainder,
        };
        continue;
      }

      // Check if it's a bullet point
      const bulletMatch = line.match(/^[-*•]\s*(.*)$/);
      if (bulletMatch && currentSection) {
        currentSection.items.push(bulletMatch[1].trim());
      } else if (currentSection) {
        if (currentSection.paragraph) {
          currentSection.paragraph += " " + line;
        } else {
          currentSection.paragraph = line;
        }
      }
    }

    if (currentSection) {
      sections.push(currentSection);
    }

    return { mainTitle, metadata, sections };
  }, [text]);

  if (!text) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-zinc-50 border border-zinc-150 rounded-xl text-zinc-400">
        <Sparkles className="size-6 opacity-30" />
        <span className="text-xs font-normal text-zinc-600">No report analysis drafted yet.</span>
      </div>
    );
  }

  if (!parsedData || parsedData.sections.length === 0) {
    return (
      <div className="p-4 bg-white border border-zinc-150 rounded-xl text-left shadow-sm min-h-[300px]">
        <RichMessageRenderer content={text} />
      </div>
    );
  }

  const { mainTitle, metadata, sections } = parsedData;

  const getSectionIcon = (type: string) => {
    if (type.includes("mastery") || type.includes("masteries"))
      return <Award className="size-4 text-emerald-600 shrink-0" />;
    if (type.includes("difficult") || type.includes("weak"))
      return <AlertTriangle className="size-4 text-amber-600 shrink-0" />;
    if (type.includes("recommend"))
      return <Lightbulb className="size-4 text-violet-600 shrink-0" />;
    if (type.includes("trend") || type.includes("performance"))
      return <BarChart2 className="size-4 text-blue-600 shrink-0" />;
    if (type.includes("limitation"))
      return <HelpCircle className="size-4 text-zinc-500 shrink-0" />;
    if (type.includes("average") || type.includes("assessment"))
      return <ClipboardList className="size-4 text-sky-600 shrink-0" />;
    return <Sparkles className="size-4 text-primary shrink-0" />;
  };

  return (
    <div className="w-full space-y-4 text-left font-sans animate-in fade-in duration-200">
      {/* Modern Executive Report Header */}
      <div className="space-y-3 pb-2 border-b border-border/50">
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="bg-primary/10 text-primary border-primary/20 text-[10px] px-2 py-0.5 font-bold uppercase tracking-wider"
          >
            AI Pedagogical Diagnostics
          </Badge>
          {Object.entries(metadata).map(([key, val]) => (
            <Badge
              key={key}
              variant="secondary"
              className="text-[10px] bg-muted/60 text-muted-foreground font-semibold px-2 py-0.5"
            >
              {key}: {val}
            </Badge>
          ))}
        </div>
        <h2 className="text-base font-bold tracking-tight text-foreground">{mainTitle}</h2>
      </div>

      {/* Structured Document Content Flow */}
      <div className="space-y-5">
        {sections.map((sec, index) => {
          const isCallout = sec.iconType.includes("recommend") || sec.iconType.includes("difficult");
          return (
            <div
              key={index}
              className={
                isCallout
                  ? "p-4 rounded-xl border border-primary/15 bg-primary/[0.02] space-y-2"
                  : "space-y-2"
              }
            >
              <div className="flex items-center gap-2">
                {getSectionIcon(sec.iconType)}
                <h3 className="font-bold text-xs uppercase tracking-wider text-foreground">
                  {sec.title}
                </h3>
              </div>

              {sec.paragraph && (
                <div className="border-l-2 border-primary/40 pl-3 py-0.5 text-xs text-foreground/90 leading-relaxed font-normal">
                  <RichMessageRenderer content={sec.paragraph} />
                </div>
              )}

              {sec.items.length > 0 && (
                <div className="space-y-1.5 pt-1 pl-1">
                  {sec.items.map((item, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-xs text-foreground/90 leading-relaxed">
                      <ChevronRight className="size-3.5 text-primary shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <RichMessageRenderer content={item} />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {index < sections.length - 1 && !isCallout && (
                <Separator className="my-3.5 bg-border/40" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
