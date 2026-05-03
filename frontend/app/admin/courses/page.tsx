"use client"

import { useEffect, useState, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { 
  BookOpen, 
  Plus, 
  Search, 
  Users, 
  GraduationCap, 
  MoreVertical,
  ChevronLeft,
  ChevronRight,
  Filter,
  Layers,
  Calendar
} from "lucide-react"
import { adminApi, AdminCourseListItem } from "@/lib/api/admin"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

export default function AdminCoursesPage() {
  const [courses, setCourses] = useState<AdminCourseListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [currentPage, setCurrentPage] = useState(1)
  const [totalCourses, setTotalCourses] = useState(0)
  const pageSize = 10

  async function loadCourses() {
    setLoading(true)
    try {
      const data = await adminApi.getCourses(currentPage, pageSize)
      setCourses(data.items)
      setTotalCourses(data.total)
    } catch (err) {
      console.error("Failed to load courses", err)
      toast.error("Failed to load courses")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCourses()
  }, [currentPage])

  const filteredCourses = useMemo(() => {
    return courses.filter(course => {
      const matchesSearch = 
        course.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
        course.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        course.lecturer_name.toLowerCase().includes(searchTerm.toLowerCase())
      const matchesStatus = statusFilter === "all" || course.status === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [courses, searchTerm, statusFilter])

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Courses & Classes</h1>
          <p className="text-muted-foreground text-sm">Platform-wide course management and academic structure</p>
        </div>
        <Button className="rounded-lg px-5 h-9">
          <Plus className="mr-2 size-4" /> Create Course
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="md:col-span-2 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input 
            placeholder="Search by code, title, or lecturer..." 
            className="pl-9 h-9 rounded-lg border focus-visible:ring-1"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 rounded-lg border">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="Active">Active</SelectItem>
            <SelectItem value="Draft">Draft</SelectItem>
            <SelectItem value="Archived">Archived</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border shadow-none rounded-xl">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-lg bg-muted flex items-center justify-center text-muted-foreground border">
              <BookOpen className="size-5" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Total Courses</p>
              <h3 className="text-xl font-bold leading-tight">{totalCourses}</h3>
            </div>
          </CardContent>
        </Card>
        <Card className="border shadow-none rounded-xl">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-lg bg-muted flex items-center justify-center text-muted-foreground border">
              <Users className="size-5" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Active Sections</p>
              <h3 className="text-xl font-bold leading-tight">24</h3>
            </div>
          </CardContent>
        </Card>
        <Card className="border shadow-none rounded-xl">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-lg bg-muted flex items-center justify-center text-muted-foreground border">
              <GraduationCap className="size-5" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Departments</p>
              <h3 className="text-xl font-bold leading-tight">8</h3>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border shadow-none overflow-hidden">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[120px] h-10 text-xs">Code</TableHead>
                <TableHead className="h-10 text-xs">Course Title</TableHead>
                <TableHead className="h-10 text-xs">Lecturer</TableHead>
                <TableHead className="h-10 text-xs">Students</TableHead>
                <TableHead className="h-10 text-xs">Status</TableHead>
                <TableHead className="text-right h-10 text-xs">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                [1, 2, 3, 4, 5].map(i => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-3 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-3 w-48" /></TableCell>
                    <TableCell><Skeleton className="h-3 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-3 w-8" /></TableCell>
                    <TableCell><Skeleton className="h-3 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-7 w-7 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : filteredCourses.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground text-sm">
                    No courses found matching your search.
                  </TableCell>
                </TableRow>
              ) : (
                filteredCourses.map((course) => (
                  <TableRow key={course.id} className="group transition-colors h-14">
                    <TableCell className="font-mono font-bold text-primary text-xs">
                      {course.code}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium text-sm leading-tight">{course.title}</span>
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Layers className="size-3" /> Core Module
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="size-6 rounded-full bg-muted flex items-center justify-center text-[9px] font-bold text-muted-foreground border">
                          {course.lecturer_name[0]}
                        </div>
                        <span className="text-xs">{course.lecturer_name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-xs font-medium">
                        <Users className="size-3 text-muted-foreground" />
                        {course.student_count}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant="secondary"
                        className={cn(
                          "rounded-md px-2 py-0 text-[10px] font-semibold h-5 bg-transparent border",
                          course.status === "Active" && "border-emerald-200 text-emerald-700",
                          course.status === "Draft" && "border-amber-200 text-amber-700",
                          course.status === "Archived" && "border-muted text-muted-foreground"
                        )}
                      >
                        {course.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="rounded-md h-7 w-7">
                            <MoreVertical className="size-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40 rounded-lg">
                          <DropdownMenuLabel className="text-[10px] font-bold uppercase text-muted-foreground px-2 py-1">Management</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-xs">
                            <Calendar className="mr-2 size-3.5" /> Schedule
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-xs">
                            <Users className="mr-2 size-3.5" /> Enrolled Students
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-xs">Edit Details</DropdownMenuItem>
                          <DropdownMenuItem className="text-xs text-destructive">Archive Course</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between pt-1">
        <p className="text-xs text-muted-foreground">
          Showing <strong>{filteredCourses.length}</strong> of <strong>{totalCourses}</strong> courses
        </p>
        <div className="flex items-center gap-1">
          <Button 
            variant="outline" 
            size="sm" 
            className="rounded-md h-8 w-8 p-0"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(prev => prev - 1)}
          >
            <ChevronLeft className="size-3.5" />
          </Button>
          <div className="text-xs font-medium px-2">Page {currentPage}</div>
          <Button 
            variant="outline" 
            size="sm" 
            className="rounded-md h-8 w-8 p-0"
            disabled={currentPage * pageSize >= totalCourses}
            onClick={() => setCurrentPage(prev => prev + 1)}
          >
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  )
}