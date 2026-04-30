// components/reset-password-form.tsx
"use client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TypographyH2 } from "@/components/ui/typography";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { authApi } from "@/lib/api/auth";
import { validateResetPasswordForm, validatePassword } from "@/lib/validation";

export function ResetPasswordForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      toast.error("Invalid or missing reset token");
      setTimeout(() => {
        router.push("/forgot-password");
      }, 2000);
    }
  }, [token, router]);

  const handleChange = (field: string, value: string) => {
    if (field === "password") {
      setPassword(value);
    } else {
      setConfirmPassword(value);
    }

    // Clear error for this field when user starts typing
    if (errors[field]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!token) {
      toast.error("Invalid reset token");
      return;
    }

    // Validate form
    const validation = validateResetPasswordForm({ password, confirmPassword });
    if (!validation.isValid) {
      setErrors(validation.errors);
      toast.error("Please fix the errors in the form");
      return;
    }

    setLoading(true);
    setErrors({});

    try {
      await authApi.resetPassword({
        token,
        new_password: password,
        confirm_password: confirmPassword,
      });

      setSuccess(true);
      toast.success("Password reset successfully!");

      // Redirect to login after short delay
      setTimeout(() => {
        router.push("/login");
      }, 2000);
    } catch (err: any) {
      const errorMessage = err.message || "Failed to reset password";
      setErrors({ form: errorMessage });
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className={cn("flex flex-col gap-6", className)} {...props}>
        <Card className="overflow-hidden p-0">
          <CardContent className="p-8">
            <div className="flex flex-col items-center gap-2 text-center">
              <TypographyH2 className="text-2xl font-semibold tracking-tight">
                Invalid Reset Link
              </TypographyH2>
              <p className="text-muted-foreground text-sm mt-4">
                The password reset link is invalid or has expired.
              </p>
              <Link href="/forgot-password" className="mt-6 block w-full">
                <Button className="w-full rounded-full">
                  Request New Reset Link
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="overflow-hidden p-0">
        <CardContent className="p-8">
          <div className="flex flex-col items-center gap-2 text-center mb-8">
            <TypographyH2 className="text-2xl font-semibold tracking-tight">
              Create a new password
            </TypographyH2>
            <p className="text-muted-foreground text-sm">
              Enter a strong password to secure your account.
            </p>
          </div>

          {success ? (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">
                <p className="font-semibold mb-2">Password reset successful!</p>
                <p className="text-sm">
                  Your password has been updated. You can now sign in with your
                  new password.
                </p>
              </div>

              <Link href="/login" className="block">
                <Button className="w-full rounded-full">Go to Sign In</Button>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {errors.form && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
                  {errors.form}
                </div>
              )}

              <div>
                <label className="text-sm font-medium mb-2 block">
                  New password
                </label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => handleChange("password", e.target.value)}
                  required
                  disabled={loading}
                  aria-invalid={!!errors.password}
                />
                {errors.password && (
                  <p className="text-red-500 text-xs mt-1">{errors.password}</p>
                )}
                {!errors.password && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Must be at least 8 characters with uppercase, lowercase,
                    number, and special character.
                  </p>
                )}
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">
                  Confirm password
                </label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) =>
                    handleChange("confirmPassword", e.target.value)
                  }
                  required
                  disabled={loading}
                  aria-invalid={!!errors.confirmPassword}
                />
                {errors.confirmPassword && (
                  <p className="text-red-500 text-xs mt-1">
                    {errors.confirmPassword}
                  </p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full rounded-full mt-6"
                disabled={loading}
              >
                {loading ? "Resetting password..." : "Reset Password"}
              </Button>

              <div className="text-center text-sm mt-4">
                <Link href="/login" className="text-primary hover:underline">
                  Back to Sign In
                </Link>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
