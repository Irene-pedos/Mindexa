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
  GraduationCap, 
  Users, 
  Layers,
  Loader2,
  Search,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  Edit2,
  BarChart3,
  Filter
} from "lucide-react"
import { academicApi, adminAcademicApi } from "@/lib/api/academic"
import { adminApi } from "@/lib/api/admin"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export default function AcademicStructurePage() {
  const [activeTab, setActiveTab] = useState("campuses")
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 10

  // Form State
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [formData, setFormData] = useState<any>({})
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
      toast.error("Failed to load institutions")
    }
  }, [selInst])

  useEffect(() => {
    loadInstitutions()
  }, [])

  const loadData = useCallback(async () => {
    if (!selInst) return
    
    setLoading(true)
    try {
      switch (activeTab) {
        case "campuses":
          const c = await academicApi.getCampuses(selInst)
          setCampuses(c)
          break
        case "colleges":
          if (selCampus && selCampus !== "none") {
            const col = await academicApi.getColleges(selCampus)
            setColleges(col)
          } else {
            setColleges([])
          }
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
          if (selGroup && selGroup !== "none") {
            const s = await academicApi.getSections(selGroup)
            setSections(s)
          } else {
            setSections([])
          }
          break
      }
    } catch (err) {
      toast.error(`Failed to load ${activeTab}`)
    } finally {
      setLoading(false)
    }
  }, [activeTab, selInst, selCampus, selCollege, selDept, selOpt, selGroup])

  useEffect(() => {
    loadData()
    setSearchTerm("")
    setSelectedIds(new Set())
    setCurrentPage(1)
  }, [loadData])

  const currentList = useMemo(() => {
    const listMap: any = {
      campuses,
      colleges,
      departments,
      options,
      "class-groups": classGroups,
      sections
    }
    return listMap[activeTab] || []
  }, [activeTab, campuses, colleges, departments, options, classGroups, sections])

  const filteredData = useMemo(() => {
    return currentList.filter((item: any) => 
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.code.toLowerCase().includes(searchTerm.toLowerCase())
    )
  }, [currentList, searchTerm])

  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredData.slice(start, start + pageSize)
  }, [filteredData, currentPage])

  const totalPages = Math.ceil(filteredData.length / pageSize)

  const handleCreate = async () => {
    setIsCreating(true)
    try {
      let res
      switch (activeTab) {
        case "campuses":
          res = await adminAcademicApi.createCampus({ ...formData, institution_id: selInst })
          break
        case "colleges":
          res = await adminAcademicApi.createCollege({ ...formData, campus_id: selCampus })
          break
        case "departments":
          res = await adminAcademicApi.createDepartment({ 
            ...formData, 
            institution_id: selInst,
            campus_id: selCampus !== "none" ? selCampus : null,
            college_id: selCollege !== "none" ? selCollege : null
          })
          break
        case "options":
          res = await adminAcademicApi.createOption({ ...formData, department_id: selDept })
          break
        case "class-groups":
          res = await adminAcademicApi.createClassGroup({ ...formData, option_id: selOpt })
          break
        case "sections":
          res = await adminAcademicApi.createSection({ ...formData, class_group_id: selGroup })
          break
      }
      toast.success(`${activeTab.slice(0, -1)} created successfully`)
      setCreateDialogOpen(false)
      setFormData({})
      loadData()
    } catch (err) {
      toast.error(`Failed to create ${activeTab.slice(0, -1)}`)
    } finally {
      setIsCreating(false)
    }
  }

  const handleEdit = (item: any) => {
    setEditingItem(item)
    setFormData({
        name: item.name,
        code: item.code,
        level: item.level || ""
    })
    setEditDialogOpen(true)
  }

  const handleUpdateItem = async () => {
    if (!editingItem) return
    setIsCreating(true)
    try {
        await adminAcademicApi.updateEntity(activeTab, editingItem.id, formData)
        toast.success(`${activeTab.slice(0, -1)} updated successfully`)
        setEditDialogOpen(false)
        setEditingItem(null)
        loadData()
    } catch (err) {
        toast.error(`Failed to update ${activeTab.slice(0, -1)}`)
    } finally {
        setIsCreating(false)
    }
  }

  const handleToggleStatus = async (item: any) => {
    setIsProcessingRow(item.id)
    try {
        await adminAcademicApi.updateEntity(activeTab, item.id, { is_active: !item.is_active })
        toast.success(`${activeTab.slice(0, -1)} ${item.is_active ? "deactivated" : "activated"} successfully`)
        loadData()
    } catch (err) {
        toast.error(`Failed to toggle status`)
    } finally {
        setIsProcessingRow(null)
    }
  }

  const handleViewStats = (item: any) => {
    toast.info(`Fetching stats for ${item.name}... (Coming Soon)`)
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === paginatedData.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(paginatedData.map((i: any) => i.id)))
    }
  }

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Academic Structure</h1>
          <p className="text-muted-foreground text-xs font-medium">Manage hierarchical entities and levels</p>
        </div>

        <div className="flex items-center gap-2">
            <Select value={selInst} onValueChange={setSelInst}>
                <SelectTrigger className="w-[180px] h-9 rounded-full shadow-none border-muted/40 bg-background text-xs font-semibold">
                    <SelectValue placeholder="Institution" />
                </SelectTrigger>
                <SelectContent>
                    {institutions.map(i => (
                        <SelectItem key={i.id} value={i.id} className="text-xs">{i.name}</SelectItem>
                    ))}
                </SelectContent>
            </Select>

            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                <DialogTrigger asChild>
                    <Button size="sm" className="rounded-full gap-2 shadow-none px-5 h-9">
                        <Plus className="size-3.5" />
                        Create New
                    </Button>
                </DialogTrigger>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="text-lg">Add {activeTab.slice(0, -1)}</DialogTitle>
                        <DialogDescription className="text-xs">
                            Define a new entity within the current scope.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-1.5">
                            <Label htmlFor="name" className="text-xs">Name / Title</Label>
                            <Input 
                                id="name" 
                                placeholder="e.g. Computer Science" 
                                className="h-9 text-xs"
                                value={formData.name || ""}
                                onChange={(e) => setFormData({...formData, name: e.target.value})}
                            />
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="code" className="text-xs">Short Code</Label>
                            <Input 
                                id="code" 
                                placeholder="e.g. CS" 
                                className="h-9 text-xs font-mono"
                                value={formData.code || ""}
                                onChange={(e) => setFormData({...formData, code: e.target.value})}
                            />
                        </div>
                        {activeTab === "class-groups" && (
                            <div className="grid gap-1.5">
                                <Label htmlFor="level" className="text-xs">Level (Year)</Label>
                                <Input 
                                    id="level" 
                                    type="number" 
                                    className="h-9 text-xs"
                                    value={formData.level || ""}
                                    onChange={(e) => setFormData({...formData, level: parseInt(e.target.value)})}
                                />
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" size="sm" onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
                        <Button size="sm" onClick={handleCreate} disabled={isCreating} className="px-6">
                            {isCreating ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                            Finalize
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-muted/40 p-1 h-11 rounded-2xl w-full flex justify-start overflow-x-auto gap-1 border border-muted/20">
          <TabsTrigger value="campuses" className="rounded-xl px-4 py-1.5 text-[11px] font-bold data-[state=active]:bg-background data-[state=active]:shadow-sm gap-2 uppercase tracking-tighter">
            <MapPin className="size-3" /> Campuses
          </TabsTrigger>
          <TabsTrigger value="colleges" className="rounded-xl px-4 py-1.5 text-[11px] font-bold data-[state=active]:bg-background data-[state=active]:shadow-sm gap-2 uppercase tracking-tighter">
            <School className="size-3" /> Colleges
          </TabsTrigger>
          <TabsTrigger value="departments" className="rounded-xl px-4 py-1.5 text-[11px] font-bold data-[state=active]:bg-background data-[state=active]:shadow-sm gap-2 uppercase tracking-tighter">
            <Library className="size-3" /> Departments
          </TabsTrigger>
          <TabsTrigger value="options" className="rounded-xl px-4 py-1.5 text-[11px] font-bold data-[state=active]:bg-background data-[state=active]:shadow-sm gap-2 uppercase tracking-tighter">
            <Layers className="size-3" /> Options
          </TabsTrigger>
          <TabsTrigger value="class-groups" className="rounded-xl px-4 py-1.5 text-[11px] font-bold data-[state=active]:bg-background data-[state=active]:shadow-sm gap-2 uppercase tracking-tighter">
            <GraduationCap className="size-3" /> Levels
          </TabsTrigger>
          <TabsTrigger value="sections" className="rounded-xl px-4 py-1.5 text-[11px] font-bold data-[state=active]:bg-background data-[state=active]:shadow-sm gap-2 uppercase tracking-tighter">
            <Users className="size-3" /> Sections
          </TabsTrigger>
        </TabsList>

        <div className="mt-3 space-y-3">
            {/* Context Filters */}
            <div className="flex flex-wrap items-center gap-2 p-2 bg-muted/10 rounded-2xl border border-dashed border-muted-foreground/20">
                <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-muted-foreground px-2">
                    <Filter className="size-3" /> Scope
                </div>
                
                {activeTab !== "campuses" && (
                    <Select value={selCampus} onValueChange={setSelCampus}>
                        <SelectTrigger className="w-[150px] h-7 text-[10px] rounded-full bg-background">
                            <SelectValue placeholder="All Campuses" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="none" className="text-[10px]">All Campuses</SelectItem>
                            {campuses.map(c => (
                                <SelectItem key={c.id} value={c.id} className="text-[10px]">{c.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}

                {["departments", "options", "class-groups", "sections"].includes(activeTab) && (
                    <Select value={selCollege} onValueChange={setSelCollege} disabled={selCampus === "none"}>
                        <SelectTrigger className="w-[150px] h-7 text-[10px] rounded-full bg-background">
                            <SelectValue placeholder="All Faculties" />
                        </SelectTrigger>
                        <SelectContent>
                             <SelectItem value="none" className="text-[10px]">All Faculties</SelectItem>
                            {colleges.map(c => (
                                <SelectItem key={c.id} value={c.id} className="text-[10px]">{c.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}

                {["options", "class-groups", "sections"].includes(activeTab) && (
                    <Select value={selDept} onValueChange={setSelDept}>
                        <SelectTrigger className="w-[150px] h-7 text-[10px] rounded-full bg-background">
                            <SelectValue placeholder="Select Dept" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="none" className="text-[10px]">Select Dept</SelectItem>
                            {departments.map(d => (
                                <SelectItem key={d.id} value={d.id} className="text-[10px]">{d.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}

                {["class-groups", "sections"].includes(activeTab) && (
                    <Select value={selOpt} onValueChange={setSelOpt} disabled={selDept === "none"}>
                        <SelectTrigger className="w-[150px] h-7 text-[10px] rounded-full bg-background">
                            <SelectValue placeholder="Select Program" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="none" className="text-[10px]">Select Program</SelectItem>
                            {options.map(o => (
                                <SelectItem key={o.id} value={o.id} className="text-[10px]">{o.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}

                {activeTab === "sections" && (
                    <Select value={selGroup} onValueChange={setSelGroup} disabled={selOpt === "none"}>
                        <SelectTrigger className="w-[150px] h-7 text-[10px] rounded-full bg-background">
                            <SelectValue placeholder="Select Level" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="none" className="text-[10px]">Select Level</SelectItem>
                            {classGroups.map(cg => (
                                <SelectItem key={cg.id} value={cg.id} className="text-[10px]">{cg.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}
            </div>

            <Card className="border shadow-none overflow-hidden rounded-2xl">
                <div className="p-3 border-b bg-muted/5 flex items-center gap-3">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                        <Input 
                            placeholder={`Search ${activeTab}...`} 
                            className="pl-9 h-8 text-[11px] rounded-lg border-muted/50 bg-background"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader className="bg-muted/30">
                            <TableRow className="hover:bg-transparent border-none">
                                <TableHead className="w-10 pl-4">
                                    <Checkbox checked={selectedIds.size === paginatedData.length && paginatedData.length > 0} onCheckedChange={toggleSelectAll} />
                                </TableHead>
                                <TableHead className="text-[10px] uppercase font-bold tracking-wider h-9">Name</TableHead>
                                <TableHead className="text-[10px] uppercase font-bold tracking-wider h-9">Code</TableHead>
                                <TableHead className="text-[10px] uppercase font-bold tracking-wider h-9">Status</TableHead>
                                <TableHead className="text-right text-[10px] uppercase font-bold tracking-wider h-9 pr-4">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                [1, 2, 3].map(i => (
                                    <TableRow key={i} className="h-12 border-muted/10">
                                        <TableCell colSpan={5}><Skeleton className="h-5 w-full rounded-md" /></TableCell>
                                    </TableRow>
                                ))
                            ) : paginatedData.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="h-32 text-center text-muted-foreground text-xs italic">
                                        No entities found in this scope.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                paginatedData.map((item: any) => (
                                    <TableRow key={item.id} className="group transition-colors h-12 border-muted/10">
                                        <TableCell className="pl-4">
                                            <Checkbox checked={selectedIds.has(item.id)} onCheckedChange={() => toggleSelect(item.id)} />
                                        </TableCell>
                                        <TableCell className="font-semibold text-xs text-foreground/90">{item.name}</TableCell>
                                        <TableCell className="font-mono text-[10px] font-medium text-primary/80">{item.code}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className="rounded-full text-[9px] h-5 px-2 bg-background border-muted/30 uppercase font-medium">
                                                {item.is_active ? "ACTIVE" : "INACTIVE"}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right pr-4">
                                            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <Button variant="ghost" size="icon" className="size-7 rounded-lg hover:bg-primary/5 hover:text-primary" onClick={() => handleEdit(item)}>
                                                    <Edit2 className="size-3.5" />
                                                </Button>
                                                <Button variant="ghost" size="icon" className="size-7 rounded-lg hover:bg-primary/5 hover:text-primary" onClick={() => handleViewStats(item)}>
                                                    <BarChart3 className="size-3.5" />
                                                </Button>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="size-7 rounded-lg" disabled={isProcessingRow === item.id}>
                                                            {isProcessingRow === item.id ? <Loader2 className="size-3.5 animate-spin" /> : <MoreVertical className="size-3.5" />}
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="w-40 rounded-xl">
                                                        <DropdownMenuItem className="text-[11px] cursor-pointer" onClick={() => handleEdit(item)}>
                                                            Edit Details
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem className="text-[11px] cursor-pointer" onClick={() => handleViewStats(item)}>
                                                            View Analytics
                                                        </DropdownMenuItem>
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem 
                                                            className={cn("text-[11px] cursor-pointer", item.is_active ? "text-destructive" : "text-emerald-600")}
                                                            onClick={() => handleToggleStatus(item)}
                                                        >
                                                            {item.is_active ? "Deactivate" : "Activate"}
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
                <div className="p-2.5 bg-muted/5 border-t flex items-center justify-between">
                    <p className="text-[10px] text-muted-foreground font-black uppercase tracking-tighter">
                        PAGE {currentPage} OF {totalPages || 1}
                    </p>
                    <div className="flex items-center gap-1">
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            className="size-7 rounded-lg" 
                            disabled={currentPage === 1}
                            onClick={() => setCurrentPage(p => p - 1)}
                        >
                            <ChevronLeft className="size-4" />
                        </Button>
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            className="size-7 rounded-lg"
                            disabled={currentPage >= totalPages}
                            onClick={() => setCurrentPage(p => p + 1)}
                        >
                            <ChevronRight className="size-4" />
                        </Button>
                    </div>
                </div>
            </Card>
        </div>
      </Tabs>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent>
              <DialogHeader>
                  <DialogTitle className="text-lg">Edit {activeTab.slice(0, -1)}</DialogTitle>
                  <DialogDescription className="text-xs">
                      Update entity details.
                  </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                  <div className="grid gap-1.5">
                      <Label htmlFor="edit-name" className="text-xs">Name / Title</Label>
                      <Input 
                          id="edit-name" 
                          placeholder="e.g. Computer Science" 
                          className="h-9 text-xs"
                          value={formData.name || ""}
                          onChange={(e) => setFormData({...formData, name: e.target.value})}
                      />
                  </div>
                  <div className="grid gap-1.5">
                      <Label htmlFor="edit-code" className="text-xs">Short Code</Label>
                      <Input 
                          id="edit-code" 
                          placeholder="e.g. CS" 
                          className="h-9 text-xs font-mono"
                          value={formData.code || ""}
                          onChange={(e) => setFormData({...formData, code: e.target.value})}
                      />
                  </div>
                  {activeTab === "class-groups" && (
                      <div className="grid gap-1.5">
                          <Label htmlFor="edit-level" className="text-xs">Level (Year)</Label>
                          <Input 
                              id="edit-level" 
                              type="number" 
                              className="h-9 text-xs"
                              value={formData.level || ""}
                              onChange={(e) => setFormData({...formData, level: parseInt(e.target.value)})}
                          />
                      </div>
                  )}
              </div>
              <DialogFooter>
                  <Button variant="ghost" size="sm" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
                  <Button size="sm" onClick={handleUpdateItem} disabled={isCreating} className="px-6">
                      {isCreating ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                      Save Changes
                  </Button>
              </DialogFooter>
          </DialogContent>
      </Dialog>
    </div>
  )
}
