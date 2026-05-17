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
import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import { authApi } from "@/lib/api/auth";
import { lecturerApi, InstitutionResponse, DepartmentResponse, OptionResponse } from "@/lib/api/lecturer";
import { validateSignupForm } from "@/lib/validation";
import Image from "next/image";
import { Checkbox } from "./ui/checkbox";
import { ScrollArea } from "./ui/scroll-area";
import { Loader2, Check } from "lucide-react";

export function SignupForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [role, setRole] = useState<"STUDENT" | "LECTURER">("STUDENT");
  
  // Metadata states
  const [institutions, setInstitutions] = useState<InstitutionResponse[]>([]);
  const [availableDepartments, setAvailableDepartments] = useState<DepartmentResponse[]>([]);
  const [availableOptions, setAvailableOptions] = useState<OptionResponse[]>([]);
  
  const [fetchingDepts, setFetchingDepts] = useState(false);
  const [fetchingOptions, setFetchingOptions] = useState(false);

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    confirmPassword: "",
    regNumber: "",
    college: "", // Used for students (string)
    department: "", // Used for students (string)
    option: "", // Used for students (string)
    level: "",
    year: "",
  });

  // Multi-select states for lecturers
  const [selectedInstitutionIds, setSelectedInstitutionIds] = useState<string[]>([]);
  const [selectedDepartmentIds, setSelectedDeptIds] = useState<string[]>([]);
  const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>([]);

  useEffect(() => {
    async function loadInstitutions() {
      try {
        const data = await lecturerApi.getInstitutions();
        setInstitutions(data);
      } catch (err) {
        console.error("Failed to load institutions", err);
      }
    }
    loadInstitutions();
  }, []);

  const handleInstitutionChange = async (id: string) => {
    if (role === "STUDENT") {
      // Students usually belong to one institution
      setSelectedInstitutionIds([id]);
      setFetchingDepts(true);
      try {
        const depts = await lecturerApi.getDepartments(id);
        setAvailableDepartments(depts);
      } catch (err) {
        toast.error("Failed to load departments");
      } finally {
        setFetchingDepts(false);
      }
    } else {
      // Lecturers can teach in many institutions
      const newSelected = selectedInstitutionIds.includes(id)
        ? selectedInstitutionIds.filter(i => i !== id)
        : [...selectedInstitutionIds, id];
      setSelectedInstitutionIds(newSelected);
      
      // Refresh departments
      if (newSelected.length > 0) {
        setFetchingDepts(true);
        try {
          const allDepts = await Promise.all(
            newSelected.map(instId => lecturerApi.getDepartments(instId))
          );
          setAvailableDepartments(allDepts.flat());
        } catch (err) {
          toast.error("Failed to load departments");
        } finally {
          setFetchingDepts(false);
        }
      } else {
        setAvailableDepartments([]);
        setSelectedDeptIds([]);
      }
    }
  };

  const handleDeptToggle = async (id: string) => {
    if (role === "STUDENT") {
      setSelectedDeptIds([id]);
      // Students pick one department, so we can set the formData string too
      const dept = availableDepartments.find(d => d.id === id);
      if (dept) setFormData(p => ({ ...p, department: dept.name }));

      setFetchingOptions(true);
      try {
        const options = await lecturerApi.getOptions(id);
        setAvailableOptions(options);
      } catch (err) {
        toast.error("Failed to load options");
      } finally {
        setFetchingOptions(false);
      }
    } else {
      const newSelected = selectedDepartmentIds.includes(id)
        ? selectedDepartmentIds.filter(i => i !== id)
        : [...selectedDepartmentIds, id];
      setSelectedDeptIds(newSelected);

      if (newSelected.length > 0) {
        setFetchingOptions(true);
        try {
          const allOptions = await Promise.all(
            newSelected.map(dId => lecturerApi.getOptions(dId))
          );
          setAvailableOptions(allOptions.flat());
        } catch (err) {
          toast.error("Failed to load options");
        } finally {
          setFetchingOptions(false);
        }
      } else {
        setAvailableOptions([]);
        setSelectedOptionIds([]);
      }
    }
  };

  const handleOptionToggle = (id: string) => {
    if (role === "STUDENT") {
      setSelectedOptionIds([id]);
      const opt = availableOptions.find(o => o.id === id);
      if (opt) setFormData(p => ({ ...p, option: opt.name }));
    } else {
      setSelectedOptionIds(prev =>
        prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
      );
    }
  };

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

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    const validation = validateSignupForm({ 
      ...formData, 
      role,
      institution_ids: selectedInstitutionIds,
      department_ids: selectedDepartmentIds
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
        reg_number: role === "STUDENT" ? formData.regNumber : undefined,
        college: formData.college,
        department: formData.department,
        option: role === "STUDENT" ? formData.option : undefined,
        level: role === "STUDENT" ? formData.level : undefined,
        year: role === "STUDENT" ? formData.year : undefined,
        // Structured fields
        institution_ids: role === "LECTURER" ? selectedInstitutionIds : [selectedInstitutionIds[0]],
        department_ids: role === "LECTURER" ? selectedDepartmentIds : [selectedDepartmentIds[0]],
        option_ids: role === "LECTURER" ? selectedOptionIds : [selectedOptionIds[0]],
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
                  value={role}
                  onValueChange={(v) => {
                    setRole(v as "STUDENT" | "LECTURER");
                    setSelectedInstitutionIds([]);
                    setSelectedDeptIds([]);
                    setSelectedOptionIds([]);
                    setAvailableDepartments([]);
                    setAvailableOptions([]);
                  }}
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

              {/* Institutions */}
              <Field>
                <FieldLabel>
                  {role === "STUDENT" ? "Institution" : "Institutions (Select all you teach in)"}
                </FieldLabel>
                <div className="grid grid-cols-1 gap-2 mt-1">
                  {institutions.map(inst => (
                    <div 
                      key={inst.id} 
                      onClick={() => handleInstitutionChange(inst.id)}
                      className={cn(
                        "flex items-center justify-between p-2 rounded-md border cursor-pointer transition-colors text-xs",
                        selectedInstitutionIds.includes(inst.id) 
                          ? "bg-primary/10 border-primary text-primary" 
                          : "hover:bg-muted"
                      )}
                    >
                      <span>{inst.name} ({inst.code})</span>
                      {selectedInstitutionIds.includes(inst.id) && <Check className="size-3" />}
                    </div>
                  ))}
                </div>
              </Field>

              {/* Departments */}
              {selectedInstitutionIds.length > 0 && (
                <Field>
                  <div className="flex items-center justify-between mb-2">
                    <FieldLabel>
                      {role === "STUDENT" ? "Department" : "Departments"}
                    </FieldLabel>
                    {fetchingDepts && <Loader2 className="size-3 animate-spin" />}
                  </div>
                  <ScrollArea className="h-[120px] rounded-md border p-2 bg-muted/20">
                    <div className="space-y-2">
                      {availableDepartments.map(dept => (
                        <div key={dept.id} className="flex items-center space-x-2">
                          <Checkbox 
                            id={`dept-${dept.id}`} 
                            checked={selectedDepartmentIds.includes(dept.id)}
                            onCheckedChange={() => handleDeptToggle(dept.id)}
                          />
                          <label 
                            htmlFor={`dept-${dept.id}`} 
                            className="text-xs font-medium leading-none cursor-pointer"
                          >
                            {dept.name}
                          </label>
                        </div>
                      ))}
                      {availableDepartments.length === 0 && !fetchingDepts && (
                        <p className="text-[10px] text-muted-foreground p-2">No departments found.</p>
                      )}
                    </div>
                  </ScrollArea>
                </Field>
              )}

              {/* Options */}
              {selectedDepartmentIds.length > 0 && (
                <Field>
                   <div className="flex items-center justify-between mb-2">
                    <FieldLabel>
                      {role === "STUDENT" ? "Option" : "Options / Specializations"}
                    </FieldLabel>
                    {fetchingOptions && <Loader2 className="size-3 animate-spin" />}
                  </div>
                  <ScrollArea className="h-[120px] rounded-md border p-2 bg-muted/20">
                    <div className="space-y-2">
                      {availableOptions.map(opt => (
                        <div key={opt.id} className="flex items-center space-x-2">
                          <Checkbox 
                            id={`opt-${opt.id}`} 
                            checked={selectedOptionIds.includes(opt.id)}
                            onCheckedChange={() => handleOptionToggle(opt.id)}
                          />
                          <label 
                            htmlFor={`opt-${opt.id}`} 
                            className="text-xs font-medium leading-none cursor-pointer"
                          >
                            {opt.name}
                          </label>
                        </div>
                      ))}
                       {availableOptions.length === 0 && !fetchingOptions && (
                        <p className="text-[10px] text-muted-foreground p-2">No options found.</p>
                      )}
                    </div>
                  </ScrollArea>
                </Field>
              )}

              {role === "STUDENT" && (
                <div className="grid grid-cols-2 gap-4">
                  <Field>
                    <FieldLabel htmlFor="level">Level</FieldLabel>
                    <Select
                      value={formData.level}
                      onValueChange={(v) => setFormData(p => ({ ...p, level: v }))}
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
                      onValueChange={(v) => setFormData(p => ({ ...p, year: v }))}
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
            <Image
              src="/images/Login Image.png"
              alt="Students in academic environment"
              fill
              className="object-cover"
            />
            <div className="absolute inset-0 bg-primary/20 mix-blend-multiply" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
