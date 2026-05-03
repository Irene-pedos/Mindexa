// components/login-form.tsx
"use client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TypographyH2 } from "@/components/ui/typography";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const router = useRouter();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await login({ email, password });
      toast.success("Login successful");

      // Redirect based on backend role (lowercase in database)
      const role = data.user.role.toLowerCase();

      if (role === "admin" || role === "super_admin") {
        toast.error("Access Denied: Admins must login via the Admin Portal.");
        // We log them out immediately to clear the session they just established here
        const { authApi } = await import("@/lib/api/auth");
        await authApi.logout();
        return;
      }

      if (role === "student") router.push("/student/dashboard");
      else if (role === "lecturer") router.push("/lecturer/dashboard");
      else router.push("/student/dashboard");
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : "Invalid credentials";
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="overflow-hidden p-0">
        <CardContent className="grid p-0 md:grid-cols-2">
          <form onSubmit={handleLogin} className="p-6 md:p-8">
            <div className="flex flex-col items-center gap-2 text-center mb-8">
              <TypographyH2 className="text-2xl font-semibold tracking-tight">
                Welcome back
              </TypographyH2>
              <p className="text-muted-foreground text-sm">
                Sign in to your Mindexa account
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Email address</label>
                <Input
                  type="email"
                  placeholder="you@university.edu"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm font-medium">Password</label>
                  <Link
                    href="/forgot-password"
                    className="text-xs text-primary hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>
                <Input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <Button
                type="submit"
                className="w-full rounded-full"
                disabled={loading}
              >
                {loading ? "Signing in..." : "Sign in"}
              </Button>

              <div className="relative flex items-center justify-center my-4">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-muted-foreground/20" />
                </div>
                <span className="relative bg-card px-2 text-xs text-muted-foreground uppercase">
                  Or continue with
                </span>
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full rounded-full opacity-50 cursor-not-allowed"
                disabled
              >
                Login with RP MIS
                <Badge variant="secondary" className="ml-2 text-[8px] h-3 px-1">
                  Coming Soon
                </Badge>
              </Button>
            </div>

            <div className="text-center text-sm mt-6">
              Don&apos;t have an account?{" "}
              <Link
                href="/signup"
                className="text-primary hover:underline font-medium"
              >
                Sign up
              </Link>
            </div>
          </form>

          <div className="relative hidden bg-muted md:block">
            <img
              src="images/Login Image.png"
              alt="Academic environment"
              className="absolute inset-0 h-full w-full object-cover"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
