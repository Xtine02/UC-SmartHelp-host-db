import { useState, useEffect, useMemo } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import TicketDetailModal from "@/components/tickets/TicketDetailModal";
import ReviewAnalytics from "@/components/analytics/ReviewAnalytics";
import Navbar from "@/components/Navbar";
import { useBackConfirm } from "@/hooks/use-back-confirm";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2, ArrowUpDown, ChevronUp, ChevronDown } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type TicketStatus = "pending" | "in_progress" | "resolved";

interface Ticket {
  id: string;
  ticket_number: string;
  subject: string;
  status: TicketStatus;
  created_at: string;
  sender_id: string;
  full_name?: string;
}

type SortConfig = {
  key: keyof Ticket;
  direction: "asc" | "desc";
} | null;

const StaffDashboard = () => {
  const { toast } = useToast();
  const [stats, setStats] = useState({ pending: 0, in_progress: 0, resolved: 0 });
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [view, setView] = useState<"tickets" | "reviews">("tickets");
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);
  const { showConfirm, handleConfirmLeave, handleStayOnPage } = useBackConfirm(
    view !== "tickets" ? () => setView("tickets") : undefined
  );

  const fetchData = async () => {
    try {
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
        setTickets(data);
        setStats({
          pending: data.filter((t: any) => t.status === "pending").length,
          in_progress: data.filter((t: any) => t.status === "in_progress").length,
          resolved: data.filter((t: any) => t.status === "resolved").length
        });
      }
    } catch (error) {
      console.error("Failed to fetch tickets", error);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const toggleSelectAll = () => {
    if (selectedIds.size === sortedTickets.length) {
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
    if (!confirm(`Are you sure you want to delete ${selectedIds.size} ticket(s)?`)) return;

    try {
      const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
      for (const id of selectedIds) {
        await fetch(`${API_URL}/api/tickets/${id}`, { method: 'DELETE' });
      }
      toast({ title: "Tickets deleted successfully" });
      setSelectedIds(new Set());
      fetchData();
    } catch (error) {
      toast({ title: "Delete failed", variant: "destructive" });
    }
  };

  const handleStatusChange = async (ticketId: string, newStatus: string) => {
    toast({ title: "Updating Status..." });
    setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, status: newStatus as TicketStatus } : t));
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
        const aVal = (a[sortConfig.key] || "").toString().toLowerCase();
        const bValue = (b[sortConfig.key] || "").toString().toLowerCase();
        if (aVal < bValue) return sortConfig.direction === "asc" ? -1 : 1;
        if (aVal > bValue) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }
    return result;
  }, [tickets, sortConfig]);

  const SortButton = ({ label, sortKey }: { label: string, sortKey: keyof Ticket }) => {
    const isActive = sortConfig?.key === sortKey;
    return (
      <TableHead className="font-bold py-4">
        <button 
          onClick={() => handleSort(sortKey)}
          className={`flex items-center gap-1 hover:text-primary transition-colors uppercase ${isActive ? 'text-primary' : ''}`}
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
              &larr; Back to Dashboard Overview
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
          <div className="flex justify-between items-center bg-primary/5 p-6 rounded-2xl border border-primary/10">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Staff Overview</h1>
              <p className="text-muted-foreground">Manage and respond to student inquiries.</p>
            </div>
            <button onClick={() => setView("reviews")} className="bg-primary text-primary-foreground px-6 py-2 rounded-xl font-bold shadow-lg hover:scale-105 active:scale-95 transition-all">
              View Analytics
            </button>
          </div>

          <div className="grid gap-6 sm:grid-cols-3">
            <div className="rounded-2xl p-8 text-center shadow-md border-b-4 border-amber-400 bg-amber-50">
              <p className="text-5xl font-extrabold text-amber-600 mb-2">{stats.pending}</p>
              <p className="text-sm font-bold text-amber-800 uppercase tracking-wider">Pending</p>
            </div>
            <div className="rounded-2xl p-8 text-center shadow-md border-b-4 border-blue-400 bg-blue-50">
              <p className="text-5xl font-extrabold text-blue-600 mb-2">{stats.in_progress}</p>
              <p className="text-sm font-bold text-blue-800 uppercase tracking-wider">In-Progress</p>
            </div>
            <div className="rounded-2xl p-8 text-center shadow-md border-b-4 border-emerald-400 bg-emerald-50">
              <p className="text-5xl font-extrabold text-emerald-600 mb-2">{stats.resolved}</p>
              <p className="text-sm font-bold text-emerald-800 uppercase tracking-wider">Resolved</p>
            </div>
          </div>

          <div className="space-y-4">
            {selectedIds.size > 0 && (
              <div className="flex items-center justify-between bg-destructive/10 p-4 rounded-xl border border-destructive/20 animate-in slide-in-from-top-4">
                <span className="text-sm font-bold text-destructive">{selectedIds.size} selected</span>
                <button onClick={handleDelete} className="flex items-center gap-2 bg-destructive text-white px-4 py-2 rounded-lg font-bold text-xs hover:bg-destructive/90 transition-all">
                  <Trash2 className="h-4 w-4" /> DELETE SELECTED
                </button>
              </div>
            )}

            <h2 className="text-xl font-bold text-foreground px-1">All Tickets</h2>
            <div className="rounded-2xl border bg-card overflow-hidden shadow-sm">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="w-[50px] text-center">
                      <Checkbox 
                        checked={selectedIds.size === sortedTickets.length && sortedTickets.length > 0}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <SortButton label="TICKET ID" sortKey="ticket_number" />
                    <SortButton label="SUBJECT" sortKey="subject" />
                    <SortButton label="SENDER" sortKey="full_name" />
                    <SortButton label="DATE SENT" sortKey="created_at" />
                    <SortButton label="STATUS" sortKey="status" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tickets.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-20 bg-muted/5">
                        No tickets found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    sortedTickets.map((t) => (
                      <TableRow 
                        key={t.id} 
                        className={`cursor-pointer transition-colors ${selectedIds.has(t.id) ? 'bg-destructive/5' : 'hover:bg-secondary/30'}`}
                        onClick={() => setSelectedTicket(t)}
                      >
                        <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                          <Checkbox 
                            checked={selectedIds.has(t.id)}
                            onCheckedChange={() => toggleSelect(t.id)}
                          />
                        </TableCell>
                        <TableCell className="font-mono font-bold text-primary">{t.ticket_number}</TableCell>
                        <TableCell className="font-medium">{t.subject}</TableCell>
                        <TableCell className="text-sm font-bold">{t.full_name || "Unknown"}</TableCell>
                        <TableCell className="text-muted-foreground">{format(new Date(t.created_at), "MMM d, yyyy")}</TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Select value={t.status} onValueChange={(v) => handleStatusChange(t.id, v)}>
                            <SelectTrigger className="w-36 h-9 rounded-lg">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pending">Pending</SelectItem>
                              <SelectItem value="in_progress">In-Progress</SelectItem>
                              <SelectItem value="resolved">Resolved/Closed</SelectItem>
                            </SelectContent>
                          </Select>
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
          ticket={selectedTicket}
          onClose={() => { setSelectedTicket(null); fetchData(); }}
          isStaff={true}
        />
      )}
    </div>
  );
};

export default StaffDashboard;
