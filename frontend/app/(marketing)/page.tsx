// frontend/app/(marketing)/page.tsx
import { Button } from "@/components/ui/button";
import { ArrowRight, Play } from "lucide-react";

export default function HomePage() {
  return (
    <>
      {/* Hero Section */}
      <section className="relative min-h-screen overflow-hidden bg-gradient-to-br from-indigo-950 via-purple-950 to-black pb-32 pt-32">
        {/* Optional subtle grid/overlay */}
        <div className="absolute inset-0 bg-[url('/hero-bg-pattern.svg')] opacity-5"></div>

        {/* Background image overlay – replace with your actual student photo */}
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1524178232363-1fb2b075b655?auto=format&fit=crop&q=80')] bg-cover bg-center opacity-20"></div>

        <div className="container relative mx-auto px-6">
          <div className="grid grid-cols-1 gap-16 lg:grid-cols-2 lg:items-center lg:gap-24">
            {/* Left content */}
            <div className="space-y-10">
              <h1 className="text-5xl font-extrabold leading-tight tracking-tight md:text-6xl lg:text-7xl">
                The Future of Academic Integrity.
                <br />
                <span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
                  Secure. Intelligent. Fair.
                </span>
              </h1>

              <p className="max-w-3xl text-xl text-indigo-200/90 md:text-2xl">
                Conduct cheating-free assessments with real-time AI monitoring
                and autonomous grading.
              </p>

              <div className="flex flex-wrap gap-6">
                <Button
                  size="lg"
                  className="h-14 bg-gradient-to-r from-indigo-500 to-purple-600 px-10 text-lg hover:from-indigo-600 hover:to-purple-700"
                >
                  Get Started <ArrowRight className="ml-3 h-5 w-5" />
                </Button>

                <Button
                  size="lg"
                  variant="outline"
                  className="h-14 border-indigo-400/50 px-10 text-lg text-white hover:bg-indigo-900/30"
                >
                  See it in action <Play className="ml-3 h-5 w-5" />
                </Button>
              </div>
            </div>

            {/* Right floating card – Intelligent Assistant */}
            <div className="relative mx-auto w-full max-w-md lg:mx-0">
              <div className="rounded-3xl border border-white/10 bg-black/40 p-8 backdrop-blur-xl">
                <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-500 text-3xl font-bold text-white">
                  AI
                </div>
                <h3 className="mb-4 text-3xl font-bold">
                  Intelligent Learning Assistant
                </h3>
                <p className="text-lg text-indigo-200/80">
                  AI-powered homework assistant that helps students understand
                  concepts, improve structure, and receive learning guidance
                  without providing direct answers.
                </p>
                <Button
                  variant="link"
                  className="mt-6 px-0 text-indigo-400 hover:text-indigo-300"
                >
                  Discover More →
                </Button>
              </div>
            </div>
          </div>

          {/* Stats pills – curved container */}
          <div className="mt-24 flex justify-center">
            <div className="flex flex-wrap justify-center gap-6 rounded-full border border-white/10 bg-black/40 px-12 py-6 backdrop-blur-xl md:gap-16">
              <div className="text-center">
                <div className="text-4xl font-bold text-white">99.9%</div>
                <div className="text-sm text-indigo-300">Integrity Rate</div>
              </div>
              <div className="text-center">
                <div className="text-4xl font-bold text-white">50k+</div>
                <div className="text-sm text-indigo-300">Assessments</div>
              </div>
              <div className="text-center">
                <div className="text-4xl font-bold text-white">120+</div>
                <div className="text-sm text-indigo-300">Institutions</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Placeholder for next section – Crisis */}
      <section className="bg-black py-32">
        <div className="container mx-auto px-6 text-center">
          <h2 className="mb-8 text-5xl font-bold">
            A Growing Crisis in Digital Academic Evaluation
          </h2>
          <p className="mx-auto max-w-4xl text-xl text-gray-400">
            {/* ... your text here ... */}
          </p>
          {/* We'll build the photo + 4 cards next */}
        </div>
      </section>
    </>
  );
}
