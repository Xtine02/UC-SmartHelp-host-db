import { useEffect, useMemo, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import TicketList from "@/components/tickets/TicketList";
import ReviewAnalytics from "@/components/analytics/ReviewAnalytics";
import AccountManagement from "@/components/admin/AccountManagement";
import Navbar from "@/components/Navbar";
import { useBackConfirm } from "@/hooks/use-back-confirm";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { ChevronDown } from "lucide-react";

interface Ticket {
  id: string;
  department: string;
  status: string;
}

interface DeptStat {
  name: string;
  all: number;
  pending: number;
  in_progress: number;
  resolved: number;
}

const DEPT_NAME_MAP: Record<string, string> = {
  "accounting": "Accounting",
  "accounting office": "Accounting",
  "scholarship": "Scholarship",
  "scholarship office": "Scholarship",
  "registrar": "Registrar",
  "registrar's office": "Registrar",
  "cashier": "Cashier",
  "cashier's office": "Cashier",
  "sao": "SAO",
  "ccs": "CCS Office",
  "ccs office": "CCS Office",
  "it": "IT",
  "it department": "IT",
};

const COLOR_PALETTE = [
  "#3b82f6",
  "#14b8a6",
  "#f97316",
  "#8b5cf6",
  "#ec4899",
  "#22c55e",
  "#facc15",
];

const normalizeDept = (raw: string | null | undefined) => {
  const key = (raw || "").toString().trim().toLowerCase();
  return DEPT_NAME_MAP[key] || raw || "Unknown";
};

const normalizeStatus = (status: string | null | undefined): string =>
  status
    ?.toString()
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, '_')
    || 'pending';

