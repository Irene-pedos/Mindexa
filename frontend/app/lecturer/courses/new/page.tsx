// app/lecturer/courses/new/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, Loader2, Save } from "lucide-react";
import { lecturerApi, InstitutionResponse, AcademicPeriodResponse } from "@/lib/api/lecturer";
import { toast } from "sonner";
import Link from "next/link";

export default function NewCoursePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [fetchingMetadata, setFetchingMetadata] = useState(true);
  
  const [institutions, setInstitutions] = useState<InstitutionResponse[]>([]);
  const [periods, setPeriods] = useState<AcademicPeriodResponse[]>([]);
  
  const [formData, setFormData] = useState({
    title: "",
    code: "",
    description: "",
    credit_hours: 3,
    institution_id: "",
    academic_period_id: "",
  });

  useEffect(() => {
    async function loadMetadata() {
      try {
        const [insts, pers] = await Promise.all([
          lecturerApi.getInstitutions(),
          lecturerApi.getPeriods(),
        ]);
        setInstitutions(insts);
        setPeriods(pers);
        
        // Auto-select if only one option exists
        if (insts.length === 1) {
          setFormData(prev => ({ ...prev, institution_id: insts[0].id }));
        }
        if (pers.length === 1) {
          setFormData(prev => ({ ...prev, academic_period_id: pers[0].id }));
        }
      } catch (err: any) {
        toast.error("Failed to load metadata for course creation");
      } finally {
        setFetchingMetadata(false);
      }
    }
    loadMetadata();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.institution_id || !formData.academic_period_id) {
      toast.error("Please select an institution and academic period");
      return;
    }

    setLoading(true);
    try {
      await lecturerApi.createCourse({
        ...formData,
        credit_hours: Number(formData.credit_hours),
      });
      toast.success("Course created successfully");
      router.push("/lecturer/courses");
    } catch (err: any) {
      toast.error(err.message || "Failed to create course");
    } finally {
      setLoading(false);
    }
  };

  if (fetchingMetadata) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="size-10 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/lecturer/courses">
            <ChevronLeft className="size-5" />
          </Link>
        </Button>
        <h1 className="text-3xl font-semibold tracking-tight">Add New Course</h1>
      </div>

      <form onSubmit={handleSubmit}>
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
                  onValueChange={val => setFormData(prev => ({ ...prev, institution_id: val }))}
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
          </CardContent>
          <CardFooter className="flex justify-between border-t pt-6">
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
      </form>
    </div>
  );
}
