"use client"

import { useEffect, useState, useMemo, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { 
  Users, 
  UserPlus, 
  CheckCircle, 
  XCircle, 
  Search, 
  Filter, 
  MoreVertical,
  ChevronLeft,
  ChevronRight,
  Mail,
  ShieldCheck,
  UserCog,
  Loader2
} from "lucide-react"
import { adminApi, UserResponse, AdminUserCreate } from "@/lib/api/admin"
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [roleFilter, setRoleFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [currentPage, setCurrentPage] = useState(1)
  const [totalUsers, setTotalUsers] = useState(0)
  const pageSize = 10

  // Dialog States
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isViewDetailsOpen, setIsViewDetailsOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<UserResponse | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // New User Form State
  const [newUser, setNewUser] = useState<AdminUserCreate>({
    email: "",
    password: "",
    first_name: "",
    last_name: "",
    role: "STUDENT",
    status: "ACTIVE",
    email_verified: true,
  })

  const loadUsers = useCallback(async () => {
    setLoading(true)
    try {
      const data = await adminApi.getUsers(currentPage, pageSize)
      setUsers(data.items)
      setTotalUsers(data.total)
    } catch (err) {
      console.error("Failed to load users", err)
      toast.error("Failed to load users")
    } finally {
      setLoading(false)
    }
  }, [currentPage, pageSize])

  useEffect(() => {
    loadUsers()
  }, [loadUsers])

  const filteredUsers = useMemo(() => {
    return users.filter(user => {
      const name = `${user.profile?.first_name || ""} ${user.profile?.last_name || ""}`.toLowerCase()
      const email = user.email.toLowerCase()
      const matchesSearch = name.includes(searchTerm.toLowerCase()) || email.includes(searchTerm.toLowerCase())
      const matchesRole = roleFilter === "all" || user.role === roleFilter
      const matchesStatus = statusFilter === "all" || user.status === statusFilter
      return matchesSearch && matchesRole && matchesStatus
    })
  }, [users, searchTerm, roleFilter, statusFilter])

  const handleApprove = async (userId: string) => {
    try {
      await adminApi.approveUser(userId, "ACTIVE")
      toast.success("User approved successfully")
      loadUsers()
    } catch (err) {
      toast.error("Failed to approve user")
    }
  }

  const handleStatusUpdate = async (userId: string, status: string) => {
    try {
      await adminApi.updateUserStatus(userId, status)
      toast.success(`User ${status.toLowerCase()} successfully`)
      loadUsers()
    } catch (err) {
      toast.error(`Failed to ${status.toLowerCase()} user`)
    }
  }

  const handleAddUser = async () => {
    if (!newUser.email || !newUser.password || !newUser.first_name || !newUser.last_name) {
      toast.error("Please fill in all required fields")
      return
    }

    setIsSubmitting(true)
    try {
      await adminApi.createUser(newUser)
      toast.success("User created successfully")
      setIsAddDialogOpen(false)
      setNewUser({
        email: "",
        password: "",
        first_name: "",
        last_name: "",
        role: "STUDENT",
        status: "ACTIVE",
        email_verified: true,
      })
      loadUsers()
    } catch (err: any) {
      toast.error(err.message || "Failed to create user")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Users & Roles</h1>
          <p className="text-muted-foreground text-sm">Manage all platform users and permissions</p>
        </div>
        <Button className="rounded-lg px-5 h-9" onClick={() => setIsAddDialogOpen(true)}>
          <UserPlus className="mr-2 size-4" /> Add User
        </Button>
      </div>

      {/* Add User Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Add New User</DialogTitle>
            <DialogDescription>
              Create a new user account manually.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name</Label>
                <Input 
                  id="firstName" 
                  placeholder="John" 
                  value={newUser.first_name}
                  onChange={(e) => setNewUser({...newUser, first_name: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input 
                  id="lastName" 
                  placeholder="Doe" 
                  value={newUser.last_name}
                  onChange={(e) => setNewUser({...newUser, last_name: e.target.value})}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input 
                id="email" 
                type="email" 
                placeholder="john.doe@university.ac" 
                value={newUser.email}
                onChange={(e) => setNewUser({...newUser, email: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Initial Password</Label>
              <Input 
                id="password" 
                type="password" 
                placeholder="••••••••" 
                value={newUser.password}
                onChange={(e) => setNewUser({...newUser, password: e.target.value})}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="role">User Role</Label>
                <Select 
                  value={newUser.role} 
                  onValueChange={(v) => setNewUser({...newUser, role: v})}
                >
                  <SelectTrigger id="role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="STUDENT">Student</SelectItem>
                    <SelectItem value="LECTURER">Lecturer</SelectItem>
                    <SelectItem value="ADMIN">Administrator</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Initial Status</Label>
                <Select 
                  value={newUser.status} 
                  onValueChange={(v) => setNewUser({...newUser, status: v})}
                >
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="PENDING_APPROVAL">Pending Approval</SelectItem>
                    <SelectItem value="SUSPENDED">Suspended</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAddUser} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Details Dialog */}
      <Dialog open={isViewDetailsOpen} onOpenChange={setIsViewDetailsOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>User Details</DialogTitle>
            <DialogDescription>
              Comprehensive information about the user account.
            </DialogDescription>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-6 py-4">
              <div className="flex items-center gap-4 border-b pb-6">
                <div className="size-16 rounded-full bg-muted flex items-center justify-center font-bold text-2xl text-muted-foreground">
                  {selectedUser.profile?.first_name?.[0] || selectedUser.email[0].toUpperCase()}
                </div>
                <div className="space-y-1">
                  <h3 className="text-xl font-bold">
                    {selectedUser.profile ? `${selectedUser.profile.first_name} ${selectedUser.profile.last_name}` : "No Profile"}
                  </h3>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Mail className="size-3.5" />
                    <span className="text-sm">{selectedUser.email}</span>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Badge variant="outline">{selectedUser.role}</Badge>
                    <Badge 
                      variant="secondary"
                      className={cn(
                        "bg-transparent border",
                        selectedUser.status === "ACTIVE" && "border-emerald-200 text-emerald-700",
                        selectedUser.status === "PENDING_APPROVAL" && "border-amber-200 text-amber-700",
                        selectedUser.status === "SUSPENDED" && "border-red-200 text-red-700"
                      )}
                    >
                      {selectedUser.status}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-y-6 gap-x-12">
                <div className="space-y-1">
                  <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">User ID</p>
                  <p className="text-sm font-mono truncate">{selectedUser.id}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Joined Date</p>
                  <p className="text-sm">{new Date(selectedUser.created_at).toLocaleString()}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Email Verified</p>
                  <p className="text-sm flex items-center gap-2">
                    {selectedUser.email_verified ? (
                      <><ShieldCheck className="size-4 text-emerald-500" /> Yes</>
                    ) : (
                      <><XCircle className="size-4 text-muted-foreground/40" /> No</>
                    )}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Last Login</p>
                  <p className="text-sm">{selectedUser.last_login_at ? new Date(selectedUser.last_login_at).toLocaleString() : "Never"}</p>
                </div>

                {selectedUser.role === "STUDENT" && (
                  <>
                    <div className="space-y-1">
                      <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Student ID</p>
                      <p className="text-sm">{selectedUser.profile?.student_id || "N/A"}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Academic Level</p>
                      <p className="text-sm">{selectedUser.profile?.level} Year {selectedUser.profile?.year}</p>
                    </div>
                  </>
                )}

                {selectedUser.role === "LECTURER" && (
                  <>
                    <div className="space-y-1">
                      <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Staff ID</p>
                      <p className="text-sm">{selectedUser.profile?.staff_id || "N/A"}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Assigned Courses</p>
                      <div className="flex flex-wrap gap-1">
                        {selectedUser.profile?.assigned_courses?.map(c => (
                          <Badge key={c} variant="secondary" className="text-[10px]">{c}</Badge>
                        )) || "None"}
                      </div>
                    </div>
                  </>
                )}

                <div className="space-y-1 col-span-2">
                  <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Department & College</p>
                  <p className="text-sm">{selectedUser.profile?.department} • {selectedUser.profile?.college}</p>
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="border-t pt-4">
             <Button variant="ghost" onClick={() => setIsViewDetailsOpen(false)}>Close</Button>
             {selectedUser?.status === "PENDING_APPROVAL" && (
               <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => {
                 handleApprove(selectedUser.id);
                 setIsViewDetailsOpen(false);
               }}>Approve User</Button>
             )}
             {selectedUser?.status === "ACTIVE" && (
               <Button variant="destructive" onClick={() => {
                 handleStatusUpdate(selectedUser.id, "SUSPENDED");
                 setIsViewDetailsOpen(false);
               }}>Suspend Account</Button>
             )}
             {selectedUser?.status === "SUSPENDED" && (
               <Button className="bg-primary" onClick={() => {
                 handleStatusUpdate(selectedUser.id, "ACTIVE");
                 setIsViewDetailsOpen(false);
               }}>Reactivate Account</Button>
             )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="md:col-span-2 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input 
            placeholder="Search by name or email..." 
            className="pl-9 h-9 rounded-lg border focus-visible:ring-1"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="h-9 rounded-lg border">
            <SelectValue placeholder="All Roles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            <SelectItem value="ADMIN">Administrator</SelectItem>
            <SelectItem value="LECTURER">Lecturer</SelectItem>
            <SelectItem value="STUDENT">Student</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 rounded-lg border">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="PENDING_APPROVAL">Pending</SelectItem>
            <SelectItem value="SUSPENDED">Suspended</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="border shadow-none overflow-hidden">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[280px] h-10">User</TableHead>
                <TableHead className="h-10">Role</TableHead>
                <TableHead className="h-10">Status</TableHead>
                <TableHead className="h-10">Verified</TableHead>
                <TableHead className="h-10">Joined</TableHead>
                <TableHead className="text-right h-10">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                [1, 2, 3, 4, 5].map(i => (
                  <TableRow key={i}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Skeleton className="size-8 rounded-full" />
                        <div className="space-y-1">
                          <Skeleton className="h-3 w-24" />
                          <Skeleton className="h-2 w-32" />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell><Skeleton className="h-3 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-3 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-3 w-3" /></TableCell>
                    <TableCell><Skeleton className="h-3 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-7 w-7 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : filteredUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground text-sm">
                    No users found matching your criteria.
                  </TableCell>
                </TableRow>
              ) : (
                filteredUsers.map((user) => (
                  <TableRow key={user.id} className="group transition-colors h-14">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="size-8 rounded-full bg-muted flex items-center justify-center font-semibold text-xs text-muted-foreground">
                          {user.profile?.first_name?.[0] || user.email[0].toUpperCase()}
                        </div>
                        <div className="flex flex-col">
                          <span className="font-medium text-sm leading-tight">
                            {user.profile ? `${user.profile.first_name} ${user.profile.last_name}` : "No Profile"}
                          </span>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            {user.email}
                          </span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant="outline" 
                        className={cn(
                          "rounded-md px-2 py-0 text-[10px] font-semibold h-5",
                          user.role === "ADMIN" && "border-primary text-primary",
                          user.role === "LECTURER" && "border-blue-400 text-blue-600",
                          user.role === "STUDENT" && "text-muted-foreground"
                        )}
                      >
                        {user.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant="secondary"
                        className={cn(
                          "rounded-md px-2 py-0 text-[10px] font-semibold h-5 bg-transparent border",
                          user.status === "ACTIVE" && "border-emerald-200 text-emerald-700",
                          user.status === "PENDING_APPROVAL" && "border-amber-200 text-amber-700",
                          user.status === "SUSPENDED" && "border-red-200 text-red-700"
                        )}
                      >
                        {user.status.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {user.email_verified ? (
                        <ShieldCheck className="size-4 text-emerald-500" />
                      ) : (
                        <XCircle className="size-4 text-muted-foreground/40" />
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(user.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="rounded-md h-7 w-7">
                            <MoreVertical className="size-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40 rounded-lg">
                          <DropdownMenuItem 
                            className="text-xs"
                            onClick={() => {
                              setSelectedUser(user);
                              setIsViewDetailsOpen(true);
                            }}
                          >
                            <UserCog className="mr-2 size-3.5" /> View details
                          </DropdownMenuItem>
                          {user.status === "PENDING_APPROVAL" && (
                            <DropdownMenuItem onClick={() => handleApprove(user.id)} className="text-xs text-emerald-600">
                              <CheckCircle className="mr-2 size-3.5" /> Approve
                            </DropdownMenuItem>
                          )}
                          {user.status === "ACTIVE" && (
                            <DropdownMenuItem onClick={() => handleStatusUpdate(user.id, "SUSPENDED")} className="text-xs text-destructive">
                              <XCircle className="mr-2 size-3.5" /> Suspend
                            </DropdownMenuItem>
                          )}
                          {user.status === "SUSPENDED" && (
                            <DropdownMenuItem onClick={() => handleStatusUpdate(user.id, "ACTIVE")} className="text-xs text-emerald-600">
                              <CheckCircle className="mr-2 size-3.5" /> Reactivate
                            </DropdownMenuItem>
                          )}
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
          Showing <strong>{filteredUsers.length}</strong> of <strong>{totalUsers}</strong> users
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
            disabled={currentPage * pageSize >= totalUsers}
            onClick={() => setCurrentPage(prev => prev + 1)}
          >
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  )
}