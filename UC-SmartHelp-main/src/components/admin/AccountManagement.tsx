import { useEffect, useState, useCallback, type FormEvent } from "react";
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
import { UserPlus, Edit2, X } from "lucide-react";

interface User {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  gmail_account?: string | null;
  role: string;
  department: string | null;
  is_disabled?: number;
  image?: string | null;
}

const AccountManagement = () => {
  const { toast } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
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
    // Removed auto-refresh - was causing dashboard to shake/flicker
    // Users will be updated on create/update/delete instead
  }, [fetchUsers]);

  const handleStartEdit = async () => {
    if (!selectedUser) return;
    const baseEditUser = { ...selectedUser };
    setEditUser(baseEditUser);
    setIsEditing(true);

    try {
      const response = await fetch(`${API_URL}/api/find-linked-gmail`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: selectedUser.email }),
      });
      if (!response.ok) return;
      const data = await response.json();
      const fetchedGmail = typeof data?.gmail_account === "string" ? data.gmail_account : null;
      setEditUser((prev) => (prev ? { ...prev, gmail_account: fetchedGmail } : prev));
    } catch {
      // Keep base values if linked gmail lookup fails.
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditUser(null);
  };

  const handleDetailsOpenChange = (open: boolean) => {
    setDetailsOpen(open);
    if (!open) {
      setIsEditing(false);
      setEditUser(null);
    }
  };

  const handleSaveEdit = async () => {
    if (!editUser) return;
    if (!editUser.first_name || !editUser.last_name || !editUser.email) {
      toast({ variant: "destructive", title: "Error", description: "Please fill in all required fields" });
      return;
    }

    setEditLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/users/${editUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: editUser.first_name,
          last_name: editUser.last_name,
          email: editUser.email,
          gmail_account: editUser.gmail_account || null,
          role: editUser.role,
          department: editUser.role === "staff" ? editUser.department : null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to update user");
      }
      const updatedUser = await response.json();

      // Update local users list
      setUsers((prev) =>
        prev.map((u) => (u.id === editUser.id ? { ...u, ...updatedUser } : u))
      );
      setSelectedUser((prev) => (prev ? { ...prev, ...updatedUser } as User : prev));
      setIsEditing(false);
      setEditUser(null);
      toast({ title: "Success", description: "User updated successfully" });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
      toast({ variant: "destructive", title: "Error", description: errorMessage });
    } finally {
      setEditLoading(false);
    }
  };

  const handleSendResetLink = async (targetEmail?: string | null) => {
    const email = String(targetEmail || "").trim().toLowerCase();
    if (!email) {
      toast({ variant: "destructive", title: "Error", description: "No email available to send reset link" });
      return;
    }
    setResetLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/request-password-reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "Failed to send reset link");
      }
      toast({ title: "Reset link sent", description: `Password reset link sent to ${email}` });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
      toast({ variant: "destructive", title: "Reset Link Failed", description: errorMessage });
    } finally {
      setResetLoading(false);
    }
  };

  const handleToggleDisable = async (userId: number, disableUser: boolean) => {
    try {
      const response = await fetch(`${API_URL}/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_disabled: disableUser }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.details || "Failed to update account status");
      }
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, is_disabled: disableUser ? 1 : 0 } : u))
      );
      setSelectedUser((prev) =>
        prev && prev.id === userId ? { ...prev, is_disabled: disableUser ? 1 : 0 } : prev
      );
      toast({ title: disableUser ? "User disabled" : "User enabled" });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
      toast({ variant: "destructive", title: "Status Update Failed", description: errorMessage });
    }
  };

  const handleCreateUser = async (e: FormEvent) => {
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
      
      console.log('Create user response status:', response.status);
      
      const newUserData = await response.json();
      console.log('Create user response data:', newUserData);
      
      if (!response.ok) {
        throw new Error(newUserData.error || newUserData.details || 'Failed to create user');
      }
      
      if (!newUserData || !newUserData.id) {
        console.error('Invalid response - missing id field:', newUserData);
        throw new Error('Invalid response from server - no user data returned');
      }
      
      // Optimistically add new user to list
      setUsers((prev) => [...prev, newUserData]);
      toast({ title: "Success", description: "User created successfully" });
      setNewUser({ first_name: "", last_name: "", email: "", password: "", role: "staff", department: "" });
      setCreateDialogOpen(false);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
      console.error('User creation error:', error);
      console.error('Error details:', errorMessage);
      toast({ variant: "destructive", title: "Error", description: errorMessage });
    } finally {
      setCreateLoading(false);
    }
  };

  return (
    <div className="space-y-4 pt-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-bold text-foreground">Account Management</h2>
        <div className="flex items-center gap-2">
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
      </div>

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
                <TableHead>Last Name</TableHead>
                <TableHead>First Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow
                  key={u.id}
                  className="cursor-pointer hover:bg-muted/30"
                  onClick={() => {
                    setSelectedUser(u);
                    setDetailsOpen(true);
                  }}
                >
                  <TableCell>{u.last_name}</TableCell>
                  <TableCell>{u.first_name}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>
                    <span className="inline-block bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-semibold capitalize">
                      {u.role}
                    </span>
                  </TableCell>
                  <TableCell>
                    {u.role === "student" ? (
                      <span className="text-muted-foreground text-xs italic">N/A</span>
                    ) : (
                      <span className="inline-block bg-purple-100 text-purple-800 px-3 py-1 rounded-full text-sm font-semibold">
                        {u.department || "N/A"}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${
                        Number(u.is_disabled) === 1
                          ? "bg-red-100 text-red-700"
                          : "bg-green-100 text-green-700"
                      }`}
                    >
                      {Number(u.is_disabled) === 1 ? "Disabled" : "Enabled"}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={detailsOpen} onOpenChange={handleDetailsOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle>User Details</DialogTitle>
                <DialogDescription>Manage account details and access for this user.</DialogDescription>
              </div>
              {!isEditing && selectedUser && (
                <button
                  onClick={handleStartEdit}
                  className="flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-2 text-sm font-semibold text-primary hover:bg-primary/20 transition-colors"
                >
                  <Edit2 className="h-4 w-4" />
                  Edit
                </button>
              )}
            </div>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-6">
              {isEditing && editUser ? (
                <div className="rounded-xl border p-5 space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">First Name *</label>
                      <Input
                        value={editUser.first_name}
                        onChange={(e) => setEditUser({ ...editUser, first_name: e.target.value })}
                        placeholder="First name"
                        className="rounded-lg"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Last Name *</label>
                      <Input
                        value={editUser.last_name}
                        onChange={(e) => setEditUser({ ...editUser, last_name: e.target.value })}
                        placeholder="Last name"
                        className="rounded-lg"
                      />
                    </div>
                    <div className="sm:col-span-2 space-y-2">
                      <label className="text-sm font-medium text-foreground">Email *</label>
                      <Input
                        type="email"
                        value={editUser.email}
                        onChange={(e) => setEditUser({ ...editUser, email: e.target.value })}
                        placeholder="user@example.com"
                        className="rounded-lg"
                      />
                    </div>
                    <div className="sm:col-span-2 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">Password</label>
                        <Input value="********" readOnly className="rounded-lg tracking-widest" />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleSendResetLink(editUser.gmail_account || editUser.email)}
                        disabled={resetLoading}
                        className="rounded-lg bg-primary/10 px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/20 disabled:opacity-50"
                      >
                        {resetLoading ? "Sending..." : "Send Reset Link"}
                      </button>
                    </div>
                    <div className="sm:col-span-2 space-y-2">
                      <label className="text-sm font-medium text-foreground">Linked Gmail Account</label>
                      <Input
                        type="email"
                        value={editUser.gmail_account || ""}
                        onChange={(e) => setEditUser({ ...editUser, gmail_account: e.target.value })}
                        placeholder="your.email@gmail.com"
                        className="rounded-lg"
                      />
                      <p className="text-xs text-muted-foreground">
                        Used for password recovery when user cannot access their account email.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Role</label>
                      <Select value={editUser.role} onValueChange={(v) => setEditUser({ ...editUser, role: v })}>
                        <SelectTrigger className="rounded-lg"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="staff">Staff</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {editUser.role === "staff" && (
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">Department</label>
                        <Select value={editUser.department || ""} onValueChange={(v) => setEditUser({ ...editUser, department: v })}>
                          <SelectTrigger className="rounded-lg"><SelectValue placeholder="Select Department" /></SelectTrigger>
                          <SelectContent>
                            {departments.map((dept) => (
                              <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 justify-end pt-4">
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      className="rounded-lg border border-muted/60 px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted/10"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveEdit}
                      disabled={editLoading}
                      className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
                    >
                      {editLoading ? "Saving..." : "Save Changes"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border p-5">
                  <div className="flex flex-col gap-5 md:flex-row md:items-start">
                    <div className="h-28 w-28 overflow-hidden rounded-full border bg-muted/20">
                      {selectedUser.image ? (
                        <img
                          src={selectedUser.image}
                          alt={`${selectedUser.first_name} ${selectedUser.last_name}`}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xl font-semibold text-muted-foreground">
                          {selectedUser.first_name?.[0] || "U"}
                        </div>
                      )}
                    </div>

                    <div className="grid flex-1 grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                      <div>
                        <p className="text-muted-foreground">First Name</p>
                        <p className="font-semibold">{selectedUser.first_name}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Last Name</p>
                        <p className="font-semibold">{selectedUser.last_name}</p>
                      </div>
                      <div className="sm:col-span-2">
                        <p className="text-muted-foreground">Email</p>
                        <p className="font-semibold break-all">{selectedUser.email}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Password</p>
                        <p className="font-semibold tracking-widest">********</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Role</p>
                        <p className="font-semibold capitalize">{selectedUser.role}</p>
                      </div>
                      <div className="sm:col-span-2">
                        <p className="text-muted-foreground">Department</p>
                        <p className="font-semibold">{selectedUser.department || "N/A"}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <label className="flex items-center gap-3 rounded-lg border p-4">
                <Checkbox
                  checked={Number(selectedUser.is_disabled) === 1}
                  onCheckedChange={(checked) => handleToggleDisable(selectedUser.id, Boolean(checked))}
                />
                <span className="text-sm font-medium md:text-base">
                  Disable this account (user cannot log in while disabled)
                </span>
              </label>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AccountManagement;
