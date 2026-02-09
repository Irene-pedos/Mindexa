// frontend/app/(marketing)/page.tsx
import Link from "next/link";
import { Button } from "@/components/ui/button"; // we'll add shadcn/ui soon
import { ArrowRight, Lock, Brain, Scale } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 pb-32 pt-24 text-white">
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10"></div>
        <div className="container relative mx-auto px-6 text-center">
          <h1 className="mx-auto max-w-5xl bg-gradient-to-r from-white via-indigo-200 to-white bg-clip-text text-5xl font-extrabold tracking-tight text-transparent md:text-7xl">
            The Future of Academic Integrity
          </h1>
          <p className="mx-auto mt-6 max-w-3xl text-xl text-indigo-100 md:text-2xl">
            Secure. Intelligent. Fair. Conduct cheat-proof assessments with
            real-time behavioral monitoring and explainable AI grading.
          </p>

          <div className="mt-10 flex flex-wrap justify-center gap-6">
            <Button
              size="lg"
              asChild
              className="bg-white text-indigo-700 hover:bg-indigo-50"
            >
              <Link href="/signup">Get Started →</Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-white text-white hover:bg-white/10"
            >
              See It In Action
            </Button>
          </div>

          {/* Stats pills */}
          <div className="mt-16 flex flex-wrap justify-center gap-8 text-center">
            <div className="rounded-full bg-white/20 px-8 py-4 backdrop-blur-sm">
              <div className="text-4xl font-bold">99.9%</div>
              <div className="text-indigo-200">Integrity Rate</div>
            </div>
            <div className="rounded-full bg-white/20 px-8 py-4 backdrop-blur-sm">
              <div className="text-4xl font-bold">50k+</div>
              <div className="text-indigo-200">Assessments</div>
            </div>
            <div className="rounded-full bg-white/20 px-8 py-4 backdrop-blur-sm">
              <div className="text-4xl font-bold">120+</div>
              <div className="text-indigo-200">Institutions</div>
            </div>
          </div>
        </div>
      </section>

      {/* Problem – Crisis Section */}
      <section className="py-24">
        <div className="container mx-auto px-6">
          <h2 className="mb-16 text-center text-4xl font-bold tracking-tight md:text-5xl">
            A Growing Crisis in Digital Academic Evaluation
          </h2>

          <div className="grid gap-8 md:grid-cols-3">
            {/* Bento-style cards – different heights/sizes */}
            <div className="group relative overflow-hidden rounded-3xl bg-gradient-to-br from-red-50 to-rose-100 p-8 shadow-lg transition-all hover:scale-[1.02] hover:shadow-xl md:col-span-2 md:row-span-2">
              <h3 className="mb-4 text-2xl font-semibold">
                Assessments at Risk
              </h3>
              <p className="text-lg text-slate-700">
                Digital exams often lack robust safeguards — easy manipulation,
                copy-paste, AI cheating, tab-switching.
              </p>
            </div>

            <div className="rounded-3xl bg-gradient-to-br from-amber-50 to-yellow-100 p-8 shadow-lg transition-all hover:scale-[1.02] hover:shadow-xl">
              <h3 className="mb-4 text-2xl font-semibold">
                Disconnected Workflows
              </h3>
              <p className="text-slate-700">
                Fragmented tools = more admin burden, less transparency.
              </p>
            </div>

            <div className="rounded-3xl bg-gradient-to-br from-blue-50 to-cyan-100 p-8 shadow-lg transition-all hover:scale-[1.02] hover:shadow-xl">
              <h3 className="mb-4 text-2xl font-semibold">Misaligned AI Use</h3>
              <p className="text-slate-700">
                Black-box grading erodes trust — no explanations, no appeals.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Capabilities – Bento Grid */}
      <section className="bg-slate-100 py-24">
        <div className="container mx-auto px-6">
          <h2 className="mb-16 text-center text-4xl font-bold tracking-tight md:text-5xl">
            Core Capabilities of Mindexa Platform
          </h2>

          <div className="grid gap-6 md:grid-cols-12 md:grid-rows-3">
            {/* Large left card */}
            <div className="group col-span-12 rounded-3xl bg-gradient-to-br from-indigo-500 to-purple-600 p-10 text-white shadow-2xl transition-all hover:scale-[1.02] md:col-span-8 md:row-span-3">
              <Lock className="mb-6 h-16 w-16" />
              <h3 className="mb-6 text-4xl font-bold">
                Secure Assessments & Examinations
              </h3>
              <p className="text-xl leading-relaxed">
                Lockdown mode, real-time integrity monitoring (tab focus, paste
                detection, typing biometrics), randomized question delivery.
              </p>
              <Button
                variant="secondary"
                className="mt-8 bg-white text-indigo-700"
              >
                Learn More →
              </Button>
            </div>

            {/* Smaller right cards */}
            <div className="col-span-12 rounded-3xl bg-white p-8 shadow-xl transition-all hover:scale-[1.02] md:col-span-4">
              <Brain className="mb-6 h-12 w-12 text-purple-600" />
              <h3 className="mb-4 text-3xl font-semibold">
                Intelligent AI Grading
              </h3>
              <p className="text-slate-600">
                Explainable RAG-based grading with traceable justifications —
                never a black box.
              </p>
            </div>

            <div className="col-span-12 rounded-3xl bg-white p-8 shadow-xl transition-all hover:scale-[1.02] md:col-span-4">
              <Scale className="mb-6 h-12 w-12 text-purple-600" />
              <h3 className="mb-4 text-3xl font-semibold">
                Appeals & Re-Evaluation
              </h3>
              <p className="text-slate-600">
                Formal appeal process with full audit trail — fairness
                guaranteed.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Bar at bottom */}
      <section className="bg-indigo-600 py-20 text-white">
        <div className="container mx-auto px-6 text-center">
          <h2 className="mb-8 text-4xl font-bold md:text-5xl">
            Ready to Restore Trust in Digital Assessment?
          </h2>
          <p className="mb-10 text-xl text-indigo-100">
            Join institutions worldwide that choose integrity over convenience.
          </p>
          <div className="flex flex-wrap justify-center gap-6">
            <Button
              size="lg"
              className="bg-white text-indigo-700 hover:bg-indigo-50"
            >
              Get Started Free
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-white text-white hover:bg-white/10"
            >
              Book a Demo
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
