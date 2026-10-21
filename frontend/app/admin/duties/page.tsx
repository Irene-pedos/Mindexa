"use client"

// app/admin/duties/page.tsx
// Assign and deactivate institutional duties (spec §5.1). Duties are never
// deleted — deactivation keeps the audit trail.

import { useCallback, useEffect, useMemo, useState } from "react"
import { format } from "date-fns"
import { toast } from "sonner"
import { BadgeCheck, Loader2, Plus, Search, UserCog, XCircle } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
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
import { academicApi, AcademicCampus, AcademicDepartment, AcademicInstitution } from "@/lib/api/academic"
import type { UserResponse } from "@/lib/api/admin"
import {
  DUTY_LABELS,
  DutyAssignment,
  DutyType,
  dutyApi,
  dutyNeedsDepartment,
} from "@/lib/api/duty"

const DUTY_TYPES: DutyType[] = ["MODERATOR", "EXAM_OFFICER", "DEPARTMENT_HEAD"]
const NONE = "none"

type StatusFilter = "active" | "inactive" | "all"

type AssignForm = {
  duty: DutyType
  user_id: string
  institution_id: string
  campus_id: string
  department_id: string
  valid_to: string
}

const emptyForm = (institutionId = ""): AssignForm => ({
  duty: "MODERATOR",
  user_id: "",
  institution_id: institutionId,
  campus_id: NONE,
  department_id: "",
  valid_to: "",
})

function staffName(user: UserResponse): string {
  const p = user.profile
  const name = p?.display_name || [p?.first_name, p?.last_name].filter(Boolean).join(" ")
  return name || user.email
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback
}

