"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  Upload,
  CheckCircle2,
  XCircle,
  ExternalLink,
} from "lucide-react";
import Image from "next/image";
import { adminApi } from "@/lib/api/admin";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export default function InstitutionsPage() {
  const [institutions, setInstitutions] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState<string | null>(null);
  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false);
  const [isBrandingDialogOpen, setIsBrandingDialogOpen] = useState(false);
  const [selectedInst, setSelectedInst] = useState<any>(null);

  // UI State
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "suspended">("all");
  const [sortField, setSortField] = useState("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const [formData, setFormData] = useState({
    name: "",
    code: "",
    timezone: "UTC",
    logo_url: "",
  });
  const [logoFile, setLogoFile] = useState<File | null>(null);

  const loadInstitutions = useCallback(async () => {
    setLoading(true);
    try {
      const [dataRes, sumRes] = await Promise.allSettled([
        adminApi.getInstitutions(),
        adminApi.getInstitutionSummary(),
      ]);

      if (dataRes.status === "fulfilled") {
        setInstitutions(dataRes.value);
      } else {
        toast.error("Could not load institutions list");
      }

      if (sumRes.status === "fulfilled") {
        setSummary(sumRes.value);
      } else {
        toast.error("Could not load institution metrics");
      }
    } catch {
      toast.error("Failed to load institution data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInstitutions();
  }, [loadInstitutions]);

  // Filtering & Sorting
  const filteredAndSorted = useMemo(() => {
    const result = institutions.filter((inst) => {
      const matchesSearch =
        inst.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inst.code.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus =
        statusFilter === "all"
          ? true
          : statusFilter === "active"
          ? inst.is_active
          : !inst.is_active;

      return matchesSearch && matchesStatus;
    });

    result.sort((a, b) => {
      const valA = (a[sortField] || "").toString().toLowerCase();
      const valB = (b[sortField] || "").toString().toLowerCase();
      if (valA < valB) return sortOrder === "asc" ? -1 : 1;
      if (valA > valB) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

    return result;
  }, [institutions, searchTerm, statusFilter, sortField, sortOrder]);

  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAndSorted.slice(start, start + pageSize);
  }, [filteredAndSorted, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredAndSorted.length / pageSize);

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  const handleCreate = async () => {
    if (!formData.name.trim() || !formData.code.trim()) {
      toast.error("Institution name and code are required");
      return;
    }

    setIsCreating(true);
    try {
      const payload = { ...formData };

      if (logoFile) {
        payload.logo_url = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(logoFile);
        });
      }

      await adminApi.createInstitution(payload);
      toast.success("Institution registered successfully");
      setCreateDialogOpen(false);
      setFormData({ name: "", code: "", timezone: "UTC", logo_url: "" });
      setLogoFile(null);
      loadInstitutions();
    } catch {
      toast.error("Failed to register institution");
    } finally {
      setIsCreating(false);
    }
  };

  const handleUpdate = async () => {
    if (!selectedInst) return;
    setIsCreating(true);
    try {
      const payload: any = {
        name: formData.name,
        timezone: formData.timezone,
      };
      if (logoFile) {
        payload.logo_url = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(logoFile);
        });
      } else if (formData.logo_url !== selectedInst.logo_url) {
        payload.logo_url = formData.logo_url;
      }
      await adminApi.updateInstitution(selectedInst.id, payload);
      toast.success("Institution details updated");
      setIsSettingsDialogOpen(false);
      setIsBrandingDialogOpen(false);
      loadInstitutions();
    } catch {
      toast.error("Failed to update institution");
    } finally {
      setIsCreating(false);
    }
  };

  const handleToggleStatus = async (inst: any) => {
    setIsProcessing(inst.id);
    try {
      await adminApi.updateInstitution(inst.id, { is_active: !inst.is_active });
      toast.success(`Institution ${inst.is_active ? "suspended" : "activated"} successfully`);
      loadInstitutions();
    } catch {
      toast.error("Failed to update institution status");
    } finally {
      setIsProcessing(null);
    }
  };

  const handleConfigure = (inst: any) => {
    setSelectedInst(inst);
    setFormData({
      name: inst.name,
      code: inst.code,
      timezone: inst.timezone,
      logo_url: inst.logo_url || "",
    });
    setIsSettingsDialogOpen(true);
  };

  const handleBranding = (inst: any) => {
    setSelectedInst(inst);
    setFormData({
      name: inst.name,
      code: inst.code,
      timezone: inst.timezone,
      logo_url: inst.logo_url || "",
    });
    setLogoFile(null);
    setIsBrandingDialogOpen(true);
  };

  return (
    <div className="w-full min-w-0 space-y-6 transition-all duration-300 ease-in-out">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-5 border-b border-border/40">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Building2 className="size-4.5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-foreground">
                Institutions & Academic Partners
              </h1>
              <p className="text-xs text-muted-foreground">
                Centralized registry of accredited educational institutions and operational tenants.
              </p>
            </div>
          </div>
        </div>

        <Button
          size="sm"
          onClick={() => {
            setFormData({ name: "", code: "", timezone: "UTC", logo_url: "" });
            setLogoFile(null);
            setCreateDialogOpen(true);
          }}
          className="h-8.5 rounded-xl gap-2 px-4 text-xs font-semibold shadow-xs cursor-pointer self-start sm:self-auto"
        >
          <Plus className="size-3.5" />
          Register Institution
        </Button>
      </div>

      {/* KPI Overview Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[
          {
            label: "Active Partners",
            value: summary?.active_partners || institutions.filter((i) => i.is_active).length,
            detail: "Fully certified",
            icon: CheckCircle2,
          },
          {
            label: "Total Capacity",
            value:
              (summary?.total_capacity || 0) >= 1000
                ? `${((summary?.total_capacity || 0) / 1000).toFixed(1)}k`
                : summary?.total_capacity || 0,
            detail: "Student enrollments",
            icon: Globe,
          },
          {
            label: "Integrations",
            value: summary?.integrations_count || institutions.length,
            detail: "Connected systems",
            icon: Settings,
          },
          {
            label: "Suspended",
            value: summary?.suspended_partners || institutions.filter((i) => !i.is_active).length,
            detail: "Access restricted",
            icon: PowerOff,
          },
        ].map((stat, i) => (
          <div
            key={i}
            className="p-4 rounded-2xl bg-card border border-border shadow-2xs flex items-center justify-between"
          >
            <div className="space-y-1">
              <p className="text-[11px] font-medium text-muted-foreground">{stat.label}</p>
              <div className="text-2xl font-bold tracking-tight text-foreground">
                {loading ? <Skeleton className="h-7 w-12" /> : stat.value}
              </div>
              <p className="text-[10px] text-muted-foreground">{stat.detail}</p>
            </div>
            <div className="size-9 rounded-xl bg-muted/50 border border-border/50 flex items-center justify-center text-muted-foreground shrink-0">
              <stat.icon className="size-4" />
            </div>
          </div>
        ))}
      </div>

      {/* Unified Table Container */}
      <div className="rounded-2xl border border-border bg-card shadow-2xs overflow-hidden">
        {/* Toolbar */}
        <div className="p-3 sm:p-4 border-b border-border/60 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-muted/10">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              placeholder="Search partner by name or code..."
              className="pl-9 h-8.5 text-xs rounded-xl bg-background border-border/80 focus-visible:ring-1"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Status Segmented Buttons */}
            <div className="flex items-center bg-muted/60 p-0.5 rounded-xl border border-border/60 text-xs">
              {(["all", "active", "suspended"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setStatusFilter(s);
                    setCurrentPage(1);
                  }}
                  className={cn(
                    "px-3 py-1 rounded-lg font-medium text-[11px] capitalize transition-all cursor-pointer",
                    statusFilter === s
                      ? "bg-background text-foreground shadow-2xs font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {s}
                </button>
              ))}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => toggleSort("name")}
              className="h-8 rounded-xl text-xs gap-1.5 px-3 cursor-pointer border-border/70"
            >
              <ArrowUpDown className="size-3" />
              Sort ({sortOrder})
            </Button>
          </div>
        </div>

        {/* Data Table */}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/20">
              <TableRow className="border-b border-border/60 hover:bg-transparent">
                <TableHead className="text-[11px] font-semibold tracking-tight h-10 pl-5">
                  Partner Institution
                </TableHead>
                <TableHead className="text-[11px] font-semibold tracking-tight h-10">
                  Institutional Code
                </TableHead>
                <TableHead className="text-[11px] font-semibold tracking-tight h-10">
                  Timezone & Locale
                </TableHead>
                <TableHead className="text-[11px] font-semibold tracking-tight h-10">
                  Status
                </TableHead>
                <TableHead className="text-right text-[11px] font-semibold tracking-tight h-10 pr-5">
                  Operations
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                [1, 2, 3, 4, 5].map((i) => (
                  <TableRow key={i} className="border-b border-border/40 h-14">
                    <TableCell colSpan={5} className="px-5">
                      <Skeleton className="h-6 w-full rounded-lg" />
                    </TableCell>
                  </TableRow>
                ))
              ) : paginatedData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-40 text-center text-muted-foreground text-xs">
                    No institutions match the current search filters.
                  </TableCell>
                </TableRow>
              ) : (
                paginatedData.map((inst) => (
                  <TableRow key={inst.id} className="border-b border-border/40 hover:bg-muted/15 transition-colors h-14">
                    <TableCell className="pl-5">
                      <div className="flex items-center gap-3">
                        <div className="size-8 rounded-xl bg-muted/60 border border-border/70 flex items-center justify-center overflow-hidden shrink-0 relative">
                          {inst.logo_url ? (
                            <Image src={inst.logo_url} alt="" fill unoptimized className="object-cover" />
                          ) : (
                            <Building2 className="size-4 text-muted-foreground/70" />
                          )}
                        </div>
                        <div>
                          <p className="font-semibold text-xs text-foreground leading-tight">{inst.name}</p>
                          <p className="text-[10px] text-muted-foreground">ID: {inst.id.slice(0, 8)}...</p>
                        </div>
                      </div>
                    </TableCell>

                    <TableCell>
                      <Badge variant="outline" className="font-mono text-[10px] px-2 py-0.5 rounded-md border-border">
                        {inst.code}
                      </Badge>
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Globe className="size-3.5 shrink-0" />
                        <span>{inst.timezone || "UTC"}</span>
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            "size-2 rounded-full",
                            inst.is_active ? "bg-emerald-500 ring-2 ring-emerald-500/20" : "bg-amber-500 ring-2 ring-amber-500/20"
                          )}
                        />
                        <span className="text-xs font-medium text-foreground">
                          {inst.is_active ? "Active" : "Suspended"}
                        </span>
                      </div>
                    </TableCell>

                    <TableCell className="text-right pr-5">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-lg hover:bg-muted cursor-pointer"
                            disabled={isProcessing === inst.id}
                          >
                            {isProcessing === inst.id ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <MoreVertical className="size-3.5 text-muted-foreground" />
                            )}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48 rounded-xl p-1 shadow-lg">
                          <DropdownMenuLabel className="text-[10px] font-medium text-muted-foreground px-2 py-1">
                            Partner Settings
                          </DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-xs cursor-pointer py-1.5 rounded-lg"
                            onClick={() => handleConfigure(inst)}
                          >
                            <Settings className="mr-2 size-3.5 text-muted-foreground" />
                            Configuration
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-xs cursor-pointer py-1.5 rounded-lg"
                            onClick={() => handleBranding(inst)}
                          >
                            <ImageIcon className="mr-2 size-3.5 text-muted-foreground" />
                            Logo & Branding
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className={cn(
                              "text-xs font-medium cursor-pointer py-1.5 rounded-lg",
                              inst.is_active
                                ? "text-amber-600 focus:text-amber-600 focus:bg-amber-500/10"
                                : "text-emerald-600 focus:text-emerald-600 focus:bg-emerald-500/10"
                            )}
                            onClick={() => handleToggleStatus(inst)}
                          >
                            {inst.is_active ? (
                              <>
                                <PowerOff className="mr-2 size-3.5" /> Suspend Access
                              </>
                            ) : (
                              <>
                                <Power className="mr-2 size-3.5" /> Activate Partner
                              </>
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
        </div>

        {/* Integrated Pagination Footer */}
        <div className="p-3 sm:px-5 bg-muted/10 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Showing{" "}
            <strong>
              {filteredAndSorted.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}
            </strong>{" "}
            to <strong>{Math.min(currentPage * pageSize, filteredAndSorted.length)}</strong> of{" "}
            <strong>{filteredAndSorted.length}</strong> partners
          </span>

          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="icon"
              className="size-7.5 rounded-lg cursor-pointer"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="text-xs font-mono font-medium px-2">
              {currentPage} / {totalPages || 1}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="size-7.5 rounded-lg cursor-pointer"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Registration Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold tracking-tight">Register Institution</DialogTitle>
            <DialogDescription className="text-xs">
              Add a verified educational organization into the multi-tenant system.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="inst-name" className="text-xs font-semibold">
                  Name
                </Label>
                <Input
                  id="inst-name"
                  placeholder="e.g. University of Rwanda"
                  className="h-9 text-xs"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inst-code" className="text-xs font-semibold">
                  Identifier Code
                </Label>
                <Input
                  id="inst-code"
                  placeholder="e.g. UR"
                  className="h-9 text-xs font-mono uppercase"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="inst-tz" className="text-xs font-semibold">
                Operating Timezone
              </Label>
              <Input
                id="inst-tz"
                value={formData.timezone}
                placeholder="Africa/Kigali or UTC"
                className="h-9 text-xs"
                onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Institution Logo</Label>
              <div className="flex items-center gap-3">
                <div className="size-14 rounded-xl border border-dashed border-border flex flex-col items-center justify-center bg-muted/20 hover:bg-muted/40 transition-colors relative overflow-hidden cursor-pointer shrink-0">
                  {logoFile ? (
                    <Image
                      src={URL.createObjectURL(logoFile)}
                      alt="Preview"
                      fill
                      unoptimized
                      className="object-cover"
                    />
                  ) : (
                    <Upload className="size-4 text-muted-foreground" />
                  )}
                  <input
                    type="file"
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    accept="image/*"
                    onChange={(e) => setLogoFile(e.target.files?.[0] || null)}
                  />
                </div>
                <div className="flex-1 space-y-1">
                  <Input
                    placeholder="Or enter logo image URL..."
                    className="h-8.5 text-xs"
                    value={formData.logo_url}
                    onChange={(e) => setFormData({ ...formData, logo_url: e.target.value })}
                  />
                  <p className="text-[10px] text-muted-foreground">PNG, SVG or JPG (Square recommended)</p>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => setCreateDialogOpen(false)} className="h-8.5 text-xs">
              Cancel
            </Button>
            <Button size="sm" onClick={handleCreate} disabled={isCreating} className="h-8.5 px-4 text-xs font-semibold">
              {isCreating && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Complete Registration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Configuration Dialog */}
      <Dialog open={isSettingsDialogOpen} onOpenChange={setIsSettingsDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold tracking-tight">Configure Institution</DialogTitle>
            <DialogDescription className="text-xs">Update institutional identity and time standards.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="cfg-name" className="text-xs font-semibold">
                Institution Name
              </Label>
              <Input
                id="cfg-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="h-9 text-xs"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cfg-code" className="text-xs font-semibold">
                  Code
                </Label>
                <Input id="cfg-code" value={formData.code} disabled className="h-9 text-xs font-mono opacity-60" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cfg-tz" className="text-xs font-semibold">
                  Timezone
                </Label>
                <Input
                  id="cfg-tz"
                  value={formData.timezone}
                  onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                  className="h-9 text-xs"
                />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => setIsSettingsDialogOpen(false)} className="h-8.5 text-xs">
              Cancel
            </Button>
            <Button size="sm" onClick={handleUpdate} disabled={isCreating} className="h-8.5 px-4 text-xs font-semibold">
              {isCreating && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Branding Dialog */}
      <Dialog open={isBrandingDialogOpen} onOpenChange={setIsBrandingDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold tracking-tight">Institutional Branding</DialogTitle>
            <DialogDescription className="text-xs">Update visual brand identity and crest.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4 flex flex-col items-center">
            <div className="size-24 rounded-2xl border border-dashed border-border flex flex-col items-center justify-center bg-muted/20 hover:bg-muted/40 transition-colors relative overflow-hidden cursor-pointer group">
              {logoFile ? (
                <Image src={URL.createObjectURL(logoFile)} alt="Preview" fill unoptimized className="object-cover" />
              ) : formData.logo_url ? (
                <Image src={formData.logo_url} alt="Current" fill unoptimized className="object-cover" />
              ) : (
                <Upload className="size-6 text-muted-foreground" />
              )}
              <input
                type="file"
                className="absolute inset-0 opacity-0 cursor-pointer"
                accept="image/*"
                onChange={(e) => setLogoFile(e.target.files?.[0] || null)}
              />
            </div>
            <div className="w-full space-y-1.5">
              <Label htmlFor="brand-url" className="text-xs font-semibold">
                Image Web URL
              </Label>
              <Input
                id="brand-url"
                placeholder="https://..."
                value={formData.logo_url}
                onChange={(e) => setFormData({ ...formData, logo_url: e.target.value })}
                className="h-9 text-xs"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" size="sm" onClick={() => setIsBrandingDialogOpen(false)} className="h-8.5 text-xs">
              Cancel
            </Button>
            <Button size="sm" onClick={handleUpdate} disabled={isCreating} className="h-8.5 px-4 text-xs font-semibold">
              {isCreating && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Update Brand
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
