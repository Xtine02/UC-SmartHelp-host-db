import { useState, useEffect, useMemo } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import TicketDetailModal from "@/components/tickets/TicketDetailModal";
import ReviewAnalytics from "@/components/analytics/ReviewAnalytics";
import Navbar from "@/components/Navbar";
import { useBackConfirm } from "@/hooks/use-back-confirm";
import { ArrowUpDown, ChevronUp, ChevronDown, Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type TicketStatus = "pending" | "in_progress" | "resolved" | "reopened";

interface Ticket {
  id: string;
  ticket_number: string;
  subject: string;
  status: TicketStatus;
  created_at: string;
  department: string;
  user_id: string;
  description: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
}

type SortConfig = {
  key: keyof Ticket;
  direction: "asc" | "desc";
} | null;

const AccountingDashboard = () => {
  const { toast } = useToast();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [stats, setStats] = useState({ pending: 0, in_progress: 0, resolved: 0 });
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [view, setView] = useState<"tickets" | "reviews">("tickets");
  const [loading, setLoading] = useState(true);
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);
  const { showConfirm, handleConfirmLeave, handleStayOnPage } = useBackConfirm(
    view !== "tickets" ? () => setView("tickets") : undefined
  );

  const fetchData = async () => {
    try {
      setLoading(true);
      const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
      const userJson = localStorage.getItem("user");
      const user = userJson ? JSON.parse(userJson) : null;
      const userId = user?.id || user?.userId || user?.user_id;

      const url = new URL(`${API_URL}/api/tickets`);
      if (userId) url.searchParams.append("user_id", userId.toString());
      url.searchParams.append("role", user?.role || "staff");

      const response = await fetch(url.toString());
      if (response.ok) {
        const data = await response.json();
        const accountingTickets = data.filter((t: any) => {
          const dept = (t.department || "").toLowerCase();
          return dept === "accounting office" || dept === "accounting";
        });
        
        setTickets(accountingTickets);
        
        const newStats = accountingTickets.reduce((acc: any, t: Ticket) => {
          if (t.status === "pending" || t.status === "reopened") acc.pending++;
          else if (t.status === "in_progress") acc.in_progress++;
          else if (t.status === "resolved") acc.resolved++;
          return acc;
        }, { pending: 0, in_progress: 0, resolved: 0 });
        
        setStats(newStats);
      }
    } catch (error) {
      console.error("Error fetching accounting tickets:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleStatusChange = async (ticketId: string, newStatus: string) => {
    // 1. Snapshot old state for rollback
    const oldTickets = [...tickets];
    const oldStats = { ...stats };

    // 2. Immediate local update (Optimistic)
    setTickets(prev => prev.map(t => {
      if (t.id === ticketId) return { ...t, status: newStatus as TicketStatus };
      return t;
    }));

    // 3. Update stats locally to prevent flicker
    setStats(prev => {
      const targetTicket = tickets.find(t => t.id === ticketId);
      if (!targetTicket || targetTicket.status === newStatus) return prev;
      
      const nextStats = { ...prev };
      // Decrement old status count
      const oldStatus = targetTicket.status;
      if (oldStatus === 'pending' || oldStatus === 'reopened') nextStats.pending--;
      else if (oldStatus === 'in_progress') nextStats.in_progress--;
      else if (oldStatus === 'resolved') nextStats.resolved--;

      // Increment new status count
      if (newStatus === 'pending' || newStatus === 'reopened') nextStats.pending++;
      else if (newStatus === 'in_progress') nextStats.in_progress++;
      else if (newStatus === 'resolved') nextStats.resolved++;
      
      return nextStats;
    });

    try {
      const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
      const response = await fetch(`${API_URL}/api/tickets/${ticketId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus })
      });
      
      if (!response.ok) throw new Error("Failed to update status");
      // Success: No need to re-fetch, UI is already correct
    } catch (error) {
      console.error("Error updating status:", error);
      setTickets(oldTickets);
      setStats(oldStats);
      toast({ title: "Error", description: "Status sync failed", variant: "destructive" });
    }
  };

  const handleTicketClick = (ticket: Ticket) => {
    if (ticket.status?.toLowerCase() === "pending") {
      // Transition to in_progress locally immediately
      handleStatusChange(ticket.id, "in_progress");
      setSelectedTicket({ ...ticket, status: "in_progress" });
    } else {
      setSelectedTicket(ticket);
    }
  };

  const handleSort = (key: keyof Ticket) => {
    let direction: "asc" | "desc" = "asc";
    if (sortConfig && sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

  const sortedTickets = useMemo(() => {
    let result = [...tickets];
    if (sortConfig) {
      result.sort((a, b) => {
        const aValue = (a[sortConfig.key] || "").toString().toLowerCase();
        const bValue = (b[sortConfig.key] || "").toString().toLowerCase();
        if (aValue < bValue) return sortConfig.direction === "asc" ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }
    return result;
  }, [tickets, sortConfig]);

  const toggleSelectAll = () => {
    if (selectedIds.size === sortedTickets.length && sortedTickets.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sortedTickets.map(t => t.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const handleDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Permanently delete ${selectedIds.size} selected ticket(s)?`)) return;

    try {
      const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
      for (const id of Array.from(selectedIds)) {
        await fetch(`${API_URL}/api/tickets/${id}`, { method: 'DELETE' });
      }
      toast({ title: "Tickets deleted" });
      setSelectedIds(new Set());
      fetchData();
    } catch (error) {
      toast({ title: "Delete failed", variant: "destructive" });
    }
  };

  const SortButton = ({ label, sortKey }: { label: string, sortKey: keyof Ticket }) => {
    const isActive = sortConfig?.key === sortKey;
    return (
      <TableHead className="font-black py-5 text-xs uppercase tracking-widest">
        <button 
          onClick={() => handleSort(sortKey)}
          className={`flex items-center gap-1 hover:text-emerald-600 transition-colors uppercase ${isActive ? 'text-emerald-700' : ''}`}
        >
          {label}
          {isActive ? (
            sortConfig.direction === "asc" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
          ) : (
            <ArrowUpDown className="h-3 w-3 opacity-30" />
          )}
        </button>
      </TableHead>
    );
  };

  if (view === "reviews") {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Navbar />
        <main className="flex-1 container mx-auto p-4 md:p-8">
          <div className="space-y-6 p-4">
            <button onClick={() => setView("tickets")} className="text-sm font-medium text-primary hover:underline transition-all">
              &larr; BACK TO ACCOUNTING OVERVIEW
            </button>
            <div className="bg-card rounded-2xl border p-6 shadow-sm">
              <ReviewAnalytics />
            </div>
          </div>
        </main>
      </div>
    );
  }

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
        <div className="space-y-8 p-4">
          <div className="flex justify-between items-center bg-emerald-500/10 p-8 rounded-3xl border border-emerald-500/20">
            <div>
              <h1 className="text-3xl font-black tracking-tight text-emerald-700 uppercase italic">Accounting Dashboard</h1>
            </div>
            <button 
              onClick={() => setView("reviews")}
              className="bg-emerald-600 text-white px-8 py-3 rounded-2xl font-black shadow-lg hover:scale-105 active:scale-95 transition-all uppercase tracking-tight"
            >
              View Reviews
            </button>
          </div>

          <div className="grid gap-6 sm:grid-cols-3">
            <div className="rounded-3xl p-8 text-center shadow-xl border-b-8 border-amber-400 bg-white">
              <p className="text-6xl font-black text-amber-500 mb-2">{stats.pending}</p>
              <p className="text-xs font-black text-amber-800 uppercase tracking-widest">Pending Concerns</p>
            </div>
            <div className="rounded-3xl p-8 text-center shadow-xl border-b-8 border-blue-400 bg-white">
              <p className="text-6xl font-black text-blue-500 mb-2">{stats.in_progress}</p>
              <p className="text-xs font-black text-blue-800 uppercase tracking-widest">In-Progress</p>
            </div>
            <div className="rounded-3xl p-8 text-center shadow-xl border-b-8 border-emerald-400 bg-white">
              <p className="text-6xl font-black text-emerald-500 mb-2">{stats.resolved}</p>
              <p className="text-xs font-black text-emerald-800 uppercase tracking-widest">Resolved</p>
            </div>
          </div>

          <div className="space-y-4">
            {selectedIds.size > 0 && (
              <div className="flex items-center justify-between bg-destructive/10 p-4 rounded-xl border border-destructive/20 animate-in slide-in-from-top-4">
                <span className="text-sm font-bold text-destructive">
                  {selectedIds.size} ticket(s) selected
                </span>
                <button 
                  onClick={handleDelete}
                  className="flex items-center gap-2 bg-destructive text-white px-4 py-2 rounded-lg font-bold text-xs hover:bg-destructive/90 transition-all shadow-lg active:scale-95"
                >
                  <Trash2 className="h-4 w-4" />
                  DELETE SELECTED
                </button>
              </div>
            )}

            <div className="flex justify-between items-center px-2">
              <h2 className="text-xl font-black text-foreground uppercase tracking-tight italic">Accounting Tickets</h2>
              <span className="text-xs font-bold text-muted-foreground bg-muted px-3 py-1 rounded-full">
                {tickets.length} TOTAL
              </span>
            </div>
            
            <div className="rounded-3xl border-2 bg-card overflow-hidden shadow-2xl">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow className="border-b-2">
                    <TableHead className="w-[50px] text-center">
                      <Checkbox 
                        checked={selectedIds.size === sortedTickets.length && sortedTickets.length > 0}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <SortButton label="Ticket ID" sortKey="ticket_number" />
                    <SortButton label="Subject" sortKey="subject" />
                    <SortButton label="Sender" sortKey="full_name" />
                    <SortButton label="Status" sortKey="status" />
                    <SortButton label="Date Sent" sortKey="created_at" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-20 font-bold animate-pulse">Loading tickets...</TableCell></TableRow>
                  ) : sortedTickets.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-24 bg-muted/5">
                        <p className="text-xl font-black uppercase opacity-20 italic">No accounting tickets found</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    sortedTickets.map((t) => (
                      <TableRow 
                        key={t.id} 
                        className={`cursor-pointer transition-colors border-b ${selectedIds.has(t.id) ? 'bg-destructive/5' : 'hover:bg-emerald-50/50'}`}
                        onClick={() => handleTicketClick(t)}
                      >
                        <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                          <Checkbox 
                            checked={selectedIds.has(t.id)}
                            onCheckedChange={() => toggleSelect(t.id)}
                          />
                        </TableCell>
                        <TableCell className="font-mono font-black text-emerald-600">#{t.ticket_number}</TableCell>
                        <TableCell className="font-bold text-foreground">{t.subject}</TableCell>
                        <TableCell className="font-bold text-muted-foreground uppercase text-xs">
                          {t.full_name || "Unknown"}
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          {t.status?.toLowerCase() === "pending" ? (
                            <div 
                              className="inline-flex items-center px-3 py-1 rounded-full bg-amber-100 text-amber-700 border border-amber-200 text-[10px] font-black uppercase tracking-widest shadow-sm select-none cursor-pointer hover:bg-amber-200 transition-colors"
                              onClick={() => handleTicketClick(t)}
                            >
                              Pending
                            </div>
                          ) : (
                            <Select 
                              value={t.status} 
                              onValueChange={(v) => handleStatusChange(t.id, v)}
                            >
                              <SelectTrigger 
                                className={`h-7 w-fit px-3 rounded-full border shadow-sm text-[10px] font-black uppercase tracking-widest focus:ring-0 focus:ring-offset-0 transition-all hover:brightness-95 ${
                                  t.status === "in_progress" 
                                    ? "bg-blue-100 text-blue-700 border-blue-200" 
                                    : "bg-emerald-100 text-emerald-700 border-emerald-200"
                                }`}
                              >
                                <span className="flex items-center gap-1">
                                  {t.status === 'in_progress' ? 'In-Progress' : 'Resolved'}
                                  <ChevronDown className="h-3 w-3 opacity-50" />
                                </span>
                              </SelectTrigger>
                              <SelectContent className="rounded-xl border-2 min-w-[120px]">
                                <SelectItem value="in_progress" className="font-bold text-blue-600 text-xs">In-Progress</SelectItem>
                                <SelectItem value="resolved" className="font-bold text-emerald-600 text-xs">Resolved</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                        </TableCell>
                        <TableCell className="font-bold text-muted-foreground">
                          {format(new Date(t.created_at), "MMM d, yyyy")}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      </main>

      {selectedTicket && (
        <TicketDetailModal
          ticket={selectedTicket as any}
          onClose={() => { setSelectedTicket(null); fetchData(); }}
          isStaff={true}
        />
      )}
    </div>
  );
};

export default AccountingDashboard;
