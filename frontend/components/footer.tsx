// frontend/components/Footer.tsx
import Link from "next/link";
import { Logo } from "@/components/logo";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Send } from "lucide-react";

export default function Footer() {
  return (
    <footer className="bg-muted/30 border-t border-border py-12">
      <div className="container mx-auto px-6 max-w-7xl">
        <div className="flex flex-col lg:flex-row justify-between gap-12">
          {/* Left - Logo + Description */}
          <div className="max-w-sm">
            <div className="flex items-center gap-3 mb-4">
              <Image
                src="/icons/logo/mindexa-logo.svg"
                alt="Logo"
                width={100}
                height={30}
              />
            </div>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Mindexa is a secure academic ecosystem built to support the
              national digital transformation.
            </p>
          </div>

          {/* Right - Four Columns */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-12 gap-y-10">
            <div>
              <h4 className="font-medium text-foreground mb-4">Product</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <Link
                    href="#"
                    className="hover:text-foreground transition-colors"
                  >
                    Proctoring
                  </Link>
                </li>
                <li>
                  <Link
                    href="#"
                    className="hover:text-foreground transition-colors"
                  >
                    AI Grading
                  </Link>
                </li>
                <li>
                  <Link
                    href="#"
                    className="hover:text-foreground transition-colors"
                  >
                    Appeals Hub
                  </Link>
                </li>
                <li>
                  <Link
                    href="#"
                    className="hover:text-foreground transition-colors"
                  >
                    Discussion Lab
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="font-medium text-foreground mb-4">Product</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <Link
                    href="#"
                    className="hover:text-foreground transition-colors"
                  >
                    Proctoring
                  </Link>
                </li>
                <li>
                  <Link
                    href="#"
                    className="hover:text-foreground transition-colors"
                  >
                    AI Grading
                  </Link>
                </li>
                <li>
                  <Link
                    href="#"
                    className="hover:text-foreground transition-colors"
                  >
                    Appeals Hub
                  </Link>
                </li>
                <li>
                  <Link
                    href="#"
                    className="hover:text-foreground transition-colors"
                  >
                    Discussion Lab
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="font-medium text-foreground mb-4">Product</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <Link
                    href="#"
                    className="hover:text-foreground transition-colors"
                  >
                    Proctoring
                  </Link>
                </li>
                <li>
                  <Link
                    href="#"
                    className="hover:text-foreground transition-colors"
                  >
                    AI Grading
                  </Link>
                </li>
                <li>
                  <Link
                    href="#"
                    className="hover:text-foreground transition-colors"
                  >
                    Appeals Hub
                  </Link>
                </li>
                <li>
                  <Link
                    href="#"
                    className="hover:text-foreground transition-colors"
                  >
                    Discussion Lab
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="font-medium text-foreground mb-4">Product</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <Link
                    href="#"
                    className="hover:text-foreground transition-colors"
                  >
                    Proctoring
                  </Link>
                </li>
                <li>
                  <Link
                    href="#"
                    className="hover:text-foreground transition-colors"
                  >
                    AI Grading
                  </Link>
                </li>
                <li>
                  <Link
                    href="#"
                    className="hover:text-foreground transition-colors"
                  >
                    Appeals Hub
                  </Link>
                </li>
                <li>
                  <Link
                    href="#"
                    className="hover:text-foreground transition-colors"
                  >
                    Discussion Lab
                  </Link>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Newsletter + Bottom Bar */}
        <div className="mt-16 border-t border-border pt-8 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="relative flex items-center w-full md:w-auto">
            <input
              type="email"
              placeholder="Enter Email address"
              className="bg-background border border-primary rounded-full pl-5 pr-14 py-3 text-sm w-full md:w-80 focus:outline-none focus:border-primary"
            />
            <Button size="icon" className="absolute right-1 rounded-full shrink-0 h-10 w-10 bg-primary text-primary-foreground hover:bg-primary/90">
              <Send className="h-4 w-4" />
              <span className="sr-only">Subscribe</span>
            </Button>
          </div>

          <div className="text-xs text-muted-foreground flex flex-col md:flex-row items-center gap-4">
            <div>© 2026 Mindexa. All right Reserved</div>
            <div className="flex gap-6">
              <Link
                href="#"
                className="hover:text-foreground transition-colors"
              >
                Terms of Service
              </Link>
              <Link
                href="#"
                className="hover:text-foreground transition-colors"
              >
                Privacy policy
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
