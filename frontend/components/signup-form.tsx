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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TypographyH2 } from "@/components/ui/typography";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { authApi } from "@/lib/api/auth";
import { validateSignupForm } from "@/lib/validation";

export function SignupForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [role, setRole] = useState<"STUDENT" | "LECTURER">("STUDENT");
  const [customCollege, setCustomCollege] = useState(false);
  const [customDepartment, setCustomDepartment] = useState(false);

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    confirmPassword: "",
    regNumber: "",
    college: "",
    department: "",
    option: "",
    level: "",
    year: "",
  });

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

  const handleSelectChange = (name: string, value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    const validation = validateSignupForm({ ...formData, role });
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
        reg_number: role === "STUDENT" ? formData.regNumber : undefined,
        college: formData.college,
        department: formData.department,
        option: role === "STUDENT" ? formData.option : undefined,
        level: role === "STUDENT" ? formData.level : undefined,
        year: role === "STUDENT" ? formData.year : undefined,
      });

      toast.success(
        role === "LECTURER"
          ? "Account created. Your lecturer account is pending approval."
          : "Account created! Please check your email to verify your account.",
      );

      setTimeout(() => {
        router.push("/login");
      }, 2000);
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to create account";
      setErrors({ form: errorMessage });
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="overflow-hidden p-0">
        <CardContent className="grid p-0 md:grid-cols-2">
          {/* Form Side */}
          <form onSubmit={handleSignup} className="p-6 md:p-8">
            <FieldGroup>
              <div className="flex flex-col items-center gap-2 text-center mb-6">
                <TypographyH2 className="text-2xl font-semibold text-foreground tracking-tight">
                  Create your account
                </TypographyH2>
                <p className="text-muted-foreground text-sm">
                  Join Mindexa academic integrity platform
                </p>
              </div>

              <div className="mb-6">
                <Tabs
                  defaultValue="STUDENT"
                  onValueChange={(v) => setRole(v as "STUDENT" | "LECTURER")}
                  className="w-full"
                >
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="STUDENT">Student</TabsTrigger>
                    <TabsTrigger value="LECTURER">Lecturer</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              {errors.form && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4 text-sm">
                  {errors.form}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <Field>
                  <FieldLabel htmlFor="firstName">First name</FieldLabel>
                  <Input
                    id="firstName"
                    name="firstName"
                    placeholder="John"
                    required
                    value={formData.firstName}
                    onChange={handleChange}
                    aria-invalid={!!errors.firstName}
                  />
                  {errors.firstName && (
                    <FieldDescription className="text-red-500 text-xs mt-1">
                      {errors.firstName}
                    </FieldDescription>
                  )}
                </Field>
                <Field>
                  <FieldLabel htmlFor="lastName">Last name</FieldLabel>
                  <Input
                    id="lastName"
                    name="lastName"
                    placeholder="Doe"
                    required
                    value={formData.lastName}
                    onChange={handleChange}
                    aria-invalid={!!errors.lastName}
                  />
                  {errors.lastName && (
                    <FieldDescription className="text-red-500 text-xs mt-1">
                      {errors.lastName}
                    </FieldDescription>
                  )}
                </Field>
              </div>

              <Field>
                <FieldLabel htmlFor="email">Email address</FieldLabel>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="you@university.edu"
                  required
                  value={formData.email}
                  onChange={handleChange}
                  aria-invalid={!!errors.email}
                />
                {errors.email && (
                  <FieldDescription className="text-red-500 text-xs mt-1">
                    {errors.email}
                  </FieldDescription>
                )}
              </Field>

              {role === "STUDENT" && (
                <Field>
                  <FieldLabel htmlFor="regNumber">
                    Registration Number <span className="text-red-500">*</span>
                  </FieldLabel>
                  <Input
                    id="regNumber"
                    name="regNumber"
                    placeholder="2024/UG/1234"
                    required
                    value={formData.regNumber}
                    onChange={handleChange}
                    aria-invalid={!!errors.regNumber}
                  />
                  {errors.regNumber && (
                    <FieldDescription className="text-red-500 text-xs mt-1">
                      {errors.regNumber}
                    </FieldDescription>
                  )}
                </Field>
              )}

              <div className="grid grid-cols-2 gap-4">
                <Field>
                  <FieldLabel htmlFor="college">
                    College <span className="text-red-500">*</span>
                  </FieldLabel>
                  {customCollege ? (
                    <div className="flex gap-2">
                      <Input
                        id="college"
                        name="college"
                        placeholder="Type college name"
                        value={formData.college}
                        onChange={handleChange}
                        required
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        className="px-2 text-xs"
                        onClick={() => {
                          setCustomCollege(false);
                          setFormData((p) => ({ ...p, college: "" }));
                        }}
                      >
                        List
                      </Button>
                    </div>
                  ) : (
                    <Select
                      value={formData.college}
                      onValueChange={(v) => {
                        if (v === "other") {
                          setCustomCollege(true);
                          setFormData((p) => ({ ...p, college: "" }));
                        } else {
                          handleSelectChange("college", v);
                        }
                      }}
                      required
                    >
                      <SelectTrigger id="college">
                        <SelectValue placeholder="Select College" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CST">
                          Science & Technology
                        </SelectItem>
                        <SelectItem value="CBE">
                          Business & Economics
                        </SelectItem>
                        <SelectItem value="CASS">
                          Arts & Social Sciences
                        </SelectItem>
                        <SelectItem value="other">
                          Other (Type manually)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                  {errors.college && (
                    <FieldDescription className="text-red-500 text-xs mt-1">
                      {errors.college}
                    </FieldDescription>
                  )}
                </Field>
                <Field>
                  <FieldLabel htmlFor="department">Department</FieldLabel>
                  {customDepartment ? (
                    <div className="flex gap-2">
                      <Input
                        id="department"
                        name="department"
                        placeholder="Type department"
                        value={formData.department}
                        onChange={handleChange}
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        className="px-2 text-xs"
                        onClick={() => {
                          setCustomDepartment(false);
                          setFormData((p) => ({ ...p, department: "" }));
                        }}
                      >
                        List
                      </Button>
                    </div>
                  ) : (
                    <Select
                      value={formData.department}
                      onValueChange={(v) => {
                        if (v === "other") {
                          setCustomDepartment(true);
                          setFormData((p) => ({ ...p, department: "" }));
                        } else {
                          handleSelectChange("department", v);
                        }
                      }}
                    >
                      <SelectTrigger id="department">
                        <SelectValue placeholder="Select Dept" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CS">Computer Science</SelectItem>
                        <SelectItem value="IT">
                          Information Technology
                        </SelectItem>
                        <SelectItem value="SE">Software Engineering</SelectItem>
                        <SelectItem value="other">
                          Other (Type manually)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                  {errors.department && (
                    <FieldDescription className="text-red-500 text-xs mt-1">
                      {errors.department}
                    </FieldDescription>
                  )}
                </Field>
              </div>

              {role === "STUDENT" && (
                <Field>
                  <FieldLabel htmlFor="option">Option</FieldLabel>
                  <Select
                    value={formData.option}
                    onValueChange={(v) => handleSelectChange("option", v)}
                  >
                    <SelectTrigger id="option">
                      <SelectValue placeholder="Select Option" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="networking">Networking</SelectItem>
                      <SelectItem value="software">
                        Software Engineering
                      </SelectItem>
                      <SelectItem value="embedded">Embedded Systems</SelectItem>
                    </SelectContent>
                  </Select>
                  {errors.option && (
                    <FieldDescription className="text-red-500 text-xs mt-1">
                      {errors.option}
                    </FieldDescription>
                  )}
                </Field>
              )}

              {role === "STUDENT" && (
                <div className="grid grid-cols-2 gap-4">
                  <Field>
                    <FieldLabel htmlFor="level">Level</FieldLabel>
                    <Select
                      value={formData.level}
                      onValueChange={(v) => handleSelectChange("level", v)}
                    >
                      <SelectTrigger id="level">
                        <SelectValue placeholder="Level" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">Level 1</SelectItem>
                        <SelectItem value="2">Level 2</SelectItem>
                        <SelectItem value="3">Level 3</SelectItem>
                        <SelectItem value="4">Level 4</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="year">Year</FieldLabel>
                    <Select
                      value={formData.year}
                      onValueChange={(v) => handleSelectChange("year", v)}
                    >
                      <SelectTrigger id="year">
                        <SelectValue placeholder="Year" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="2024">2024</SelectItem>
                        <SelectItem value="2025">2025</SelectItem>
                        <SelectItem value="2026">2026</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
              )}

              <Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field>
                    <FieldLabel htmlFor="password">Password</FieldLabel>
                    <Input
                      id="password"
                      name="password"
                      type="password"
                      required
                      value={formData.password}
                      onChange={handleChange}
                      aria-invalid={!!errors.password}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="confirmPassword">
                      Confirm Password
                    </FieldLabel>
                    <Input
                      id="confirmPassword"
                      name="confirmPassword"
                      type="password"
                      required
                      value={formData.confirmPassword}
                      onChange={handleChange}
                      aria-invalid={!!errors.confirmPassword}
                    />
                  </Field>
                </div>
                {errors.password && (
                  <FieldDescription className="text-red-500 text-xs mt-1">
                    {errors.password}
                  </FieldDescription>
                )}
              </Field>

              <Field className="pt-2">
                <Button
                  type="submit"
                  className="w-full rounded-full"
                  disabled={loading}
                >
                  {loading ? "Creating account..." : "Create Account"}
                </Button>
              </Field>

              <FieldDescription className="text-center text-sm mt-4">
                Already have an account?{" "}
                <Link
                  href="/login"
                  className="text-primary hover:underline font-medium"
                >
                  Sign in
                </Link>
              </FieldDescription>
            </FieldGroup>
          </form>

          {/* Right Side - Decorative Image */}
          <div className="relative hidden bg-muted md:block">
            <img
              src="images/Login Image.png"
              alt="Students in academic environment"
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-primary/20 mix-blend-multiply" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
