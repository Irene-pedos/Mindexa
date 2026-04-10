// frontend/app/page.tsx
import HeroSection from "@/components/hero-section";
import CrisisSection from "@/components/sections/CrisisSection";
import UnifiedSolutionSection from "@/components/sections/UnifiedSolutionSection";
import CapabilitiesSection from "@/components/sections/CapabilitiesSection";
import RedefiningSection from "@/components/sections/RedefiningSection";
import TestimonialsSection from "@/components/sections/TestimonialsSection";
import FAQSection from "@/components/sections/FAQSection";
import Footer from "@/components/footer";

export default function Home() {
  return (
    <>
      <HeroSection />
      <CrisisSection />
      <UnifiedSolutionSection />
      <CapabilitiesSection />
      <RedefiningSection />
      <TestimonialsSection />
      <FAQSection />
      <Footer />
    </>
  );
}
