import { useEffect, useState, useCallback } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { UserPlus } from "lucide-react";

interface User {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  department: string | null;
}

const AccountManagement = () => {
  const { toast } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newUser, setNewUser] = useState({
    first_name: "",
    last_name: "",
    email: "",
    password: "",
    role: "staff",
    department: "",
  });
  const [createLoading, setCreateLoading] = useState(false);
  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

  const departments = [
    "Registrar's Office",
    "Accounting Office",
    "Clinic",
    "CCS Office",
    "Cashier's Office",
    "SAO",
    "Scholarship"
  ];

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      console.log("Fetching users from:", `${API_URL}/api/users`);
      const response = await fetch(`${API_URL}/api/users`);
      console.log("Users API response status:", response.status);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("API error response:", errorData);
        throw new Error(`HTTP ${response.status}: ${errorData.error || 'Failed to fetch users'}`);
      }
      const data = await response.json();
      console.log("Users fetched successfully:", data.length, "users");
      console.log("User data:", data);
      setUsers(data);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
      console.error("Error fetching users:", errorMessage);
      console.error("Full error object:", error);
      toast({ variant: "destructive", title: "Error Fetching Users", description: errorMessage });
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [API_URL, toast]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleUpdate = async (userId: number, role: string, department: string | null) => {
    try {
      const response = await fetch(`${API_URL}/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, department }),
      });
      if (!response.ok) throw new Error("Failed to update user");
      toast({ title: "User updated successfully" });
      fetchUsers();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
      toast({ variant: "destructive", title: "Update Failed", description: errorMessage });
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === users.length) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(users.map((u) => u.id)));
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} user(s)? This cannot be undone.`)) return;

    try {
      for (const id of Array.from(selectedIds)) {
        await fetch(`${API_URL}/api/users/${id}`, { method: "DELETE" });
      }
      setSelectedIds(new Set());
      toast({ title: "Users deleted" });
      fetchUsers();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
      toast({ variant: "destructive", title: "Delete Failed", description: errorMessage });
      fetchUsers();
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUser.first_name || !newUser.last_name || !newUser.email || !newUser.password) {
      toast({ variant: "destructive", title: "Error", description: "Please fill in all required fields" });
      return;
    }

    setCreateLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: newUser.first_name,
          last_name: newUser.last_name,
          email: newUser.email,
          password: newUser.password,
          role: newUser.role,
          department: newUser.role === "staff" ? newUser.department : null,
        }),
      });
      if (!response.ok) throw new Error("Failed to create user");
      toast({ title: "User created successfully" });
      setNewUser({ first_name: "", last_name: "", email: "", password: "", role: "staff", department: "" });
      setCreateDialogOpen(false);
      fetchUsers();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
      toast({ variant: "destructive", title: "Create Failed", description: errorMessage });
    } finally {
      setCreateLoading(false);
    }
  };

  return (
    <div className="space-y-4 pt-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-bold text-foreground">Account Management</h2>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <button className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90">
              <UserPlus className="h-4 w-4" />
              Create User
            </button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Create New User</DialogTitle>
              <DialogDescription>Add a new staff or admin user to the system.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-foreground">First Name *</label>
                  <Input
                    value={newUser.first_name}
                    onChange={(e) => setNewUser({ ...newUser, first_name: e.target.value })}
                    placeholder="First name"
                    className="rounded-lg"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-foreground">Last Name *</label>
                  <Input
                    value={newUser.last_name}
                    onChange={(e) => setNewUser({ ...newUser, last_name: e.target.value })}
                    placeholder="Last name"
                    className="rounded-lg"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground">Email *</label>
                <Input
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  placeholder="user@example.com"
                  className="rounded-lg"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground">Password *</label>
                <Input
                  type="password"
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  placeholder="Enter password"
                  className="rounded-lg"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground">Role *</label>
                <Select value={newUser.role} onValueChange={(v) => setNewUser({ ...newUser, role: v })}>
                  <SelectTrigger className="rounded-lg"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="staff">Staff</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {newUser.role === "staff" && (
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-foreground">Department</label>
                  <Select value={newUser.department} onValueChange={(v) => setNewUser({ ...newUser, department: v })}>
                    <SelectTrigger className="rounded-lg"><SelectValue placeholder="Select Department" /></SelectTrigger>
                    <SelectContent>
                      {departments.map((dept) => (
                        <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex gap-2 justify-end pt-4">
                <button
                  type="button"
                  onClick={() => setCreateDialogOpen(false)}
                  className="rounded-lg border border-muted/60 px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted/10"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
                >
                  {createLoading ? "Creating..." : "Create User"}
                </button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {selectedIds.size > 0 && (
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 rounded-xl border bg-card p-4">
          <p className="text-sm font-semibold text-foreground">
            {selectedIds.size} user{selectedIds.size === 1 ? "" : "s"} selected
          </p>
          <div className="flex gap-2">
            <button
              onClick={toggleSelectAll}
              className="rounded-lg border border-muted/60 bg-muted/10 px-4 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted/20"
            >
              {selectedIds.size === users.length ? "Unselect all" : "Select all"}
            </button>
            <button
              onClick={handleDeleteSelected}
              className="rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-white hover:bg-destructive/90"
            >
              Delete selected
            </button>
          </div>
        </div>
      )}

      <div className="rounded-xl border bg-card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <p className="text-muted-foreground">Loading users...</p>
          </div>
        ) : users.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-muted-foreground">No users found in the database.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary">
                <TableHead className="w-[60px] text-center">
                  <Checkbox
                    checked={selectedIds.size === users.length && users.length > 0}
                    onCheckedChange={toggleSelectAll}
                  />
                </TableHead>
                <TableHead>Last Name</TableHead>
                <TableHead>First Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Department</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="text-center">
                    <Checkbox
                      checked={selectedIds.has(u.id)}
                      onCheckedChange={() => toggleSelect(u.id)}
                    />
                  </TableCell>
                  <TableCell>{u.last_name}</TableCell>
                  <TableCell>{u.first_name}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>
                    <Select value={u.role} onValueChange={(v) => handleUpdate(u.id, v, u.department)}>
                      <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="student">Student</SelectItem>
                        <SelectItem value="staff">Staff</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    {u.role === "staff" ? (
                      <Select value={u.department || ""} onValueChange={(v) => handleUpdate(u.id, u.role, v)}>
                        <SelectTrigger className="w-48"><SelectValue placeholder="Select Dept" /></SelectTrigger>
                        <SelectContent>
                          {departments.map(dept => (
                            <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="text-muted-foreground text-xs italic">N/A</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
};

export default AccountManagement;
