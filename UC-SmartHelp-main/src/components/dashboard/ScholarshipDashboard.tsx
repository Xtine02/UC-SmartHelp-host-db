import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import TicketDetailModal from "@/components/tickets/TicketDetailModal";
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

const normalizeStatus = (status: any) =>
  status
    ?.toString()
    .toLowerCase()
    .trim()
    .replace(/[\s\-]+/g, '_')
    || 'pending';

interface Ticket {
  id: string;
  ticket_number: string;
  subject: string;
  status: TicketStatus;
  created_at: string;
  department: string;
  user_id: string;
  description: string;
  acknowledge_at?: string | null;
  first_name?: string;
  last_name?: string;
  full_name?: string;
}

type SortConfig = {
  key: keyof Ticket;
  direction: "asc" | "desc";
} | null;

interface Stats {
  all: number;
  pending: number;
  in_progress: number;
  resolved: number;
  reopened: number;
}

const ScholarshipDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [filter, setFilter] = useState<"all" | TicketStatus>("all");
  const [search, setSearch] = useState<string>("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [stats, setStats] = useState<Stats>({ all: 0, pending: 0, in_progress: 0, resolved: 0, reopened: 0 });
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);
  
  const userJson = localStorage.getItem("user");
  const user = userJson ? JSON.parse(userJson) : null;
  
  const { showConfirm, handleConfirmLeave, handleStayOnPage } = useBackConfirm(undefined);

  const fetchData = async () => {
    try {
      setLoading(true);
      const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
      const userId = user?.id || user?.userId || user?.user_id;

      const url = new URL(`${API_URL}/api/tickets`);
      if (userId) url.searchParams.append("user_id", userId.toString());
      url.searchParams.append("role", user?.role || "staff");
      
      // Pass department to enable server-side filtering for staff
      const userDept = user?.department || "scholarship";
      url.searchParams.append("department", userDept);

      const response = await fetch(url.toString());
      if (response.ok) {
        const data: Ticket[] = await response.json();
        const scholarshipTickets = data
          .map((t: Ticket) => ({ ...t, status: normalizeStatus(t.status) }))
          .filter((t: Ticket) => {
            const dept = (t.department || "").toLowerCase();
            return dept === "scholarship office" || dept === "scholarship";
          });
        
        setTickets(scholarshipTickets);
        
        const newStats = scholarshipTickets.reduce((acc: Stats, t: Ticket) => {
          if (t.status === "pending") acc.pending++;
          else if (t.status === "reopened") acc.reopened++;
          else if (t.status === "in_progress") acc.in_progress++;
          else if (t.status === "resolved") acc.resolved++;
          return acc;
        }, { all: scholarshipTickets.length, pending: 0, in_progress: 0, resolved: 0, reopened: 0 });
        
        setStats(newStats);
      }
    } catch (error) {
      console.error("Error fetching scholarship tickets:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Removed auto-refresh - was causing dashboard to shake/flicker
    // Tickets will be updated on filter/sort/status changes instead
  }, [fetchData]);

  const handleStatusChange = async (ticketId: string, newStatus: string) => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
      const userId = user?.id || user?.userId || user?.user_id;

      const response = await fetch(`${API_URL}/api/tickets/${ticketId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus, user_id: userId })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData?.error || "Failed to update status");
      }

      // Update the ticket in state locally instead of refetching
      setTickets(tickets.map(t => 
        t.id === ticketId ? { ...t, status: newStatus as TicketStatus } : t
      ));
      
      toast({ title: "Success", description: "Status updated successfully" });
    } catch (error: any) {
      console.error("Error updating status:", error);
      toast({ title: "Error", description: error?.message || "Status sync failed", variant: "destructive" });
    }
  };

  const handleTicketClick = async (ticket: Ticket) => {
    // Always call the open endpoint for staff to handle auto status updates
    try {
      const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
      const userId = user?.id || user?.userId || user?.user_id;

      const response = await fetch(`${API_URL}/api/tickets/${ticket.id}/open`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId })
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.updated && data.ticket) {
          const normalizedStatus = (data.ticket.status as string)?.toLowerCase().trim().replace(/[\s\-]+/g, '_');
          setSelectedTicket({ ...ticket, ...data.ticket, status: normalizedStatus });

          return;
        }
        setSelectedTicket(ticket);
      } else {
        setSelectedTicket(ticket);
      }
    } catch (error) {
      console.error("Error opening ticket:", error);
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

  const filteredTickets = useMemo(() => {
    const base = filter === "all" ? tickets : tickets.filter((t) => normalizeStatus(t.status) === filter);
    if (!search.trim()) return base;

    const q = search.toLowerCase();
    return base.filter((t) => {
      const hay = `${t.ticket_number} ${t.subject} ${t.description || ""} ${t.full_name || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [tickets, filter, search]);

  const sortedTickets = useMemo(() => {
    const result = [...filteredTickets];
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
  }, [filteredTickets, sortConfig]);

  const toggleSelectAll = () => {
    if (selectedIds.size === sortedTickets.length && sortedTickets.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sortedTickets.map((t) => t.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleDelete = async () => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
      const userId = user?.id || user?.userId || user?.user_id;

      for (const id of Array.from(selectedIds)) {
        const response = await fetch(`${API_URL}/api/tickets/${id}`, {
          method: 'DELETE',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: userId }),
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({ error: 'Unknown error' }));
          throw new Error(err.error || 'Failed to delete ticket');
        }
      }

      // Optimistically remove deleted tickets from local state
      setTickets((prev) => prev.filter((t) => !selectedIds.has(t.id)));
      setSelectedIds(new Set());
      setShowDeleteConfirm(false);
      toast({ title: "Tickets deleted" });
    } catch (error: any) {
      toast({ title: "Delete failed", description: error?.message || "Unable to delete tickets", variant: "destructive" });
    }
  };

  const SortButton = ({ label, sortKey }: { label: string, sortKey: keyof Ticket }) => {
    const isActive = sortConfig?.key === sortKey;
    return (
      <TableHead className="font-black py-5 text-xs uppercase tracking-widest">
        <button 
          onClick={() => handleSort(sortKey)}
          className={`flex items-center gap-1 hover:text-blue-600 transition-colors uppercase ${isActive ? 'text-blue-700' : ''}`}
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
            <div className="bg-card rounded-2xl border p-6 shadow-sm">
              <ReviewAnalytics department={user?.department} />
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
          <div className="flex justify-between items-center bg-blue-500/10 p-8 rounded-3xl border border-blue-500/20">
            <div>
              <h1 className="text-3xl font-black tracking-tight text-blue-700 uppercase italic">Scholarship Dashboard</h1>
            </div>
            <button 
              onClick={() => navigate("/analytics")}
              className="bg-blue-600 text-white px-8 py-3 rounded-2xl font-black shadow-lg hover:scale-105 active:scale-95 transition-all uppercase tracking-tight"
            >
              View Reviews
            </button>
          </div>

          <div className="grid gap-6 sm:grid-cols-5">
            {[
              { id: "all", label: "All Tickets", value: stats.all, border: "border-slate-400", text: "text-slate-500" },
              { id: "pending", label: "Pending Concerns", value: stats.pending, border: "border-amber-400", text: "text-amber-500" },
              { id: "in_progress", label: "In-Progress", value: stats.in_progress, border: "border-blue-400", text: "text-blue-500" },
              { id: "resolved", label: "Resolved/Closed", value: stats.resolved, border: "border-emerald-400", text: "text-emerald-500" },
              { id: "reopened", label: "Reopen", value: stats.reopened, border: "border-pink-400", text: "text-pink-500" },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setFilter(item.id as any)}
                className={`rounded-3xl p-8 text-center shadow-xl border-b-8 bg-white transition-all duration-150 ${item.border} ${
                  filter === item.id ? "ring-2 ring-primary" : "hover:-translate-y-1 hover:shadow-2xl"
                }`}
              >
                <p className={`text-6xl font-black mb-2 ${item.text}`}>{item.value}</p>
                <p className="text-xs font-black text-slate-800 uppercase tracking-widest">{item.label}</p>
              </button>
            ))}
          </div>

          <div className="mt-4">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tickets..."
              className="w-1/2 rounded-xl border border-muted/50 bg-white px-4 py-3 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>


          <div className="space-y-4">
            {selectedIds.size > 0 && (
              <div className="flex items-center justify-between bg-destructive/10 p-4 rounded-xl border border-destructive/20 animate-in slide-in-from-top-4">
                <span className="text-sm font-bold text-destructive">
                  {selectedIds.size} ticket(s) selected
                </span>
                <button 
                  onClick={() => setShowDeleteConfirm(true)}
                  className="flex items-center gap-2 bg-destructive text-white px-4 py-2 rounded-lg font-bold text-xs hover:bg-destructive/90 transition-all shadow-lg active:scale-95"
                >
                  <Trash2 className="h-4 w-4" />
                  DELETE SELECTED
                </button>
              </div>
            )}

            <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Tickets?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to permanently delete {selectedIds.size} selected ticket(s)? This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="flex gap-3 justify-end">
                  <AlertDialogCancel onClick={() => setShowDeleteConfirm(false)}>
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
                    Yes, Delete
                  </AlertDialogAction>
                </div>
              </AlertDialogContent>
            </AlertDialog>

            <div className="flex justify-between items-center px-2">
              <h2 className="text-xl font-black text-foreground uppercase tracking-tight italic">Scholarship Tickets</h2>
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
                  {sortedTickets.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-24 bg-muted/5">
                        <p className="text-xl font-black uppercase opacity-50 italic">No Tickets</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    sortedTickets.map((t) => (
                      <TableRow 
                        key={t.id} 
                        className={`cursor-pointer transition-colors border-b ${selectedIds.has(t.id) ? 'bg-destructive/5' : 'hover:bg-blue-50/50'} ${!t.acknowledge_at ? 'bg-slate-100/60 text-slate-600' : ''}`}
                        onClick={() => handleTicketClick(t)}
                      >
                        <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                          <Checkbox 
                            checked={selectedIds.has(t.id)}
                            onCheckedChange={() => toggleSelect(t.id)}
                          />
                        </TableCell>
                        <TableCell className="font-mono font-black text-blue-600">#{t.ticket_number}</TableCell>
                        <TableCell className="font-bold text-foreground">{t.subject}</TableCell>
                        <TableCell className="font-bold text-muted-foreground uppercase text-xs">
                          {t.full_name || "Unknown"}
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          {t.status?.toLowerCase() === "pending" || t.status?.toLowerCase() === "reopened" ? (
                            <div 
                              className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm select-none cursor-pointer transition-colors ${
                                t.status?.toLowerCase() === 'reopened'
                                  ? 'bg-pink-100 text-pink-700 border border-pink-200 hover:bg-pink-200'
                                  : 'bg-amber-100 text-amber-700 border border-amber-200 hover:bg-amber-200'
                              }`}
                              onClick={() => handleStatusChange(t.id, "in_progress")}
                            >
                              {t.status?.toLowerCase() === 'reopened' ? 'Reopened' : 'Pending'}
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
                                  {t.status === 'in_progress' ? 'In-Progress' : 'Resolved/Closed'}
                                  <ChevronDown className="h-3 w-3 opacity-50" />
                                </span>
                              </SelectTrigger>
                              <SelectContent className="rounded-xl border-2 min-w-[120px]">
                                <SelectItem value="in_progress" className="font-bold text-blue-600 text-xs">In-Progress</SelectItem>
                                <SelectItem value="resolved" className="font-bold text-emerald-600 text-xs">Resolved/Closed</SelectItem>
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
          ticket={selectedTicket as Ticket}
          onClose={() => { setSelectedTicket(null); }}
          isStaff={true}
          onFeedbackSuccess={() => {}}
        />
      )}
    </div>
  );
};

export default ScholarshipDashboard;
