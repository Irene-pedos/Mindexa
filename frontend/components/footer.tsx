import { BookOpen, Github } from "lucide-react";
import { Footer as UIFooter } from "@/components/ui/footer";
import Image from "next/image";

export default function Footer() {
  return (
    <div className="w-full">
      <UIFooter
        logo={
          <Image
            src="/icons/logo/mindexa-wordmark.svg"
            alt="Mindexa Logo"
            width={100}
            height={24}
            style={{ width: "auto" }}
            className="h-6"
          />
        }
        brandName=""
        socialLinks={[
          {
            icon: (
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="h-4 w-4 fill-current"
              >
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 22.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.008 4.07H5.078z"></path>
              </svg>
            ),
            href: "https://x.com",
            label: "X",
          },
          {
            icon: <Github className="h-5 w-5" />,
            href: "https://github.com",
            label: "GitHub",
          },
        ]}
        mainLinks={[
          { href: "/proctoring", label: "Proctoring" },
          { href: "/ai-grading", label: "AI Grading" },
          { href: "/appeals", label: "Appeals Hub" },
          { href: "/discussion", label: "Discussion Lab" },
        ]}
        legalLinks={[
          { href: "/privacy", label: "Privacy Policy" },
          { href: "/terms", label: "Terms of Service" },
        ]}
        copyright={{
          text: "© 2026 Mindexa",
          license: "All rights reserved.",
        }}
      />
    </div>
  );
}
