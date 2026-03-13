import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { X } from "lucide-react";
import { format } from "date-fns";

interface Ticket {
  id: string;
  ticket_number: string;
  subject: string;
  status: string;
  created_at: string;
  department_id: string;
  department?: string;
  description?: string;
  acknowledge_at?: string | null;
  closed_at?: string | null;
  reopen_at?: string | null;
  departments?: { name: string } | null;
  profiles?: {
    first_name: string;
    last_name: string;
  } | null;
}

interface Props {
  ticket: Ticket;
  onClose: () => void;
  isStaff?: boolean;
}

const TicketDetailModal = ({ ticket, onClose, isStaff = false }: Props) => {
  // Manual Auth
  const savedUser = localStorage.getItem("user");
  const user = savedUser ? JSON.parse(savedUser) : null;
  
  const { toast } = useToast();
  const [messages, setMessages] = useState<any[]>([]);
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(false);
  const [showReplyBox, setShowReplyBox] = useState(false);
  const [forwardDept, setForwardDept] = useState("");
  const [showForward, setShowForward] = useState(false);
  const [departments, setDepartments] = useState<{id: string, name: string}[]>([]);

  const fetchMessages = async () => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
      const response = await fetch(`${API_URL}/api/tickets/${ticket.id}/responses`);
      if (response.ok) {
        const data = await response.json();
        setMessages(data);
      }
    } catch (error) {
      console.error("Error fetching messages:", error);
    }
  };

  const fetchDepartments = async () => {
    setDepartments([
      { id: "1", name: "Registrar's Office" },
      { id: "2", name: "Accounting Office" },
      { id: "3", name: "Clinic" },
      { id: "4", name: "CCS Office" },
      { id: "5", name: "Cashier's Office" },
      { id: "6", name: "SAO" },
      { id: "7", name: "Scholarship" }
    ]);
  };

  const handleStatusChange = async (newStatus: string) => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
      const response = await fetch(`${API_URL}/api/tickets/${ticket.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus })
      });
      
      if (response.ok) {
        toast({ title: `Ticket marked as ${newStatus}` });
        // Update local state to show change immediately
        ticket.status = newStatus;
        fetchMessages(); // Refresh to sync
      }
    } catch (error) {
      console.error("Error updating status:", error);
    }
  };

  const updateStatusToInProgress = async () => {
    if (isStaff && ticket.status?.toLowerCase() === "pending") {
      await handleStatusChange("in_progress");
    }
  };

  useEffect(() => {
    if (ticket?.id) {
      fetchMessages();
      fetchDepartments();
      updateStatusToInProgress();
    }
  }, [ticket?.id]);

  const handleSendReply = async () => {
    if (!reply.trim() || !user) return;
    setLoading(true);
    
    try {
      const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
      const userId = user.userId || user.id || user.user_id;
      
      const response = await fetch(`${API_URL}/api/tickets/${ticket.id}/responses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          message: reply.trim()
        })
      });

      if (response.ok) {
        setReply("");
        setShowReplyBox(false);
        fetchMessages();
        toast({ title: "Reply sent successfully" });

        // Force status to in_progress if staff replies to a pending ticket
        if (isStaff && ticket.status?.toLowerCase() === "pending") {
          await handleStatusChange("in_progress");
        }
      } else {
        throw new Error("Failed to send reply");
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleForward = async () => {
    if (!forwardDept) return;
    const dept = departments.find((d) => d.id === forwardDept);
    toast({ title: `Ticket forwarded to ${dept?.name || "department"}` });
    setShowForward(false);
    onClose();
  };

  const senderName = ticket.profiles 
    ? `${ticket.profiles.first_name || ""} ${ticket.profiles.last_name || ""}`.trim() 
    : "Student";
    
  const deptName = ticket.department || ticket.departments?.name || "Department";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-md px-4 py-6" onClick={onClose}>
      <div
        className="relative w-full max-w-2xl max-h-full overflow-y-auto rounded-3xl bg-background border shadow-2xl animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-background/90 backdrop-blur-md z-10 flex justify-between items-center px-8 py-6 border-b">
          <div>
            <h2 className="text-2xl font-black text-foreground uppercase italic tracking-tight">Ticket Details</h2>
            <p className="text-xs font-bold text-primary tracking-widest uppercase">#{ticket.ticket_number || "Draft"}</p>
          </div>
          <Button variant="secondary" size="icon" onClick={onClose} className="rounded-full h-10 w-10 hover:rotate-90 transition-all duration-300">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="p-8 space-y-8">
          {/* Metadata Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 bg-secondary/50 rounded-2xl border">
              <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block mb-1">Office / Department</span>
              <span className="text-lg font-bold text-foreground">{deptName}</span>
            </div>
            <div className="p-4 bg-blue/5 rounded-2xl border">
              <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block mb-1">Created At</span>
              <span className="text-sm font-bold text-foreground">{format(new Date(ticket.created_at), "MMM d, yyyy h:mm a")}</span>
            </div>
          </div>

          {/* Status Display */}
          <div className={`p-4 rounded-2xl border text-center font-black uppercase tracking-[0.2em] text-xs ${
            ticket.status?.toLowerCase() === "pending" ? "bg-amber-50 text-amber-700 border-amber-200" :
            ticket.status?.toLowerCase() === "in_progress" ? "bg-blue-50 text-blue-700 border-blue-200" :
            "bg-emerald-50 text-emerald-700 border-emerald-200"
          }`}>
            Status: {ticket.status?.replace('_', ' ')}
          </div>

          {/* Content */}
          <div className="space-y-4">
            <div className="space-y-1">
              <span className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] ml-1">Concern Topic</span>
              <div className="text-xl font-extrabold text-foreground bg-secondary/20 p-4 rounded-2xl border-l-4 border-primary">
                {ticket.subject}
              </div>
            </div>
          </div>

          {/* Thread History */}
          <div className="space-y-4">
            <h4 className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">Conversation Thread</h4>
            <div className="space-y-4">
              {/* Initial Message from Student */}
              <div className="bg-primary/5 border border-primary/20 rounded-2xl p-6 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-primary" />
                <div className="flex justify-between items-center mb-3">
                  <span className="text-xs font-black text-primary uppercase tracking-wider">
                    {isStaff ? senderName : "You"} (Student)
                  </span>
                  <span className="text-[10px] text-muted-foreground font-bold">
                    {format(new Date(ticket.created_at), "MMM d, h:mm a")}
                  </span>
                </div>
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{ticket.description || "No description provided."}</p>
              </div>

              {/* Subsequent Messages */}
              {messages.map((m) => (
                <div key={m.id} className="bg-card border rounded-2xl p-5 shadow-sm">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-xs font-bold text-primary">
                      {m.profiles?.first_name} {m.profiles?.last_name}
                    </span>
                    <span className="text-[10px] text-muted-foreground font-bold">
                      {m.created_at ? format(new Date(m.created_at), "MMM d, h:mm a") : "RECENT"}
                    </span>
                  </div>
                  <p className="text-sm text-foreground leading-relaxed">{m.content}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Dynamic Forms */}
          {showReplyBox && (
            <div className="p-6 border-2 border-primary/20 rounded-3xl bg-primary/5 space-y-4 animate-in slide-in-from-top-4">
              <h4 className="text-sm font-black uppercase text-primary ml-1">Write Response</h4>
              <Textarea
                placeholder="Type your message here..."
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                className="min-h-[150px] bg-background rounded-xl border-none shadow-inner text-base"
              />
              <div className="flex gap-3">
                <Button onClick={handleSendReply} disabled={loading || !reply.trim()} className="flex-1 py-6 rounded-xl font-bold">
                  {loading ? "SENDING..." : "SEND REPLY"}
                </Button>
                <Button variant="outline" onClick={() => setShowReplyBox(false)} className="rounded-xl px-8">Cancel</Button>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          {isStaff && !showReplyBox && (
            <div className="pt-6 border-t">
              <Button onClick={() => setShowReplyBox(true)} className="w-full py-8 text-xl font-black rounded-2xl shadow-xl hover:scale-[1.01] active:scale-[0.99] transition-all uc-gradient-btn text-white">
                REPLY TO TICKET
              </Button>
            </div>
          )}
          
          {!isStaff && !showReplyBox && (
            <div className="pt-6 border-t text-center">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest italic">Viewing ticket as requester</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TicketDetailModal;
