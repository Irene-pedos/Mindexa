"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { UserPlus, Loader2 } from "lucide-react";
import { AdminUserCreate } from "@/lib/api/admin";
import { toast } from "sonner";

interface AddUserDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: AdminUserCreate) => Promise<void>;
  isSubmitting?: boolean;
}

export function AddUserDialog({
  isOpen,
  onOpenChange,
  onSubmit,
  isSubmitting = false,
}: AddUserDialogProps) {
  const [formData, setFormData] = useState<AdminUserCreate>({
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !formData.email.trim() ||
      !formData.password ||
      !formData.first_name.trim() ||
      !formData.last_name.trim()
    ) {
      toast.error("Please fill in all required account fields (Name, Email, Password)");
      return;
    }

    try {
      await onSubmit(formData);
      setFormData({
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
    } catch {
      // Error handled by parent toast
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto p-6 rounded-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <div className="size-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <UserPlus className="size-4.5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold tracking-tight text-foreground">
                Provision New Account
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Manually register an institutional user with verified identity scope.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {/* Identity Section */}
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="firstName" className="text-xs font-semibold">
                  First Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="firstName"
                  placeholder="e.g. Jane"
                  value={formData.first_name}
                  onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                  className="h-9 text-xs rounded-xl"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lastName" className="text-xs font-semibold">
                  Last Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="lastName"
                  placeholder="e.g. Mukamana"
                  value={formData.last_name}
                  onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                  className="h-9 text-xs rounded-xl"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs font-semibold">
                  Institutional Email <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="jane.mukamana@ur.ac.rw"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="h-9 text-xs rounded-xl"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs font-semibold">
                  Initial Password <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="h-9 text-xs rounded-xl"
                  required
                />
              </div>
            </div>
          </div>

          <Separator className="bg-border/60" />

          {/* Role and Status Section */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="role" className="text-xs font-semibold">
                Functional Role
              </Label>
              <Select
                value={formData.role}
                onValueChange={(val) => setFormData({ ...formData, role: val })}
              >
                <SelectTrigger id="role" className="h-9 text-xs rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="STUDENT" className="text-xs">
                    Student
                  </SelectItem>
                  <SelectItem value="LECTURER" className="text-xs font-medium text-sky-600 dark:text-sky-400">
                    Lecturer
                  </SelectItem>
                  <SelectItem value="COORDINATOR" className="text-xs font-medium text-purple-600 dark:text-purple-400">
                    Coordinator
                  </SelectItem>
                  <SelectItem value="REVIEWER" className="text-xs font-medium text-indigo-600 dark:text-indigo-400">
                    Reviewer
                  </SelectItem>
                  <SelectItem value="SUPERVISOR" className="text-xs font-medium text-amber-600 dark:text-amber-400">
                    Supervisor
                  </SelectItem>
                  <SelectItem value="ADMIN" className="text-xs font-semibold text-primary">
                    Administrator
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="status" className="text-xs font-semibold">
                Initial Status
              </Label>
              <Select
                value={formData.status}
                onValueChange={(val) => setFormData({ ...formData, status: val })}
              >
                <SelectTrigger id="status" className="h-9 text-xs rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE" className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                    Active
                  </SelectItem>
                  <SelectItem value="PENDING_APPROVAL" className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                    Pending Approval
                  </SelectItem>
                  <SelectItem value="SUSPENDED" className="text-xs text-rose-600 dark:text-rose-400 font-medium">
                    Suspended
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator className="bg-border/60" />

          {/* Institutional Placement */}
          <div className="space-y-3">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Institutional Placement
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="college" className="text-xs font-semibold">
                  College / Faculty
                </Label>
                <Input
                  id="college"
                  placeholder="e.g. Science & Technology"
                  value={formData.college || ""}
                  onChange={(e) => setFormData({ ...formData, college: e.target.value })}
                  className="h-9 text-xs rounded-xl"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="department" className="text-xs font-semibold">
                  Department
                </Label>
                <Input
                  id="department"
                  placeholder="e.g. Computer Science"
                  value={formData.department || ""}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                  className="h-9 text-xs rounded-xl"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="staffId" className="text-xs font-semibold">
                  Staff ID <span className="text-muted-foreground font-normal">(Faculty)</span>
                </Label>
                <Input
                  id="staffId"
                  placeholder="e.g. ST-2024-09"
                  value={formData.staff_id || ""}
                  onChange={(e) => setFormData({ ...formData, staff_id: e.target.value })}
                  className="h-9 text-xs font-mono rounded-xl"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="studentId" className="text-xs font-semibold">
                  Student Reg # <span className="text-muted-foreground font-normal">(Students)</span>
                </Label>
                <Input
                  id="studentId"
                  placeholder="e.g. 221008742"
                  value={formData.student_id || ""}
                  onChange={(e) => setFormData({ ...formData, student_id: e.target.value })}
                  className="h-9 text-xs font-mono rounded-xl"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="pt-3 gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-xs rounded-xl"
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              className="text-xs font-semibold rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground px-5"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-3.5 mr-1.5 animate-spin" /> Provisioning...
                </>
              ) : (
                <>
                  <UserPlus className="size-3.5 mr-1.5" /> Register Account
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
