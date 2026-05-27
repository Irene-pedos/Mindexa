"use client"

import { useEffect, useState, useCallback, useMemo } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { 
  Plus, 
  Settings, 
  Power, 
  PowerOff, 
  Globe, 
  Image as ImageIcon,
  MoreVertical,
  Loader2,
  Search,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Building2,
  Upload
} from "lucide-react"
import { adminApi } from "@/lib/api/admin"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { Checkbox } from "@/components/ui/checkbox"

export default function InstitutionsPage() {
  const [institutions, setInstitutions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [isProcessing, setIsProcessing] = useState<string | null>(null)
  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false)
  const [isBrandingDialogOpen, setIsBrandingDialogOpen] = useState(false)
  const [selectedInst, setSelectedInst] = useState<any>(null)
  
  // UI State
  const [searchTerm, setSearchTerm] = useState("")
  const [sortField, setSortField] = useState("name")
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 8

  const [formData, setFormData] = useState({
    name: "",
    code: "",
    timezone: "UTC",
    logo_url: ""
  })
  const [logoFile, setLogoFile] = useState<File | null>(null)

  const loadInstitutions = useCallback(async () => {
    setLoading(true)
    try {
      const data = await adminApi.getInstitutions()
      setInstitutions(data)
    } catch (err) {
      toast.error("Failed to load institutions")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadInstitutions()
  }, [loadInstitutions])

  // Logic
  const filteredAndSorted = useMemo(() => {
    const result = institutions.filter(inst => 
      inst.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inst.code.toLowerCase().includes(searchTerm.toLowerCase())
    )

    result.sort((a, b) => {
      const valA = a[sortField] || ""
      const valB = b[sortField] || ""
      if (valA < valB) return sortOrder === "asc" ? -1 : 1
      if (valA > valB) return sortOrder === "asc" ? 1 : -1
      return 0
    })

    return result
  }, [institutions, searchTerm, sortField, sortOrder])

  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredAndSorted.slice(start, start + pageSize)
  }, [filteredAndSorted, currentPage])

  const totalPages = Math.ceil(filteredAndSorted.length / pageSize)

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortOrder("asc")
    }
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === paginatedData.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(paginatedData.map(i => i.id)))
    }
  }

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }

  const handleCreate = async () => {
    if (!formData.name || !formData.code) {
      toast.error("Name and Code are required")
      return
    }

    setIsCreating(true)
    try {
      const payload = { ...formData }
      
      // Convert file to base64 so it can be saved in the database as a string
      if (logoFile) {
        payload.logo_url = await new Promise((resolve) => {
            const reader = new FileReader()
            reader.onloadend = () => resolve(reader.result as string)
            reader.readAsDataURL(logoFile)
        })
      }

      await adminApi.createInstitution(payload)
      toast.success("Institution created successfully")
      setCreateDialogOpen(false)
      setFormData({ name: "", code: "", timezone: "UTC", logo_url: "" })
      setLogoFile(null)
      loadInstitutions()
    } catch (err) {
      toast.error("Failed to create institution")
    } finally {
      setIsCreating(false)
    }
  }

  const handleUpdate = async () => {
    if (!selectedInst) return
    setIsCreating(true)
    try {
        const payload: any = { 
            name: formData.name, 
            timezone: formData.timezone 
        }
        if (logoFile) {
            payload.logo_url = await new Promise((resolve) => {
                const reader = new FileReader()
                reader.onloadend = () => resolve(reader.result as string)
                reader.readAsDataURL(logoFile)
            })
        } else if (formData.logo_url !== selectedInst.logo_url) {
            payload.logo_url = formData.logo_url
        }
        await adminApi.updateInstitution(selectedInst.id, payload)
        toast.success("Institution updated successfully")
        setIsSettingsDialogOpen(false)
        setIsBrandingDialogOpen(false)
        loadInstitutions()
    } catch (err) {
        toast.error("Failed to update institution")
    } finally {
        setIsCreating(false)
    }
  }

  const handleToggleStatus = async (inst: any) => {
    setIsProcessing(inst.id)
    try {
      await adminApi.updateInstitution(inst.id, { is_active: !inst.is_active })
      toast.success(`Institution ${inst.is_active ? "suspended" : "activated"} successfully`)
      loadInstitutions()
    } catch (err) {
      toast.error("Failed to update status")
    } finally {
      setIsProcessing(null)
    }
  }

  const handleConfigure = (inst: any) => {
    setSelectedInst(inst)
    setFormData({
        name: inst.name,
        code: inst.code,
        timezone: inst.timezone,
        logo_url: inst.logo_url || ""
    })
    setIsSettingsDialogOpen(true)
  }

  const handleBranding = (inst: any) => {
    setSelectedInst(inst)
    setFormData({
        name: inst.name,
        code: inst.code,
        timezone: inst.timezone,
        logo_url: inst.logo_url || ""
    })
    setLogoFile(null)
    setIsBrandingDialogOpen(true)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Institutions</h1>
          <p className="text-muted-foreground text-xs font-medium">Global management of educational partners</p>
        </div>

        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="rounded-full gap-2 shadow-none px-5 h-9">
              <Plus className="size-3.5" />
              Add Institution
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[480px]">
            <DialogHeader>
              <DialogTitle className="text-lg">Register Institution</DialogTitle>
              <DialogDescription className="text-xs">
                Create a new top-level organisational unit.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="name" className="text-xs">Name</Label>
                  <Input 
                    id="name" 
                    placeholder="University of UR" 
                    className="h-9 text-xs"
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="code" className="text-xs">Code</Label>
                  <Input 
                    id="code" 
                    placeholder="UR" 
                    className="h-9 text-xs font-mono"
                    value={formData.code}
                    onChange={(e) => setFormData({...formData, code: e.target.value})}
                  />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="timezone" className="text-xs">Timezone</Label>
                <Input 
                  id="timezone" 
                  value={formData.timezone}
                  className="h-9 text-xs"
                  onChange={(e) => setFormData({...formData, timezone: e.target.value})}
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Institution Logo</Label>
                <div className="flex items-center gap-3 mt-1">
                    <div className="size-16 rounded-xl border-2 border-dashed flex flex-col items-center justify-center bg-muted/30 text-muted-foreground transition-colors hover:bg-muted/50 cursor-pointer relative overflow-hidden group">
                        {logoFile ? (
                             <img 
                                src={URL.createObjectURL(logoFile)} 
                                alt="Preview" 
                                className="size-full object-cover"
                             />
                        ) : (
                            <>
                                <Upload className="size-4 mb-1" />
                                <span className="text-[9px] font-bold">UPLOAD</span>
                            </>
                        )}
                        <input 
                            type="file" 
                            className="absolute inset-0 opacity-0 cursor-pointer" 
                            accept="image/*"
                            onChange={(e) => setLogoFile(e.target.files?.[0] || null)}
                        />
                    </div>
                    <div className="flex-1 space-y-1">
                        <Label htmlFor="logo_url" className="text-[10px] uppercase font-bold text-muted-foreground">Or provide Image URL</Label>
                        <Input 
                            id="logo_url" 
                            placeholder="https://..." 
                            className="h-8 text-[11px]"
                            value={formData.logo_url}
                            onChange={(e) => setFormData({...formData, logo_url: e.target.value})}
                        />
                    </div>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" size="sm" onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
              <Button size="sm" onClick={handleCreate} disabled={isCreating} className="px-6">
                {isCreating ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                Finalize Registry
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {[
            { label: "Active Partners", value: institutions.filter(i => i.is_active).length, color: "text-emerald-600" },
            { label: "Total Capacity", value: "24.5k", color: "text-primary" },
            { label: "Integrations", value: 12, color: "text-amber-600" },
            { label: "Suspended", value: institutions.filter(i => !i.is_active).length, color: "text-destructive" }
        ].map((stat, i) => (
            <Card key={i} className="border shadow-none rounded-xl bg-background/50 overflow-hidden">
                <CardContent className="px-4 py-3 flex flex-col gap-0.5">
                    <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{stat.label}</p>
                    <h3 className={cn("text-xl font-semibold leading-tight", stat.color)}>{stat.value}</h3>
                </CardContent>
            </Card>
        ))}
      </div>

      <Card className="border shadow-none overflow-hidden rounded-2xl">
        <div className="p-4 border-b bg-muted/10 flex flex-col sm:flex-row items-center gap-3">
            <div className="relative flex-1 w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <Input 
                    placeholder="Filter by name or code..." 
                    className="pl-9 h-9 text-xs rounded-xl border-muted/50 bg-background focus-visible:ring-1"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
            <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="h-9 rounded-xl text-xs gap-2 px-3" onClick={() => toggleSort("name")}>
                    Sort Name
                    <ArrowUpDown className="size-3" />
                </Button>
            </div>
        </div>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow className="hover:bg-transparent border-none">
                <TableHead className="w-10 pl-4">
                    <Checkbox checked={selectedIds.size === paginatedData.length && paginatedData.length > 0} onCheckedChange={toggleSelectAll} />
                </TableHead>
                <TableHead className="text-[10px] uppercase font-bold tracking-wider h-10">Institution</TableHead>
                <TableHead className="text-[10px] uppercase font-bold tracking-wider h-10">Code</TableHead>
                <TableHead className="text-[10px] uppercase font-bold tracking-wider h-10">Timezone</TableHead>
                <TableHead className="text-[10px] uppercase font-bold tracking-wider h-10">Status</TableHead>
                <TableHead className="text-right text-[10px] uppercase font-bold tracking-wider h-10 pr-4">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                [1, 2, 3, 4].map(i => (
                  <TableRow key={i} className="border-muted/20 h-14">
                    <TableCell colSpan={6}><Skeleton className="h-6 w-full rounded-lg" /></TableCell>
                  </TableRow>
                ))
              ) : paginatedData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground text-xs italic">
                    No matching results found.
                  </TableCell>
                </TableRow>
              ) : (
                paginatedData.map((inst) => (
                  <TableRow key={inst.id} className="group transition-colors h-14 border-muted/20">
                    <TableCell className="pl-4">
                        <Checkbox checked={selectedIds.has(inst.id)} onCheckedChange={() => toggleSelect(inst.id)} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <div className="size-7 rounded-lg bg-muted flex items-center justify-center border overflow-hidden shrink-0">
                          {inst.logo_url ? (
                            <img src={inst.logo_url} alt="" className="size-full object-cover" />
                          ) : (
                            <Building2 className="size-3 text-muted-foreground/60" />
                          )}
                        </div>
                        <span className="font-semibold text-xs truncate max-w-[200px] text-foreground/90">{inst.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-[10px] font-medium text-primary/80">
                      {inst.code}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-medium">
                        <Globe className="size-3" />
                        {inst.timezone}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant="secondary"
                        className={cn(
                          "rounded-full px-2 py-0 text-[9px] font-semibold border uppercase",
                          inst.is_active 
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                            : "bg-amber-50 text-amber-700 border-amber-200"
                        )}
                      >
                        {inst.is_active ? "ACTIVE" : "SUSPENDED"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right pr-4">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="rounded-full h-8 w-8 hover:bg-muted/80" disabled={isProcessing === inst.id}>
                            {isProcessing === inst.id ? <Loader2 className="size-3.5 animate-spin" /> : <MoreVertical className="size-3.5" />}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44 rounded-xl shadow-xl border-muted/20 p-1">
                          <DropdownMenuLabel className="text-[9px] font-semibold uppercase text-muted-foreground px-2 py-1.5 tracking-tighter">Manage Partnership</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-[11px] font-medium cursor-pointer py-2 rounded-lg" onClick={() => handleConfigure(inst)}>
                            <Settings className="mr-2 size-3.5 text-muted-foreground" /> Configure Settings
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-[11px] font-medium cursor-pointer py-2 rounded-lg" onClick={() => handleBranding(inst)}>
                            <ImageIcon className="mr-2 size-3.5 text-muted-foreground" /> Manage Branding
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            className={cn(
                              "text-[11px] font-semibold cursor-pointer py-2 rounded-lg",
                              inst.is_active ? "text-amber-600 focus:text-amber-600 focus:bg-amber-50" : "text-emerald-600 focus:text-emerald-600 focus:bg-emerald-50"
                            )}
                            onClick={() => handleToggleStatus(inst)}
                          >
                            {inst.is_active ? (
                              <><PowerOff className="mr-2 size-3.5" /> Suspend Institution</>
                            ) : (
                              <><Power className="mr-2 size-3.5" /> Activate Partner</>
                            )}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
        <div className="p-3 bg-muted/5 border-t flex items-center justify-between">
            <p className="text-[10px] text-muted-foreground font-bold">
                PAGE {currentPage} OF {totalPages || 1}
            </p>
            <div className="flex items-center gap-1.5">
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

      {/* Settings Dialog */}
      <Dialog open={isSettingsDialogOpen} onOpenChange={setIsSettingsDialogOpen}>
        <DialogContent className="sm:max-w-[450px] rounded-3xl">
          <DialogHeader>
            <DialogTitle>Configure Institution</DialogTitle>
            <DialogDescription className="text-xs">Update core identity and regional settings.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-5 py-4">
             <div className="grid gap-1.5">
                <Label htmlFor="edit-name" className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Institution Name</Label>
                <Input id="edit-name" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="rounded-xl h-10 text-xs" />
             </div>
             <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-1.5">
                    <Label htmlFor="edit-code" className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Short Code</Label>
                    <Input id="edit-code" value={formData.code} disabled className="rounded-xl h-10 text-xs font-mono opacity-60" />
                </div>
                <div className="grid gap-1.5">
                    <Label htmlFor="edit-tz" className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Timezone</Label>
                    <Input id="edit-tz" value={formData.timezone} onChange={(e) => setFormData({...formData, timezone: e.target.value})} className="rounded-xl h-10 text-xs" />
                </div>
             </div>
          </div>
          <DialogFooter>
             <Button variant="ghost" size="sm" onClick={() => setIsSettingsDialogOpen(false)} className="text-[10px] font-bold uppercase">Cancel</Button>
             <Button size="sm" onClick={handleUpdate} disabled={isCreating} className="px-8 rounded-xl font-bold text-[10px] uppercase">
                {isCreating ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                Save Changes
             </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Branding Dialog */}
      <Dialog open={isBrandingDialogOpen} onOpenChange={setIsBrandingDialogOpen}>
        <DialogContent className="sm:max-w-[450px] rounded-3xl">
          <DialogHeader>
            <DialogTitle>Manage Branding</DialogTitle>
            <DialogDescription className="text-xs">Update institutional logo and visual assets.</DialogDescription>
          </DialogHeader>
          <div className="py-6">
             <div className="flex flex-col items-center gap-6">
                <div className="size-32 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center bg-muted/30 text-muted-foreground transition-colors hover:bg-muted/50 cursor-pointer relative overflow-hidden group">
                    {logoFile ? (
                         <img src={URL.createObjectURL(logoFile)} alt="Preview" className="size-full object-cover" />
                    ) : formData.logo_url ? (
                         <img src={formData.logo_url} alt="Current" className="size-full object-cover" />
                    ) : (
                        <>
                            <Upload className="size-6 mb-2" />
                            <span className="text-[10px] font-bold uppercase">Upload Logo</span>
                        </>
                    )}
                    <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" accept="image/*" onChange={(e) => setLogoFile(e.target.files?.[0] || null)} />
                </div>
                <div className="w-full space-y-1.5">
                    <Label htmlFor="edit-logo-url" className="text-[10px] uppercase font-bold text-muted-foreground ml-1">Alternative Image URL</Label>
                    <Input 
                        id="edit-logo-url" 
                        placeholder="https://..." 
                        value={formData.logo_url} 
                        onChange={(e) => setFormData({...formData, logo_url: e.target.value})} 
                        className="h-9 text-xs rounded-xl"
                    />
                </div>
             </div>
          </div>
          <DialogFooter>
             <Button variant="ghost" size="sm" onClick={() => setIsBrandingDialogOpen(false)} className="text-[10px] font-bold uppercase">Cancel</Button>
             <Button size="sm" onClick={handleUpdate} disabled={isCreating} className="px-8 rounded-xl font-bold text-[10px] uppercase">
                {isCreating ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                Update Branding
             </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
