"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, Loader2, Save, Upload, X, FileText, Plus, Check } from "lucide-react";
import { 
  lecturerApi, 
  InstitutionResponse, 
  AcademicPeriodResponse,
  DepartmentResponse,
  OptionResponse,
  ClassGroupResponse 
} from "@/lib/api/lecturer";
import { toast } from "sonner";
import Link from "next/link";
import { useAuth } from "@/hooks/use-auth";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export default function NewCoursePage() {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [fetchingMetadata, setFetchingMetadata] = useState(true);
  
  const [institutions, setInstitutions] = useState<InstitutionResponse[]>([]);
  const [periods, setPeriods] = useState<AcademicPeriodResponse[]>([]);
  
  const [availableDepartments, setAvailableDepartments] = useState<DepartmentResponse[]>([]);
  const [availableOptions, setAvailableOptions] = useState<OptionResponse[]>([]);
  const [availableClasses, setAvailableClasses] = useState<ClassGroupResponse[]>([]);
  
  const [fetchingDepts, setFetchingDepts] = useState(false);
  const [fetchingOptions, setFetchingOptions] = useState(false);
  const [fetchingClasses, setFetchingClasses] = useState(false);

  const [formData, setFormData] = useState({
    title: "",
    code: "",
    description: "",
    credit_hours: 3,
    institution_id: "",
    academic_period_id: "",
  });

  const [selectedDeptIds, setSelectedDeptIds] = useState<string[]>([]);
  const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>([]);
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  
  const [courseNotes, setCourseNotes] = useState<File[]>([]);

  useEffect(() => {
    async function loadMetadata() {
      try {
        const [insts, pers] = await Promise.all([
          lecturerApi.getMyInstitutions(),
          lecturerApi.getPeriods(),
        ]);
        setInstitutions(insts);
        setPeriods(pers);
        
        if (insts.length === 1) {
          handleInstitutionChange(insts[0].id);
        }
        if (pers.length === 1) {
          setFormData(prev => ({ ...prev, academic_period_id: pers[0].id }));
        }
      } catch (err: any) {
        toast.error("Failed to load metadata");
      } finally {
        setFetchingMetadata(false);
      }
    }
    loadMetadata();
  }, []);

  const handleInstitutionChange = async (val: string) => {
    setFormData(prev => ({ ...prev, institution_id: val }));
    setSelectedDeptIds([]);
    setSelectedOptionIds([]);
    setSelectedClassIds([]);
    setAvailableDepartments([]);
    setAvailableOptions([]);
    setAvailableClasses([]);
    
    setFetchingDepts(true);
    try {
      const depts = await lecturerApi.getMyDepartments(val);
      setAvailableDepartments(depts);
    } catch (err) {
      toast.error("Failed to load departments");
    } finally {
      setFetchingDepts(false);
    }
  };

  const toggleDept = async (id: string) => {
    const newSelected = selectedDeptIds.includes(id) 
      ? selectedDeptIds.filter(i => i !== id)
      : [...selectedDeptIds, id];
    
    setSelectedDeptIds(newSelected);
    
    // Refresh options
    if (newSelected.length > 0) {
      setFetchingOptions(true);
      try {
        // Fetch options for all selected departments
        const allOptions = await Promise.all(
          newSelected.map(dId => lecturerApi.getMyOptions(dId))
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
  };

  const toggleOption = async (id: string) => {
    const newSelected = selectedOptionIds.includes(id)
      ? selectedOptionIds.filter(i => i !== id)
      : [...selectedOptionIds, id];
    
    setSelectedOptionIds(newSelected);
    
    // Refresh classes
    if (newSelected.length > 0) {
      setFetchingClasses(true);
      try {
        const allClasses = await Promise.all(
          newSelected.map(oId => lecturerApi.getMyClasses(oId))
        );
        setAvailableClasses(allClasses.flat());
      } catch (err) {
        toast.error("Failed to load classes");
      } finally {
        setFetchingClasses(false);
      }
    } else {
      setAvailableClasses([]);
      setSelectedClassIds([]);
    }
  };

  const toggleClass = (id: string) => {
    setSelectedClassIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.institution_id || !formData.academic_period_id) {
      toast.error("Please select an institution and academic period");
      return;
    }
    if (selectedClassIds.length === 0) {
      toast.error("Please select at least one class");
      return;
    }

    setLoading(true);
    try {
      const course = await lecturerApi.createCourse({
        ...formData,
        credit_hours: Number(formData.credit_hours),
        department_ids: selectedDeptIds,
        option_ids: selectedOptionIds,
        class_group_ids: selectedClassIds,
      });

      // Upload notes if any
      if (courseNotes.length > 0) {
        for (const file of courseNotes) {
          const uploadData = new FormData();
          uploadData.append("file", file);
          uploadData.append("course_id", course.id);
          uploadData.append("material_category", "LECTURE_NOTES");
          uploadData.append("is_student_visible", "true");
          await lecturerApi.uploadMaterial(uploadData);
        }
      }

      toast.success("Course created successfully");
      router.push("/lecturer/courses");
    } catch (err: any) {
      toast.error(err.message || "Failed to create course");
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setCourseNotes(prev => [...prev, ...newFiles]);
    }
  };

  const removeFile = (index: number) => {
    setCourseNotes(prev => prev.filter((_, i) => i !== index));
  };

  if (fetchingMetadata) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="size-10 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/lecturer/courses">
            <ChevronLeft className="size-5" />
          </Link>
        </Button>
        <h1 className="text-3xl font-semibold tracking-tight">Add New Course</h1>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Course Information</CardTitle>
                <CardDescription>
                  Enter the basic details for the new course offering.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="title">Course Title</Label>
                    <Input 
                      id="title" 
                      placeholder="e.g. Introduction to Psychology" 
                      required 
                      value={formData.title}
                      onChange={e => setFormData(prev => ({ ...prev, title: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="code">Course Code</Label>
                    <Input 
                      id="code" 
                      placeholder="e.g. PSY101" 
                      required 
                      value={formData.code}
                      onChange={e => setFormData(prev => ({ ...prev, code: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea 
                    id="description" 
                    placeholder="Briefly describe what students will learn in this course..." 
                    className="min-h-[100px]"
                    value={formData.description}
                    onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="institution">Institution</Label>
                    <Select 
                      value={formData.institution_id} 
                      onValueChange={handleInstitutionChange}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select Institution" />
                      </SelectTrigger>
                      <SelectContent>
                        {institutions.map(inst => (
                          <SelectItem key={inst.id} value={inst.id}>
                            {inst.name} ({inst.code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="period">Academic Period</Label>
                    <Select 
                      value={formData.academic_period_id} 
                      onValueChange={val => setFormData(prev => ({ ...prev, academic_period_id: val }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select Period" />
                      </SelectTrigger>
                      <SelectContent>
                        {periods.map(p => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="w-1/3 space-y-2">
                  <Label htmlFor="credit_hours">Credit Hours</Label>
                  <Input 
                    id="credit_hours" 
                    type="number" 
                    min={1} 
                    max={30} 
                    value={formData.credit_hours}
                    onChange={e => setFormData(prev => ({ ...prev, credit_hours: Number(e.target.value) }))}
                  />
                </div>

                <div className="pt-4 border-t space-y-4">
                  <Label>Course Notes / Materials (Optional)</Label>
                  <div className="flex items-center gap-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => document.getElementById("file-upload")?.click()}
                      className="gap-2"
                    >
                      <Upload className="size-4" /> Select Files
                    </Button>
                    <input
                      id="file-upload"
                      type="file"
                      multiple
                      className="hidden"
                      onChange={handleFileChange}
                    />
                  </div>

                  {courseNotes.length > 0 && (
                    <div className="grid grid-cols-1 gap-2">
                      {courseNotes.map((file, i) => (
                        <div key={i} className="flex items-center justify-between p-2 bg-muted/50 rounded-lg border text-sm">
                          <div className="flex items-center gap-2 truncate">
                            <FileText className="size-4 text-primary shrink-0" />
                            <span className="truncate font-medium">{file.name}</span>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-7 text-muted-foreground hover:text-destructive"
                            onClick={() => removeFile(i)}
                          >
                            <X className="size-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-5 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Assign to Classes</CardTitle>
                <CardDescription>Select the departments, options, and specific classes that will take this course.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Departments */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold">Departments</Label>
                    {fetchingDepts && <Loader2 className="size-3 animate-spin" />}
                  </div>
                  <ScrollArea className="h-[120px] rounded-md border p-2 bg-muted/20">
                    {availableDepartments.length === 0 ? (
                      <p className="text-xs text-muted-foreground p-4 text-center">Select an institution first.</p>
                    ) : (
                      <div className="space-y-2">
                        {availableDepartments.map(dept => (
                          <div key={dept.id} className="flex items-center space-x-2">
                            <Checkbox 
                              id={`dept-${dept.id}`} 
                              checked={selectedDeptIds.includes(dept.id)}
                              onCheckedChange={() => toggleDept(dept.id)}
                            />
                            <label 
                              htmlFor={`dept-${dept.id}`} 
                              className="text-xs font-medium leading-none cursor-pointer peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                            >
                              {dept.name}
                            </label>
                          </div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </div>

                {/* Options */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold">Options / Specializations</Label>
                    {fetchingOptions && <Loader2 className="size-3 animate-spin" />}
                  </div>
                  <ScrollArea className="h-[120px] rounded-md border p-2 bg-muted/20">
                    {availableOptions.length === 0 ? (
                      <p className="text-xs text-muted-foreground p-4 text-center">Select departments first.</p>
                    ) : (
                      <div className="space-y-2">
                        {availableOptions.map(opt => (
                          <div key={opt.id} className="flex items-center space-x-2">
                            <Checkbox 
                              id={`opt-${opt.id}`} 
                              checked={selectedOptionIds.includes(opt.id)}
                              onCheckedChange={() => toggleOption(opt.id)}
                            />
                            <label 
                              htmlFor={`opt-${opt.id}`} 
                              className="text-xs font-medium leading-none cursor-pointer"
                            >
                              {opt.name}
                            </label>
                          </div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </div>

                {/* Classes */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold">Specific Classes</Label>
                    {fetchingClasses && <Loader2 className="size-3 animate-spin" />}
                  </div>
                  <ScrollArea className="h-[150px] rounded-md border p-2 bg-muted/20">
                    {availableClasses.length === 0 ? (
                      <p className="text-xs text-muted-foreground p-4 text-center">Select options first.</p>
                    ) : (
                      <div className="grid grid-cols-1 gap-2">
                        {availableClasses.map(cls => (
                          <div 
                            key={cls.id} 
                            onClick={() => toggleClass(cls.id)}
                            className={cn(
                              "flex items-center justify-between p-2 rounded-md border cursor-pointer transition-colors text-xs",
                              selectedClassIds.includes(cls.id) 
                                ? "bg-primary/10 border-primary text-primary" 
                                : "hover:bg-muted"
                            )}
                          >
                            <span>{cls.name} ({cls.code})</span>
                            {selectedClassIds.includes(cls.id) && <Check className="size-3" />}
                          </div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                  <p className="text-[10px] text-muted-foreground">
                    Only selected classes will have access to this course and its assessments.
                  </p>
                </div>
              </CardContent>
              <CardFooter className="flex justify-between border-t pt-6 bg-muted/5 rounded-b-lg">
                <Button variant="outline" type="button" asChild>
                  <Link href="/lecturer/courses">Cancel</Link>
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" /> Creating...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 size-4" /> Create Course
                    </>
                  )}
                </Button>
              </CardFooter>
            </Card>
          </div>
        </div>
      </form>
    </div>
  );
}
