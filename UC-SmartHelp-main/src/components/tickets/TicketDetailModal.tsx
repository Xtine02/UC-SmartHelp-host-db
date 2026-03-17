import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { X, Send } from "lucide-react";
import { format } from "date-fns";
import FeedbackDialog from "./FeedbackDialog";

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
  const [showFeedback, setShowFeedback] = useState(false);
  const [departments, setDepartments] = useState<{id: string, name: string}[]>([]);
  const [currentStatus, setCurrentStatus] = useState(ticket.status);

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
        setCurrentStatus(newStatus);
        fetchMessages();
      } else {
        const errorData = await response.json();
        toast({ title: "Error", description: errorData.error || "Failed to update status", variant: "destructive" });
      }
    } catch (error) {
      console.error("Error updating status:", error);
    }
  };

  const updateStatusToInProgress = async () => {
    if (isStaff && !ticket.acknowledge_at) {
      try {
        const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
        const response = await fetch(`${API_URL}/api/tickets/${ticket.id}/open`, {
          method: "PATCH",
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.updated) {
            toast({ title: "Ticket Status: In-Progress", description: "This ticket has been acknowledged." });

            const normalizedStatus = data.ticket?.status
              ? (data.ticket.status as string).toLowerCase().trim().replace(/[\s\-]+/g, '_')
              : "in_progress";

            setCurrentStatus(normalizedStatus);
          }
        }
      } catch (error) {
        console.error("Error acknowledging ticket:", error);
      }
    }
  };

  useEffect(() => {
    if (ticket?.id) {
      setCurrentStatus(ticket.status);
      fetchMessages();
      fetchDepartments();
    }
  }, [ticket?.id]);

  // Separate effect to trigger status change once currentStatus is set correctly
  useEffect(() => {
    if (ticket?.id) {
      updateStatusToInProgress();
    }
  }, [ticket?.id, isStaff]);

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

        // Logic for auto-status transition on reply:
        if (isStaff) {
          // If staff replies to a pending or reopened ticket, move it to in_progress
          if (currentStatus?.toLowerCase() === "pending" || currentStatus?.toLowerCase() === "reopened") {
            await handleStatusChange("in_progress");
          }
        } else {
          // If student replies to a resolved ticket, move it back to reopened
          if (currentStatus?.toLowerCase() === "resolved") {
            await handleStatusChange("reopened");
          }
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData?.error || "Failed to send reply";
        const errorDetails = errorData?.details ? ` (${errorData.details})` : "";
        throw new Error(`${errorMessage}${errorDetails}`);
      }
    } catch (error: any) {
      const message = typeof error?.message === "string" ? error.message : "Failed to send reply";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleForward = async () => {
    if (!forwardDept) {
      toast({ title: "Error", description: "Please select a department", variant: "destructive" });
      return;
    }
    
    try {
      const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
      const dept = departments.find((d) => d.id === forwardDept);
      
      const response = await fetch(`${API_URL}/api/tickets/${ticket.id}/forward`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ department_id: forwardDept })
      });

      if (response.ok) {
        toast({ title: "Ticket Forwarded", description: `Ticket forwarded to ${dept?.name || "department"}` });
        setShowForward(false);
        setForwardDept("");
        onClose();
      } else {
        const error = await response.json().catch(() => ({}));
        throw new Error(error?.error || "Failed to forward ticket");
      }
    } catch (error: any) {
      const message = typeof error?.message === "string" ? error.message : "Failed to forward ticket";
      toast({ title: "Error", description: message, variant: "destructive" });
    }
  };

  const senderName = ticket.profiles 
    ? `${ticket.profiles.first_name || ""} ${ticket.profiles.last_name || ""}`.trim() 
    : "Student";
    
  const deptName = ticket.department || ticket.departments?.name || "Department";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-md px-4 py-6" onClick={onClose}>
      <div
        className="relative w-full max-w-4xl max-h-full overflow-y-auto rounded-3xl bg-background border shadow-2xl animate-in zoom-in-95 duration-200"
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
            currentStatus?.toLowerCase() === "pending" ? "bg-orange-50 text-orange-700 border-orange-200" :
            currentStatus?.toLowerCase() === "in_progress" ? "bg-blue-50 text-blue-700 border-blue-200" :
            currentStatus?.toLowerCase() === "resolved" ? "bg-green-50 text-green-700 border-green-200" :
            currentStatus?.toLowerCase() === "reopened" ? "bg-pink-50 text-pink-700 border-pink-200" :
            "bg-gray-50 text-gray-700 border-gray-200"
          }`}>
            Status: {currentStatus?.replace('_', ' ')}
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
                <div key={m.id} className={`border rounded-2xl p-5 shadow-sm ${m.role === 'staff' || m.role === 'admin' ? 'bg-emerald-50/50 ml-6' : 'bg-card mr-6'}`}>
                  <div className="flex justify-between items-center mb-3">
                    <span className={`text-xs font-bold ${m.role === 'staff' || m.role === 'admin' ? 'text-emerald-700' : 'text-primary'}`}>
                      {m.first_name} {m.last_name} ({m.role?.toUpperCase()})
                    </span>
                    <span className="text-[10px] text-muted-foreground font-bold">
                      {m.created_at ? format(new Date(m.created_at), "MMM d, h:mm a") : "RECENT"}
                    </span>
                  </div>
                  <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{m.message}</p>
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
          {!showReplyBox && !showForward && (
            <div className="pt-6 border-t space-y-3">
              {isStaff ? (
                // Staff/Admin view - show FORWARD button
                <Button 
                  onClick={() => setShowForward(true)} 
                  className="w-full py-8 text-xl font-black rounded-2xl shadow-xl hover:scale-[1.01] active:scale-[0.99] transition-all bg-purple-500 hover:bg-purple-600 text-white uppercase italic"
                >
                  <Send className="mr-2 h-5 w-5" />
                  FORWARD TICKET
                </Button>
              ) : (
                // Student view - show REPLY button
                <>
                  {currentStatus?.toLowerCase() === "resolved" ? (
                    <Button 
                      onClick={() => handleStatusChange("reopened")} 
                      className="w-full py-8 text-xl font-black rounded-2xl shadow-xl hover:scale-[1.01] active:scale-[0.99] transition-all bg-orange-500 hover:bg-orange-600 text-white uppercase italic"
                    >
                      REOPEN THIS TICKET
                    </Button>
                  ) : (
                    <Button onClick={() => setShowReplyBox(true)} className="w-full py-8 text-xl font-black rounded-2xl shadow-xl hover:scale-[1.01] active:scale-[0.99] transition-all uc-gradient-btn text-white">
                      REPLY TO TICKET
                    </Button>
                  )}
                  <div className="mt-4 text-center">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest italic">Viewing ticket as requester</p>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Forward Department Selector */}
          {showForward && (
            <div className="p-6 border-2 border-purple-500/20 rounded-3xl bg-purple-50/5 space-y-4 animate-in slide-in-from-top-4">
              <h4 className="text-sm font-black uppercase text-purple-600 ml-1">Select Department to Forward</h4>
              <Select value={forwardDept} onValueChange={setForwardDept}>
                <SelectTrigger className="rounded-xl bg-background border-2 border-purple-200 h-12">
                  <SelectValue placeholder="Choose a department..." />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {departments.map((dept) => (
                    <SelectItem key={dept.id} value={dept.id}>
                      {dept.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-3">
                <Button 
                  onClick={handleForward} 
                  disabled={!forwardDept || loading}
                  className="flex-1 py-6 rounded-xl font-bold bg-purple-500 hover:bg-purple-600 text-white"
                >
                  {loading ? "FORWARDING..." : "FORWARD"}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setShowForward(false);
                    setForwardDept("");
                  }} 
                  className="rounded-xl px-8"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>

      {/* Feedback Dialog - Only for students */}
      {!isStaff && (
        <FeedbackDialog
          open={showFeedback}
          onClose={() => setShowFeedback(false)}
          departmentName={deptName}
          departmentId={ticket.department_id}
          ticketId={ticket.id}
        />
      )}
      </div>
    </div>
  );
};

export default TicketDetailModal;
