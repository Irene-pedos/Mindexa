import { ResetPasswordForm } from "@/components/reset-password-form";
import { Suspense } from "react";

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6 md:p-10">
      <div className="w-full max-w-sm md:max-w-md lg:max-w-lg">
        <Suspense fallback={<div>Loading...</div>}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}
