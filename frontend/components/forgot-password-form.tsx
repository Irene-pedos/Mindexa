// components/forgot-password-form.tsx
"use client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TypographyH2 } from "@/components/ui/typography";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { authApi } from "@/lib/api/auth";
import { validateEmail } from "@/lib/validation";

export function ForgotPasswordForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate email
    const emailError = validateEmail(email);
    if (emailError) {
      setError(emailError.message);
      toast.error(emailError.message);
      return;
    }

    setLoading(true);
    setError("");

    try {
      await authApi.forgotPassword({ email });
      setSubmitted(true);
      toast.success("Password reset instructions sent to your email");
    } catch (err: any) {
      const errorMessage = err.message || "Failed to send reset email";
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="overflow-hidden p-0">
        <CardContent className="p-8">
          <div className="flex flex-col items-center gap-2 text-center mb-8">
            <TypographyH2 className="text-2xl font-semibold tracking-tight">
              Reset your password
            </TypographyH2>
            <p className="text-muted-foreground text-sm">
              Enter your email address and we'll send you instructions to reset
              your password.
            </p>
          </div>

          {!submitted ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
                  {error}
                </div>
              )}

              <div>
                <label className="text-sm font-medium mb-2 block">
                  Email address
                </label>
                <Input
                  type="email"
                  placeholder="you@university.edu"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (error) setError("");
                  }}
                  required
                  disabled={loading}
                />
              </div>

              <Button
                type="submit"
                className="w-full rounded-full"
                disabled={loading}
              >
                {loading ? "Sending..." : "Send Reset Instructions"}
              </Button>

              <div className="text-center text-sm mt-6">
                Remember your password?{" "}
                <Link
                  href="/login"
                  className="text-primary hover:underline font-medium"
                >
                  Sign in
                </Link>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">
                <p className="font-semibold mb-2">Check your email</p>
                <p className="text-sm">
                  We've sent password reset instructions to{" "}
                  <strong>{email}</strong>
                </p>
              </div>

              <p className="text-sm text-muted-foreground text-center">
                If you don't see the email, check your spam folder or{" "}
                <button
                  onClick={() => {
                    setSubmitted(false);
                    setEmail("");
                  }}
                  className="text-primary hover:underline font-medium"
                >
                  try again
                </button>
              </p>

              <Link href="/login" className="block text-center">
                <Button variant="outline" className="w-full rounded-full">
                  Back to Sign In
                </Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
