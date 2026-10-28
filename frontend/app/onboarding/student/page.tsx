"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ModeToggle } from "@/components/ui/mode-toggle";
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
  MapPin,
  Library,
  Users,
  LogOut,
  Check
} from "lucide-react";
import { academicApi } from "@/lib/api/academic";
import { authApi } from "@/lib/api/auth";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { 
  InstitutionResponse as AcademicInstitution, 
  CampusResponse as AcademicCampus, 
  CollegeResponse as AcademicCollege, 
  DepartmentResponse as AcademicDepartment, 
  OptionResponse as AcademicOption, 
  ClassGroupResponse as AcademicClassGroup, 
  ClassSectionResponse as AcademicClassSection,
  AcademicPeriodResponse as AcademicPeriod
} from "@/lib/api/academic-types";

const STEPS = [
  { id: 1, title: "Institution", subtitle: "University & Dept", icon: School },
  { id: 2, title: "Program", subtitle: "Degree & Cohort", icon: BookOpen },
  { id: 3, title: "Photo & Finalize", subtitle: "ID & Review", icon: GraduationCap },
];

export default function StudentOnboarding() {
  const router = useRouter();
  const { user, checkAuth } = useAuth();
  const [activeStep, setActiveStep] = useState<1 | 2 | 3>(1);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  
  // Academic Data State
  const [institutions, setInstitutions] = useState<AcademicInstitution[]>([]);
  const [campuses, setCampuses] = useState<AcademicCampus[]>([]);
  const [colleges, setColleges] = useState<AcademicCollege[]>([]);
  const [departments, setDepartments] = useState<AcademicDepartment[]>([]);
  const [options, setOptions] = useState<AcademicOption[]>([]);
  const [classGroups, setClassGroups] = useState<AcademicClassGroup[]>([]);
  const [sections, setSections] = useState<AcademicClassSection[]>([]);
  const [periods, setPeriods] = useState<AcademicPeriod[]>([]);
  const [dbLevels, setDbLevels] = useState<number[]>([]);
  
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

  // Loading states
  const [loading, setLoading] = useState<Record<string, boolean>>({
    init: true,
    depts: false,
    options: false,
    groups: false,
  });

  const displayName = [user?.profile?.first_name, user?.profile?.last_name]
    .filter(Boolean)
    .join(" ") || user?.profile?.display_name || user?.email?.split("@")[0] || "Student";

  const initials = [user?.profile?.first_name?.[0], user?.profile?.last_name?.[0]]
    .filter(Boolean)
    .join("")
    .toUpperCase() || user?.email?.[0]?.toUpperCase() || "S";

  const currentAvatarUrl = profilePic || (user?.profile?.avatar_url
    ? `${process.env.NEXT_PUBLIC_API_URL?.replace("/api/v1", "") || "http://localhost:8000"}${user.profile.avatar_url}`
    : undefined);

  // Load institutions
  useEffect(() => {
    async function init() {
      try {
        const data = await academicApi.getInstitutions();
        setInstitutions(data);
      } catch {
        toast.error("Failed to load institutions");
      } finally {
        setLoading(prev => ({ ...prev, init: false }));
      }
    }
    init();
  }, []);

  // When institution is selected: load related hierarchy
  useEffect(() => {
    if (!selectedInst) return;

    setLoading(prev => ({ ...prev, depts: true }));

    Promise.allSettled([
      academicApi.getCampuses(selectedInst),
      academicApi.getColleges({ institution_id: selectedInst }),
      academicApi.getPeriods(selectedInst),
      academicApi.getLevels(selectedInst),
      academicApi.getDepartments({ institution_id: selectedInst })
    ]).then(([campusesRes, collegesRes, periodsRes, levelsRes, deptsRes]) => {
      if (campusesRes.status === "fulfilled") setCampuses(campusesRes.value);
      if (collegesRes.status === "fulfilled") setColleges(collegesRes.value);
      if (periodsRes.status === "fulfilled") setPeriods(periodsRes.value);
      if (levelsRes.status === "fulfilled") setDbLevels(levelsRes.value);
      if (deptsRes.status === "fulfilled") setDepartments(deptsRes.value);
      setLoading(prev => ({ ...prev, depts: false }));
    });

    setSelectedCampus("none");
    setSelectedCollege("none");
    setSelectedDept("");
    setSelectedOpt("");
    setSelectedGroup("");
    setSelectedSection("none");
    setLevel("");
    setYear("");
  }, [selectedInst]);

  // When department changes: load options
  useEffect(() => {
    if (!selectedDept) {
      setOptions([]);
      setSelectedOpt("");
      return;
    }
    setLoading(prev => ({ ...prev, options: true }));
    academicApi.getOptions(selectedDept)
      .then(setOptions)
      .catch(() => setOptions([]))
      .finally(() => setLoading(prev => ({ ...prev, options: false })));

    setSelectedOpt("");
    setSelectedGroup("");
    setSelectedSection("none");
    setLevel("");
  }, [selectedDept]);

  // When option changes: load class groups
  useEffect(() => {
    if (!selectedOpt) {
      setClassGroups([]);
      setSelectedGroup("");
      return;
    }
    setLoading(prev => ({ ...prev, groups: true }));
    academicApi.getClassGroups(selectedOpt)
      .then(setClassGroups)
      .catch(() => setClassGroups([]))
      .finally(() => setLoading(prev => ({ ...prev, groups: false })));

    setSelectedGroup("");
    setSelectedSection("none");
    setLevel("");
  }, [selectedOpt]);

  // When class group changes: set level and load sections
  useEffect(() => {
    if (!selectedGroup) {
      setSections([]);
      setSelectedSection("none");
      return;
    }

    const group = classGroups.find(g => g.id === selectedGroup);
    if (group) {
      setLevel(group.level ? `Level ${group.level}` : group.name);
    }

    academicApi.getSections(selectedGroup)
      .then(setSections)
      .catch(() => setSections([]));

    setSelectedSection("none");
  }, [selectedGroup, classGroups]);

  // Upload student ID photo
  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file (PNG, JPG, WebP)");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error("Photo must be under 2MB");
      return;
    }

    const preview = URL.createObjectURL(file);
    setProfilePic(preview);
    setUploadingAvatar(true);

    try {
      await authApi.uploadAvatar(file);
      await checkAuth();
      toast.success("ID photo uploaded successfully");
    } catch (err: any) {
      toast.error(err.message || "Failed to upload photo");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleFinish = async () => {
    if (!selectedInst || !selectedDept || !selectedOpt || !level || !year) {
      toast.error("Please complete all required fields.");
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
        class_section_id: selectedSection !== "none" ? selectedSection : undefined,
      });

      toast.success("Student profile verified!");
      await checkAuth();
      router.push("/student/dashboard");
    } catch (err: any) {
      toast.error(err.message || "Failed to complete onboarding");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await authApi.logout();
    } catch {
      // Continue to login
    }
    router.push("/login");
  };

  const currentInstitution = institutions.find(i => i.id === selectedInst);
  const currentDepartment = departments.find(d => d.id === selectedDept);
  const currentOption = options.find(o => o.id === selectedOpt);

  const fallbackYears = [
    `${new Date().getFullYear()} - ${new Date().getFullYear() + 1}`,
    `${new Date().getFullYear() - 1} - ${new Date().getFullYear()}`,
  ];

  const stepsLeft = 3 - activeStep;
  const progressPercent = activeStep === 1 ? "33.3%" : activeStep === 2 ? "66.6%" : "100%";

  return (
    <div className="min-h-screen w-full bg-background text-foreground flex items-center justify-center p-3 sm:p-4 md:p-6 relative">
      {/* Discreet floating top controls */}
      <div className="fixed top-3 right-3 sm:top-5 sm:right-5 flex items-center gap-1.5 z-20">
        <ModeToggle variant="ghost" size="sm" className="rounded-lg h-8 w-8 text-muted-foreground hover:text-foreground" />
        <Button
          variant="ghost"
          size="sm"
          onClick={handleSignOut}
          className="h-8 px-2 rounded-lg text-xs text-muted-foreground hover:text-foreground gap-1"
          title="Sign out"
        >
          <LogOut className="size-3.5" />
          <span className="hidden sm:inline">Sign Out</span>
        </Button>
      </div>

      {/* Main Compact Card */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="w-full max-w-lg relative z-10"
      >
        <div className="bg-card border border-border/80 rounded-2xl p-5 sm:p-6 space-y-4 shadow-xs">
          {/* Card Header & Title */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] font-semibold">
              <span className="text-primary uppercase tracking-wider">
                Step {activeStep} of 3
              </span>
              <span className="text-muted-foreground">
                {stepsLeft === 0 ? "Final step" : `${stepsLeft} ${stepsLeft === 1 ? "step" : "steps"} left`}
              </span>
            </div>

            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              Student Onboarding
            </h1>
            <p className="text-xs text-muted-foreground">
              {activeStep === 1 
                ? "Select your university and department." 
                : activeStep === 2 
                ? "Specify your degree program and academic level."
                : "Add your photo and confirm your enrollment."}
            </p>

            {/* Stepper Progress Bar */}
            <div className="pt-2">
              <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                <motion.div 
                  className="h-full bg-primary rounded-full"
                  initial={false}
                  animate={{ width: progressPercent }}
                  transition={{ duration: 0.3, ease: "easeInOut" }}
                />
              </div>

              {/* Stepper Indicator Pills */}
              <div className="grid grid-cols-3 gap-1.5 mt-2.5">
                {STEPS.map((s) => {
                  const isActive = activeStep === s.id;
                  const isDone = activeStep > s.id;
                  return (
                    <div 
                      key={s.id}
                      className={`flex items-center gap-1.5 p-1.5 rounded-lg border text-xs transition-colors ${
                        isActive 
                          ? "border-primary/40 bg-primary/5 text-foreground font-medium" 
                          : isDone 
                          ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400" 
                          : "border-border/40 text-muted-foreground"
                      }`}
                    >
                      <div className={`size-4 rounded-full flex items-center justify-center text-[10px] shrink-0 font-bold ${
                        isDone 
                          ? "bg-emerald-600 text-white" 
                          : isActive 
                          ? "bg-primary text-primary-foreground" 
                          : "bg-muted text-muted-foreground"
                      }`}>
                        {isDone ? <Check className="size-2.5" /> : s.id}
                      </div>
                      <span className="truncate text-[10px] sm:text-[11px]">{s.title}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Stepper Views with smooth transitions */}
          <AnimatePresence mode="wait">
            {/* STEP 1: Institution & Department */}
            {activeStep === 1 && (
              <motion.div
                key="step-1"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.2 }}
                className="space-y-3.5"
              >
                {/* University */}
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Building2 className="size-3.5 text-primary" />
                    University / Institution
                  </Label>
                  <Select value={selectedInst} onValueChange={setSelectedInst} disabled={loading.init}>
                    <SelectTrigger className="h-9.5 rounded-lg border-border/80 bg-background text-xs sm:text-sm focus-visible:ring-primary/20">
                      <SelectValue placeholder={loading.init ? "Loading universities..." : "Select university..."} />
                    </SelectTrigger>
                    <SelectContent className="max-h-56">
                      {institutions.map(inst => (
                        <SelectItem key={inst.id} value={inst.id} className="text-xs sm:text-sm">
                          {inst.name} {inst.code && `(${inst.code})`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Department */}
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Library className="size-3.5 text-primary" />
                    Department
                  </Label>
                  <Select 
                    value={selectedDept} 
                    onValueChange={setSelectedDept}
                    disabled={!selectedInst || loading.depts}
                  >
                    <SelectTrigger className="h-9.5 rounded-lg border-border/80 bg-background text-xs sm:text-sm focus-visible:ring-primary/20">
                      <SelectValue placeholder={
                        !selectedInst 
                          ? "Select university first" 
                          : loading.depts 
                          ? "Loading departments..." 
                          : "Select department..."
                      } />
                    </SelectTrigger>
                    <SelectContent className="max-h-56">
                      {departments.map(d => (
                        <SelectItem key={d.id} value={d.id} className="text-xs sm:text-sm">
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Campus (if multiple exist) */}
                {campuses.length > 0 && (
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <MapPin className="size-3.5 text-muted-foreground" />
                      Campus (Optional)
                    </Label>
                    <Select value={selectedCampus} onValueChange={setSelectedCampus}>
                      <SelectTrigger className="h-9.5 rounded-lg border-border/80 bg-background text-xs sm:text-sm">
                        <SelectValue placeholder="Main Campus" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none" className="text-xs sm:text-sm">Main / Global Campus</SelectItem>
                        {campuses.map(c => (
                          <SelectItem key={c.id} value={c.id} className="text-xs sm:text-sm">{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Continue Button */}
                <div className="pt-1">
                  <Button
                    onClick={() => setActiveStep(2)}
                    disabled={!selectedInst || !selectedDept}
                    className="w-full h-9.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 font-semibold text-xs gap-1.5 shadow-xs"
                  >
                    <span>Continue to Degree Program</span>
                    <ArrowRight className="size-3.5" />
                  </Button>
                </div>
              </motion.div>
            )}

            {/* STEP 2: Degree Program, Level & Session */}
            {activeStep === 2 && (
              <motion.div
                key="step-2"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
                className="space-y-3.5"
              >
                {/* Program / Specialization */}
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Layers className="size-3.5 text-primary" />
                    Degree Program / Specialization
                  </Label>
                  <Select 
                    value={selectedOpt} 
                    onValueChange={setSelectedOpt}
                    disabled={loading.options}
                  >
                    <SelectTrigger className="h-9.5 rounded-lg border-border/80 bg-background text-xs sm:text-sm focus-visible:ring-primary/20">
                      <SelectValue placeholder={loading.options ? "Loading programs..." : "Select program..."} />
                    </SelectTrigger>
                    <SelectContent className="max-h-56">
                      {options.map(o => (
                        <SelectItem key={o.id} value={o.id} className="text-xs sm:text-sm">
                          {o.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Level & Academic Year in 2 Columns */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Academic Level */}
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <GraduationCap className="size-3.5 text-primary" />
                      Academic Level
                    </Label>
                    {classGroups.length > 0 ? (
                      <Select 
                        value={selectedGroup} 
                        onValueChange={setSelectedGroup}
                        disabled={!selectedOpt}
                      >
                        <SelectTrigger className="h-9.5 rounded-lg border-border/80 bg-background text-xs sm:text-sm">
                          <SelectValue placeholder="Select cohort/level..." />
                        </SelectTrigger>
                        <SelectContent className="max-h-56">
                          {classGroups.map(g => (
                            <SelectItem key={g.id} value={g.id} className="text-xs sm:text-sm">
                              {g.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Select 
                        value={level} 
                        onValueChange={setLevel}
                        disabled={!selectedOpt}
                      >
                        <SelectTrigger className="h-9.5 rounded-lg border-border/80 bg-background text-xs sm:text-sm">
                          <SelectValue placeholder="Select level..." />
                        </SelectTrigger>
                        <SelectContent>
                          {(dbLevels.length > 0 ? dbLevels.map(l => `Level ${l}`) : ["Level 1", "Level 2", "Level 3", "Level 4", "Level 5", "Level 6"]).map(l => (
                            <SelectItem key={l} value={l} className="text-xs sm:text-sm">
                              {l}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  {/* Academic Year */}
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <Calendar className="size-3.5 text-primary" />
                      Academic Session
                    </Label>
                    <Select value={year} onValueChange={setYear}>
                      <SelectTrigger className="h-9.5 rounded-lg border-border/80 bg-background text-xs sm:text-sm">
                        <SelectValue placeholder="Session year..." />
                      </SelectTrigger>
                      <SelectContent>
                        {periods.length > 0 ? (
                          periods.map(p => (
                            <SelectItem key={p.id} value={p.name} className="text-xs sm:text-sm">
                              {p.name}
                            </SelectItem>
                          ))
                        ) : (
                          fallbackYears.map(y => (
                            <SelectItem key={y} value={y} className="text-xs sm:text-sm">
                              {y}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Section (Optional if sections exist) */}
                {sections.length > 0 && (
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <Users className="size-3.5 text-muted-foreground" />
                      Section / Stream (Optional)
                    </Label>
                    <Select value={selectedSection} onValueChange={setSelectedSection}>
                      <SelectTrigger className="h-9.5 rounded-lg border-border/80 bg-background text-xs sm:text-sm">
                        <SelectValue placeholder="Default Section" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none" className="text-xs sm:text-sm">Default Section</SelectItem>
                        {sections.map(s => (
                          <SelectItem key={s.id} value={s.id} className="text-xs sm:text-sm">{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Navigation Buttons */}
                <div className="pt-1 flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setActiveStep(1)}
                    className="h-9.5 px-3 rounded-lg text-xs font-semibold gap-1 text-muted-foreground hover:text-foreground"
                  >
                    <ArrowLeft className="size-3.5" />
                    <span>Back</span>
                  </Button>

                  <Button
                    onClick={() => setActiveStep(3)}
                    disabled={!selectedOpt || !level || !year}
                    className="flex-1 h-9.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 font-semibold text-xs gap-1.5 shadow-xs"
                  >
                    <span>Continue to Photo & Review</span>
                    <ArrowRight className="size-3.5" />
                  </Button>
                </div>
              </motion.div>
            )}

            {/* STEP 3: Photo & Review */}
            {activeStep === 3 && (
              <motion.div
                key="step-3"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                {/* Photo & Student Identity */}
                <div className="flex items-center gap-3.5 p-3 rounded-xl bg-muted/30 border border-border/50">
                  <div className="relative group shrink-0">
                    <Avatar className="size-16 sm:size-18 rounded-full border border-border shadow-xs overflow-hidden bg-muted">
                      <AvatarImage 
                        src={currentAvatarUrl} 
                        alt={displayName}
                        className="object-cover" 
                      />
                      <AvatarFallback className="bg-primary/10 text-primary text-lg font-bold uppercase">
                        {initials}
                      </AvatarFallback>
                    </Avatar>

                    <label
                      htmlFor="student-avatar"
                      className="absolute -bottom-1 -right-1 size-7 bg-primary text-primary-foreground hover:bg-primary/90 rounded-full flex items-center justify-center cursor-pointer transition-transform border-2 border-background shadow-xs hover:scale-105 active:scale-95"
                      title="Upload ID photo"
                    >
                      {uploadingAvatar ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <Camera className="size-3" />
                      )}
                      <input 
                        id="student-avatar"
                        type="file" 
                        className="hidden" 
                        accept="image/png, image/jpeg, image/webp" 
                        onChange={handleAvatarChange}
                        disabled={uploadingAvatar}
                      />
                    </label>
                  </div>

                  <div className="min-w-0 flex-1 space-y-0.5">
                    <h2 className="text-sm font-semibold text-foreground truncate">
                      {displayName}
                    </h2>
                    <p className="text-xs text-muted-foreground font-mono truncate">
                      {user?.email}
                    </p>
                    <span className="inline-block text-[10px] text-primary font-medium">
                      Student Enrollment
                    </span>
                  </div>
                </div>

                {/* Enrollment Summary */}
                <div className="rounded-xl border border-border/60 bg-muted/20 p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold border-b border-border/40 pb-1.5">
                    <span className="text-muted-foreground uppercase text-[10px] tracking-wider">Academic Record</span>
                    <span className="text-primary">{level} &bull; {year}</span>
                  </div>

                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">University:</span>
                      <span className="font-medium text-foreground text-right truncate max-w-[220px]">{currentInstitution?.name}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Department:</span>
                      <span className="font-medium text-foreground text-right truncate max-w-[220px]">{currentDepartment?.name}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Program:</span>
                      <span className="font-medium text-foreground text-right truncate max-w-[220px]">{currentOption?.name}</span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="pt-1 flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setActiveStep(2)}
                    disabled={submitting}
                    className="h-9.5 px-3 rounded-lg text-xs font-semibold gap-1 text-muted-foreground hover:text-foreground"
                  >
                    <ArrowLeft className="size-3.5" />
                    <span>Back</span>
                  </Button>

                  <Button
                    onClick={handleFinish}
                    disabled={submitting || uploadingAvatar}
                    className="flex-1 h-9.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 font-semibold text-xs gap-1.5 shadow-xs"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="size-3.5 animate-spin" />
                        <span>Verifying...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="size-3.5" />
                        <span>Complete Enrollment</span>
                      </>
                    )}
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
