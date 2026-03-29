// components/login-form.tsx
'use client';
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { TypographyH2 } from "@/components/ui/typography"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"

export function LoginForm({ className, ...props }: React.ComponentProps<"div">) {
  const router = useRouter()
  const [role, setRole] = useState<"student" | "lecturer" | "admin">("student")

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()
    // Simulate role-based redirect
    if (role === "student") router.push("/student/dashboard")
    else if (role === "lecturer") router.push("/lecturer/dashboard")
    else router.push("/admin/dashboard")
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="overflow-hidden p-0">
        <CardContent className="grid p-0 md:grid-cols-2">
          <form onSubmit={handleLogin} className="p-6 md:p-8">
            <div className="flex flex-col items-center gap-2 text-center mb-8">
              <TypographyH2 className="text-2xl font-semibold tracking-tight">Welcome back</TypographyH2>
              <p className="text-muted-foreground text-sm">Sign in to your Mindexa account</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Login as</label>
                <div className="flex gap-2 mt-2">
                  {(["student", "lecturer", "admin"] as const).map((r) => (
                    <Button
                      key={r}
                      type="button"
                      variant={role === r ? "default" : "outline"}
                      onClick={() => setRole(r)}
                      className="capitalize flex-1"
                    >
                      {r}
                    </Button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium">Email address</label>
                <Input type="email" placeholder="you@university.edu" required />
              </div>

              <div>
                <label className="text-sm font-medium">Password</label>
                <Input type="password" required />
              </div>

              <Button type="submit" className="w-full rounded-full">
                Sign in as {role}
              </Button>
            </div>

            <div className="text-center text-sm mt-6">
              Don&apos;t have an account?{" "}
              <Link href="/signup" className="text-primary hover:underline font-medium">
                Sign up
              </Link>
            </div>
          </form>

          <div className="relative hidden bg-muted md:block">
            <img
              src="https://images.unsplash.com/photo-1524178232363-1fb2b075b655"
              alt="Academic environment"
              className="absolute inset-0 h-full w-full object-cover"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}