export default function AdminDutiesPage() {
  const [duties, setDuties] = useState<DutyAssignment[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active")
  const [dutyFilter, setDutyFilter] = useState<DutyType | "all">("all")
  const [search, setSearch] = useState("")

  const [staffQuery, setStaffQuery] = useState("")
  const [staffResults, setStaffResults] = useState<UserResponse[]>([])
  const [staffLoading, setStaffLoading] = useState(false)
  const [selectedStaff, setSelectedStaff] = useState<UserResponse | null>(null)
  const [institutions, setInstitutions] = useState<AcademicInstitution[]>([])
  const [campuses, setCampuses] = useState<AcademicCampus[]>([])
  const [departments, setDepartments] = useState<AcademicDepartment[]>([])

  const [assignOpen, setAssignOpen] = useState(false)
  const [form, setForm] = useState<AssignForm>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [toDeactivate, setToDeactivate] = useState<DutyAssignment | null>(null)
  const [deactivating, setDeactivating] = useState(false)

  const loadDuties = useCallback(async () => {
    setLoading(true)
    try {
      const data = await dutyApi.list({
        is_active: statusFilter === "all" ? undefined : statusFilter === "active",
        duty: dutyFilter === "all" ? undefined : dutyFilter,
      })
      setDuties(data)
    } catch (err) {
      toast.error(errorMessage(err, "Failed to load duty assignments"))
    } finally {
      setLoading(false)
    }
  }, [statusFilter, dutyFilter])

  useEffect(() => {
    loadDuties()
  }, [loadDuties])

  // Reference data for the assign dialog
  useEffect(() => {
    academicApi
      .getInstitutions()
      .then(setInstitutions)
      .catch((err) => toast.error(errorMessage(err, "Failed to load institutions")))
  }, [])

  // Debounced server-side staff search. Moderator / HOD must be lecturers;
  // exam officer may also be an admin (spec §5.1).
  useEffect(() => {
    if (!assignOpen) return
    let cancelled = false
    const timer = setTimeout(async () => {
      setStaffLoading(true)
      try {
        const roles: ("LECTURER" | "ADMIN")[] = dutyNeedsDepartment(form.duty)
          ? ["LECTURER"]
          : ["LECTURER", "ADMIN"]
        const pages = await Promise.all(roles.map((r) => dutyApi.searchStaff(r, staffQuery)))
        if (!cancelled) setStaffResults(pages.flatMap((p) => p.items))
      } catch (err) {
        if (!cancelled) toast.error(errorMessage(err, "Failed to search staff"))
      } finally {
        if (!cancelled) setStaffLoading(false)
      }
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [assignOpen, staffQuery, form.duty])

  useEffect(() => {
    if (!form.institution_id) {
      setCampuses([])
      setDepartments([])
      return
    }
    const campusId = form.campus_id === NONE ? undefined : form.campus_id
    Promise.all([
      academicApi.getCampuses(form.institution_id),
      academicApi.getDepartments({ institution_id: form.institution_id, campus_id: campusId }),
    ])
      .then(([camp, dept]) => {
        setCampuses(camp)
        setDepartments(dept)
      })
      .catch(() => toast.error("Failed to load campuses and departments"))
  }, [form.institution_id, form.campus_id])

  const visibleDuties = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return duties
    return duties.filter((d) =>
      [d.user_name, d.user_email, d.department_name, d.institution_name]
        .some((v) => v?.toLowerCase().includes(term)),
    )
  }, [duties, search])

  const openAssign = () => {
    setForm(emptyForm(institutions[0]?.id ?? ""))
    setStaffQuery("")
    setSelectedStaff(null)
    setAssignOpen(true)
  }

  const selectStaff = (user: UserResponse | null) => {
    setSelectedStaff(user)
    setForm((f) => ({ ...f, user_id: user?.id ?? "" }))
  }

  const handleAssign = async () => {
    const needsDept = dutyNeedsDepartment(form.duty)
    if (!form.user_id || !form.institution_id || (needsDept && !form.department_id)) {
      toast.error(needsDept ? "Select a staff member, institution and department" : "Select a staff member and institution")
      return
    }
    setSaving(true)
    try {
      await dutyApi.assign({
        duty: form.duty,
        user_id: form.user_id,
        institution_id: form.institution_id,
        campus_id: form.campus_id === NONE ? null : form.campus_id,
        department_id: needsDept ? form.department_id : null,
        valid_to: form.valid_to ? new Date(`${form.valid_to}T23:59:59`).toISOString() : null,
      })
      toast.success(`${DUTY_LABELS[form.duty]} duty assigned`)
      setAssignOpen(false)
      loadDuties()
    } catch (err) {
      toast.error(errorMessage(err, "Failed to assign duty"))
    } finally {
      setSaving(false)
    }
  }

  const handleDeactivate = async () => {
    if (!toDeactivate) return
    setDeactivating(true)
    try {
      await dutyApi.deactivate(toDeactivate.id)
      toast.success("Duty deactivated")
      setToDeactivate(null)
      loadDuties()
    } catch (err) {
      toast.error(errorMessage(err, "Failed to deactivate duty"))
    } finally {
      setDeactivating(false)
    }
  }

  const scopeLabel = (d: DutyAssignment) =>
    d.department_name || d.campus_name || `${d.institution_name ?? "Institution"} (all)`

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 border-b border-muted/20 pb-4">
        <div>
          <h1 className="text-xl font-semibold text-primary tracking-tight flex items-center gap-2">
            <UserCog className="size-5" />
            Staff Duties
          </h1>
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest mt-0.5">
            Moderators, exam officers & heads of department
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Select value={dutyFilter} onValueChange={(v) => setDutyFilter(v as DutyType | "all")}>
            <SelectTrigger className="w-[170px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All duties</SelectItem>
              {DUTY_TYPES.map((d) => (
                <SelectItem key={d} value={d} className="text-xs">{DUTY_LABELS[d]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="w-[130px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active" className="text-xs">Active</SelectItem>
              <SelectItem value="inactive" className="text-xs">Inactive</SelectItem>
              <SelectItem value="all" className="text-xs">All</SelectItem>
            </SelectContent>
          </Select>
          <Button
            size="sm"
            className="h-8 rounded-lg gap-2 font-semibold text-[10px] uppercase tracking-wider px-4 shadow-none"
            onClick={openAssign}
          >
            <Plus className="size-3.5" />
            Assign Duty
          </Button>
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden bg-card border border-border/60 rounded-2xl shadow-none">
        <div className="p-3 border-b border-muted/10 bg-muted/5">
          <div className="relative w-full max-w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              placeholder="Search staff or department..."
              className="pl-8 h-8 text-[11px] rounded-lg"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <Table>
            <TableHeader className="bg-muted/5 sticky top-0 z-10 backdrop-blur-sm">
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-[9px] uppercase font-semibold tracking-widest h-8 pl-5">Staff member</TableHead>
                <TableHead className="text-[9px] uppercase font-semibold tracking-widest h-8">Duty</TableHead>
                <TableHead className="text-[9px] uppercase font-semibold tracking-widest h-8">Scope</TableHead>
                <TableHead className="text-[9px] uppercase font-semibold tracking-widest h-8">Valid</TableHead>
                <TableHead className="text-[9px] uppercase font-semibold tracking-widest h-8">Status</TableHead>
                <TableHead className="text-right text-[9px] uppercase font-semibold tracking-widest h-8 pr-5">Manage</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                [1, 2, 3, 4].map((i) => (
                  <TableRow key={i} className="h-10">
                    <TableCell colSpan={6} className="px-5"><Skeleton className="h-5 w-full rounded-md" /></TableCell>
                  </TableRow>
                ))
              ) : visibleDuties.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-48 text-center">
                    <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                      <BadgeCheck className="size-6" />
                      <p className="text-xs font-medium">No duty assignments found</p>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={openAssign}>
                        Assign the first duty
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                visibleDuties.map((d) => (
                  <TableRow key={d.id} className="h-11 hover:bg-muted/5">
                    <TableCell className="pl-5">
                      <div className="text-[11px] font-medium">{d.user_name || d.user_email}</div>
                      {d.user_name && <div className="text-[10px] text-muted-foreground">{d.user_email}</div>}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[9px] uppercase font-semibold">
                        {DUTY_LABELS[d.duty]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-[11px]">{scopeLabel(d)}</TableCell>
                    <TableCell className="text-[11px] text-muted-foreground">
                      {format(new Date(d.valid_from), "dd MMM yyyy")}
                      {" → "}
                      {d.valid_to ? format(new Date(d.valid_to), "dd MMM yyyy") : "no end"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={d.is_active ? "default" : "secondary"} className="text-[9px]">
                        {d.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right pr-5">
                      {d.is_active && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-[11px] text-destructive hover:text-destructive"
                          onClick={() => setToDeactivate(d)}
                        >
                          <XCircle className="size-3.5 mr-1" />
                          Deactivate
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Assign dialog */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Assign duty</DialogTitle>
            <DialogDescription>
              Moderators and heads of department must be lecturer accounts. Staff who
              don&apos;t teach get a duty-only workspace automatically.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label className="text-xs">Duty</Label>
              <Select
                value={form.duty}
                onValueChange={(v) => {
                  setForm((f) => ({ ...f, duty: v as DutyType, user_id: "", department_id: "" }))
                  setSelectedStaff(null)
                }}
              >
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DUTY_TYPES.map((d) => (
                    <SelectItem key={d} value={d}>{DUTY_LABELS[d]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="staff-search" className="text-xs">Staff member</Label>
              {selectedStaff ? (
                <div className="flex items-center justify-between rounded-md border px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{staffName(selectedStaff)}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {selectedStaff.email} · {selectedStaff.role === "ADMIN" ? "Admin" : "Lecturer"}
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => selectStaff(null)}>
                    Change
                  </Button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                    <Input
                      id="staff-search"
                      placeholder="Search by name or email..."
                      className="h-9 pl-8 text-sm"
                      value={staffQuery}
                      onChange={(e) => setStaffQuery(e.target.value)}
                      autoComplete="off"
                    />
                    {staffLoading && (
                      <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 size-3.5 animate-spin text-muted-foreground" />
                    )}
                  </div>
                  <div role="listbox" aria-label="Matching staff" className="max-h-44 overflow-y-auto rounded-md border">
                    {staffResults.length === 0 ? (
                      <p className="px-3 py-3 text-xs text-muted-foreground">
                        {staffLoading ? "Searching..." : "No matching staff"}
                      </p>
                    ) : (
                      staffResults.map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          role="option"
                          aria-selected={false}
                          onClick={() => selectStaff(u)}
                          className="flex w-full flex-col items-start px-3 py-1.5 text-left hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
                        >
                          <span className="text-sm">{staffName(u)}</span>
                          <span className="text-xs text-muted-foreground">
                            {u.email} · {u.role === "ADMIN" ? "Admin" : "Lecturer"}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                  {!dutyNeedsDepartment(form.duty) && (
                    <p className="text-[11px] text-muted-foreground">Exam officers may be lecturers or admins.</p>
                  )}
                </>
              )}
            </div>

            <div className="grid gap-1.5">
              <Label className="text-xs">Institution</Label>
              <Select
                value={form.institution_id}
                onValueChange={(v) => setForm((f) => ({ ...f, institution_id: v, campus_id: NONE, department_id: "" }))}
              >
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select institution" /></SelectTrigger>
                <SelectContent>
                  {institutions.map((i) => (
                    <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label className="text-xs">Campus {dutyNeedsDepartment(form.duty) ? "(filters departments)" : "(optional)"}</Label>
              <Select
                value={form.campus_id}
                onValueChange={(v) => setForm((f) => ({ ...f, campus_id: v, department_id: "" }))}
              >
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>All campuses</SelectItem>
                  {campuses.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {dutyNeedsDepartment(form.duty) && (
              <div className="grid gap-1.5">
                <Label className="text-xs">Department</Label>
                <Select value={form.department_id} onValueChange={(v) => setForm((f) => ({ ...f, department_id: v }))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select department" /></SelectTrigger>
                  <SelectContent>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid gap-1.5">
              <Label className="text-xs">Valid until (optional)</Label>
              <Input
                type="date"
                className="h-9 text-sm"
                value={form.valid_to}
                onChange={(e) => setForm((f) => ({ ...f, valid_to: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleAssign} disabled={saving}>
              {saving && <Loader2 className="size-4 mr-2 animate-spin" />}
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivate confirmation */}
      <Dialog open={toDeactivate !== null} onOpenChange={(open) => !open && setToDeactivate(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Deactivate duty?</DialogTitle>
            <DialogDescription>
              {toDeactivate && (
                <>
                  {toDeactivate.user_name || toDeactivate.user_email} will lose{" "}
                  {DUTY_LABELS[toDeactivate.duty]} access for {scopeLabel(toDeactivate)} immediately.
                  The assignment is kept in the history.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setToDeactivate(null)} disabled={deactivating}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeactivate} disabled={deactivating}>
              {deactivating && <Loader2 className="size-4 mr-2 animate-spin" />}
              Deactivate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
