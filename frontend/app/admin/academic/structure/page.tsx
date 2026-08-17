"use client"

import { useEffect, useState, useCallback, useMemo } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { 
  Plus, 
  MapPin, 
  School, 
  Library, 
  Layers,
  Loader2,
  Search,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  Edit2,
  Filter,
  ArrowRight,
  CheckCircle2,
  Users,
  LayoutGrid,
  BookOpen,
  Info,
  AlertCircle,
  Globe,
  Settings
} from "lucide-react"
import { academicApi, adminAcademicApi } from "@/lib/api/academic"
import { adminApi } from "@/lib/api/admin"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { apiClient } from "@/lib/api/client"

const STEPS = [
  { id: "campuses", label: "Sites & Campuses", icon: MapPin, description: "Institutional locations" },
  { id: "colleges", label: "Colleges & Faculties", icon: School, description: "Academic divisions" },
  { id: "departments", label: "Departments", icon: Library, description: "Operational units" },
  { id: "options", label: "Degree Programs", icon: Layers, description: "Programs of study" },
  { id: "class-groups", label: "Year Levels", icon: LayoutGrid, description: "Academic progression" },
  { id: "sections", label: "Classes & Cohorts", icon: Users, description: "Student cohorts" },
]

export default function AcademicStructurePage() {
  const [activeStep, setActiveStep] = useState("campuses")
  const [loading, setLoading] = useState(false)
  
  // Data State
  const [institutions, setInstitutions] = useState<any[]>([])
  const [campuses, setCampuses] = useState<any[]>([])
  const [colleges, setColleges] = useState<any[]>([])
  const [departments, setDepartments] = useState<any[]>([])
  const [options, setOptions] = useState<any[]>([])
  const [classGroups, setClassGroups] = useState<any[]>([])
  const [sections, setSections] = useState<any[]>([])

  // Selection State (for filtering)
  const [selInst, setSelInst] = useState<string>("")
  const [selCampus, setSelCampus] = useState<string>("none")
  const [selCollege, setSelCollege] = useState<string>("none")
  const [selDept, setSelDept] = useState<string>("none")
  const [selOpt, setSelOpt] = useState<string>("none")
  const [selGroup, setSelGroup] = useState<string>("none")

  // UI State
  const [searchTerm, setSearchTerm] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 10

  // Form State
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [formData, setFormData] = useState<any>({
      location_type: "PHYSICAL_ROOM"
  })
  const [editingItem, setEditingItem] = useState<any>(null)
  const [isProcessingRow, setIsProcessingRow] = useState<string | null>(null)

  const loadInstitutions = useCallback(async () => {
    try {
      const data = await adminApi.getInstitutions()
      setInstitutions(data)
      if (data.length > 0 && !selInst) {
        setSelInst(data[0].id)
      }
    } catch (err) {
      console.error("Failed to load institutions:", err)
      toast.error("Failed to load institutions for structure selection")
    }
  }, [selInst])

  useEffect(() => {
    loadInstitutions()
  }, [loadInstitutions])

  const loadData = useCallback(async () => {
    if (!selInst) return
    
    setLoading(true)
    try {
      switch (activeStep) {
        case "campuses":
          const c = await academicApi.getCampuses(selInst)
          setCampuses(c)
          break
        case "colleges":
          const col = await academicApi.getColleges({ 
            institution_id: selInst,
            campus_id: selCampus !== "none" ? selCampus : undefined 
          })
          setColleges(col)
          break
        case "departments":
          const d = await academicApi.getDepartments({ 
            institution_id: selInst, 
            campus_id: selCampus !== "none" ? selCampus : undefined, 
            college_id: selCollege !== "none" ? selCollege : undefined 
          })
          setDepartments(d)
          break
        case "options":
          if (selDept && selDept !== "none") {
            const o = await academicApi.getOptions(selDept)
            setOptions(o)
          } else {
            setOptions([])
          }
          break
        case "class-groups":
          if (selOpt && selOpt !== "none") {
            const cg = await academicApi.getClassGroups(selOpt)
            setClassGroups(cg)
          } else {
            setClassGroups([])
          }
          break
        case "sections":
          // Load sections for the selected Level OR Department
          if (selGroup && selGroup !== "none") {
            const s = await academicApi.getSections(selGroup)
            setSections(s)
          } else if (selDept && selDept !== "none") {
            // Refactored backend support: fetch sections directly under department
            const s = await academicApi.getSections({ department_id: selDept })
            setSections(s)
          } else {
            setSections([])
          }
          break
      }
    } catch (err) {
      console.error(err)
      toast.error(`Failed to load ${activeStep}`)
    } finally {
      setLoading(false)
    }
  }, [activeStep, selInst, selCampus, selCollege, selDept, selOpt, selGroup])

  useEffect(() => {
    loadData()
    setSearchTerm("")
    setCurrentPage(1)
  }, [loadData])

  const currentList = useMemo(() => {
    const listMap: any = { campuses, colleges, departments, options, "class-groups": classGroups, sections }
    return listMap[activeStep] || []
  }, [activeStep, campuses, colleges, departments, options, classGroups, sections])

  const filteredData = useMemo(() => {
    return currentList.filter((item: any) => 
      (item.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.code || "").toLowerCase().includes(searchTerm.toLowerCase())
    )
  }, [currentList, searchTerm])

  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredData.slice(start, start + pageSize)
  }, [filteredData, currentPage])

  const totalPages = Math.ceil(filteredData.length / pageSize)

  const handleCreate = async () => {
    if (!formData.name) {
      toast.error("Name is required")
      return
    }

    if (activeStep !== "sections" && !formData.code) {
        toast.error("Code is required")
        return
    }

    setIsCreating(true)
    try {
      switch (activeStep) {
        case "campuses":
          await adminAcademicApi.createCampus({ ...formData, institution_id: selInst })
          break
        case "colleges":
          await adminAcademicApi.createCollege({ 
            ...formData, 
            institution_id: selInst,
            campus_id: selCampus !== "none" ? selCampus : null 
          })
          break
        case "departments":
          await adminAcademicApi.createDepartment({ 
            ...formData, 
            institution_id: selInst, 
            campus_id: selCampus !== "none" ? selCampus : null,
            college_id: selCollege !== "none" ? selCollege : null
          })
          break
        case "options":
          await adminAcademicApi.createOption({ ...formData, department_id: selDept })
          break
        case "class-groups":
          await adminAcademicApi.createClassGroup({ ...formData, option_id: selOpt })
          break
        case "sections":
          // Sections now decoupled from Course, belonging to Level (ClassGroup) OR Dept
          await adminAcademicApi.createSection({ 
              ...formData, 
              class_group_id: selGroup !== "none" ? selGroup : null,
              department_id: selDept !== "none" ? selDept : null,
              location_type: formData.location_type || "PHYSICAL_ROOM"
          })
          break
      }
      toast.success(`${activeStep.slice(0, -1)} created successfully`)
      setCreateDialogOpen(false)
      setFormData({ location_type: "PHYSICAL_ROOM" })
      loadData()
    } catch (err: any) {
      toast.error(err.message || `Failed to create ${activeStep.slice(0, -1)}`)
    } finally {
      setIsCreating(false)
    }
  }

  const handleEdit = (item: any) => {
    setEditingItem(item)
    setFormData({
        name: item.name,
        code: item.code,
        level: item.level || "",
        location_type: item.location_type || "PHYSICAL_ROOM",
        room: item.room || "",
        capacity: item.capacity || ""
    })
    setEditDialogOpen(true)
  }

  const handleUpdateItem = async () => {
    if (!editingItem) return
    setIsCreating(true)
    try {
        await adminAcademicApi.updateEntity(activeStep, editingItem.id, formData)
        toast.success(`${activeStep.slice(0, -1)} updated successfully`)
        setEditDialogOpen(false)
        setEditingItem(null)
        loadData()
    } catch (err) {
        toast.error(`Failed to update ${activeStep.slice(0, -1)}`)
    } finally {
        setIsCreating(false)
    }
  }

  const handleToggleStatus = async (item: any) => {
    setIsProcessingRow(item.id)
    try {
        await adminAcademicApi.updateEntity(activeStep, item.id, { is_active: !item.is_active })
        toast.success(`${activeStep.slice(0, -1)} ${item.is_active ? "deactivated" : "activated"} successfully`)
        loadData()
    } catch (err) {
        toast.error(`Failed to toggle status`)
    } finally {
        setIsProcessingRow(null)
    }
  }

  const getSectionLocationBadge = (type: string) => {
      switch(type) {
          case 'ONLINE': return <Badge className="bg-sky-50 text-sky-700 border-sky-100 uppercase text-[8px] h-4">Online</Badge>
          case 'HYBRID': return <Badge className="bg-purple-50 text-purple-700 border-purple-100 uppercase text-[8px] h-4">Hybrid</Badge>
          case 'NOT_APPLICABLE': return <Badge className="bg-muted/50 text-muted-foreground border-none uppercase text-[8px] h-4">Remote</Badge>
          default: return <Badge className="bg-emerald-50 text-emerald-700 border-emerald-100 uppercase text-[8px] h-4">Campus</Badge>
      }
  }

  return (
    <div data-tour="admin-academic" className="flex flex-col h-[calc(100vh-120px)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 border-b border-muted/20 pb-4">
        <div>
          <h1 className="text-xl font-semibold text-primary tracking-tight flex items-center gap-2">
            <Library className="size-5" />
            Academic Structure
          </h1>
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest mt-0.5">Institutional Hierarchy & Student Groups</p>
        </div>
        
        <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-muted/10 px-3 py-1.5 rounded-lg border border-muted/30">
                <span className="text-[9px] font-semibold text-muted-foreground uppercase">Target Instance</span>
                <Select value={selInst} onValueChange={setSelInst}>
                    <SelectTrigger className="w-[200px] h-6 border-none shadow-none bg-transparent text-xs font-semibold p-0 focus:ring-0 text-primary">
                        <SelectValue placeholder="Select Institution" />
                    </SelectTrigger>
                    <SelectContent>
                        {institutions.map(i => (
                            <SelectItem key={i.id} value={i.id} className="text-xs font-medium">{i.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
        </div>
      </div>

      <div className="flex flex-1 gap-4 overflow-hidden">
        {/* Navigation Sidebar */}
        <div className="w-56 flex flex-col gap-1 pr-1 border-r border-muted/10 overflow-y-auto">
            {STEPS.map((step, idx) => {
                const Icon = step.icon
                const isActive = activeStep === step.id
                const currentIndex = STEPS.findIndex(s => s.id === activeStep)
                const isCompleted = idx < currentIndex
                
                return (
                    <button
                        key={step.id}
                        onClick={() => setActiveStep(step.id)}
                        className={cn(
                            "flex items-center gap-3 p-2.5 rounded-lg transition-all text-left group relative border shadow-xs",
                            isActive 
                                ? "bg-primary text-primary-foreground border-primary font-semibold" 
                                : "hover:bg-muted/10 text-muted-foreground border-transparent"
                        )}
                    >
                        <div className={cn(
                            "size-7 rounded flex items-center justify-center border transition-colors",
                            isActive ? "bg-white/20 text-white border-white/30" : 
                            isCompleted ? "bg-emerald-50 text-emerald-600 border-emerald-200" :
                            "bg-muted/10 border-muted/40 group-hover:bg-white"
                        )}>
                            {isCompleted ? <CheckCircle2 className="size-3.5" /> : <Icon className="size-3.5" />}
                        </div>
                        <div className="flex-1">
                            <p className="text-[11px] font-semibold uppercase tracking-tight leading-none mb-1">{step.label}</p>
                            <p className="text-[9px] opacity-70 leading-none font-medium">{step.description}</p>
                        </div>
                        {isActive && <ArrowRight className="size-3 absolute right-2" />}
                    </button>
                )
            })}
            
            <div className="mt-8 p-4 bg-muted/5 rounded-lg border border-muted/10">
                <div className="flex justify-between items-center mb-3 px-1">
                    <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest">Hierarchy State</p>
                    <span className="text-[9px] font-semibold text-primary">
                        {Math.round(((STEPS.findIndex(s => s.id === activeStep) + 1) / STEPS.length) * 100)}%
                    </span>
                </div>
                <div className="flex gap-1 h-1">
                    {STEPS.map((_, i) => (
                        <div 
                            key={i} 
                            className={cn(
                                "flex-1 rounded-full transition-all duration-300", 
                                i <= STEPS.findIndex(s => s.id === activeStep) ? "bg-primary" : "bg-muted/30"
                            )} 
                        />
                    ))}
                </div>
            </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden bg-white border border-muted/10 rounded-xl">
            {/* Toolbar */}
            <div className="p-3 border-b border-muted/10 flex flex-wrap items-center justify-between gap-3 bg-muted/5">
                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative w-44">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                        <Input 
                            placeholder={`Search records...`} 
                            className="pl-8 h-8 text-[11px] rounded-lg border-muted/30 bg-white focus:border-primary/40 focus:ring-0"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    
                    {/* Cascading Filters */}
                    <div className="flex flex-wrap items-center gap-1.5">
                        {activeStep !== "campuses" && (
                            <Select value={selCampus} onValueChange={setSelCampus}>
                                <SelectTrigger className="h-7 text-[10px] rounded-md bg-white border-muted/30 min-w-[100px] w-fit font-semibold text-primary">
                                    <MapPin className="size-3 mr-1.5 text-muted-foreground" />
                                    <SelectValue placeholder="All Sites" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none" className="text-[10px] font-medium">All Sites / Campuses</SelectItem>
                                    {campuses.map(c => (
                                        <SelectItem key={c.id} value={c.id} className="text-[10px] font-medium">{c.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}

                        {["departments", "options", "class-groups", "sections"].includes(activeStep) && (
                            <Select value={selCollege} onValueChange={setSelCollege}>
                                <SelectTrigger className="h-7 text-[10px] rounded-md bg-white border-muted/30 min-w-[100px] w-fit font-semibold text-primary">
                                    <School className="size-3 mr-1.5 text-muted-foreground" />
                                    <SelectValue placeholder="Faculty" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none" className="text-[10px] font-medium">All Colleges / Faculties</SelectItem>
                                    {colleges.map(c => (
                                        <SelectItem key={c.id} value={c.id} className="text-[10px] font-medium">{c.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}

                        {["options", "class-groups", "sections"].includes(activeStep) && (
                            <Select value={selDept} onValueChange={setSelDept}>
                                <SelectTrigger className="h-7 text-[10px] rounded-md bg-white border-muted/30 min-w-[110px] w-fit font-semibold text-primary">
                                    <Library className="size-3 mr-1.5 text-muted-foreground" />
                                    <SelectValue placeholder="Department" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none" className="text-[10px] font-medium">Select Dept</SelectItem>
                                    {departments.map(d => (
                                        <SelectItem key={d.id} value={d.id} className="text-[10px] font-medium">{d.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}

                        {["class-groups", "sections"].includes(activeStep) && (
                            <Select value={selOpt} onValueChange={setSelOpt} disabled={selDept === "none"}>
                                <SelectTrigger className="h-7 text-[10px] rounded-md bg-white border-muted/30 min-w-[110px] w-fit font-semibold text-primary">
                                    <Layers className="size-3 mr-1.5 text-muted-foreground" />
                                    <SelectValue placeholder="Program" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none" className="text-[10px] font-medium">Select Program</SelectItem>
                                    {options.map(o => (
                                        <SelectItem key={o.id} value={o.id} className="text-[10px] font-medium">{o.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}

                        {activeStep === "sections" && (
                            <Select value={selGroup} onValueChange={setSelGroup} disabled={selOpt === "none"}>
                                <SelectTrigger className="h-7 text-[10px] rounded-md bg-white border-muted/30 min-w-[100px] w-fit font-semibold text-primary">
                                    <LayoutGrid className="size-3 mr-1.5 text-muted-foreground" />
                                    <SelectValue placeholder="Year Level" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none" className="text-[10px] font-medium">Select Level</SelectItem>
                                    {classGroups.map(cg => (
                                        <SelectItem key={cg.id} value={cg.id} className="text-[10px] font-medium">{cg.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {activeStep === "sections" && selDept === "none" && (
                        <span className="text-[10px] text-amber-600 font-bold uppercase animate-pulse flex items-center gap-1">
                            <AlertCircle className="size-3" /> Select Parent Dept to manage cohorts
                        </span>
                    )}
                    <Button 
                        size="sm" 
                        disabled={activeStep === "sections" && selDept === "none"}
                        className="h-8 rounded-lg gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-[10px] uppercase tracking-wider px-4 shadow-none"
                        onClick={() => {
                            setFormData({ location_type: "PHYSICAL_ROOM" })
                            setCreateDialogOpen(true)
                        }}
                    >
                        <Plus className="size-3.5" />
                        New {activeStep === "sections" ? "Cohort / Section" : activeStep.slice(0, -1)}
                    </Button>
                </div>
            </div>

            {/* Grid/Table Area */}
            <div className="flex-1 overflow-auto">
                <Table>
                    <TableHeader className="bg-muted/5 border-b border-muted/10 sticky top-0 z-10 backdrop-blur-sm">
                        <TableRow className="hover:bg-transparent">
                            <TableHead className="text-[9px] uppercase font-semibold tracking-widest h-8 pl-5">Entity Registry</TableHead>
                            <TableHead className="text-[9px] uppercase font-semibold tracking-widest h-8">Code / ID</TableHead>
                            {activeStep === "sections" && <TableHead className="text-[9px] uppercase font-semibold tracking-widest h-8">Delivery Mode</TableHead>}
                            <TableHead className="text-[9px] uppercase font-semibold tracking-widest h-8">Status</TableHead>
                            <TableHead className="text-right text-[9px] uppercase font-semibold tracking-widest h-8 pr-5">Manage</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            [1, 2, 3, 4, 5].map(i => (
                                <TableRow key={i} className="h-10">
                                    <TableCell colSpan={5} className="px-5"><Skeleton className="h-5 w-full rounded-md" /></TableCell>
                                </TableRow>
                            ))
                        ) : activeStep === "sections" && selDept === "none" ? (
                            <TableRow>
                                <TableCell colSpan={5} className="h-64 text-center">
                                    <div className="flex flex-col items-center justify-center opacity-40 max-w-sm mx-auto">
                                        <Library className="size-10 text-primary mb-4" />
                                        <p className="text-[12px] font-bold uppercase tracking-widest leading-relaxed">
                                            Cohorts are linked to Departments.<br/>
                                            <span className="text-[10px] font-medium normal-case mt-2 block italic text-muted-foreground">Please select a Department in the filters above to manage student groups.</span>
                                        </p>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : paginatedData.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="h-48 text-center">
                                    <div className="flex flex-col items-center justify-center opacity-40">
                                        <Filter className="size-6 text-muted-foreground mb-2" />
                                        <p className="text-[10px] font-semibold uppercase tracking-widest">No matching results identified</p>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : (
                            paginatedData.map((item: any) => (
                                <TableRow key={item.id} className="group transition-colors h-11 border-muted/5 hover:bg-muted/5">
                                    <TableCell className="pl-5 font-medium text-[11px] text-foreground uppercase tracking-tight">
                                        {item.name}
                                    </TableCell>
                                    <TableCell className="font-mono text-[10px] font-semibold text-primary/80">
                                        {item.code || "ID: " + (item.id.slice(0, 8))}
                                    </TableCell>
                                    {activeStep === "sections" && (
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                {getSectionLocationBadge(item.location_type)}
                                                {item.room && <span className="text-[10px] text-muted-foreground font-mono">@{item.room}</span>}
                                            </div>
                                        </TableCell>
                                    )}
                                    <TableCell>
                                        <div className="flex items-center gap-1.5">
                                            <div className={cn("size-1.5 rounded-full", item.is_active ? "bg-emerald-500" : "bg-amber-500")} />
                                            <span className={cn("text-[9px] font-semibold uppercase tracking-widest", item.is_active ? "text-emerald-700" : "text-amber-700")}>
                                                {item.is_active ? "Active" : "Disabled"}
                                            </span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right pr-5">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" className="size-6 rounded-md hover:bg-muted/10" disabled={isProcessingRow === item.id}>
                                                    {isProcessingRow === item.id ? <Loader2 className="size-3 animate-spin text-primary" /> : <MoreVertical className="size-3 text-muted-foreground" />}
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="w-40 rounded-lg border border-muted/20 shadow-none">
                                                <DropdownMenuItem className="text-[10px] font-semibold uppercase p-2" onClick={() => handleEdit(item)}>
                                                    <Edit2 className="size-3 mr-2 text-primary" /> Edit Info
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem 
                                                    className={cn("text-[10px] font-semibold uppercase p-2", item.is_active ? "text-amber-600" : "text-emerald-600")}
                                                    onClick={() => handleToggleStatus(item)}
                                                >
                                                    {item.is_active ? "Suspend" : "Activate"}
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Pagination */}
            <div className="p-2 border-t border-muted/10 flex items-center justify-between px-5 bg-muted/5">
                <p className="text-[9px] text-muted-foreground font-semibold uppercase tracking-widest">
                    PG {currentPage} / {totalPages || 1}
                </p>
                <div className="flex items-center gap-1">
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        className="size-6 rounded-md" 
                        disabled={currentPage === 1}
                        onClick={() => setCurrentPage(p => p - 1)}
                    >
                        <ChevronLeft className="size-3" />
                    </Button>
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        className="size-6 rounded-md"
                        disabled={currentPage >= totalPages}
                        onClick={() => setCurrentPage(p => p + 1)}
                    >
                        <ChevronRight className="size-3" />
                    </Button>
                </div>
            </div>
        </div>
      </div>

      {/* Forms */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto rounded-2xl p-0 overflow-hidden border border-border bg-card shadow-xl">
              <div className="bg-primary p-5 text-primary-foreground">
                  <DialogTitle className="text-sm font-semibold uppercase tracking-widest">
                      New {activeStep === "sections" ? "Class Group / Cohort" : activeStep.slice(0, -1)}
                  </DialogTitle>
                  <DialogDescription className="text-primary-foreground/60 text-[10px] mt-0.5 font-medium uppercase tracking-tighter">
                      Registering entity into institutional registry
                  </DialogDescription>
              </div>
              <div className="p-5 space-y-4 bg-white">
                  <div className="grid gap-1">
                      <Label htmlFor="name" className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground ml-0.5">
                        {activeStep === "sections" ? "Cohort / Section Identifier" : "Entity Name"}
                      </Label>
                      <Input 
                          id="name" 
                          placeholder={activeStep === "sections" ? "e.g. Section A" : "e.g. Faculty of Engineering"} 
                          className="h-9 text-[11px] font-medium rounded-md border-muted/30 bg-muted/5 focus-visible:ring-1 focus-visible:ring-primary/40 focus-visible:border-primary/40"
                          value={formData.name || ""}
                          onChange={(e) => setFormData({...formData, name: e.target.value})}
                      />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {activeStep !== "sections" ? (
                        <div className="grid gap-1">
                            <Label htmlFor="code" className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground ml-0.5">Entity Code</Label>
                            <Input 
                                id="code" 
                                placeholder="e.g. FENG" 
                                className="h-9 text-[11px] font-medium rounded-md border-muted/30 bg-muted/5 font-mono"
                                value={formData.code || ""}
                                onChange={(e) => setFormData({...formData, code: e.target.value})}
                            />
                        </div>
                    ) : (
                        <div className="grid gap-1 col-span-2">
                            <Label htmlFor="location_type" className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground ml-0.5">Location Type</Label>
                            <Select 
                                value={formData.location_type || "PHYSICAL_ROOM"} 
                                onValueChange={(v) => setFormData({...formData, location_type: v})}
                            >
                                <SelectTrigger className="h-9 text-[11px] font-medium rounded-md border-muted/30 bg-muted/5">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="PHYSICAL_ROOM" className="text-xs font-medium">Physical Room</SelectItem>
                                    <SelectItem value="ONLINE" className="text-xs font-medium">Online (Virtual)</SelectItem>
                                    <SelectItem value="HYBRID" className="text-xs font-medium">Hybrid (Mixed)</SelectItem>
                                    <SelectItem value="NOT_APPLICABLE" className="text-xs font-medium">Not Applicable</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                    
                    {activeStep === "sections" && (
                        <div className="grid gap-1">
                            <Label htmlFor="capacity" className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground ml-0.5">Seat Capacity</Label>
                            <Input 
                                id="capacity" 
                                type="number" 
                                placeholder="30"
                                className="h-9 text-[11px] font-medium rounded-md border-muted/30 bg-muted/5"
                                value={formData.capacity || ""}
                                onChange={(e) => setFormData({...formData, capacity: parseInt(e.target.value)})}
                            />
                        </div>
                    )}

                    {activeStep === "class-groups" && (
                        <div className="grid gap-1">
                            <Label htmlFor="level" className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground ml-0.5">Year Level</Label>
                            <Input 
                                id="level" 
                                type="number" 
                                className="h-9 text-[11px] font-medium rounded-md border-muted/30 bg-muted/5"
                                value={formData.level || ""}
                                onChange={(e) => setFormData({...formData, level: parseInt(e.target.value)})}
                            />
                        </div>
                    )}
                    {activeStep === "sections" && (
                        <div className="grid gap-1">
                            <Label htmlFor="room" className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground ml-0.5">Room / Link (Optional)</Label>
                            <Input 
                                id="room" 
                                placeholder={formData.location_type === 'ONLINE' ? 'e.g. Teams Link' : 'e.g. Lab 1'}
                                className="h-9 text-[11px] font-medium rounded-md border-muted/30 bg-muted/5"
                                value={formData.room || ""}
                                onChange={(e) => setFormData({...formData, room: e.target.value})}
                            />
                        </div>
                    )}
                  </div>
              </div>
              <div className="p-4 bg-muted/5 border-t border-muted/10 flex flex-row justify-end gap-2 px-5">
                  <Button variant="ghost" size="sm" onClick={() => setCreateDialogOpen(false)} className="text-[9px] font-semibold uppercase tracking-widest h-8 px-4">Cancel</Button>
                  <Button size="sm" onClick={handleCreate} disabled={isCreating} className="h-8 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-[9px] uppercase tracking-widest px-6 transition-all shadow-none">
                      {isCreating ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <CheckCircle2 className="mr-2 size-3.5" />}
                      Commit Entry
                  </Button>
              </div>
          </DialogContent>
      </Dialog>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto rounded-2xl p-0 overflow-hidden border border-border bg-card shadow-xl">
              <div className="bg-primary p-5 text-primary-foreground">
                  <DialogTitle className="text-sm font-semibold uppercase tracking-widest">Update Metadata</DialogTitle>
                  <DialogDescription className="text-primary-foreground/60 text-[10px] mt-0.5 font-medium uppercase tracking-tighter">
                      Modifying record for {activeStep.slice(0, -1)}
                  </DialogDescription>
              </div>
              <div className="p-5 space-y-4 bg-white">
                  <div className="grid gap-1">
                      <Label htmlFor="edit-name" className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground ml-0.5">Entity Name</Label>
                      <Input 
                          id="edit-name" 
                          className="h-9 text-[11px] font-medium rounded-md border-muted/30 bg-muted/5"
                          value={formData.name || ""}
                          onChange={(e) => setFormData({...formData, name: e.target.value})}
                      />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-1">
                        <Label htmlFor="edit-code" className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground ml-0.5">
                            {activeStep === "sections" ? "Capacity" : "Entity Code"}
                        </Label>
                        {activeStep === "sections" ? (
                             <Input 
                                id="edit-capacity" 
                                type="number"
                                className="h-9 text-[11px] font-medium rounded-md border-muted/30 bg-muted/5"
                                value={formData.capacity || ""}
                                onChange={(e) => setFormData({...formData, capacity: parseInt(e.target.value)})}
                             />
                        ) : (
                            <Input 
                                id="edit-code" 
                                className="h-9 text-[11px] font-medium rounded-md border-muted/30 bg-muted/20 opacity-50 font-mono"
                                value={formData.code || ""}
                                disabled
                            />
                        )}
                    </div>
                    {activeStep === "class-groups" && (
                        <div className="grid gap-1">
                            <Label htmlFor="edit-level" className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground ml-0.5">Year Level</Label>
                            <Input 
                                id="edit-level" 
                                type="number" 
                                className="h-9 text-[11px] font-medium rounded-md border-muted/30 bg-muted/5"
                                value={formData.level || ""}
                                onChange={(e) => setFormData({...formData, level: parseInt(e.target.value)})}
                            />
                        </div>
                    )}
                    {activeStep === "sections" && (
                         <div className="grid gap-1">
                            <Label htmlFor="edit-room" className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground ml-0.5">Room</Label>
                            <Input 
                                id="edit-room" 
                                className="h-9 text-[11px] font-medium rounded-md border-muted/30 bg-muted/5"
                                value={formData.room || ""}
                                onChange={(e) => setFormData({...formData, room: e.target.value})}
                            />
                        </div>
                    )}
                  </div>
              </div>
              <div className="p-4 bg-muted/5 border-t border-muted/10 flex flex-row justify-end gap-2 px-5">
                  <Button variant="ghost" size="sm" onClick={() => setEditDialogOpen(false)} className="text-[9px] font-semibold uppercase tracking-widest h-8 px-4">Cancel</Button>
                  <Button size="sm" onClick={handleUpdateItem} disabled={isCreating} className="h-8 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-[9px] uppercase tracking-widest px-6 shadow-none transition-all">
                      {isCreating ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <CheckCircle2 className="mr-2 size-3.5" />}
                      Update
                  </Button>
              </div>
          </DialogContent>
      </Dialog>
    </div>
  )
}
