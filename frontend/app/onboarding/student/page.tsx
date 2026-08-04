"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  ArrowRight, 
  ArrowLeft,
  Camera,
  School,
  GraduationCap,
  CheckCircle2,
  Loader2,
  Building2,
  BookOpen,
  Calendar,
  Layers,
  LayoutGrid,
  MapPin,
  Library,
  Users
} from "lucide-react";
import { academicApi } from "@/lib/api/academic";
import { authApi } from "@/lib/api/auth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { 
  InstitutionResponse as AcademicInstitution, 
  CampusResponse as AcademicCampus, 
  CollegeResponse as AcademicCollege, 
  DepartmentResponse as AcademicDepartment, 
  OptionResponse as AcademicOption, 
  ClassGroupResponse as AcademicClassGroup, 
  ClassSectionResponse as AcademicClassSection 
} from "@/lib/api/academic-types";

const STEPS = [
  { id: 1, title: "Institution", icon: School, description: "Select University" },
  { id: 2, title: "Program", icon: BookOpen, description: "Degree & Specialization" },
  { id: 3, title: "Profile", icon: GraduationCap, description: "Finalize Identity" },
];

export default function StudentOnboarding() {
  const router = useRouter();
  const { user, checkAuth } = useAuth();
  const [activeStep, setActiveStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  
  // Data State
  const [institutions, setInstitutions] = useState<AcademicInstitution[]>([]);
  const [campuses, setCampuses] = useState<AcademicCampus[]>([]);
  const [colleges, setColleges] = useState<AcademicCollege[]>([]);
  const [departments, setDepartments] = useState<AcademicDepartment[]>([]);
  const [options, setOptions] = useState<AcademicOption[]>([]);
  const [classGroups, setClassGroups] = useState<AcademicClassGroup[]>([]);
  const [sections, setSections] = useState<AcademicClassSection[]>([]);
  
  // Selections
  const [selectedInst, setSelectedInst] = useState<string>("");
  const [selectedCampus, setSelectedCampus] = useState<string>("none");
  const [selectedCollege, setSelectedCollege] = useState<string>("none");
  const [selectedDept, setSelectedDept] = useState<string>("");
  const [selectedOpt, setSelectedOpt] = useState<string>("");
  const [selectedGroup, setSelectedGroup] = useState<string>("");
  const [selectedSection, setSelectedSection] = useState<string>("none");
  
  const [level, setLevel] = useState<string>("");
  const [year, setYear] = useState<string>("");
  const [profilePic, setProfilePic] = useState<string | null>(null);

  const [periods, setPeriods] = useState<any[]>([]);
  const [dbLevels, setDbLevels] = useState<number[]>([]);

  // Loading states
  const [loading, setLoading] = useState<Record<string, boolean>>({});

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

  // Cascading Logic
  useEffect(() => {
    if (selectedInst) {
      setLoading(prev => ({ ...prev, campuses: true, colleges: true, periods: true, levels: true }));
      
      academicApi.getCampuses(selectedInst)
        .then(setCampuses)
        .finally(() => setLoading(prev => ({ ...prev, campuses: false })));

      academicApi.getColleges({ institution_id: selectedInst })
        .then(setColleges)
        .finally(() => setLoading(prev => ({ ...prev, colleges: false })));

      academicApi.getPeriods(selectedInst)
        .then(setPeriods)
        .finally(() => setLoading(prev => ({ ...prev, periods: false })));

      academicApi.getLevels(selectedInst)
        .then(setDbLevels)
        .finally(() => setLoading(prev => ({ ...prev, levels: false })));

      setSelectedCampus("none");
      setSelectedCollege("none");
      setSelectedDept("");
      setSelectedOpt("");
      setSelectedGroup("");
      setYear("");
    }
  }, [selectedInst]);

  useEffect(() => {
    if (selectedCampus && selectedCampus !== "none") {
      setLoading(prev => ({ ...prev, colleges: true }));
      academicApi.getColleges({ campus_id: selectedCampus })
        .then(setColleges)
        .finally(() => setLoading(prev => ({ ...prev, colleges: false })));
      setSelectedCollege("none");
    } else if (selectedInst) {
      setLoading(prev => ({ ...prev, colleges: true }));
      academicApi.getColleges({ institution_id: selectedInst })
        .then(setColleges)
        .finally(() => setLoading(prev => ({ ...prev, colleges: false })));
    }
  }, [selectedCampus, selectedInst]);

  useEffect(() => {
    if (selectedInst) {
        setLoading(prev => ({ ...prev, depts: true }));
        const params: any = { institution_id: selectedInst };
        if (selectedCampus !== "none") params.campus_id = selectedCampus;
        if (selectedCollege !== "none") params.college_id = selectedCollege;

        academicApi.getDepartments(params)
            .then(setDepartments)
            .finally(() => setLoading(prev => ({ ...prev, depts: false })));
        setSelectedDept("");
    }
  }, [selectedCollege, selectedCampus, selectedInst]);

  useEffect(() => {
    if (selectedDept) {
      setLoading(prev => ({ ...prev, options: true }));
      academicApi.getOptions(selectedDept)
        .then(setOptions)
        .finally(() => setLoading(prev => ({ ...prev, options: false })));
      setSelectedOpt("");
    }
  }, [selectedDept]);

  useEffect(() => {
    if (selectedOpt) {
      setLoading(prev => ({ ...prev, groups: true }));
      academicApi.getClassGroups(selectedOpt)
        .then(setClassGroups)
        .finally(() => setLoading(prev => ({ ...prev, groups: false })));
      setSelectedGroup("");
    }
  }, [selectedOpt]);

  useEffect(() => {
    if (selectedGroup) {
      setLoading(prev => ({ ...prev, sections: true }));
      academicApi.getSections(selectedGroup)
        .then(setSections)
        .finally(() => setLoading(prev => ({ ...prev, sections: false })));
      setSelectedSection("none");

      // Auto-populate Final Level if the selected group has a level defined
      const group = classGroups.find(g => g.id === selectedGroup);
      if (group && group.level) {
        setLevel(`Level ${group.level}`);
      }
    }
  }, [selectedGroup, classGroups]);

  const handleFinish = async () => {
    if (!selectedInst || !selectedDept || !selectedOpt || !level || !year) {
      toast.error("Please fill in all required academic fields.");
      return;
    }

    setSubmitting(true);
    try {
      await authApi.completeStudentOnboarding({
        institution_id: selectedInst,
        campus_id: selectedCampus !== "none" ? selectedCampus : undefined,
        college_id: selectedCollege !== "none" ? selectedCollege : undefined,
        department_id: selectedDept,
        option_id: selectedOpt,
        level: level,
        year: year,
        class_section_id: selectedSection !== "none" ? selectedSection : undefined
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
    <div className="min-h-screen bg-muted/5 flex flex-col items-center justify-center p-4 sm:p-6 md:p-8">
      <div className="max-w-5xl w-full flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-center justify-between px-1">
            <div>
                <h1 className="text-xl font-semibold text-primary tracking-tight uppercase">Student Onboarding</h1>
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest">Complete your academic profile</p>
            </div>
            
            <div className="flex items-center gap-1">
                {STEPS.map((step) => {
                    const isActive = activeStep === step.id;
                    const isCompleted = activeStep > step.id;
                    return (
                        <div key={step.id} className="flex items-center">
                            <div className={cn(
                                "size-6 rounded-full border transition-all flex items-center justify-center",
                                isActive ? "bg-primary text-primary-foreground border-primary" : 
                                isCompleted ? "bg-emerald-50 text-emerald-600 border-emerald-200" : 
                                "border-muted/60 text-muted-foreground bg-white"
                            )}>
                                {isCompleted ? <CheckCircle2 className="size-3.5" /> : <span className="text-[10px] font-bold">{step.id}</span>}
                            </div>
                            {step.id < 3 && <div className={cn("w-8 h-[1px] mx-1", isCompleted ? "bg-emerald-200" : "bg-muted/30")} />}
                        </div>
                    );
                })}
            </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
            {/* Sidebar Navigation */}
            <div className="md:col-span-4 flex flex-col gap-2">
                {STEPS.map((step) => {
                    const Icon = step.icon;
                    const isActive = activeStep === step.id;
                    const isCompleted = activeStep > step.id;
                    return (
                        <div 
                            key={step.id}
                            className={cn(
                                "p-3 rounded-xl border transition-all flex items-center gap-3",
                                isActive ? "bg-white border-primary/20 shadow-none ring-1 ring-primary/5" : 
                                "bg-white/50 border-muted/20 opacity-80"
                            )}
                        >
                            <div className={cn(
                                "size-8 rounded-lg flex items-center justify-center border",
                                isActive ? "bg-primary text-primary-foreground border-primary" : 
                                isCompleted ? "bg-emerald-50 text-emerald-600 border-emerald-100" :
                                "bg-muted/10 border-muted/40"
                            )}>
                                <Icon className="size-4" />
                            </div>
                            <div>
                                <p className={cn("text-[11px] font-semibold uppercase tracking-tight leading-none", isActive ? "text-primary" : "text-muted-foreground")}>{step.title}</p>
                                <p className="text-[9px] text-muted-foreground mt-0.5 leading-none">{step.description}</p>
                            </div>
                        </div>
                    );
                })}
                
                <div className="mt-4 p-4 bg-primary/5 rounded-xl border border-primary/10">
                    <div className="flex items-center gap-2 mb-2">
                        <CheckCircle2 className="size-3.5 text-primary" />
                        <span className="text-[10px] font-semibold text-primary uppercase">Institutional Trust</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                        Mindexa uses this data to verify your academic standing and provide tailored assessment tools for your specific program.
                    </p>
                </div>
            </div>

            {/* Main Step Content */}
            <div className="md:col-span-8 bg-white border border-muted/20 rounded-2xl overflow-hidden flex flex-col min-h-[420px]">
                <div className="p-6 flex-1">
                    {activeStep === 1 && (
                        <div className="space-y-6 animate-in fade-in duration-300">
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground ml-1">University / Institution</Label>
                                <Select value={selectedInst} onValueChange={setSelectedInst}>
                                    <SelectTrigger className="h-10 rounded-xl border-muted/30 bg-muted/5 font-medium text-sm">
                                        <div className="flex items-center gap-2">
                                            <Building2 className="size-3.5 text-muted-foreground" />
                                            <SelectValue placeholder="Search Registry..." />
                                        </div>
                                    </SelectTrigger>
                                    <SelectContent>
                                        {institutions.map(inst => (
                                            <SelectItem key={inst.id} value={inst.id} className="text-sm font-medium">{inst.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground ml-1">Campus (Optional)</Label>
                                    <Select value={selectedCampus} onValueChange={setSelectedCampus} disabled={loading.campuses || !selectedInst}>
                                        <SelectTrigger className="h-10 rounded-xl border-muted/30 bg-muted/5 font-medium text-sm">
                                            <div className="flex items-center gap-2">
                                                <MapPin className="size-3.5 text-muted-foreground" />
                                                <SelectValue placeholder="Select Campus" />
                                            </div>
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none" className="text-sm font-medium">None / Global</SelectItem>
                                            {campuses.map(c => (
                                                <SelectItem key={c.id} value={c.id} className="text-sm font-medium">{c.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground ml-1">College / Faculty</Label>
                                    <Select value={selectedCollege} onValueChange={setSelectedCollege} disabled={loading.colleges || !selectedInst}>
                                        <SelectTrigger className="h-10 rounded-xl border-muted/30 bg-muted/5 font-medium text-sm">
                                            <div className="flex items-center gap-2">
                                                <School className="size-3.5 text-muted-foreground" />
                                                <SelectValue placeholder="Select College" />
                                            </div>
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none" className="text-sm font-medium">Not Applicable</SelectItem>
                                            {colleges.map(c => (
                                                <SelectItem key={c.id} value={c.id} className="text-sm font-medium">{c.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground ml-1">Department / School</Label>
                                <Select value={selectedDept} onValueChange={setSelectedDept} disabled={!selectedInst || loading.depts}>
                                    <SelectTrigger className="h-10 rounded-xl border-muted/30 bg-muted/5 font-medium text-sm text-primary">
                                        <div className="flex items-center gap-2">
                                            <Library className="size-3.5" />
                                            <SelectValue placeholder="Select Department" />
                                        </div>
                                    </SelectTrigger>
                                    <SelectContent>
                                        {departments.map(d => (
                                            <SelectItem key={d.id} value={d.id} className="text-sm font-medium">{d.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    )}

                    {activeStep === 2 && (
                        <div className="space-y-6 animate-in fade-in duration-300">
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground ml-1">Program / Specialization</Label>
                                <Select value={selectedOpt} onValueChange={setSelectedOpt} disabled={loading.options || !selectedDept}>
                                    <SelectTrigger className="h-10 rounded-xl border-muted/30 bg-muted/5 font-medium text-sm">
                                        <div className="flex items-center gap-2">
                                            <Layers className="size-3.5 text-muted-foreground" />
                                            <SelectValue placeholder="Search Program..." />
                                        </div>
                                    </SelectTrigger>
                                    <SelectContent>
                                        {options.map(o => (
                                            <SelectItem key={o.id} value={o.id} className="text-sm font-medium">{o.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground ml-1">Academic Level</Label>
                                    <Select value={selectedGroup} onValueChange={setSelectedGroup} disabled={loading.groups || !selectedOpt}>
                                        <SelectTrigger className="h-10 rounded-xl border-muted/30 bg-muted/5 font-medium text-sm text-primary">
                                            <div className="flex items-center gap-2">
                                                <LayoutGrid className="size-3.5" />
                                                <SelectValue placeholder="Select Level" />
                                            </div>
                                        </SelectTrigger>
                                        <SelectContent>
                                            {classGroups.map(g => (
                                                <SelectItem key={g.id} value={g.id} className="text-sm font-medium">{g.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground ml-1">Section (Optional)</Label>
                                    <Select value={selectedSection} onValueChange={setSelectedSection} disabled={loading.sections || !selectedGroup}>
                                        <SelectTrigger className="h-10 rounded-xl border-muted/30 bg-muted/5 font-medium text-sm">
                                            <div className="flex items-center gap-2">
                                                <Users className="size-3.5 text-muted-foreground" />
                                                <SelectValue placeholder="Select Section" />
                                            </div>
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none" className="text-sm font-medium">N/A</SelectItem>
                                            {sections.map(s => (
                                                <SelectItem key={s.id} value={s.id} className="text-sm font-medium">{s.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground ml-1">Current Academic Session</Label>
                                <Select value={year} onValueChange={setYear}>
                                    <SelectTrigger className="h-10 rounded-xl border-muted/30 bg-muted/5 font-medium text-sm">
                                        <div className="flex items-center gap-2">
                                            <Calendar className="size-3.5 text-muted-foreground" />
                                            <SelectValue placeholder="Select Active Academic Year..." />
                                        </div>
                                    </SelectTrigger>
                                    <SelectContent>
                                        {periods.map(p => (
                                            <SelectItem key={p.id} value={p.name} className="text-sm font-medium">{p.name}</SelectItem>
                                        ))}
                                        {periods.length === 0 && <SelectItem value="none" disabled>No active periods found</SelectItem>}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    )}

                    {activeStep === 3 && (
                        <div className="space-y-8 flex flex-col items-center animate-in fade-in duration-300">
                            <div className="relative group">
                                <div className="size-28 rounded-2xl border border-muted/30 overflow-hidden bg-muted/5 flex items-center justify-center relative">
                                    {profilePic ? (
                                        <Image src={profilePic} alt="Profile" fill unoptimized className="object-cover" />
                                    ) : (
                                        <div className="text-muted-foreground flex flex-col items-center gap-1 opacity-40">
                                            <GraduationCap className="size-8" />
                                            <span className="text-[8px] font-semibold uppercase tracking-widest">ID PHOTO</span>
                                        </div>
                                    )}
                                </div>
                                <label className="absolute -bottom-2 -right-2 size-8 bg-primary text-primary-foreground rounded-lg flex items-center justify-center cursor-pointer hover:bg-primary/90 transition-all border-2 border-white shadow-none">
                                    <Camera className="size-3.5" />
                                    <input type="file" className="hidden" accept="image/*" onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                            setProfilePic(URL.createObjectURL(file));
                                            authApi.uploadAvatar(file)
                                                .then(() => {
                                                    toast.success("Profile picture processed");
                                                    checkAuth();
                                                })
                                                .catch(() => toast.error("Avatar upload failed"));
                                        }
                                    }} />
                                </label>
                            </div>

                            <div className="w-full space-y-4">
                                <div className="flex justify-between items-center px-1 border-b border-muted/10 pb-2">
                                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Information Summary</p>
                                    <Badge variant="outline" className="text-[8px] h-4 uppercase font-bold text-emerald-600 border-emerald-200 bg-emerald-50">Draft Verified</Badge>
                                </div>
                                <div className="grid grid-cols-2 gap-y-4 gap-x-6 bg-muted/5 p-4 rounded-xl border border-muted/10">
                                    {[
                                        { label: "Institution", value: institutions.find(i => i.id === selectedInst)?.code, icon: Building2 },
                                        { label: "Program", value: options.find(o => o.id === selectedOpt)?.code, icon: BookOpen },
                                        { label: "Department", value: departments.find(d => d.id === selectedDept)?.code, icon: Library },
                                        { label: "Level", value: level, icon: LayoutGrid }
                                    ].map((s, i) => (
                                        <div key={i} className="space-y-1">
                                            <div className="flex items-center gap-1 text-muted-foreground">
                                                <s.icon className="size-2.5" />
                                                <p className="text-[8px] font-semibold uppercase tracking-tighter">{s.label}</p>
                                            </div>
                                            <p className="text-[11px] font-semibold text-foreground uppercase truncate">{s.value || "Not Selected"}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-4 bg-muted/5 border-t border-muted/10 flex items-center justify-between px-6">
                    <Button 
                        variant="ghost" 
                        disabled={activeStep === 1 || submitting} 
                        onClick={() => setActiveStep(prev => prev - 1)}
                        className="h-9 rounded-lg px-4 font-semibold text-[10px] uppercase tracking-widest gap-2"
                    >
                        <ArrowLeft className="size-3.5" /> Back
                    </Button>

                    {activeStep < 3 ? (
                        <Button 
                            disabled={
                                (activeStep === 1 && !selectedDept) || 
                                (activeStep === 2 && (!selectedGroup || !level || !year))
                            }
                            onClick={() => setActiveStep(prev => prev + 1)}
                            className="h-9 rounded-lg px-6 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-[10px] uppercase tracking-widest gap-2 shadow-none"
                        >
                            Continue <ArrowRight className="size-3.5" />
                        </Button>
                    ) : (
                        <Button 
                            onClick={handleFinish} 
                            disabled={submitting}
                            className="h-9 rounded-lg px-8 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-[10px] uppercase tracking-widest gap-2 shadow-none"
                        >
                            {submitting ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
                            {submitting ? "Finalizing..." : "Complete Setup"}
                        </Button>
                    )}
                </div>
            </div>
        </div>
      </div>
    </div>
  );
}
