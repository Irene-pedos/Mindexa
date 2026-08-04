"use client"

import { useEffect, useState, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { 
  Plus, 
  Calendar,
  Loader2,
  Search,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  Edit2,
  Filter,
  CheckCircle2,
  Trash2,
  Building2,
  Clock
} from "lucide-react"
import { adminAcademicApi, AcademicPeriod, AcademicInstitution } from "@/lib/api/academic"
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
import { format } from "date-fns"

export default function AcademicPeriodsPage() {
  const [periods, setPeriods] = useState<AcademicPeriod[]>([])
  const [institutions, setInstitutions] = useState<AcademicInstitution[]>([])
  const [loading, setLoading] = useState(true)
  
  // Selection State
  const [selInst, setSelInst] = useState<string>("all")
  const [searchTerm, setSearchTerm] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 10

  // Form State
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isProcessingRow, setIsProcessingRow] = useState<string | null>(null)
  
  const [formData, setFormData] = useState<any>({
    name: "",
    period_type: "YEAR",
    start_date: "",
    end_date: "",
    institution_id: "",
    is_active: true
  })
  const [editingItem, setEditingItem] = useState<AcademicPeriod | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [periodsData, instData] = await Promise.all([
        adminAcademicApi.getAcademicPeriods(selInst === "all" ? undefined : selInst),
        adminApi.getInstitutions()
      ])
      setPeriods(periodsData)
      setInstitutions(instData)
    } catch (err) {
      toast.error("Failed to load academic periods")
    } finally {
      setLoading(false)
    }
  }, [selInst])

  useEffect(() => {
    loadData()
  }, [loadData])

  const filteredPeriods = periods.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const totalPages = Math.ceil(filteredPeriods.length / pageSize)
  const paginatedData = filteredPeriods.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  const handleCreate = async () => {
    if (!formData.name || !formData.institution_id || !formData.start_date || !formData.end_date) {
      toast.error("Please fill all required fields")
      return
    }

    setIsProcessing(true)
    try {
      await adminAcademicApi.createAcademicPeriod(formData)
      toast.success("Academic period created")
      setCreateDialogOpen(false)
      setFormData({ name: "", period_type: "YEAR", start_date: "", end_date: "", institution_id: "", is_active: true })
      loadData()
    } catch (err) {
      toast.error("Failed to create period")
    } finally {
      setIsProcessing(false)
    }
  }

  const handleEdit = (period: AcademicPeriod) => {
    setEditingItem(period)
    setFormData({
      name: period.name,
      period_type: period.period_type,
      start_date: period.start_date,
      end_date: period.end_date,
      institution_id: period.institution_id,
      is_active: period.is_active
    })
    setEditDialogOpen(true)
  }

  const handleUpdate = async () => {
    if (!editingItem) return
    setIsProcessing(true)
    try {
      await adminAcademicApi.updateEntity("academic-periods", editingItem.id, formData)
      toast.success("Period updated")
      setEditDialogOpen(false)
      loadData()
    } catch (err) {
      toast.error("Failed to update period")
    } finally {
      setIsProcessing(false)
    }
  }

  const handleToggleStatus = async (period: AcademicPeriod) => {
    setIsProcessingRow(period.id)
    try {
      await adminAcademicApi.updateEntity("academic-periods", period.id, { is_active: !period.is_active })
      toast.success(`Period ${period.is_active ? "deactivated" : "activated"}`)
      loadData()
    } catch (err) {
      toast.error("Failed to update status")
    } finally {
      setIsProcessingRow(null)
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 border-b border-muted/20 pb-4">
        <div>
          <h1 className="text-xl font-semibold text-primary tracking-tight flex items-center gap-2">
            <Clock className="size-5" />
            Academic Periods
          </h1>
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest mt-0.5">Manage School Years & Semesters</p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-muted/10 px-3 py-1.5 rounded-lg border border-muted/30">
            <span className="text-[9px] font-semibold text-muted-foreground uppercase">Filter Institution</span>
            <Select value={selInst} onValueChange={setSelInst}>
              <SelectTrigger className="w-[180px] h-6 border-none shadow-none bg-transparent text-xs font-semibold p-0 focus:ring-0 text-primary">
                <SelectValue placeholder="All Institutions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs font-medium">All Institutions</SelectItem>
                {institutions.map(i => (
                  <SelectItem key={i.id} value={i.id} className="text-xs font-medium">{i.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <Button 
            size="sm" 
            className="h-8 rounded-lg gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-[10px] uppercase tracking-wider px-4 shadow-none"
            onClick={() => {
              setFormData({ name: "", period_type: "YEAR", start_date: "", end_date: "", institution_id: institutions[0]?.id || "", is_active: true })
              setCreateDialogOpen(true)
            }}
          >
            <Plus className="size-3.5" />
            New Period
          </Button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden bg-white border border-muted/10 rounded-xl">
        <div className="p-3 border-b border-muted/10 bg-muted/5">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input 
              placeholder="Search periods..." 
              className="pl-8 h-8 text-[11px] rounded-lg border-muted/30 bg-white focus:border-primary/40 focus:ring-0"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <Table>
            <TableHeader className="bg-muted/5 border-b border-muted/10 sticky top-0 z-10 backdrop-blur-sm">
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-[9px] uppercase font-semibold tracking-widest h-8 pl-5">Period Name</TableHead>
                <TableHead className="text-[9px] uppercase font-semibold tracking-widest h-8">Type</TableHead>
                <TableHead className="text-[9px] uppercase font-semibold tracking-widest h-8">Start Date</TableHead>
                <TableHead className="text-[9px] uppercase font-semibold tracking-widest h-8">End Date</TableHead>
                <TableHead className="text-[9px] uppercase font-semibold tracking-widest h-8">Status</TableHead>
                <TableHead className="text-right text-[9px] uppercase font-semibold tracking-widest h-8 pr-5">Manage</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                [1, 2, 3, 4, 5].map(i => (
                  <TableRow key={i} className="h-10">
                    <TableCell colSpan={6} className="px-5"><Skeleton className="h-5 w-full rounded-md" /></TableCell>
                  </TableRow>
                ))
              ) : paginatedData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-48 text-center">
                    <div className="flex flex-col items-center justify-center opacity-40">
                      <Calendar className="size-6 text-muted-foreground mb-2" />
                      <p className="text-[10px] font-semibold uppercase tracking-widest">No academic periods found</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                paginatedData.map((period) => (
                  <TableRow key={period.id} className="group transition-colors h-11 border-muted/5 hover:bg-muted/5">
                    <TableCell className="pl-5 font-medium text-[11px] text-foreground uppercase tracking-tight">
                      {period.name}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[8px] h-4 uppercase font-bold border-muted/30">
                        {period.period_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-[10px] text-muted-foreground">
                      {period.start_date ? format(new Date(period.start_date), "MMM d, yyyy") : "-"}
                    </TableCell>
                    <TableCell className="text-[10px] text-muted-foreground">
                      {period.end_date ? format(new Date(period.end_date), "MMM d, yyyy") : "-"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <div className={cn("size-1.5 rounded-full", period.is_active ? "bg-emerald-500" : "bg-amber-500")} />
                        <span className={cn("text-[9px] font-semibold uppercase tracking-widest", period.is_active ? "text-emerald-700" : "text-amber-700")}>
                          {period.is_active ? "Active" : "Inactive"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right pr-5">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-6 rounded-md hover:bg-muted/10" disabled={isProcessingRow === period.id}>
                            {isProcessingRow === period.id ? <Loader2 className="size-3 animate-spin text-primary" /> : <MoreVertical className="size-3 text-muted-foreground" />}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40 rounded-lg border border-muted/20 shadow-none">
                          <DropdownMenuItem className="text-[10px] font-semibold uppercase p-2" onClick={() => handleEdit(period)}>
                            <Edit2 className="size-3 mr-2 text-primary" /> Edit Period
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            className={cn("text-[10px] font-semibold uppercase p-2", period.is_active ? "text-amber-600" : "text-emerald-600")}
                            onClick={() => handleToggleStatus(period)}
                          >
                            {period.is_active ? "Deactivate" : "Activate"}
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

      {/* Forms */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto rounded-2xl p-0 overflow-hidden border border-border bg-card shadow-xl">
          <div className="bg-primary p-5 text-primary-foreground">
            <DialogTitle className="text-sm font-semibold uppercase tracking-widest">New Academic Period</DialogTitle>
            <DialogDescription className="text-primary-foreground/60 text-[10px] mt-0.5 font-medium uppercase tracking-tighter">
              Establish a new semester or academic year
            </DialogDescription>
          </div>
          <div className="p-5 space-y-4 bg-white">
            <div className="grid gap-1">
              <Label className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground ml-0.5">Institution</Label>
              <Select value={formData.institution_id} onValueChange={(v) => setFormData({...formData, institution_id: v})}>
                <SelectTrigger className="h-9 text-[11px] font-medium border-muted/30 bg-muted/5">
                  <SelectValue placeholder="Select Institution" />
                </SelectTrigger>
                <SelectContent>
                  {institutions.map(i => (
                    <SelectItem key={i.id} value={i.id} className="text-xs">{i.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="grid gap-1">
              <Label htmlFor="name" className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground ml-0.5">Period Name</Label>
              <Input 
                id="name" 
                placeholder="e.g. 2025-2026 Academic Year" 
                className="h-9 text-[11px] font-medium rounded-md border-muted/30 bg-muted/5"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1">
                <Label className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground ml-0.5">Type</Label>
                <Select value={formData.period_type} onValueChange={(v) => setFormData({...formData, period_type: v})}>
                  <SelectTrigger className="h-9 text-[11px] font-medium border-muted/30 bg-muted/5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="YEAR" className="text-xs">Full Year</SelectItem>
                    <SelectItem value="SEMESTER" className="text-xs">Semester</SelectItem>
                    <SelectItem value="TRIMESTER" className="text-xs">Trimester</SelectItem>
                    <SelectItem value="QUARTER" className="text-xs">Quarter</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1 flex items-center justify-center pt-4">
                <div className="flex items-center gap-2">
                  <input 
                    type="checkbox" 
                    id="is_active" 
                    checked={formData.is_active} 
                    onChange={(e) => setFormData({...formData, is_active: e.target.checked})}
                    className="size-3.5 accent-primary"
                  />
                  <Label htmlFor="is_active" className="text-[10px] font-semibold uppercase text-muted-foreground">Is Active</Label>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1">
                <Label htmlFor="start_date" className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground ml-0.5">Start Date</Label>
                <Input 
                  id="start_date" 
                  type="date" 
                  className="h-9 text-[11px] font-medium rounded-md border-muted/30 bg-muted/5"
                  value={formData.start_date}
                  onChange={(e) => setFormData({...formData, start_date: e.target.value})}
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="end_date" className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground ml-0.5">End Date</Label>
                <Input 
                  id="end_date" 
                  type="date" 
                  className="h-9 text-[11px] font-medium rounded-md border-muted/30 bg-muted/5"
                  value={formData.end_date}
                  onChange={(e) => setFormData({...formData, end_date: e.target.value})}
                />
              </div>
            </div>
          </div>
          <div className="p-4 bg-muted/5 border-t border-muted/10 flex flex-row justify-end gap-2 px-5">
            <Button variant="ghost" size="sm" onClick={() => setCreateDialogOpen(false)} className="text-[9px] font-semibold uppercase tracking-widest h-8 px-4">Cancel</Button>
            <Button size="sm" onClick={handleCreate} disabled={isProcessing} className="h-8 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-[9px] uppercase tracking-widest px-6 transition-all shadow-none">
              {isProcessing ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <CheckCircle2 className="mr-2 size-3.5" />}
              Save Period
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto rounded-2xl p-0 overflow-hidden border border-border bg-card shadow-xl">
          <div className="bg-primary p-5 text-primary-foreground">
            <DialogTitle className="text-sm font-semibold uppercase tracking-widest">Update Period</DialogTitle>
            <DialogDescription className="text-primary-foreground/60 text-[10px] mt-0.5 font-medium uppercase tracking-tighter">
              Modifying registry for {editingItem?.name}
            </DialogDescription>
          </div>
          <div className="p-5 space-y-4 bg-white">
            <div className="grid gap-1">
              <Label htmlFor="edit-name" className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground ml-0.5">Period Name</Label>
              <Input 
                id="edit-name" 
                className="h-9 text-[11px] font-medium rounded-md border-muted/30 bg-muted/5"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1">
                <Label className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground ml-0.5">Type</Label>
                <Select value={formData.period_type} onValueChange={(v) => setFormData({...formData, period_type: v})}>
                  <SelectTrigger className="h-9 text-[11px] font-medium border-muted/30 bg-muted/5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="YEAR" className="text-xs">Full Year</SelectItem>
                    <SelectItem value="SEMESTER" className="text-xs">Semester</SelectItem>
                    <SelectItem value="TRIMESTER" className="text-xs">Trimester</SelectItem>
                    <SelectItem value="QUARTER" className="text-xs">Quarter</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1 flex items-center justify-center pt-4">
                <div className="flex items-center gap-2">
                  <input 
                    type="checkbox" 
                    id="edit-active" 
                    checked={formData.is_active} 
                    onChange={(e) => setFormData({...formData, is_active: e.target.checked})}
                    className="size-3.5 accent-primary"
                  />
                  <Label htmlFor="edit-active" className="text-[10px] font-semibold uppercase text-muted-foreground">Is Active</Label>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1">
                <Label htmlFor="edit-start" className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground ml-0.5">Start Date</Label>
                <Input 
                  id="edit-start" 
                  type="date" 
                  className="h-9 text-[11px] font-medium rounded-md border-muted/30 bg-muted/5"
                  value={formData.start_date}
                  onChange={(e) => setFormData({...formData, start_date: e.target.value})}
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="edit-end" className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground ml-0.5">End Date</Label>
                <Input 
                  id="edit-end" 
                  type="date" 
                  className="h-9 text-[11px] font-medium rounded-md border-muted/30 bg-muted/5"
                  value={formData.end_date}
                  onChange={(e) => setFormData({...formData, end_date: e.target.value})}
                />
              </div>
            </div>
          </div>
          <div className="p-4 bg-muted/5 border-t border-muted/10 flex flex-row justify-end gap-2 px-5">
            <Button variant="ghost" size="sm" onClick={() => setEditDialogOpen(false)} className="text-[9px] font-semibold uppercase tracking-widest h-8 px-4">Cancel</Button>
            <Button size="sm" onClick={handleUpdate} disabled={isProcessing} className="h-8 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-[10px] uppercase tracking-widest px-6 transition-all shadow-none">
              {isProcessing ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <CheckCircle2 className="mr-2 size-3.5" />}
              Update
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
