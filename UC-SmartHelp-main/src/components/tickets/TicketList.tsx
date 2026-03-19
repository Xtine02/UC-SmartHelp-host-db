import { useState, useEffect, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { ArrowUpDown, ChevronUp, ChevronDown, Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import TicketDetailModal from "./TicketDetailModal";
import FeedbackDialog from "./FeedbackDialog";

interface Department {
  id: string;
  name: string;
}

interface Ticket {
  id: string;
  ticket_number: string;
  subject: string;
  status: "pending" | "in_progress" | "resolved" | "reopened";
  created_at: string;
  department_id: string;
  acknowledge_at?: string | null;
  has_unread_reply?: boolean;
  closed_at?: string | null;
  reopen_at?: string | null;
  departments?: Department | null;
  description?: string;
  profiles?: {
    first_name: string;
    last_name: string;
  } | null;
}

const statusColors: Record<string, string> = {
  pending: "bg-orange-400 text-foreground hover:bg-orange-500",
  in_progress: "bg-blue-400 text-foreground hover:bg-blue-500",
  resolved: "bg-green-400 text-foreground hover:bg-green-500",
  reopened: "bg-pink-400 text-foreground hover:bg-pink-500",
};

type SortConfig = {
  key: keyof Ticket | "department_name";
  direction: "asc" | "desc";
} | null;

interface Props {
  departmentFilter?: string;
}

// Match the normalization used in AdminDashboard for consistent filtering
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
  "clinic": "Clinic",
  "it": "IT",
  "it department": "IT",
};

const normalizeDept = (raw: string | null | undefined) => {
  const key = (raw || "").toString().trim().toLowerCase();
  return DEPT_NAME_MAP[key] || raw || "Unknown";
};

const normalizeStatus = (status: any) =>
  status
    ?.toString()
    .toLowerCase()
    .trim()
    .replace(/[\s\-]+/g, '_')
    || 'pending';

const TicketList = ({ departmentFilter }: Props) => {
  const { toast } = useToast();
  // 1. Manual Auth Logic
  let user = null;
  try {
    const savedUser = localStorage.getItem("user");
    user = savedUser ? JSON.parse(savedUser) : null;
  } catch (e) {
    console.error("TicketList: Failed to parse user", e);
  }
  
  const isGuest = localStorage.getItem("uc_guest") === "1";
  
  // Role check logic
  const isStaffOrAdmin =
    (user?.role || "").toString().trim().toLowerCase() === "staff" ||
    (user?.role || "").toString().trim().toLowerCase() === "admin";

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState<string>("");

  const toggleSelectAll = () => {
    if (selectedIds.size === sortedAndFilteredTickets.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sortedAndFilteredTickets.map(t => t.id)));
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
        await fetch(`${API_URL}/api/tickets/${id}`, { method: 'DELETE', cache: 'no-store' });
      }

      // Optimistically remove deleted tickets from UI immediately
      setTickets(prev => prev.filter((t) => !selectedIds.has(t.id)));
      setSelectedIds(new Set());

      // Refresh from server to ensure state matches database
      await fetchTickets();
      toast({ title: "Tickets deleted successfully" });
    } catch (error) {
      toast({ title: "Error deleting tickets", variant: "destructive" });
      await fetchTickets();
    }
  };
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackTicket, setFeedbackTicket] = useState<Ticket | null>(null);
  const [showFilters, setShowFilters] = useState<boolean>(true);
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);

  const fetchTickets = async () => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
      const userId = user?.id || user?.userId || user?.user_id;
      
      if (!userId && !isGuest) {
        console.error("TicketList: No userId found for fetch");
        return;
      }

      // If we have a department filter, we are likely acting as staff/admin for that dept
      const role = departmentFilter ? "admin" : (user?.role || "student");
      
      const url = new URL(`${API_URL}/api/tickets`);
      if (userId) url.searchParams.append("user_id", userId.toString());
      url.searchParams.append("role", role);

      const response = await fetch(url.toString());
      if (response.ok) {
        const data = await response.json();
        
        let filteredData = data;
        if (departmentFilter) {
          // Normalize the filter using the same map as AdminDashboard
          const targetNormalized = normalizeDept(departmentFilter);
          filteredData = data.filter((t: any) => {
            // Normalize the ticket's department using the same map
            const ticketDeptNormalized = normalizeDept(t.department);
            // Compare normalized values
            return ticketDeptNormalized === targetNormalized;
          });
        }

        const mappedTickets = filteredData.map((t: any) => ({
          ...t,
          departments: { name: t.department },
          status: normalizeStatus(t.status),
        }));
        setTickets(mappedTickets);
      } else {
        console.error("TicketList: Fetch failed", response.status);
      }
    } catch (error) {
      console.error("Error fetching tickets:", error);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, [departmentFilter]);

  const handleSort = (key: keyof Ticket | "department_name") => {
    let direction: "asc" | "desc" = "asc";
    if (sortConfig && sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

  const sortedAndFilteredTickets = useMemo(() => {
    let result = tickets.filter((t) => {
      const matchesFilter =
        filter === "all" ? true : filter === "reopened" ? t.status === "reopened" : t.status === filter;

      if (!matchesFilter) return false;

      if (!search.trim()) return true;

      const query = search.toLowerCase();
      const str = `${t.ticket_number} ${t.subject} ${t.description || ""} ${t.departments?.name || ""}`.toLowerCase();
      return str.includes(query);
    });

    if (sortConfig) {
      result.sort((a, b) => {
        let aValue: any;
        let bValue: any;

        if (sortConfig.key === "department_name") {
          aValue = a.departments?.name || "";
          bValue = b.departments?.name || "";
        } else {
          aValue = a[sortConfig.key] || "";
          bValue = b[sortConfig.key] || "";
        }

        if (aValue < bValue) {
          return sortConfig.direction === "asc" ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === "asc" ? 1 : -1;
        }
        return 0;
      });
    }

    return result;
  }, [tickets, filter, sortConfig]);

  const handleTicketClick = async (t: Ticket) => {
    // For staff/admin, call the open endpoint to handle auto status updates
    if (isStaffOrAdmin) {
      try {
        const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
        const response = await fetch(`${API_URL}/api/tickets/${t.id}/open`, {
          method: "PATCH",
        });
        
        if (response.ok) {
        const data = await response.json();
        if (data.updated) {
          // Normalize status to match frontend conventions
          const normalizedStatus = data.ticket?.status
            ? (data.ticket.status as string).toLowerCase().trim().replace(/[\s\-]+/g, '_')
            : "in_progress";

          const updatedTicket = {
            ...t,
            ...(data.ticket || {}),
            status: normalizeStatus(normalizedStatus),
          };

          // Update the ticket in the local state
          setTickets((prev) => prev.map((ticket) =>
            ticket.id === t.id ? updatedTicket : ticket
          ));
          setSelectedTicket(updatedTicket);
          return;
        }
      }
      } catch (error) {
        console.error("Error opening ticket:", error);
      }
    }
    
    // Fallback: just open the ticket without status change
    setSelectedTicket(t);
  };

  const handleCloseModal = () => {
    const closedTicket = selectedTicket;
    setSelectedTicket(null);
    fetchTickets();

    // Show feedback dialog for resolved tickets (student only, not guest)
    if (!isStaffOrAdmin && closedTicket?.status === "resolved" && !isGuest) {
      setFeedbackTicket(closedTicket);
      setShowFeedback(true);
    }
  };

  const SortButton = ({ label, sortKey }: { label: string, sortKey: keyof Ticket | "department_name" }) => {
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

  return (
    <div className="space-y-4 animate-in fade-in duration-500">
      {/* Selection Toolbar */}
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

      <div className="flex flex-col md:flex-row gap-6">
        {/* Filter sidebar */}
        <div className="space-y-4 min-w-[200px]">
          <button
            onClick={() => setShowFilters(prev => !prev)}
            className="flex items-center justify-between w-full px-4 py-3 rounded-xl bg-primary text-primary-foreground font-bold shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            <span>Filters</span>
            <span className={`transition-transform duration-300 ${showFilters ? 'rotate-180' : ''}`}>▼</span>
          </button>
          
          {showFilters && (
            <div className="space-y-1 p-1 bg-secondary/20 rounded-xl border border-dashed animate-in slide-in-from-top-2">            
              <p className="text-[10px] font-bold text-muted-foreground uppercase px-3 py-2 tracking-widest">By Status</p>
              {[
                { id: "all", label: "All Tickets" },
                { id: "pending", label: "Pending" },
                { id: "in_progress", label: "In-Progress" },
                { id: "resolved", label: "Resolved/Closed" },
                { id: "reopened", label: "Reopened" },
              ].map((btn) => (
                <button
                  key={btn.id}
                  onClick={() => setFilter(btn.id)}
                  className={`block w-full text-left px-4 py-3 rounded-lg text-sm font-bold transition-all ${
                    filter === btn.id 
                      ? "bg-background text-primary shadow-sm" 
                      : "hover:bg-background/50 text-muted-foreground"
                  }`}
                >
                  {btn.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Tickets Table */}
        <div className="flex-1 rounded-2xl border bg-card shadow-lg overflow-hidden">
          <div className="p-4 border-b bg-muted/50">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tickets..."
              className="w-1/3 rounded-xl border border-muted/50 bg-background px-4 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="w-[50px] text-center">
                  <Checkbox 
                    checked={selectedIds.size === sortedAndFilteredTickets.length && sortedAndFilteredTickets.length > 0}
                    onCheckedChange={toggleSelectAll}
                  />
                </TableHead>
                <SortButton label="TICKET ID" sortKey="ticket_number" />
                <SortButton label="SUBJECT" sortKey="subject" />
                <SortButton label="DEPARTMENT" sortKey="department_name" />
                <TableHead className="font-bold py-4 uppercase">DESCRIPTION</TableHead>
                <SortButton label="STATUS" sortKey="status" />
                <SortButton label="DATE CREATED" sortKey="created_at" />
                <SortButton label="ACKNOWLEDGED" sortKey="acknowledge_at" />
                <SortButton label="CLOSED" sortKey="closed_at" />
                <SortButton label="REOPENED" sortKey="reopen_at" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedAndFilteredTickets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-muted-foreground py-20 bg-muted/5">
                    <div className="flex flex-col items-center gap-3 opacity-60">
                      <div className="h-12 w-12 rounded-full bg-secondary flex items-center justify-center">
                         <span className="text-2xl font-bold">!</span>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-foreground">No tickets found</p>
                        <p className="text-sm">The list is currently empty.</p>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                sortedAndFilteredTickets.map((t) => (
                  <TableRow 
                    key={t.id} 
                    className={`cursor-pointer transition-colors ${selectedIds.has(t.id) ? 'bg-destructive/5' : (!t.has_unread_reply ? 'hover:bg-slate-200' : 'hover:bg-secondary/20')} ${t.has_unread_reply ? 'bg-slate-100/60 text-slate-600 font-bold' : ''}`} 
                    onClick={() => handleTicketClick(t)}
                  >
                    <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                      <Checkbox 
                        checked={selectedIds.has(t.id)}
                        onCheckedChange={() => toggleSelect(t.id)}
                      />
                    </TableCell>
                    <TableCell className="font-mono font-bold text-primary">{t.ticket_number}</TableCell>
                    <TableCell className="font-bold text-foreground">{t.subject}</TableCell>
                    <TableCell className="text-sm">{t.departments?.name || "N/A"}</TableCell>
                    <TableCell className="text-sm max-w-[200px] truncate">{t.description || "---"}</TableCell>
                    <TableCell>
                      <Badge className={`${statusColors[t.status] || "bg-gray-400"} border-none font-bold uppercase text-[10px] tracking-wider px-2.5 py-0.5`}>
                        {t.status === "in_progress" ? "In-Progress" : t.status === "resolved" ? "Resolved" : t.status === "reopened" ? "Reopened" : "Pending"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {t.created_at ? format(new Date(t.created_at), "MMM d, yyyy") : "---"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {t.acknowledge_at ? format(new Date(t.acknowledge_at), "MMM d, yyyy") : "-"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {t.closed_at ? format(new Date(t.closed_at), "MMM d, yyyy") : "-"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {t.reopen_at ? format(new Date(t.reopen_at), "MMM d, yyyy") : "-"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Modals */}
      {selectedTicket && (
        <TicketDetailModal
          ticket={selectedTicket}
          onClose={handleCloseModal}
          isStaff={isStaffOrAdmin}
          onFeedbackSuccess={() => fetchTickets()}
        />
      )}

      {feedbackTicket && (
        <FeedbackDialog
          open={showFeedback}
          onClose={() => { setShowFeedback(false); setFeedbackTicket(null); }}
          departmentName={feedbackTicket.departments?.name}
          departmentId={feedbackTicket.department_id}
          ticketId={feedbackTicket.id}
        />
      )}
    </div>
  );
};

export default TicketList;
