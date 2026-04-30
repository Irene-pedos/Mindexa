// app/(student)/courses/page.tsx
"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BookOpen, Users, Calendar, Award } from "lucide-react";
import Link from "next/link";
import { studentApi } from "@/lib/api/student";
import { AdminCourseListItem } from "@/lib/api/admin";
import { Skeleton } from "@/components/ui/skeleton";

export default function StudentCoursesPage() {
  const [courses, setCourses] = useState<AdminCourseListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadCourses() {
      try {
        const data = await studentApi.getCourses();
        setCourses(data);
      } catch (err) {
        console.error("Failed to load courses", err);
      } finally {
        setLoading(false);
      }
    }
    loadCourses();
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">My Courses</h1>
        <p className="text-muted-foreground mt-1">
          Current semester enrolled modules and progress
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {loading ? (
          [1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-64 w-full" />)
        ) : courses.length === 0 ? (
          <Card className="col-span-full">
            <CardContent className="py-20 text-center">
              <p className="text-muted-foreground text-sm">
                You are not enrolled in any courses yet.
              </p>
            </CardContent>
          </Card>
        ) : (
          courses.map((course) => (
            <Card
              key={course.id}
              className="hover:shadow-md transition-all group"
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                        <BookOpen className="size-5" />
                      </div>
                      <div>
                        <CardTitle>{course.title}</CardTitle>
                        <CardDescription>{course.code}</CardDescription>
                      </div>
                    </div>
                  </div>
                  <Badge variant="outline">{course.lecturer_name}</Badge>
                </div>
              </CardHeader>

              <CardContent className="space-y-6">
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span>Course Progress</span>
                    <span className="font-medium">75%</span> {/* Mocked */}
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `75%` }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-muted-foreground flex items-center gap-1">
                      <Calendar className="size-4" /> Schedule
                    </div>
                    <div className="font-medium mt-1">Mon/Wed 09:00</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground flex items-center gap-1">
                      <Users className="size-4" /> Class Status
                    </div>
                    <div className="font-medium mt-1">{course.status}</div>
                  </div>
                </div>

                <div className="flex gap-3 pt-4 border-t">
                  <Button asChild variant="default" className="flex-1">
                    <Link href={`/student/courses/${course.id}`}>
                      Open Course
                    </Link>
                  </Button>
                  <Button asChild variant="outline" className="flex-1">
                    <Link href="/student/assessments">View Assessments</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Quick Stats */}
      <Card>
        <CardHeader>
          <CardTitle>Semester Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="text-center">
              <div className="text-xl font-semibold">{courses.length}</div>
              <div className="text-sm text-muted-foreground">
                Active Courses
              </div>
            </div>
            <div className="text-center">
              <div className="text-xl font-semibold text-emerald-600">82%</div>
              <div className="text-sm text-muted-foreground">
                Average Progress
              </div>
            </div>
            <div className="text-center">
              <div className="text-xl font-semibold">7</div>
              <div className="text-sm text-muted-foreground">
                Assessments Due
              </div>
            </div>
            <div className="text-center">
              <div className="text-xl font-semibold text-amber-600">3.78</div>
              <div className="text-sm text-muted-foreground">Current GPA</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
