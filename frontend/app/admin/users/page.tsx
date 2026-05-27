"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Loader2,
  GraduationCap,
  Building2,
  Shield,
  Eye,
  Lock,
  UserCheck,
} from "lucide-react";
import { adminApi, UserResponse, AdminUserCreate } from "@/lib/api/admin";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { AnimatePresence, motion } from "framer-motion";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const pageSize = 10;

  // Selection State
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(
    new Set(),
  );

  // Dialog States
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isViewDetailsOpen, setIsViewDetailsOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserResponse | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isProcessingUser, setIsProcessingUser] = useState<string | null>(null);

  // New User Form State
  const [newUser, setNewUser] = useState<AdminUserCreate>({
    email: "",
    password: "",
    first_name: "",
    last_name: "",
    role: "STUDENT",
    status: "ACTIVE",
    email_verified: true,
    staff_id: "",
    student_id: "",
    college: "",
    department: "",
  });

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminApi.getUsers(currentPage, pageSize);

      setUsers(data.items);
      setTotalUsers(data.total);
    } catch (err) {
      console.error("Failed to load users", err);
      toast.error("Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [currentPage, pageSize, roleFilter, statusFilter]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const name =
        `${user.profile?.first_name || ""} ${user.profile?.last_name || ""}`.toLowerCase();
      const email = user.email.toLowerCase();
      return (
        name.includes(searchTerm.toLowerCase()) ||
        email.includes(searchTerm.toLowerCase())
      );
    });
  }, [users, searchTerm]);

  const toggleSelectAll = () => {
    if (
      selectedUserIds.size === filteredUsers.length &&
      filteredUsers.length > 0
    ) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredUsers.map((u) => u.id)));
    }
  };

  const setSelectedIds = (ids: Set<string>) => setSelectedUserIds(ids);

  const toggleSelectUser = (userId: string) => {
    const next = new Set(selectedUserIds);
    if (next.has(userId)) next.delete(userId);
    else next.add(userId);
    setSelectedIds(next);
  };

  const handleBulkApprove = async () => {
    if (selectedUserIds.size === 0) return;
    setIsSubmitting(true);
    try {
      await adminApi.bulkApproveUsers(Array.from(selectedUserIds));
      toast.success(`Successfully approved ${selectedUserIds.size} users`);
      setSelectedIds(new Set());
      loadUsers();
    } catch (err) {
      toast.error("Failed to perform bulk approval");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBulkStatusUpdate = async (status: string) => {
    if (selectedUserIds.size === 0) return;
    setIsSubmitting(true);
    try {
      await adminApi.bulkUpdateUserStatus(Array.from(selectedUserIds), status);
      toast.success(
        `Successfully updated ${selectedUserIds.size} users to ${status}`,
      );
      setSelectedIds(new Set());
      loadUsers();
    } catch (err) {
      toast.error("Failed to perform bulk status update");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApprove = async (userId: string) => {
    setIsProcessingUser(userId);
    try {
      await adminApi.approveUser(userId, "ACTIVE");
      toast.success("User approved successfully");
      loadUsers();
    } catch (err) {
      toast.error("Failed to approve user");
    } finally {
      setIsProcessingUser(null);
    }
  };

  const handleStatusUpdate = async (userId: string, status: string) => {
    setIsProcessingUser(userId);
    try {
      await adminApi.updateUserStatus(userId, status);
      toast.success(`User ${status.toLowerCase()} successfully`);
      loadUsers();
    } catch (err) {
      toast.error(`Failed to ${status.toLowerCase()} user`);
    } finally {
      setIsProcessingUser(null);
    }
  };

  const handleAddUser = async () => {
    if (
      !newUser.email ||
      !newUser.password ||
      !newUser.first_name ||
      !newUser.last_name
    ) {
      toast.error("Please fill in all required fields");
      return;
    }

    setIsSubmitting(true);
    try {
      await adminApi.createUser(newUser);
      toast.success("User account registered successfully");
      setIsAddDialogOpen(false);
      setNewUser({
        email: "",
        password: "",
        first_name: "",
        last_name: "",
        role: "STUDENT",
        status: "ACTIVE",
        email_verified: true,
        staff_id: "",
        student_id: "",
        college: "",
        department: "",
      });
      loadUsers();
    } catch (err: any) {
      toast.error(err.message || "Failed to create user");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 relative pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Users & Permissions
          </h1>
          <p className="text-muted-foreground text-xs font-medium">
            Platform-wide account governance and role assignment
          </p>
        </div>
        <Button
          size="sm"
          className="rounded-full px-5 h-9 gap-2 shadow-none"
          onClick={() => setIsAddDialogOpen(true)}
        >
          <UserPlus className="size-3.5" /> Register Account
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {[
          {
            label: "Total Accounts",
            value: totalUsers,
            icon: Users,
            color: "text-primary",
          },
          {
            label: "Awaiting Approval",
            value: users.filter((u) => u.status === "PENDING_APPROVAL").length,
            icon: UserCheck,
            color: "text-amber-600",
          },
          {
            label: "Active Nodes",
            value: users.filter((u) => u.status === "ACTIVE").length,
            icon: CheckCircle,
            color: "text-emerald-600",
          },
          {
            label: "Suspended",
            value: users.filter((u) => u.status === "SUSPENDED").length,
            icon: Lock,
            color: "text-destructive",
          },
        ].map((stat, i) => (
          <Card
            key={i}
            className="border shadow-none rounded-xl bg-background/50 overflow-hidden"
          >
            <CardContent className="px-4 py-3 flex flex-col gap-0.5">
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                {stat.label}
              </p>
              <h3
                className={cn(
                  "text-xl font-semibold leading-tight",
                  stat.color,
                )}
              >
                {stat.value}
              </h3>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Bulk Actions Bar */}
      <AnimatePresence>
        {selectedUserIds.size > 0 && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-background border shadow-2xl rounded-full px-6 py-2.5 flex items-center gap-6"
          >
            <div className="flex items-center gap-2 pr-6 border-r border-muted-foreground/20">
              <span className="bg-primary text-primary-foreground size-5 rounded-full flex items-center justify-center text-[10px] font-semibold">
                {selectedUserIds.size}
              </span>
              <span className="text-[11px] font-bold uppercase tracking-tight text-muted-foreground">
                Accounts Selected
              </span>
            </div>

            <div className="flex items-center gap-3">
              <Button
                size="sm"
                variant="outline"
                className="rounded-full h-8 px-4 border-emerald-100 text-emerald-700 hover:bg-emerald-50 text-[10px] font-bold uppercase"
                onClick={handleBulkApprove}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  "Processing..."
                ) : (
                  <>
                    <CheckCircle className="mr-2 size-3" /> Approve Access
                  </>
                )}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="rounded-full h-8 px-4 border-red-100 text-red-700 hover:bg-red-50 text-[10px] font-bold uppercase"
                onClick={() => handleBulkStatusUpdate("SUSPENDED")}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  "Processing..."
                ) : (
                  <>
                    <Lock className="mr-2 size-3" /> Suspend
                  </>
                )}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="rounded-full h-8 px-4 text-[10px] font-bold uppercase"
                onClick={() => setSelectedIds(new Set())}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="md:col-span-2 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            placeholder="Search accounts by name or email..."
            className="pl-9 h-9 text-xs rounded-xl border-muted/50 bg-background focus-visible:ring-1"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="h-9 rounded-xl border-muted/50 bg-background text-xs">
            <SelectValue placeholder="All Roles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">
              All Roles
            </SelectItem>
            <SelectItem
              value="ADMIN"
              className="text-xs text-primary font-semibold"
            >
              Administrator
            </SelectItem>
            <SelectItem value="COORDINATOR" className="text-xs font-semibold">
              Coordinator
            </SelectItem>
            <SelectItem
              value="LECTURER"
              className="text-xs font-semibold text-blue-600"
            >
              Lecturer
            </SelectItem>
            <SelectItem value="REVIEWER" className="text-xs">
              Reviewer
            </SelectItem>
            <SelectItem value="SUPERVISOR" className="text-xs">
              Supervisor
            </SelectItem>
            <SelectItem value="STUDENT" className="text-xs">
              Student
            </SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 rounded-xl border-muted/50 bg-background text-xs">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">
              All Status
            </SelectItem>
            <SelectItem value="ACTIVE" className="text-xs">
              Active
            </SelectItem>
            <SelectItem value="PENDING_APPROVAL" className="text-xs">
              Pending Approval
            </SelectItem>
            <SelectItem value="SUSPENDED" className="text-xs">
              Suspended
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="border shadow-none overflow-hidden rounded-2xl">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow className="hover:bg-transparent border-none">
                <TableHead className="w-[40px] h-10 px-4">
                  <Checkbox
                    checked={
                      selectedUserIds.size === filteredUsers.length &&
                      filteredUsers.length > 0
                    }
                    onCheckedChange={toggleSelectAll}
                  />
                </TableHead>
                <TableHead className="text-[10px] uppercase font-bold tracking-wider h-10">
                  Account Holder
                </TableHead>
                <TableHead className="text-[10px] uppercase font-bold tracking-wider h-10">
                  Role
                </TableHead>
                <TableHead className="text-[10px] uppercase font-bold tracking-wider h-10">
                  Status
                </TableHead>
                <TableHead className="text-[10px] uppercase font-bold tracking-wider h-10">
                  Institutional Scope
                </TableHead>
                <TableHead className="text-right text-[10px] uppercase font-bold tracking-wider h-10 pr-4">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                [1, 2, 3, 4, 5].map((i) => (
                  <TableRow key={i} className="h-14 border-muted/10">
                    <TableCell colSpan={6}>
                      <Skeleton className="h-6 w-full rounded-lg" />
                    </TableCell>
                  </TableRow>
                ))
              ) : filteredUsers.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="h-32 text-center text-muted-foreground text-xs italic"
                  >
                    No matching accounts found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredUsers.map((user) => (
                  <TableRow
                    key={user.id}
                    className={cn(
                      "group transition-colors h-14 border-muted/10",
                      selectedUserIds.has(user.id) && "bg-muted/30",
                    )}
                  >
                    <TableCell className="px-4">
                      <Checkbox
                        checked={selectedUserIds.has(user.id)}
                        onCheckedChange={() => toggleSelectUser(user.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <div className="size-8 rounded-full bg-muted flex items-center justify-center font-semibold text-[10px] text-muted-foreground border shrink-0">
                          {user.profile?.first_name?.[0] ||
                            user.email[0].toUpperCase()}
                        </div>
                        <div className="flex flex-col">
                          <span className="font-semibold text-xs leading-tight text-foreground/90">
                            {user.profile
                              ? `${user.profile.first_name} ${user.profile.last_name}`
                              : "UNINITIALIZED"}
                          </span>
                          <span className="text-[10px] text-muted-foreground font-medium">
                            {user.email}
                          </span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          "rounded-full px-2 py-0 text-[9px] font-semibold h-4.5 border uppercase",
                          user.role === "ADMIN" &&
                            "border-primary text-primary bg-primary/5",
                          user.role === "COORDINATOR" &&
                            "border-amber-400 text-amber-700 bg-amber-50/50",
                          user.role === "LECTURER" &&
                            "border-blue-400 text-blue-600 bg-blue-50/50",
                          user.role === "STUDENT" && "text-muted-foreground",
                        )}
                      >
                        {user.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={cn(
                          "rounded-full px-2 py-0 text-[9px] font-semibold h-4.5 border uppercase",
                          user.status === "ACTIVE" &&
                            "bg-emerald-50 text-emerald-700 border-emerald-200",
                          user.status === "PENDING_APPROVAL" &&
                            "bg-amber-50 text-amber-700 border-amber-200",
                          user.status === "SUSPENDED" &&
                            "bg-red-50 text-red-700 border-red-200",
                        )}
                      >
                        {user.status.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-foreground/70 uppercase tracking-tighter truncate max-w-[150px]">
                          {user.profile?.department || "N/A"}
                        </span>
                        <span className="text-[8px] font-medium text-muted-foreground uppercase tracking-widest">
                          {user.profile?.college || "GENERAL SCOPE"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right pr-4">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="rounded-full h-8 w-8 hover:bg-muted/80"
                            disabled={isProcessingUser === user.id}
                          >
                            {isProcessingUser === user.id ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <MoreVertical className="size-3.5" />
                            )}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          className="w-44 rounded-xl shadow-xl border-muted/20 p-1"
                        >
                          <DropdownMenuLabel className="text-[9px] font-semibold uppercase text-muted-foreground px-2 py-1.5 tracking-tighter italic">
                            Account Control
                          </DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-[11px] font-medium py-2 rounded-lg cursor-pointer"
                            onClick={() => {
                              setSelectedUser(user);
                              setIsViewDetailsOpen(true);
                            }}
                          >
                            <Eye className="mr-2 size-3.5 text-muted-foreground" />{" "}
                            View Profile
                          </DropdownMenuItem>

                          {user.role === "LECTURER" && (
                            <DropdownMenuItem
                              className="text-[11px] font-bold text-primary py-2 rounded-lg cursor-pointer"
                              asChild
                            >
                              <Link
                                href={`/admin/academic/assignments?lecturer_id=${user.id}`}
                              >
                                <GraduationCap className="mr-2 size-3.5" />{" "}
                                Assign Teaching
                              </Link>
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          {user.status === "PENDING_APPROVAL" && (
                            <DropdownMenuItem
                              onClick={() => handleApprove(user.id)}
                              className="text-[11px] font-bold text-emerald-600 py-2 rounded-lg cursor-pointer"
                            >
                              {isProcessingUser === user.id ? (
                                <Loader2 className="mr-2 size-3.5 animate-spin" />
                              ) : (
                                <UserCheck className="mr-2 size-3.5" />
                              )}
                              Approve Access
                            </DropdownMenuItem>
                          )}
                          {user.status === "ACTIVE" && (
                            <DropdownMenuItem
                              onClick={() =>
                                handleStatusUpdate(user.id, "SUSPENDED")
                              }
                              className="text-[11px] font-bold text-destructive py-2 rounded-lg cursor-pointer"
                            >
                              {isProcessingUser === user.id ? (
                                <Loader2 className="mr-2 size-3.5 animate-spin" />
                              ) : (
                                <Lock className="mr-2 size-3.5" />
                              )}
                              Suspend Account
                            </DropdownMenuItem>
                          )}
                          {user.status === "SUSPENDED" && (
                            <DropdownMenuItem
                              onClick={() =>
                                handleStatusUpdate(user.id, "ACTIVE")
                              }
                              className="text-[11px] font-bold text-emerald-600 py-2 rounded-lg cursor-pointer"
                            >
                              {isProcessingUser === user.id ? (
                                <Loader2 className="mr-2 size-3.5 animate-spin" />
                              ) : (
                                <ShieldCheck className="mr-2 size-3.5" />
                              )}
                              Reactivate
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
        <div className="p-2.5 bg-muted/5 border-t flex items-center justify-between">
          <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-tighter">
            PAGE {currentPage} OF {Math.ceil(totalUsers / pageSize) || 1}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="size-7 rounded-lg"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((p) => p - 1)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 rounded-lg"
              disabled={currentPage * pageSize >= totalUsers}
              onClick={() => setCurrentPage((p) => p + 1)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </Card>

      {/* Add User Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Register New Account</DialogTitle>
            <DialogDescription className="text-xs">
              Manually provision a platform user with institutional scope.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="firstName" className="text-xs">
                  First Name
                </Label>
                <Input
                  id="firstName"
                  placeholder="John"
                  className="h-9 text-xs"
                  value={newUser.first_name}
                  onChange={(e) =>
                    setNewUser({ ...newUser, first_name: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lastName" className="text-xs">
                  Last Name
                </Label>
                <Input
                  id="lastName"
                  placeholder="Doe"
                  className="h-9 text-xs"
                  value={newUser.last_name}
                  onChange={(e) =>
                    setNewUser({ ...newUser, last_name: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs">
                  Institutional Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="john.doe@university.ac"
                  className="h-9 text-xs"
                  value={newUser.email}
                  onChange={(e) =>
                    setNewUser({ ...newUser, email: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs">
                  Initial Security Key
                </Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  className="h-9 text-xs"
                  value={newUser.password}
                  onChange={(e) =>
                    setNewUser({ ...newUser, password: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="role" className="text-xs">
                  Functional Role
                </Label>
                <Select
                  value={newUser.role}
                  onValueChange={(v) => setNewUser({ ...newUser, role: v })}
                >
                  <SelectTrigger id="role" className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="STUDENT" className="text-xs">
                      Student
                    </SelectItem>
                    <SelectItem value="LECTURER" className="text-xs">
                      Lecturer
                    </SelectItem>
                    <SelectItem value="COORDINATOR" className="text-xs">
                      Coordinator
                    </SelectItem>
                    <SelectItem value="REVIEWER" className="text-xs">
                      Reviewer
                    </SelectItem>
                    <SelectItem value="SUPERVISOR" className="text-xs">
                      Supervisor
                    </SelectItem>
                    <SelectItem value="ADMIN" className="text-xs">
                      Global Administrator
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="status" className="text-xs">
                  Onboarding Status
                </Label>
                <Select
                  value={newUser.status}
                  onValueChange={(v) => setNewUser({ ...newUser, status: v })}
                >
                  <SelectTrigger id="status" className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE" className="text-xs">
                      Active Registry
                    </SelectItem>
                    <SelectItem value="PENDING_APPROVAL" className="text-xs">
                      Awaiting Approval
                    </SelectItem>
                    <SelectItem
                      value="SUSPENDED"
                      className="text-xs text-destructive"
                    >
                      Locked / Suspended
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator className="my-2" />
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground italic">
              Institutional Context
            </p>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="college" className="text-xs">
                  College / Faculty
                </Label>
                <Input
                  id="college"
                  placeholder="Science & Technology"
                  className="h-9 text-xs"
                  value={newUser.college || ""}
                  onChange={(e) =>
                    setNewUser({ ...newUser, college: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dept" className="text-xs">
                  Academic Department
                </Label>
                <Input
                  id="dept"
                  placeholder="Computer Science"
                  className="h-9 text-xs"
                  value={newUser.department || ""}
                  onChange={(e) =>
                    setNewUser({ ...newUser, department: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="sid" className="text-xs">
                  Staff ID (Optional)
                </Label>
                <Input
                  id="sid"
                  placeholder="L-1002"
                  className="h-9 text-xs font-mono"
                  value={newUser.staff_id || ""}
                  onChange={(e) =>
                    setNewUser({ ...newUser, staff_id: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="stuid" className="text-xs">
                  Student Reg # (Optional)
                </Label>
                <Input
                  id="stuid"
                  placeholder="S22019"
                  className="h-9 text-xs font-mono"
                  value={newUser.student_id || ""}
                  onChange={(e) =>
                    setNewUser({ ...newUser, student_id: e.target.value })
                  }
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsAddDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleAddUser}
              disabled={isSubmitting}
              className="px-6"
            >
              {isSubmitting ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <UserPlus className="mr-2 size-3.5" />
              )}
              Finalize Provisioning
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Details Dialog */}
      <Dialog open={isViewDetailsOpen} onOpenChange={setIsViewDetailsOpen}>
        <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto rounded-3xl border shadow-2xl">
          <DialogHeader className="border-b pb-4">
            <DialogTitle className="text-lg font-semibold tracking-tight">Account Intelligence</DialogTitle>
            <DialogDescription className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
              Registry Audit Node Overview
            </DialogDescription>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-6 py-4">
              {/* Identity Header */}
              <div className="flex items-center gap-4 bg-muted/20 p-4 rounded-2xl border border-muted/30">
                <div className="size-14 rounded-full bg-muted flex items-center justify-center font-semibold text-xl text-muted-foreground border shrink-0">
                  {selectedUser.profile?.first_name?.[0] || selectedUser.email[0].toUpperCase()}
                </div>
                <div className="space-y-0.5 flex-1 min-w-0">
                  <h3 className="text-base font-semibold tracking-tight truncate">
                    {selectedUser.profile ? `${selectedUser.profile.first_name} ${selectedUser.profile.last_name}` : "UNINITIALIZED"}
                  </h3>
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Mail className="size-3 text-primary/60" />
                    <span className="text-xs font-medium truncate">{selectedUser.email}</span>
                  </div>
                  <div className="flex gap-2 pt-1.5">
                    <Badge variant="outline" className="rounded-full text-[9px] font-bold uppercase bg-background border-muted/50 text-muted-foreground/80 h-4.5 px-2">{selectedUser.role}</Badge>
                    <Badge 
                      variant="secondary"
                      className={cn(
                        "bg-transparent border rounded-full text-[9px] font-bold uppercase h-4.5 px-2",
                        selectedUser.status === "ACTIVE" && "border-emerald-200 text-emerald-700 bg-emerald-50/30",
                        selectedUser.status === "PENDING_APPROVAL" && "border-amber-200 text-amber-700 bg-amber-50/30",
                        selectedUser.status === "SUSPENDED" && "border-red-200 text-red-700 bg-red-50/30"
                      )}
                    >
                      {selectedUser.status.replace("_", " ")}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Data Grid */}
              <div className="grid grid-cols-2 gap-x-8 gap-y-5 px-1">
                {/* Institutional Locus - Primary Info */}
                <div className="col-span-2 space-y-1.5 pb-2 border-b">
                  <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest flex items-center gap-2">
                    <Building2 className="size-3" /> Institutional Context
                  </p>
                  <div className="flex flex-col">
                    <p className="text-sm font-semibold text-foreground/90 uppercase">
                      {selectedUser.profile?.department || "No Department Assigned"}
                    </p>
                    <p className="text-[11px] font-medium text-muted-foreground/80 uppercase tracking-wider">
                      {selectedUser.profile?.college || "Global Scope"}
                    </p>
                  </div>
                </div>

                <div className="space-y-1">
                  <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Global ID</p>
                  <p className="text-xs font-mono font-medium truncate text-primary/70">{selectedUser.id}</p>
                </div>
                
                <div className="space-y-1 text-right">
                  <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Verification</p>
                  <p className="text-xs font-semibold flex items-center justify-end gap-1.5 text-foreground/80">
                    {selectedUser.email_verified ? (
                      <><ShieldCheck className="size-3.5 text-emerald-500" /> VERIFIED TRUST</>
                    ) : (
                      <><XCircle className="size-3.5 text-muted-foreground/40" /> UNVERIFIED</>
                    )}
                  </p>
                </div>

                <div className="space-y-1">
                  <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Onboarded</p>
                  <p className="text-xs font-medium text-foreground/80">{new Date(selectedUser.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}</p>
                </div>

                <div className="space-y-1 text-right">
                  <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Last Login</p>
                  <p className="text-xs font-medium text-foreground/80">{selectedUser.last_login_at ? new Date(selectedUser.last_login_at).toLocaleString() : "NEVER"}</p>
                </div>

                {/* Role Specifics */}
                {selectedUser.role === "STUDENT" && (
                  <div className="col-span-2 grid grid-cols-2 gap-8 pt-4 border-t border-dashed">
                    <div className="space-y-1">
                      <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Student Reg ID</p>
                      <p className="text-xs font-mono font-bold text-primary">{selectedUser.profile?.student_id || "N/A"}</p>
                    </div>
                    <div className="space-y-1 text-right">
                      <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Academic Level</p>
                      <p className="text-xs font-semibold uppercase">{selectedUser.profile?.level} Year {selectedUser.profile?.year}</p>
                    </div>
                  </div>
                )}

                {(selectedUser.role === "LECTURER" || selectedUser.role === "COORDINATOR") && (
                  <div className="col-span-2 grid grid-cols-2 gap-8 pt-4 border-t border-dashed">
                    <div className="space-y-1">
                      <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Staff / Official ID</p>
                      <p className="text-xs font-mono font-bold text-primary uppercase">{selectedUser.profile?.staff_id || "N/A"}</p>
                    </div>
                    <div className="space-y-1 text-right">
                      <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Teaching Load</p>
                      <div className="flex flex-wrap gap-1 justify-end">
                        {selectedUser.profile?.assigned_courses?.map(c => (
                          <Badge key={c} variant="secondary" className="text-[9px] font-semibold h-4 px-1.5">{c}</Badge>
                        )) || <span className="text-[10px] italic text-muted-foreground">No modules assigned</span>}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter className="border-t pt-4 gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsViewDetailsOpen(false)}
              className="text-[10px] font-bold uppercase tracking-tight"
            >
              Close Record
            </Button>
            {selectedUser?.status === "PENDING_APPROVAL" && (
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-[10px] font-bold uppercase px-6" onClick={() => {
                handleApprove(selectedUser.id);
                setIsViewDetailsOpen(false);
              }}>Approve Access</Button>
            )}
            {selectedUser?.status === "ACTIVE" && (
              <Button size="sm" variant="outline" className="text-[10px] font-bold uppercase px-6 border-red-200 text-red-700 hover:bg-red-50" onClick={() => {
                handleStatusUpdate(selectedUser.id, "SUSPENDED");
                setIsViewDetailsOpen(false);
              }}>Suspend User</Button>
            )}
            {selectedUser?.status === "SUSPENDED" && (
              <Button size="sm" className="bg-primary text-[10px] font-bold uppercase px-6" onClick={() => {
                handleStatusUpdate(selectedUser.id, "ACTIVE");
                setIsViewDetailsOpen(false);
              }}>Reactivate Account</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
