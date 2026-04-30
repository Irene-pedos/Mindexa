// components/admin-login-form.tsx
"use client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TypographyH2 } from "@/components/ui/typography";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import Image from "next/image";

export function AdminLoginForm({
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

      // Ensure the user actually has ADMIN role
      if (data.user.role !== "ADMIN" && data.user.role !== "SUPER_ADMIN") {
        toast.error("Access denied. Admin privileges required.");
        setLoading(false);
        return;
      }

      toast.success("Admin access granted");
      router.push("/admin/dashboard");
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
              <div className="size-8 flex items-center justify-center text-primary mb-2">
                <Image
                  src="/icons/logo/mindexa-icon.svg"
                  alt="Mindexa Icon"
                  width={24}
                  height={24}
                  style={{ height: "auto" }}
                  className="size-10"
                />
              </div>
              <TypographyH2 className="text-2xl font-semibold tracking-tight">
                Mindexa Admin
              </TypographyH2>
              <p className="text-muted-foreground text-sm">
                Secure Institutional Oversight Portal
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">
                  Administrator Email
                </label>
                <Input
                  type="email"
                  placeholder="admin@mindexa.ac"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm font-medium">Secure Password</label>
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
                className="w-full rounded-full mt-4"
                disabled={loading}
              >
                {loading ? "Verifying Credentials..." : "Authenticate Access"}
              </Button>
            </div>

            <div className="text-center text-xs text-muted-foreground mt-8">
              This is a restricted access system. All authentication attempts
              are logged for security auditing purposes.
            </div>
          </form>

          <div className="relative hidden bg-muted md:block">
            <img
              src="https://images.unsplash.com/photo-1524178232363-1fb2b075b655"
              alt="Secure admin environment"
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-primary/20 mix-blend-multiply" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
