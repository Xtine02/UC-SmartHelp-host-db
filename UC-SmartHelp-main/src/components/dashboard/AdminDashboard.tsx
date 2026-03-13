import { useState, useEffect } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import TicketList from "@/components/tickets/TicketList";
import ReviewAnalytics from "@/components/analytics/ReviewAnalytics";
import AccountManagement from "@/components/admin/AccountManagement";
import ChatbotAnalytics from "@/components/analytics/ChatbotAnalytics";
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

interface DeptStat {
  name: string;
  all: number;
  pending: number;
  in_progress: number;
  resolved: number;
}

const AdminDashboard = () => {
  const userJson = localStorage.getItem("user");
  const user = userJson ? JSON.parse(userJson) : null;
  
  const [deptStats, setDeptStats] = useState<DeptStat[]>([]);
  const [view, setView] = useState<"dashboard" | "tickets" | "accounts" | "reviews">("dashboard");
  const { showConfirm, handleConfirmLeave, handleStayOnPage } = useBackConfirm(
    view !== "dashboard" ? () => setView("dashboard") : undefined
  );

  useEffect(() => {
    const fetchStats = async () => {
      // Mock stats to prevent empty state in UI
      const mockStats: DeptStat[] = [
        { name: "Registrar's Office", all: 0, pending: 0, in_progress: 0, resolved: 0 },
        { name: "Accounting Office", all: 0, pending: 0, in_progress: 0, resolved: 0 },
        { name: "CCS Office", all: 0, pending: 0, in_progress: 0, resolved: 0 },
      ];
      setDeptStats(mockStats);
    };
    fetchStats();
  }, []);

  const navItems = [
    { key: "dashboard", label: "Analytics Overview" },
    { key: "tickets", label: "System Tickets" },
    { key: "accounts", label: "User Management" },
    { key: "reviews", label: "Public Feedback" },
  ] as const;

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
        <div className="flex flex-col md:flex-row gap-8 p-4">
          {/* Sidebar Navigation */}
          <div className="w-full md:w-72 space-y-4">
            <div className="px-5 py-6 bg-primary text-primary-foreground rounded-2xl shadow-lg">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-80 mb-1">System Administrator</p>
              <p className="text-lg font-bold truncate">{user?.fullName || "Admin"}</p>
            </div>
            
            <nav className="space-y-1 p-1 bg-secondary/30 rounded-2xl border">
              {navItems.map((item) => (
                <button
                  key={item.key}
                  onClick={() => setView(item.key)}
                  className={`flex w-full items-center px-5 py-4 rounded-xl text-sm font-bold transition-all ${
                    view === item.key 
                      ? "bg-background text-primary shadow-sm" 
                      : "text-muted-foreground hover:bg-background/50 hover:text-foreground"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 min-h-[600px] bg-card rounded-2xl border p-8 shadow-xl">
            {view === "dashboard" && (
              <div className="space-y-10 animate-in fade-in duration-500">
                <div className="flex justify-between items-center border-b pb-6">
                  <div>
                    <h2 className="text-3xl font-extrabold tracking-tight">System Analytics</h2>
                    <p className="text-muted-foreground mt-1">Real-time performance metrics across all departments.</p>
                  </div>
                  <Badge variant="secondary" className="px-4 py-1.5 rounded-full text-xs font-bold bg-green-100 text-green-700 hover:bg-green-100 border-none">
                     LIVE SYSTEM
                  </Badge>
                </div>

                {/* Departments Stats Table */}
                <div className="space-y-5">
                  <h3 className="text-xl font-bold flex items-center gap-2">
                    Departmental Efficiency
                  </h3>
                  <div className="rounded-2xl border overflow-hidden shadow-sm bg-background">
                    <Table>
                      <TableHeader className="bg-muted/50">
                        <TableRow>
                          <TableHead className="font-bold py-4">Department</TableHead>
                          <TableHead className="text-center font-bold py-4">Total</TableHead>
                          <TableHead className="text-center font-bold py-4">Pending</TableHead>
                          <TableHead className="text-center font-bold py-4">In-Progress</TableHead>
                          <TableHead className="text-center font-bold py-4">Resolved</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {deptStats.map((d) => (
                          <TableRow key={d.name} className="hover:bg-muted/20 transition-colors">
                            <TableCell className="font-bold text-foreground py-4">{d.name}</TableCell>
                            <TableCell className="text-center font-semibold">{d.all}</TableCell>
                            <TableCell className="text-center">
                                <span className="text-amber-600 font-bold px-3 py-1 bg-amber-50 rounded-full text-xs">{d.pending}</span>
                            </TableCell>
                            <TableCell className="text-center">
                                <span className="text-blue-600 font-bold px-3 py-1 bg-blue-50 rounded-full text-xs">{d.in_progress}</span>
                            </TableCell>
                            <TableCell className="text-center">
                                <span className="text-green-600 font-bold px-3 py-1 bg-green-50 rounded-full text-xs">{d.resolved}</span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {/* Chatbot Analytics Section */}
                <div className="pt-8 border-t border-dashed">
                  <ChatbotAnalytics />
                </div>
              </div>
            )}

            {/* Sub-view Rendering */}
            <div className="animate-in slide-in-from-right-4 duration-500">
              {view === "tickets" && <TicketList />}
              {view === "accounts" && <AccountManagement />}
              {view === "reviews" && <ReviewAnalytics />}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default AdminDashboard;
