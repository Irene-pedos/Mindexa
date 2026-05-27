"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { 
  Stepper, 
  StepperItem, 
  StepperPanel, 
} from "@/components/ui/stepper";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  CheckCircle2, 
  ArrowRight, 
  ArrowLeft,
  Camera,
  ChevronRight,
  School,
  GraduationCap
} from "lucide-react";
import { academicApi, AcademicInstitution, AcademicCampus, AcademicCollege, AcademicDepartment, AcademicOption, AcademicClassGroup, AcademicClassSection } from "@/lib/api/academic";
import { authApi } from "@/lib/api/auth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from "@/components/ui/tabs";

export default function StudentOnboarding() {
  const router = useRouter();
  const { user, checkAuth } = useAuth();
  const [activeStep, setActiveStep] = useState(1);
  const [currentTab, setCurrentTab] = useState("institutional");
  const [submitting, setSubmitting] = useState(false);
  
  // Selections
  const [institutions, setInstitutions] = useState<AcademicInstitution[]>([]);
  const [campuses, setCampuses] = useState<AcademicCampus[]>([]);
  const [colleges, setColleges] = useState<AcademicCollege[]>([]);
  const [departments, setDepartments] = useState<AcademicDepartment[]>([]);
  const [options, setOptions] = useState<AcademicOption[]>([]);
  const [classGroups, setClassGroups] = useState<AcademicClassGroup[]>([]);
  const [sections, setSections] = useState<AcademicClassSection[]>([]);
  
  // Loading states
  const [isFetchingCampuses, setIsFetchingCampuses] = useState(false);
  const [isFetchingColleges, setIsFetchingColleges] = useState(false);
  const [isFetchingDepts, setIsFetchingDepts] = useState(false);
  const [isFetchingOptions, setIsFetchingOptions] = useState(false);
  const [isFetchingGroups, setIsFetchingGroups] = useState(false);
  const [isFetchingSections, setIsFetchingSections] = useState(false);

  const [selectedInst, setSelectedInst] = useState<string>("");
  const [selectedCampus, setSelectedCampus] = useState<string>("");
  const [selectedCollege, setSelectedCollege] = useState<string>("");
  const [selectedDept, setSelectedDept] = useState<string>("");
  const [selectedOpt, setSelectedOpt] = useState<string>("");
  const [selectedGroup, setSelectedGroup] = useState<string>("");
  const [selectedSection, setSelectedSection] = useState<string>("");
  
  const [level, setLevel] = useState<string>("");
  const [year, setYear] = useState<string>("");
  const [profilePic, setProfilePic] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      try {
        const data = await academicApi.getInstitutions();
        setInstitutions(data);
      } catch (err) {
        toast.error("Failed to load academic institutions");
      }
    }
    init();
  }, []);

  // Cascading effects
  useEffect(() => {
    if (selectedInst) {
      setIsFetchingCampuses(true);
      academicApi.getCampuses(selectedInst)
        .then(setCampuses)
        .catch(() => setCampuses([]))
        .finally(() => setIsFetchingCampuses(false));

      setSelectedCampus("");
      setSelectedCollege("");
      setSelectedDept("");
      setSelectedOpt("");
      setSelectedGroup("");
      setSelectedSection("");
    }
  }, [selectedInst]);

  useEffect(() => {
    if (selectedCampus) {
      setIsFetchingColleges(true);
      academicApi.getColleges(selectedCampus)
        .then(setColleges)
        .catch(() => setColleges([]))
        .finally(() => setIsFetchingColleges(false));

      setSelectedCollege("");
      setSelectedDept("");
    } else if (selectedInst) {
        setIsFetchingDepts(true);
        academicApi.getDepartments({ institution_id: selectedInst })
            .then(setDepartments)
            .catch(() => setDepartments([]))
            .finally(() => setIsFetchingDepts(false));
    }
  }, [selectedCampus, selectedInst]);

  useEffect(() => {
    if (selectedCollege) {
      setIsFetchingDepts(true);
      academicApi.getDepartments({ college_id: selectedCollege })
        .then(setDepartments)
        .catch(() => setDepartments([]))
        .finally(() => setIsFetchingDepts(false));
      setSelectedDept("");
    } else if (selectedCampus) {
      setIsFetchingDepts(true);
      academicApi.getDepartments({ campus_id: selectedCampus })
        .then(setDepartments)
        .catch(() => setDepartments([]))
        .finally(() => setIsFetchingDepts(false));
      setSelectedDept("");
    }
  }, [selectedCollege, selectedCampus]);

  useEffect(() => {
    if (selectedDept) {
      setIsFetchingOptions(true);
      academicApi.getOptions(selectedDept)
        .then(setOptions)
        .catch(() => setOptions([]))
        .finally(() => setIsFetchingOptions(false));
      setSelectedOpt("");
      setSelectedGroup("");
      setSelectedSection("");
    }
  }, [selectedDept]);

  useEffect(() => {
    if (selectedOpt) {
      setIsFetchingGroups(true);
      academicApi.getClassGroups(selectedOpt)
        .then(setClassGroups)
        .catch(() => setClassGroups([]))
        .finally(() => setIsFetchingGroups(false));
      setSelectedGroup("");
      setSelectedSection("");
    }
  }, [selectedOpt]);

  useEffect(() => {
    if (selectedGroup) {
      setIsFetchingSections(true);
      academicApi.getSections(selectedGroup)
        .then(setSections)
        .catch(() => setSections([]))
        .finally(() => setIsFetchingSections(false));
      setSelectedSection("");
    } else {
      setSections([]);
      setSelectedSection("");
    }
  }, [selectedGroup]);

  const handleNextStep = (step: number, tab: string) => {
    setActiveStep(step);
    setCurrentTab(tab);
  };

  const handleFinish = async () => {
    // Precise validation to find which field is causing the issue
    if (!selectedInst) return toast.error("University/Institution selection is required.");
    if (!selectedDept) return toast.error("Department selection is required.");
    if (!selectedOpt) return toast.error("Academic Program selection is required.");
    if (!level) return toast.error("Academic Level selection is required.");
    if (!year) return toast.error("Academic Year selection is required.");
    
    if (classGroups.length > 0 && !selectedGroup) {
        return toast.error("Academic Group/Level selection is required.");
    }
    
    if (sections.length > 0 && !selectedSection) {
        return toast.error("Specific Class Section (e.g. Group A) is required.");
    }

    setSubmitting(true);
    try {
      await authApi.completeStudentOnboarding({
        institution_id: selectedInst,
        campus_id: selectedCampus || undefined,
        college_id: selectedCollege || undefined,
        department_id: selectedDept,
        option_id: selectedOpt,
        level: level,
        year: year,
        class_section_id: selectedSection || undefined
      });
      
      toast.success("Academic profile verified successfully!");
      await checkAuth();
      router.push("/student/dashboard");
    } catch (err: any) {
      toast.error(err.message || "Failed to complete onboarding");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-muted/20 flex items-center justify-center p-6 md:p-12">
      <Card className="max-w-5xl w-full shadow-none border rounded-xl bg-background overflow-hidden">
        <CardHeader className="border-b bg-muted/5 py-8 px-10 flex flex-row items-center justify-between">
            <div className="space-y-1">
                <CardTitle className="text-2xl font-semibold tracking-tight">Student Onboarding</CardTitle>
                <CardDescription className="text-sm font-medium">
                    Link your account to your institution to access academic tools.
                </CardDescription>
            </div>
            <div className="flex gap-2">
                {[1, 2, 3].map((step) => (
                    <div 
                        key={step} 
                        className={cn(
                            "h-1.5 w-16 rounded-full transition-all duration-300",
                            activeStep >= step ? "bg-primary" : "bg-muted"
                        )} 
                    />
                ))}
            </div>
        </CardHeader>

        <CardContent className="p-0">
          <Tabs value={currentTab} onValueChange={setCurrentTab} className="w-full">
            <TabsList className="hidden">
              <TabsTrigger value="institutional">Institutional</TabsTrigger>
              <TabsTrigger value="program">Program</TabsTrigger>
              <TabsTrigger value="identity">Identity</TabsTrigger>
            </TabsList>
            
            <TabsContent value="institutional" className="p-10 m-0">
              <div className="space-y-10">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-start">
                    <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-foreground">Institutional Assignment</h3>
                        <p className="text-muted-foreground text-sm leading-relaxed">
                            Please select your primary university and campus. This ensures you are assigned to the correct faculty records and assessment windows.
                        </p>
                    </div>
                    <div className="space-y-6">
                        <div className="space-y-2">
                            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">University / Institution</Label>
                            <Select value={selectedInst} onValueChange={setSelectedInst}>
                                <SelectTrigger className="h-11 rounded-lg">
                                    <SelectValue placeholder="Search institution registry..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {institutions.map(inst => (
                                        <SelectItem key={inst.id} value={inst.id}>{inst.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {(campuses.length > 0 || isFetchingCampuses) && (
                            <div className="space-y-2">
                                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Campus</Label>
                                <Select value={selectedCampus} onValueChange={setSelectedCampus} disabled={isFetchingCampuses}>
                                    <SelectTrigger className="h-11 rounded-lg">
                                        <SelectValue placeholder={isFetchingCampuses ? "Loading campuses..." : "Select campus..."} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {campuses.map(campus => (
                                            <SelectItem key={campus.id} value={campus.id}>{campus.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}

                        {(colleges.length > 0 || isFetchingColleges) && (
                            <div className="space-y-2">
                                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">College / Faculty</Label>
                                <Select value={selectedCollege} onValueChange={setSelectedCollege} disabled={isFetchingColleges}>
                                    <SelectTrigger className="h-11 rounded-lg">
                                        <SelectValue placeholder={isFetchingColleges ? "Loading colleges..." : "Select college..."} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {colleges.map(college => (
                                            <SelectItem key={college.id} value={college.id}>{college.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}

                        <div className="space-y-2">
                            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Department / School</Label>
                            <Select value={selectedDept} onValueChange={setSelectedDept} disabled={!selectedInst || isFetchingDepts}>
                                <SelectTrigger className="h-11 rounded-lg">
                                    <SelectValue placeholder={isFetchingDepts ? "Loading departments..." : (selectedInst ? "Select department..." : "Institutional context required")} />
                                </SelectTrigger>
                                <SelectContent>
                                    {departments.map(dept => (
                                        <SelectItem key={dept.id} value={dept.id}>{dept.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </div>
                <div className="pt-12 flex justify-end">
                  <Button size="lg" disabled={!selectedDept || isFetchingDepts} onClick={() => handleNextStep(2, "program")} className="h-11 px-10 rounded-lg font-semibold gap-2 shadow-sm">
                      Continue to Program <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="program" className="p-10 m-0">
              <div className="space-y-10">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-start">
                    <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-foreground">Program & Status</h3>
                        <p className="text-muted-foreground text-sm leading-relaxed">
                            Identify your specific program of study and your current academic level. This is required for accurate course enrollment and GPA calculation.
                        </p>
                    </div>
                    <div className="space-y-6">
                        <div className="space-y-2">
                            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Academic Specialization / Program</Label>
                            <Select value={selectedOpt} onValueChange={setSelectedOpt} disabled={!selectedDept || isFetchingOptions}>
                                <SelectTrigger className="h-11 rounded-lg">
                                    <SelectValue placeholder={isFetchingOptions ? "Loading programs..." : "Search academic program..."} />
                                </SelectTrigger>
                                <SelectContent>
                                    {options.map(opt => (
                                        <SelectItem key={opt.id} value={opt.id}>{opt.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Academic Level</Label>
                                <Select value={level} onValueChange={setLevel} disabled={!selectedOpt}>
                                    <SelectTrigger className="h-11 rounded-lg">
                                        <SelectValue placeholder="Level" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Level 6">Level 6 (Year 1 & 2)</SelectItem>
                                        <SelectItem value="Level 7">Level 7 (Year 3)</SelectItem>
                                        <SelectItem value="Level 8">Level 8 (Year 4)</SelectItem>
                                        <SelectItem value="Level 9">Level 9 (Masters)</SelectItem>
                                        <SelectItem value="Level 10">Level 10 (PhD/Doctorate)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Academic Year</Label>
                                <Select value={year} onValueChange={setYear} disabled={!selectedOpt}>
                                    <SelectTrigger className="h-11 rounded-lg">
                                        <SelectValue placeholder="Year" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="2023 - 2024">2023 - 2024</SelectItem>
                                        <SelectItem value="2024 - 2025">2024 - 2025</SelectItem>
                                        <SelectItem value="2025 - 2026">2025 - 2026</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        
                        <div className="space-y-2">
                            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Academic Group / Level</Label>
                            <Select value={selectedGroup} onValueChange={setSelectedGroup} disabled={!selectedOpt || isFetchingGroups}>
                                <SelectTrigger className="h-11 rounded-lg">
                                    <SelectValue placeholder={isFetchingGroups ? "Loading groups..." : "Select group (e.g. Level 6)..."} />
                                </SelectTrigger>
                                <SelectContent>
                                    {classGroups.map(cg => (
                                        <SelectItem key={cg.id} value={cg.id}>{cg.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {(sections.length > 0 || isFetchingSections) && (
                            <div className="space-y-2">
                                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Specific Section</Label>
                                <Select value={selectedSection} onValueChange={setSelectedSection} disabled={isFetchingSections}>
                                    <SelectTrigger className="h-11 rounded-lg">
                                        <SelectValue placeholder={isFetchingSections ? "Loading sections..." : "Select section (e.g. Group A)..."} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {sections.map(s => (
                                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                    </div>
                </div>
                <div className="pt-12 flex justify-between">
                  <Button variant="ghost" size="lg" onClick={() => handleNextStep(1, "institutional")} className="h-11 px-6 rounded-lg font-semibold gap-2">
                      <ArrowLeft className="size-4" /> Previous
                  </Button>
                  <Button size="lg" disabled={!selectedOpt || !level || !year || (classGroups.length > 0 && !selectedGroup) || (sections.length > 0 && !selectedSection) || isFetchingGroups || isFetchingSections} onClick={() => handleNextStep(3, "identity")} className="h-11 px-10 rounded-lg font-semibold gap-2 shadow-sm">
                      Confirm Identity <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="identity" className="p-10 m-0">
              <div className="space-y-10">
                <div className="flex flex-col md:flex-row items-center gap-12 py-6">
                    <div className="relative">
                        <Avatar className="size-32 border-2 border-muted shadow-sm">
                            <AvatarImage src={profilePic || undefined} />
                            <AvatarFallback className="bg-muted text-muted-foreground text-4xl font-semibold uppercase">
                                {user?.profile?.first_name?.[0]}{user?.profile?.last_name?.[0]}
                            </AvatarFallback>
                        </Avatar>
                        <label className="absolute -bottom-1 -right-1 size-10 bg-primary text-white rounded-full flex items-center justify-center shadow-md cursor-pointer hover:bg-primary/90 transition-colors border-2 border-background">
                            <Camera className="size-5" />
                            <input type="file" className="hidden" accept="image/*" onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                    const url = URL.createObjectURL(file);
                                    setProfilePic(url);
                                    authApi.uploadAvatar(file).catch(() => toast.error("Avatar upload failed"));
                                }
                            }} />
                        </label>
                    </div>
                    
                    <div className="flex-1 text-center md:text-left space-y-2">
                        <h3 className="text-2xl font-semibold text-foreground">{user?.profile?.first_name} {user?.profile?.last_name}</h3>
                        <p className="text-sm text-muted-foreground font-mono uppercase tracking-widest bg-muted w-fit px-3 py-1 rounded-md border">ID: {user?.profile?.student_id || "NOT YET ASSIGNED"}</p>
                    </div>
                </div>

                <div className="p-8 rounded-xl border bg-muted/5 flex items-start gap-4">
                    <div className="mt-1">
                        <CheckCircle2 className="size-6 text-primary" />
                    </div>
                    <div className="space-y-2">
                        <p className="font-semibold text-foreground uppercase tracking-tight">Institutional Compliance</p>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                            I confirm that the academic information provided is accurate according to my current institutional enrollment. I agree to comply with the academic integrity standards of Mindexa and my institution.
                        </p>
                    </div>
                </div>
                <div className="pt-12 flex justify-between">
                  <Button variant="ghost" size="lg" onClick={() => handleNextStep(2, "program")} className="h-11 px-6 rounded-lg font-semibold gap-2">
                      <ArrowLeft className="size-4" /> Back
                  </Button>
                  <Button 
                    size="lg" 
                    onClick={handleFinish} 
                    disabled={submitting}
                    className="h-11 px-10 rounded-lg font-semibold gap-2 min-w-[200px] shadow-lg"
                  >
                    {submitting ? "Finalizing Registry..." : "Verify and Enter Portal"}
                    {!submitting && <ArrowRight className="size-4" />}
                  </Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
