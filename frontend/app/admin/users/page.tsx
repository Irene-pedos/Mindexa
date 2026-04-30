"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Users, UserPlus, CheckCircle, XCircle } from "lucide-react"
import { adminApi, AdminUserListItem } from "@/lib/api/admin"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUserListItem[]>([])
  const [loading, setLoading] = useState(true)

  async function loadUsers() {
    try {
      const data = await adminApi.getUsers()
      setUsers(data.items)
    } catch (err) {
      console.error("Failed to load users", err)
      toast.error("Failed to load users")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadUsers()
  }, [])

  const handleApprove = async (userId: string) => {
    try {
      await adminApi.approveUser(userId, "ACTIVE")
      toast.success("User approved successfully")
      loadUsers()
    } catch (err) {
      toast.error("Failed to approve user")
    }
  }

  const handleSuspend = async (userId: string) => {
    try {
      await adminApi.approveUser(userId, "SUSPENDED")
      toast.success("User suspended")
      loadUsers()
    } catch (err) {
      toast.error("Failed to suspend user")
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Users & Roles</h1>
          <p className="text-muted-foreground mt-1">Manage all platform users and permissions</p>
        </div>
        <Button>
          <UserPlus className="mr-2 size-5" /> Add New User
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Users</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                [1, 2, 3].map(i => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-16 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : (
                users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-mono text-xs text-muted-foreground">{user.id.slice(0, 8)}</TableCell>
                    <TableCell className="font-medium">{user.name}</TableCell>
                    <TableCell>
                      <Badge variant={user.role === "ADMIN" ? "default" : user.role === "LECTURER" ? "secondary" : "outline"}>
                        {user.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{user.email}</TableCell>
                    <TableCell>
                      <Badge 
                        variant={user.status === "ACTIVE" ? "secondary" : user.status === "PENDING_APPROVAL" ? "default" : "destructive"}
                        className={user.status === "PENDING_APPROVAL" ? "bg-amber-100 text-amber-700 hover:bg-amber-100" : ""}
                      >
                        {user.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {user.status === "PENDING_APPROVAL" && (
                          <Button size="sm" onClick={() => handleApprove(user.id)} className="h-8 bg-emerald-600 hover:bg-emerald-700">
                            <CheckCircle className="size-4 mr-1" /> Approve
                          </Button>
                        )}
                        {user.status === "ACTIVE" && (
                          <Button size="sm" variant="outline" onClick={() => handleSuspend(user.id)} className="h-8 text-destructive">
                            <XCircle className="size-4 mr-1" /> Suspend
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" className="h-8">Edit</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}