// frontend/components/signup-form.tsx
"use client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { TypographyH2 } from "@/components/ui/typography";
import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useState } from "react";
import { toast } from "sonner";
import { authApi } from "@/lib/api/auth";
import { validateSignupForm } from "@/lib/validation";
import Image from "next/image";
import {
  Loader2,
  ArrowRight,
  UserPlus,
  Fingerprint,
  ShieldCheck,
} from "lucide-react";
import { AnimatedOTPInput } from "@/components/ui/otp-input";
import { Separator } from "@/components/ui/separator";

export function SignupForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [role, setRole] = useState<"STUDENT" | "LECTURER">("STUDENT");

  // Verification State
  const [showVerification, setShowVerification] = useState(false);
  const [otp, setOtp] = useState("");
  const [verifying, setVerifying] = useState(false);

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    confirmPassword: "",
    phoneNumber: "",
    regNumber: "",
    staffId: "",
  });

  const [resending, setResending] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      const apiUrl =
        process.env.NEXT_PUBLIC_API_URL?.trim().replace(/\/$/, "") ||
        "http://localhost:8000/api/v1";
      const res = await fetch(`${apiUrl}/auth/resend-verification`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: formData.email }),
      });

      if (!res.ok) {
        throw new Error("Failed to resend code");
      }

      toast.success("A new verification code has been sent to your email.");
      setOtp("");
    } catch (err: any) {
      toast.error(err.message || "Resend failed");
    } finally {
      setResending(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    const validation = validateSignupForm({
      ...formData,
      role,
    });
    if (!validation.isValid) {
      setErrors(validation.errors);
      toast.error("Please fix the errors in the form");
      return;
    }

    setLoading(true);
    setErrors({});

    try {
      await authApi.signup({
        email: formData.email,
        password: formData.password,
        first_name: formData.firstName,
        last_name: formData.lastName,
        role: role,
        phone_number: formData.phoneNumber,
        reg_number: role === "STUDENT" ? formData.regNumber : undefined,
        staff_id: role === "LECTURER" ? formData.staffId : undefined,
      });

      if (role === "LECTURER") {
        toast.success(
          "Account request submitted! Please check your email for verification. Your account will be reviewed by an administrator.",
        );
      } else {
        toast.success("Account created! Please check your email for the OTP.");
      }
      setShowVerification(true);
    } catch (err: any) {
      const errorMsg = err.message || "Failed to create account";
      
      // Handle field-specific backend errors
      if (errorMsg.includes("Registration Number")) {
        setErrors({ regNumber: "This Student ID is already registered" });
      } else if (errorMsg.includes("Phone Number")) {
        setErrors({ phoneNumber: "This phone number is already in use" });
      } else if (errorMsg.includes("email")) {
        setErrors({ email: "This email is already registered" });
      } else {
        setErrors({ form: errorMsg });
      }
      
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (code: string) => {
    setVerifying(true);
    try {
      const apiUrl =
        process.env.NEXT_PUBLIC_API_URL?.trim().replace(/\/$/, "") ||
        "http://localhost:8000/api/v1";
      const res = await fetch(`${apiUrl}/auth/verify-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token: code }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || data.message || "Invalid OTP code");
      }

      toast.success("Account verified successfully!");
      setTimeout(() => router.push("/login"), 1500);
    } catch (err: any) {
      toast.error(err.message || "Verification failed");
      setOtp("");
    } finally {
      setVerifying(false);
    }
  };

  if (showVerification) {
    return (
      <div
        className={cn(
          "flex flex-col gap-6 items-center justify-center min-h-[500px]",
          className,
        )}
        {...props}
      >
        <Card className="max-w-md w-full shadow-none border rounded-xl bg-background overflow-hidden">
          <CardContent className="p-10 text-center space-y-8">
            <div className="flex flex-col items-center gap-2">
              <div className="space-y-1">
                <TypographyH2 className="text-xl font-semibold tracking-tight">
                  Verification
                </TypographyH2>
                <p className="text-muted-foreground text-sm font-medium leading-relaxed">
                  Enter the code sent to <br />
                  <span className="font-semibold text-foreground">
                    {formData.email}
                  </span>
                </p>
              </div>
            </div>

            <div className="flex justify-center">
              <AnimatedOTPInput
                value={otp}
                onChange={setOtp}
                onComplete={handleVerify}
                maxLength={6}
              />
            </div>

            <div className="space-y-6">
              {verifying ? (
                <div className="flex items-center justify-center gap-2 text-sm font-semibold text-primary">
                  <Loader2 className="size-4 animate-spin" /> Verifying...
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleResend}
                    disabled={resending}
                    className="text-xs font-semibold text-primary hover:bg-primary/5 h-8 rounded-full"
                  >
                    {resending ? (
                      <Loader2 className="size-3 animate-spin mr-2" />
                    ) : null}
                    Didn&apos;t receive a code? Resend
                  </Button>
                  <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest opacity-60">
                    Institutional Security Protocol
                  </div>
                </div>
              )}

              <Separator />

              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowVerification(false)}
                className="h-10 px-6 font-semibold gap-2 hover:bg-muted"
              >
                <ArrowRight className="size-4 rotate-180" /> Change Email
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="overflow-hidden p-0 border shadow-none rounded-xl bg-background max-w-5xl w-full mx-auto">
        <CardContent className="grid p-0 md:grid-cols-2">
          {/* Form Side */}
          <form
            onSubmit={handleSignup}
            className="p-6 md:p-10 flex flex-col justify-center"
          >
            <div className="flex flex-col items-center gap-2 text-center mb-8">
              <TypographyH2 className="text-2xl font-semibold tracking-tight">
                Establish Account
              </TypographyH2>
              <p className="text-muted-foreground text-sm">
                Phase 1: Institutional Gateway
              </p>
            </div>

            <div className="space-y-4">
              <div className="p-1 bg-muted/50 rounded-full mb-4">
                <Tabs
                  value={role}
                  onValueChange={(v) => {
                    setRole(v as "STUDENT" | "LECTURER");
                  }}
                  className="w-full"
                >
                  <TabsList className="grid w-full grid-cols-2 bg-transparent h-9">
                    <TabsTrigger
                      value="STUDENT"
                      className="font-semibold text-xs rounded-full data-[state=active]:bg-background data-[state=active]:shadow-sm"
                    >
                      Student
                    </TabsTrigger>
                    <TabsTrigger
                      value="LECTURER"
                      className="font-semibold text-xs rounded-full data-[state=active]:bg-background data-[state=active]:shadow-sm"
                    >
                      Lecturer
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              {errors.form && (
                <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-2 rounded-lg text-xs font-medium">
                  {errors.form}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="firstName" className="text-sm font-medium">
                    Given Name
                  </Label>
                  <Input
                    id="firstName"
                    name="firstName"
                    placeholder="John"
                    required
                    value={formData.firstName}
                    onChange={handleChange}
                    aria-invalid={!!errors.firstName}
                    className="h-10"
                  />
                  {errors.firstName && (
                    <p className="text-destructive text-[10px] font-medium">
                      {errors.firstName}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lastName" className="text-sm font-medium">
                    Surname
                  </Label>
                  <Input
                    id="lastName"
                    name="lastName"
                    placeholder="Doe"
                    required
                    value={formData.lastName}
                    onChange={handleChange}
                    aria-invalid={!!errors.lastName}
                    className="h-10"
                  />
                  {errors.lastName && (
                    <p className="text-destructive text-[10px] font-medium">
                      {errors.lastName}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-sm font-medium">
                  Work Email
                </Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="name@university.edu"
                  required
                  value={formData.email}
                  onChange={handleChange}
                  aria-invalid={!!errors.email}
                  className="h-10"
                />
                {errors.email && (
                  <p className="text-destructive text-[10px] font-medium">
                    {errors.email}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="phoneNumber" className="text-sm font-medium">
                    Contact Phone
                  </Label>
                  <Input
                    id="phoneNumber"
                    name="phoneNumber"
                    type="tel"
                    placeholder="+250..."
                    value={formData.phoneNumber}
                    onChange={handleChange}
                    aria-invalid={!!errors.phoneNumber}
                    className="h-10"
                  />
                  {errors.phoneNumber && (
                    <p className="text-destructive text-[10px] font-medium">
                      {errors.phoneNumber}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  {role === "LECTURER" ? (
                    <>
                      <Label htmlFor="staffId" className="text-sm font-medium">
                        Staff ID
                      </Label>
                      <Input
                        id="staffId"
                        name="staffId"
                        placeholder="LEC-001"
                        required
                        value={formData.staffId}
                        onChange={handleChange}
                        className="h-10"
                      />
                    </>
                  ) : (
                    <>
                      <Label
                        htmlFor="regNumber"
                        className="text-sm font-medium"
                      >
                        Student ID
                      </Label>
                      <Input
                        id="regNumber"
                        name="regNumber"
                        placeholder="2024/UG/..."
                        required
                        value={formData.regNumber}
                        onChange={handleChange}
                        aria-invalid={!!errors.regNumber}
                        className="h-10"
                      />
                    </>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-sm font-medium">
                    Security Key
                  </Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    required
                    value={formData.password}
                    onChange={handleChange}
                    aria-invalid={!!errors.password}
                    className="h-10"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label
                    htmlFor="confirmPassword"
                    className="text-sm font-medium"
                  >
                    Verification
                  </Label>
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    required
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    aria-invalid={!!errors.confirmPassword}
                    className="h-10"
                  />
                </div>
              </div>

              <div className="pt-2">
                <Button
                  type="submit"
                  className="w-full h-10 rounded-full font-medium"
                  disabled={loading}
                >
                  {loading ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="size-4 animate-spin" />
                      Processing...
                    </div>
                  ) : (
                    "Register Account"
                  )}
                </Button>
              </div>

              <div className="text-center text-sm pt-2">
                <p className="text-muted-foreground">
                  Already registered?{" "}
                  <Link
                    href="/login"
                    className="text-primary hover:underline font-medium"
                  >
                    Sign in
                  </Link>
                </p>
              </div>
            </div>
          </form>

          {/* Right Side - Image */}
          <div className="relative hidden bg-muted md:block">
            <Image
              src="/images/Login Image.png"
              alt="Academic environment"
              fill
              className="object-cover"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
