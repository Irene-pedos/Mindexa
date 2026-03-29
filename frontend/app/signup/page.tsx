// frontend/app/signup/page.tsx
import { SignupForm } from "@/components/signup-form";

export default function SignupPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6 md:p-10">
      <div className="w-full max-w-sm md:max-w-4xl lg:max-w-5xl">
        <SignupForm />
      </div>
    </div>
  );
}