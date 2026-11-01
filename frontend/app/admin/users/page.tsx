"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  UserPlus,
  Accessibility,
  Download,
  ShieldCheck,
} from "lucide-react";
import {
  adminApi,
  UserResponse,
  AdminUserCreate,
  AdminAccommodationsUpdate,
} from "@/lib/api/admin";
import { toast } from "sonner";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

import { RoleFilter, StatusFilter, ViewMode, UserStats } from "@/components/mindexa/admin/users/types";
import { UserStatsCards } from "@/components/mindexa/admin/users/user-stats-cards";
import { UserFiltersBar } from "@/components/mindexa/admin/users/user-filters-bar";
import { UserDirectoryTable } from "@/components/mindexa/admin/users/user-directory-table";
import { UserGridView } from "@/components/mindexa/admin/users/user-grid-view";
import { UserDetailSheet } from "@/components/mindexa/admin/users/user-detail-sheet";
import { AddUserDialog } from "@/components/mindexa/admin/users/add-user-dialog";
import { AccommodationsDialog } from "@/components/mindexa/admin/users/accommodations-dialog";
import { AccommodationsTabView } from "@/components/mindexa/admin/users/accommodations-tab-view";
import { BulkActionsToolbar } from "@/components/mindexa/admin/users/bulk-actions-toolbar";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const pageSize = 10;

  // Filter and View states
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [activeTab, setActiveTab] = useState<"directory" | "accommodations">("directory");

  // Selection state for bulk operations
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());

  // Modal / Sheet Dialog states
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isDetailSheetOpen, setIsDetailSheetOpen] = useState(false);
  const [selectedUserForDetails, setSelectedUserForDetails] = useState<UserResponse | null>(null);
  const [isAccommodationsDialogOpen, setIsAccommodationsDialogOpen] = useState(false);
  const [selectedUserForAccommodations, setSelectedUserForAccommodations] = useState<UserResponse | null>(null);

  // Loading & Submission states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [processingUserId, setProcessingUserId] = useState<string | null>(null);

  // Fetch Users
  const loadUsers = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setIsRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const data = await adminApi.getUsers(currentPage, pageSize);
      setUsers(data.items);
      setTotalUsers(data.total);
    } catch (err: any) {
      console.error("Failed to load users", err);
      toast.error(err?.message || "Failed to load user directory");
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [currentPage, pageSize]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // Real-time computed stats across loaded users
  const userStats = useMemo<UserStats>(() => {
    return {
      total: totalUsers,
      pending: users.filter((u) => u.status === "PENDING_APPROVAL").length,
      active: users.filter((u) => u.status === "ACTIVE").length,
      suspended: users.filter((u) => u.status === "SUSPENDED").length,
      students: users.filter((u) => u.role === "STUDENT").length,
      faculty: users.filter((u) => u.role === "LECTURER" || u.role === "COORDINATOR").length,
    };
  }, [users, totalUsers]);

  // Accommodations count badge for tab
  const accommodatedStudentsCount = useMemo(() => {
    return users.filter(
      (u) =>
        u.role === "STUDENT" &&
        ((u.profile?.extra_time_percent || 0) > 0 ||
          u.profile?.requires_screen_reader_mode ||
          u.profile?.simple_mode_enabled)
    ).length;
  }, [users]);

  // Filtered Users computation
  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      // Search filter
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const fullName = `${user.profile?.first_name || ""} ${user.profile?.last_name || ""}`.toLowerCase();
        const email = user.email.toLowerCase();
        const studentId = (user.profile?.student_id || "").toLowerCase();
        const staffId = (user.profile?.staff_id || "").toLowerCase();
        const dept = (user.profile?.department || "").toLowerCase();

        const matches =
          fullName.includes(query) ||
          email.includes(query) ||
          studentId.includes(query) ||
          staffId.includes(query) ||
          dept.includes(query);

        if (!matches) return false;
      }

      // Role filter
      if (roleFilter !== "all" && user.role !== roleFilter) {
        return false;
      }

      // Status filter
      if (statusFilter !== "all" && user.status !== statusFilter) {
        return false;
      }

      return true;
    });
  }, [users, searchTerm, roleFilter, statusFilter]);

  // Selection handlers
  const handleToggleSelectAll = () => {
    if (selectedUserIds.size === filteredUsers.length && filteredUsers.length > 0) {
      setSelectedUserIds(new Set());
    } else {
      setSelectedUserIds(new Set(filteredUsers.map((u) => u.id)));
    }
  };

  const handleToggleSelectUser = (userId: string) => {
    const next = new Set(selectedUserIds);
    if (next.has(userId)) {
      next.delete(userId);
    } else {
      next.add(userId);
    }
    setSelectedUserIds(next);
  };

  // Bulk actions
  const handleBulkApprove = async () => {
    if (selectedUserIds.size === 0) return;
    setIsSubmitting(true);
    try {
      await adminApi.bulkApproveUsers(Array.from(selectedUserIds));
      toast.success(`Successfully approved ${selectedUserIds.size} accounts`);
      setSelectedUserIds(new Set());
      loadUsers();
    } catch (err: any) {
      toast.error(err?.message || "Failed to perform bulk approval");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBulkSuspend = async () => {
    if (selectedUserIds.size === 0) return;
    setIsSubmitting(true);
    try {
      await adminApi.bulkUpdateUserStatus(Array.from(selectedUserIds), "SUSPENDED");
      toast.success(`Successfully suspended ${selectedUserIds.size} accounts`);
      setSelectedUserIds(new Set());
      loadUsers();
    } catch (err: any) {
      toast.error(err?.message || "Failed to perform bulk suspension");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Single user status actions
  const handleApproveUser = async (userId: string) => {
    setProcessingUserId(userId);
    try {
      await adminApi.approveUser(userId, "ACTIVE");
      toast.success("Account approved successfully");
      loadUsers();
    } catch (err: any) {
      toast.error(err?.message || "Failed to approve account");
    } finally {
      setProcessingUserId(null);
    }
  };

  const handleStatusUpdate = async (userId: string, status: string) => {
    setProcessingUserId(userId);
    try {
      await adminApi.updateUserStatus(userId, status);
      toast.success(`Account marked as ${status.toLowerCase()}`);
      loadUsers();
    } catch (err: any) {
      toast.error(err?.message || `Failed to update status to ${status.toLowerCase()}`);
    } finally {
      setProcessingUserId(null);
    }
  };

  // Add User
  const handleAddUser = async (newUser: AdminUserCreate) => {
    setIsSubmitting(true);
    try {
      await adminApi.createUser(newUser);
      toast.success("Account registered and provisioned successfully");
      setIsAddDialogOpen(false);
      loadUsers();
    } catch (err: any) {
      toast.error(err?.message || "Failed to provision new account");
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  // Accommodations update
  const handleSaveAccommodations = async (userId: string, data: AdminAccommodationsUpdate) => {
    setIsSubmitting(true);
    try {
      const updatedProfile = await adminApi.updateAccommodations(userId, data);
      toast.success("Accommodations saved and audit trail recorded");
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId
            ? {
                ...u,
                profile: {
                  ...u.profile,
                  ...updatedProfile,
                  extra_time_percent: data.extra_time_percent,
                  requires_screen_reader_mode: data.requires_screen_reader_mode,
                  simple_mode_enabled: data.simple_mode_enabled,
                  large_text_default: data.large_text_default,
                  reduced_motion_default: data.reduced_motion_default,
                  accommodations_note: data.reason,
                  updated_at: new Date().toISOString(),
                } as any,
              }
            : u
        )
      );
      setIsAccommodationsDialogOpen(false);
      setSelectedUserForAccommodations(null);
    } catch (err: any) {
      toast.error(err?.message || "Failed to save accommodations");
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  // Export filtered users to CSV
  const handleExportCsv = () => {
    if (filteredUsers.length === 0) {
      toast.error("No accounts to export with current filters");
      return;
    }
    const headers = [
      "User ID",
      "Email",
      "Role",
      "Status",
      "First Name",
      "Last Name",
      "Department",
      "College",
      "Student ID",
      "Staff ID",
      "Email Verified",
      "Registered Date",
    ];

    const rows = filteredUsers.map((u) => [
      u.id,
      u.email,
      u.role,
      u.status,
      u.profile?.first_name || "",
      u.profile?.last_name || "",
      u.profile?.department || "",
      u.profile?.college || "",
      u.profile?.student_id || "",
      u.profile?.staff_id || "",
      u.email_verified ? "Yes" : "No",
      u.created_at,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [
        headers.join(","),
        ...rows.map((row) =>
          row
            .map((val) => `"${String(val).replace(/"/g, '""')}"`)
            .join(",")
        ),
      ].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `mindexa-users-registry-${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`Exported ${filteredUsers.length} accounts to CSV`);
  };

  return (
    <div data-tour="admin-users" className="space-y-4 sm:space-y-4.5 pb-24 relative max-w-7xl mx-auto">
      {/* Executive Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card border border-border/70 rounded-2xl p-4 sm:px-5 sm:py-4 shadow-2xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-foreground">
              Users &amp; Permissions
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Registry Active
            </span>
            <Badge variant="outline" className="rounded-full text-[10px] font-semibold px-2 py-0 border-border/80 text-muted-foreground">
              {totalUsers} Total
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Platform-wide governance, role assignments, and assessment accommodation settings
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCsv}
            className="h-9 px-3 rounded-xl gap-1.5 text-xs font-semibold border-border/80 hover:bg-muted/60 transition-colors shadow-2xs"
            title="Export filtered accounts as CSV"
          >
            <Download className="size-3.5" />
            <span className="hidden sm:inline">Export CSV</span>
          </Button>

          <Button
            size="sm"
            onClick={() => setIsAddDialogOpen(true)}
            className="h-9 px-3.5 rounded-xl gap-1.5 text-xs font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-2xs transition-all hover:shadow-xs active:scale-[0.98]"
          >
            <UserPlus className="size-3.5" /> Register Account
          </Button>
        </div>
      </div>

      {/* Tabs Navigation */}
      <Tabs
        value={activeTab}
        onValueChange={(val) => setActiveTab(val as "directory" | "accommodations")}
        className="w-full space-y-4"
      >
        <div className="flex items-center justify-between border-b border-border/60 pb-2">
          <TabsList className="h-9 p-0.5 rounded-xl bg-muted/60 border border-border/50">
            <TabsTrigger value="directory" className="text-xs gap-2 rounded-lg font-semibold px-3 sm:px-4">
              <Users className="size-3.5" /> User Directory
            </TabsTrigger>
            <TabsTrigger
              value="accommodations"
              data-tour="admin-accommodations"
              className="text-xs gap-2 rounded-lg font-semibold px-3 sm:px-4"
            >
              <Accessibility className="size-3.5" /> Accommodations &amp; Timing
              {accommodatedStudentsCount > 0 && (
                <Badge
                  variant="secondary"
                  className="ml-1 text-[10px] font-bold px-1.5 py-0 h-4 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20"
                >
                  {accommodatedStudentsCount}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Directory Tab Content */}
        <TabsContent value="directory" className="space-y-4 m-0 focus-visible:outline-none">
          {/* Sleek, Compact Key Metrics Overview */}
          <UserStatsCards
            stats={userStats}
            currentStatusFilter={statusFilter}
            onSelectStatusFilter={(status) => {
              setStatusFilter((prev) => (prev === status ? "all" : status));
            }}
            loading={loading}
          />

          {/* Search & Filter Toolbar with Quick Filters */}
          <UserFiltersBar
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            roleFilter={roleFilter}
            onRoleFilterChange={setRoleFilter}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            onRefresh={() => loadUsers(true)}
            isRefreshing={isRefreshing}
            totalFilteredCount={filteredUsers.length}
          />

          {/* Table or Grid View */}
          {viewMode === "table" ? (
            <UserDirectoryTable
              users={filteredUsers}
              loading={loading}
              selectedUserIds={selectedUserIds}
              onToggleSelectAll={handleToggleSelectAll}
              onToggleSelectUser={handleToggleSelectUser}
              onViewUser={(user) => {
                setSelectedUserForDetails(user);
                setIsDetailSheetOpen(true);
              }}
              onApproveUser={handleApproveUser}
              onStatusUpdate={handleStatusUpdate}
              processingUserId={processingUserId}
              currentPage={currentPage}
              totalUsers={totalUsers}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
            />
          ) : (
            <UserGridView
              users={filteredUsers}
              selectedUserIds={selectedUserIds}
              onToggleSelectUser={handleToggleSelectUser}
              onViewUser={(user) => {
                setSelectedUserForDetails(user);
                setIsDetailSheetOpen(true);
              }}
              onApproveUser={handleApproveUser}
              onStatusUpdate={handleStatusUpdate}
              processingUserId={processingUserId}
            />
          )}
        </TabsContent>

        {/* Accommodations Tab Content */}
        <TabsContent value="accommodations" className="space-y-4 m-0 focus-visible:outline-none">
          <AccommodationsTabView
            users={users}
            onOpenAccommodationsModal={(user) => {
              setSelectedUserForAccommodations(user);
              setIsAccommodationsDialogOpen(true);
            }}
          />
        </TabsContent>
      </Tabs>

      {/* Floating Bulk Actions Dock */}
      <BulkActionsToolbar
        selectedCount={selectedUserIds.size}
        onBulkApprove={handleBulkApprove}
        onBulkSuspend={handleBulkSuspend}
        onClearSelection={() => setSelectedUserIds(new Set())}
        isSubmitting={isSubmitting}
      />

      {/* User Details Slide-over Drawer */}
      <UserDetailSheet
        user={selectedUserForDetails}
        isOpen={isDetailSheetOpen}
        onOpenChange={setIsDetailSheetOpen}
        onApproveUser={handleApproveUser}
        onStatusUpdate={handleStatusUpdate}
        onEditAccommodations={(user) => {
          setIsDetailSheetOpen(false);
          setSelectedUserForAccommodations(user);
          setIsAccommodationsDialogOpen(true);
        }}
        isProcessing={processingUserId === selectedUserForDetails?.id}
      />

      {/* Register User Dialog */}
      <AddUserDialog
        isOpen={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        onSubmit={handleAddUser}
        isSubmitting={isSubmitting}
      />

      {/* Accommodations & Timing Dialog */}
      <AccommodationsDialog
        user={selectedUserForAccommodations}
        isOpen={isAccommodationsDialogOpen}
        onOpenChange={setIsAccommodationsDialogOpen}
        onSave={handleSaveAccommodations}
        isSaving={isSubmitting}
      />
    </div>
  );
}