const AdminDashboard = () => {
  const userJson = localStorage.getItem("user");
  const user = userJson ? JSON.parse(userJson) : null;

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"department" | "chatbot" | "tickets" | "accounts" | "feedback">("department");
  const [selectedDept, setSelectedDept] = useState<string | null>(null);
  const [showDeptDialog, setShowDeptDialog] = useState(false);
  const [loading, setLoading] = useState(true);
  const { showConfirm, handleConfirmLeave, handleStayOnPage } = useBackConfirm(
    view !== "department" ? () => setView("department") : undefined
  );

  const navItems = [
    { key: "department", label: "Department Analytics" },
    { key: "chatbot", label: "Chatbot Analytic" },
    { key: "accounts", label: "User Management" },
    { key: "feedback", label: "Feedback Analytic" },
  ] as const;

  useEffect(() => {
    const fetchTickets = async () => {
      setLoading(true);
      try {
        const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
        const userId = user?.id || user?.userId || user?.user_id;
        const url = new URL(`${API_URL}/api/tickets`);
        if (userId) url.searchParams.append("user_id", userId.toString());
        // Admin can see all departments (server-side allows this)
        console.log("Fetching tickets from:", url.toString());
        const response = await fetch(url.toString());
        console.log("Response status:", response.status);
        if (response.ok) {
          const data: Ticket[] = await response.json();
          console.log("Tickets fetched successfully:", data.length);
          setTickets(data.map((t) => ({
            ...t,
            status: normalizeStatus(t.status),
            department: normalizeDept(t.department),
          })));
        } else {
          console.error("API returned non-OK status:", response.status);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error("Error fetching tickets for admin dashboard:", errorMsg);
        console.error("Full error:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchTickets();
  }, [user]);

  const deptStats = useMemo(() => {
    const map = new Map<string, DeptStat>();

    const addDept = (name: string) => {
      if (!map.has(name)) {
        map.set(name, { name, all: 0, pending: 0, in_progress: 0, resolved: 0 });
      }
      return map.get(name)!;
    };

    tickets.forEach((ticket) => {
      const deptName = normalizeDept(ticket.department || "");
      const stat = addDept(deptName);
      stat.all += 1;
      const status = normalizeStatus(ticket.status);
      if (status === "pending") stat.pending += 1;
      else if (status === "in_progress") stat.in_progress += 1;
      else if (status === "resolved" || status === "closed") stat.resolved += 1;
    });

    // Ensure common departments always appear
    [
      "Accounting",
      "Scholarship",
      "Cashier",
      "Registrar",
      "SAO",
      "CCS Office",
      "IT",
    ].forEach((dept) => addDept(dept));

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [tickets]);

  const filteredStats = useMemo(() => {
    if (!search.trim()) return deptStats;
    const query = search.toLowerCase();
    return deptStats.filter((d) => d.name.toLowerCase().includes(query));
  }, [deptStats, search]);

  const pieData = useMemo(() => {
    return deptStats
      .filter((d) => d.all > 0)
      .map((d) => ({ name: d.name, value: d.all }));
  }, [deptStats]);

  const selectedDeptCount = filteredStats.reduce((sum, d) => sum + d.all, 0);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />

      <AlertDialog open={showConfirm} onOpenChange={handleStayOnPage}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave this page?</AlertDialogTitle>
            <AlertDialogDescription>
              Do you want to leave this page? You will be logged out and returned to the home page.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-3 justify-end">
            <AlertDialogCancel onClick={handleStayOnPage}>
              No, stay here
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmLeave} className="bg-destructive hover:bg-destructive/90">
              Yes, leave and logout
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      <main className="flex-1 container mx-auto p-4 md:p-8 animate-in fade-in duration-500">
        <div className="rounded-2xl border bg-card shadow-xl overflow-hidden">
          <div className="p-6 border-b bg-background/60">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div>
                <h1 className="text-3xl font-extrabold tracking-tight">Helpdesk Analytic</h1>
                <p className="text-sm text-muted-foreground mt-1">Overview of ticket volume and department performance.</p>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-2">
              {navItems.map((item) => (
                <button
                  key={item.key}
                  onClick={() => {
                    setView(item.key);
                    setSelectedDept(null);
                  }}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                    view === item.key
                      ? "bg-primary text-white"
                      : "bg-muted/20 text-muted-foreground hover:bg-muted/30"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {(view === "department" || view === "tickets") && (
            <div className="space-y-6 p-6">
              {selectedDept ? (
                <div className="space-y-6">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-bold">Tickets for</h2>
                      <button
                        onClick={() => setShowDeptDialog(true)}
                        className="rounded-xl border border-muted/30 bg-background px-4 py-2 text-sm font-semibold text-foreground shadow-sm hover:bg-muted/10 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                      >
                        {selectedDept || "Select Department"}
                        <ChevronDown className="ml-2 inline h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <AlertDialog open={showDeptDialog} onOpenChange={setShowDeptDialog}>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Forward to Department</AlertDialogTitle>
                        <AlertDialogDescription>Select a department to view tickets</AlertDialogDescription>
                      </AlertDialogHeader>
                      <div className="space-y-2 max-h-96 overflow-y-auto py-4">
                        <button
                          onClick={() => {
                            setSelectedDept(null);
                            setView("department");
                            setShowDeptDialog(false);
                          }}
                          className="w-full rounded-lg border border-muted/30 bg-background px-4 py-2 text-left text-sm font-medium hover:bg-muted/20 transition-colors"
                        >
                          Department Stats (Back)
                        </button>
                        {deptStats.map((d) => (
                          <button
                            key={d.name}
                            onClick={() => {
                              setSelectedDept(d.name);
                              setView("tickets");
                              setShowDeptDialog(false);
                            }}
                            className="w-full rounded-lg border border-muted/30 bg-background px-4 py-2 text-left text-sm font-medium hover:bg-muted/20 transition-colors"
                          >
                            {d.name}
                          </button>
                        ))}
                      </div>
                      <AlertDialogCancel>Close</AlertDialogCancel>
                    </AlertDialogContent>
                  </AlertDialog>

                  <TicketList departmentFilter={selectedDept} />
                </div>
              ) : (
                <>
                  {/* Pie chart (centered) */}
                  <div className="mx-auto w-full max-w-3xl rounded-2xl border bg-background p-6">
                    <div className="flex flex-col items-center gap-4">
                      <div className="flex w-full items-center justify-between">
                        <h2 className="text-lg font-bold">Tickets by Department</h2>
                        <span className="text-sm text-muted-foreground">Total: {selectedDeptCount}</span>
                      </div>
                      {pieData.length === 0 ? (
                        <div className="flex h-56 items-center justify-center text-muted-foreground">No tickets yet.</div>
                      ) : (
                        <div className="h-72 w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={56} outerRadius={88} paddingAngle={2}>
                                {pieData.map((entry, index) => (
                                  <Cell key={entry.name} fill={COLOR_PALETTE[index % COLOR_PALETTE.length]} />
                                ))}
                              </Pie>
                              <Tooltip formatter={(value: number) => [value, "Tickets"]} />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Stats Table */}
                  <div className="rounded-2xl border bg-background p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                      <div className="space-y-1">
                        <h2 className="text-lg font-bold">Department Stats</h2>
                        <p className="text-xs text-muted-foreground">Click a department row to view related tickets.</p>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                        <span className="text-sm text-muted-foreground">Showing {filteredStats.length} departments</span>
                        <Input
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          placeholder="Search departments..."
                          className="h-10 w-full sm:w-[240px]"
                        />
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader className="bg-muted/50">
                          <TableRow>
                            <TableHead className="font-bold py-3">Department</TableHead>
                            <TableHead className="font-bold text-center py-3">All tickets</TableHead>
                            <TableHead className="font-bold text-center py-3">Pending</TableHead>
                            <TableHead className="font-bold text-center py-3">In-Progress</TableHead>
                            <TableHead className="font-bold text-center py-3">Resolved</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredStats.map((d) => (
                            <TableRow
                              key={d.name}
                              className="hover:bg-primary/10 hover:text-foreground transition-colors cursor-pointer"
                              onClick={() => {
                                setSelectedDept(d.name);
                                setView("tickets");
                              }}
                            >
                              <TableCell className="font-semibold py-3">{d.name}</TableCell>
                              <TableCell className="text-center font-semibold py-3">{d.all}</TableCell>
                              <TableCell className="text-center py-3">
                                <span className="text-amber-600 font-bold px-3 py-1 bg-amber-50 rounded-full text-xs">
                                  {d.pending}
                                </span>
                              </TableCell>
                              <TableCell className="text-center py-3">
                                <span className="text-blue-600 font-bold px-3 py-1 bg-blue-50 rounded-full text-xs">
                                  {d.in_progress}
                                </span>
                              </TableCell>
                              <TableCell className="text-center py-3">
                                <span className="text-green-600 font-bold px-3 py-1 bg-green-50 rounded-full text-xs">
                                  {d.resolved}
                                </span>
                              </TableCell>
                            </TableRow>
                          ))}
                          {filteredStats.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                                No departments match your search.
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          <div className="p-6">
            {view === "accounts" && <AccountManagement />}
            {view === "feedback" && <ReviewAnalytics />}
            {view === "chatbot" && (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="rounded-2xl border bg-background p-8 text-center max-w-md">
                  <h2 className="text-2xl font-bold mb-2">Chatbot Analytics</h2>
                  <p className="text-muted-foreground mb-4">Chatbot performance metrics and usage statistics will be displayed here.</p>
                  <div className="h-40 flex items-center justify-center bg-muted/20 rounded-xl">
                    <p className="text-sm text-muted-foreground">Chatbot analytics coming soon</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default AdminDashboard;
