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
  onFeedbackSuccess?: () => void;
  onReplySuccess?: () => void;
}

const TicketDetailModal = ({ ticket, onClose, isStaff = false, onFeedbackSuccess, onReplySuccess }: Props) => {
  // Manual Auth
  const savedUser = localStorage.getItem("user");
  const user = savedUser ? JSON.parse(savedUser) : null;
  const userId = user?.id || user?.userId || user?.user_id;
  const userRole = (user?.role || "").toString().trim().toLowerCase();
  const isAdmin = userRole === "admin";
  const isStaffUser = userRole === "staff";
  const isAdminOrStaff = isAdmin || isStaffUser;
  
  const { toast } = useToast();
  const [messages, setMessages] = useState<any[]>([]);
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(false);
  const [showReplyBox, setShowReplyBox] = useState(false);
  const [forwardDept, setForwardDept] = useState("");
  const [showForward, setShowForward] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [departments, setDepartments] = useState<{id: string | number, name: string}[]>([]);
  const [currentStatus, setCurrentStatus] = useState(ticket.status);
  const [ticketData, setTicketData] = useState<Ticket>(ticket);

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
    const fallbackDepartments = [
      { id: 1, name: "Registrar's Office" },
      { id: 2, name: "Accounting Office" },
      { id: 3, name: "Clinic" },
      { id: 4, name: "CCS Office" },
      { id: 5, name: "Cashier's Office" },
      { id: 6, name: "SAO" },
      { id: 7, name: "Scholarship" }
    ];

    try {
      const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
      console.log("Fetching departments from:", `${API_URL}/api/departments`);
      
      const response = await fetch(`${API_URL}/api/departments`);
      if (!response.ok) {
        console.warn(`Departments API returned status ${response.status}, using fallback`);
        setDepartments(fallbackDepartments);
        return;
      }

      const data = await response.json();
      console.log("Departments loaded from API:", data, "Count:", data?.length || 0);
      
      // Always use fallback as departments to ensure all 7 are shown
      const finalDepts = Array.isArray(data) && data.length > 0 ? data : fallbackDepartments;
      console.log("Final departments to display:", finalDepts);
      setDepartments(finalDepts); // Use final data if available

      // If the ticket already has a department, try to preselect it
      const deptList = finalDepts;
      const currentId = ticket.department_id ||
        (ticket.department
          ? deptList.find((d: any) => d.name?.toString().toLowerCase().trim() === ticket.department?.toString().toLowerCase().trim())?.id
          : undefined);

      if (currentId) {
        setForwardDept(currentId.toString());
      }
    } catch (error) {
      console.error("Error fetching departments:", error);
      console.log("Using fallback departments");
      setDepartments(fallbackDepartments);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
      const response = await fetch(`${API_URL}/api/tickets/${ticket.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus, user_id: userId })
      });
      
      if (response.ok) {
        const payload = await response.json();
        toast({ title: `Ticket marked as ${newStatus}` });
        const nextStatus = payload?.ticket?.status || newStatus;
        setCurrentStatus(nextStatus);
        if (payload?.ticket) {
          setTicketData((prev) => ({ ...prev, ...payload.ticket, status: nextStatus }));
        }
        onReplySuccess?.();
        
        // Show feedback dialog when ticket is marked as resolved by staff
        if (newStatus.toLowerCase() === "resolved" && isAdminOrStaff) {
          setShowFeedback(true);
        }
        
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
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: userId })
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.updated) {
            toast({ title: "Ticket Status: In-Progress", description: "This ticket has been acknowledged." });

            const normalizedStatus = data.ticket?.status
              ? (data.ticket.status as string).toLowerCase().trim().replace(/[\s\-]+/g, '_')
              : "in_progress";

            setCurrentStatus(normalizedStatus);
            if (data.ticket) {
              setTicketData((prev) => ({ ...prev, ...data.ticket, status: normalizedStatus }));
            }
          }
        }
      } catch (error) {
        console.error("Error acknowledging ticket:", error);
      }
    }
  };

  const markTicketAsReadForStudent = async () => {
    if (!isStaff && !isAdmin && ticket?.id) {
      try {
        const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
        const response = await fetch(`${API_URL}/api/tickets/${ticket.id}/acknowledge`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: userId, role: 'student' })
        });

        if (response.ok) {
          console.log("Ticket marked as read for student");
        }
      } catch (error) {
        console.error("Error marking ticket as read:", error);
      }
    }
  };

  const markTicketAsReadForStaff = async () => {
    if ((isStaffUser || isAdmin) && ticket?.id) {
      try {
        const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
        const response = await fetch(`${API_URL}/api/tickets/${ticket.id}/acknowledge`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: userId, role: 'staff' })
        });

        if (response.ok) {
          console.log("Ticket marked as read for staff");
          // Trigger parent to refresh tickets list to remove highlight
          onReplySuccess?.();
        }
      } catch (error) {
        console.error("Error marking ticket as read for staff:", error);
      }
    }
  };

  useEffect(() => {
    if (ticket?.id) {
      setCurrentStatus(ticket.status);
      setTicketData(ticket);
      fetchMessages();
      fetchDepartments();
      // Mark ticket as read for students when opened
      markTicketAsReadForStudent();
      // Mark ticket as read for staff/admin when opened
      markTicketAsReadForStaff();
    }
    // Removed polling - was causing resource exhaustion
    // Messages update through Supabase real-time subscriptions
  }, [ticket?.id]);

  // Re-fetch departments when forward dialog opens to ensure list is current
  useEffect(() => {
    if (showForward && departments.length === 0) {
      fetchDepartments();
    }
  }, [showForward, departments.length]);

  // Separate effect to trigger status change once currentStatus is set correctly
  useEffect(() => {
    if (ticket?.id) {
      updateStatusToInProgress();
    }
  }, [ticket?.id, isStaff]);

  // Debug effect to log departments
  useEffect(() => {
    console.log("Departments state updated:", departments, "Total count:", departments?.length || 0);
  }, [departments]);

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
        // Wait for messages to be fetched before proceeding
        await fetchMessages();
        
        // For staff, acknowledge the ticket after replying to remove the highlight
        if (isStaffUser) {
          try {
            await fetch(`${API_URL}/api/tickets/${ticket.id}/acknowledge`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ user_id: userId, role: 'staff' })
            });
            
            // Notify parent component to refresh tickets from server
            onReplySuccess?.();
          } catch (ackError) {
            console.error("Error acknowledging ticket after reply:", ackError);
            // Don't fail the operation if acknowledge fails
          }
        }
        
        toast({ title: "Reply sent successfully" });

        // Logic for auto-status transition on reply:
        if (isStaffUser) {
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
      const dept = departments.find((d) => d.id?.toString() === forwardDept);
      
      const response = await fetch(`${API_URL}/api/tickets/${ticket.id}/forward`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          department_id: forwardDept,
          user_id: user?.id || user?.userId || user?.user_id
        })
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

  const senderName =
    ticket.full_name ||
    `${ticket.first_name || ""} ${ticket.last_name || ""}`.trim() ||
    (ticket.profiles ? `${ticket.profiles.first_name || ""} ${ticket.profiles.last_name || ""}`.trim() : "") ||
    "Student";
    
  const deptName = ticket.department || ticket.departments?.name || "Department";
  const resolvedOrClosedAt = ticketData.closed_at;
  const displayStatus =
    currentStatus?.toLowerCase() === "in_progress"
      ? "In-Progress"
      : (currentStatus?.toLowerCase() === "resolved" || currentStatus?.toLowerCase() === "closed")
      ? "Resolved/Closed"
      : currentStatus?.toLowerCase() === "reopened"
      ? "Reopened"
      : "Pending";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-md px-4 py-6" onClick={onClose}>
      <div
        className="relative w-full max-w-4xl max-h-[90vh] flex flex-col rounded-3xl bg-background border shadow-2xl animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-background/90 backdrop-blur-md z-10 flex justify-between items-center px-8 py-6 border-b">
          <div>
            <h2 className="text-2xl font-black text-foreground uppercase italic tracking-tight">Ticket Details</h2>
            <p className="text-xs font-bold text-primary tracking-widest uppercase">#{ticketData.ticket_number || "Draft"}</p>
          </div>
          <Button variant="secondary" size="icon" onClick={onClose} className="rounded-full h-10 w-10 hover:rotate-90 transition-all duration-300">
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Scrollable body (only messages and content scroll) */}
        <div className="flex-1 overflow-y-auto p-8 space-y-8">
          {/* Metadata Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 bg-secondary/50 rounded-2xl border">
              <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block mb-1">Office / Department</span>
              <span className="text-lg font-bold text-foreground">{deptName}</span>
            </div>
            <div className="p-4 bg-blue/5 rounded-2xl border">
              <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block mb-1">Created At</span>
              <span className="text-sm font-bold text-foreground">{format(new Date(ticketData.created_at), "MMM d, yyyy h:mm a")}</span>
            </div>
            {ticketData.acknowledge_at && !ticketData.closed_at && (
              <div className="p-4 bg-green/5 rounded-2xl border">
                <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block mb-1">Acknowledged At</span>
                <span className="text-sm font-bold text-green-700">{format(new Date(ticketData.acknowledge_at), "MMM d, yyyy h:mm a")}</span>
              </div>
            )}
            {resolvedOrClosedAt && (
              <div className="p-4 bg-red/5 rounded-2xl border">
                <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block mb-1">Resolved/Closed At</span>
                <span className="text-sm font-bold text-red-700">{format(new Date(resolvedOrClosedAt), "MMM d, yyyy h:mm a")}</span>
              </div>
            )}
            {ticketData.reopen_at && (
              <div className="p-4 bg-orange/5 rounded-2xl border">
                <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block mb-1">Reopened At</span>
                <span className="text-sm font-bold text-orange-700">{format(new Date(ticketData.reopen_at), "MMM d, yyyy h:mm a")}</span>
              </div>
            )}
          </div>

          {/* Status Display */}
          <div className={`p-4 rounded-2xl border text-center font-black uppercase tracking-[0.2em] text-xs ${
            currentStatus?.toLowerCase() === "pending" ? "bg-orange-50 text-orange-700 border-orange-200" :
            currentStatus?.toLowerCase() === "in_progress" ? "bg-blue-50 text-blue-700 border-blue-200" :
            (currentStatus?.toLowerCase() === "resolved" || currentStatus?.toLowerCase() === "closed") ? "bg-green-50 text-green-700 border-green-200" :
            currentStatus?.toLowerCase() === "reopened" ? "bg-pink-50 text-pink-700 border-pink-200" :
            "bg-gray-50 text-gray-700 border-gray-200"
          }`}>
            Status: {displayStatus}
          </div>

          {/* Content */}
          <div className="space-y-4">
            <div className="space-y-1">
              <span className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] ml-1">Concern Topic</span>
              <div className="text-xl font-extrabold text-foreground bg-secondary/20 p-4 rounded-2xl border-l-4 border-primary">
                {ticketData.subject}
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
                    {format(new Date(ticketData.created_at), "MMM d, h:mm a")}
                  </span>
                </div>
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{ticketData.description || "No description provided."}</p>
              </div>

              {/* Subsequent Messages */}
              {messages.map((m) => (
                <div key={m.id} className={`border rounded-2xl p-5 shadow-sm ${m.role === 'staff' || m.role === 'admin' ? 'bg-emerald-50/50 ml-6' : 'bg-card mr-6'}`}>
                  <div className="flex justify-between items-center mb-3">
                    <span className={`text-xs font-bold ${m.role === 'staff' || m.role === 'admin' ? 'text-emerald-700' : 'text-primary'}`}>
                      {(!isAdminOrStaff && m.role === 'student')
                        ? "You"
                        : (`${m.first_name || ""} ${m.last_name || ""}`.trim() || "Student")
                      } ({m.role?.toUpperCase()})
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
        </div>

        {/* Fixed footer actions */}
        <div className="sticky bottom-0 z-10 bg-background/90 backdrop-blur-md border-t px-8 py-6">
          {showReplyBox ? (
            <div className="space-y-4">
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
          ) : showForward ? (
            <div className="space-y-4">
              <h4 className="text-sm font-black uppercase text-purple-600 ml-1">Select Department to Forward</h4>
              <p className="text-xs text-muted-foreground ml-1">Choose a department to redirect this ticket</p>
              {departments.length === 0 ? (
                <div className="rounded-xl border-2 border-dashed border-gray-300 p-4 text-sm text-muted-foreground">
                  No departments loaded yet. Please refresh or wait for the list to appear.
                </div>
              ) : (
                <Select value={forwardDept} onValueChange={setForwardDept}>
                  <SelectTrigger className="w-full rounded-xl border-2 border-purple-200 bg-background h-12">
                    <SelectValue placeholder="Choose a department..." />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl" portalled={false}>
                    {departments.map((dept) => (
                      <SelectItem key={dept.id} value={dept.id?.toString() || ""}>
                        {dept.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <div className="flex gap-3">
                <Button 
                  onClick={handleForward} 
                  disabled={!forwardDept || loading}
                  className="flex-1 py-6 rounded-xl font-bold bg-purple-500 hover:bg-purple-600 text-white disabled:opacity-50"
                >
                  {loading ? "FORWARDING..." : "CONFIRM FORWARD"}
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
          ) : (
            <div className="space-y-3">
              {isAdmin ? (
                // Admin view - show FORWARD button
                <Button 
                  onClick={() => setShowForward(true)} 
                  className="w-full py-8 text-xl font-black rounded-2xl shadow-xl hover:scale-[1.01] active:scale-[0.99] transition-all bg-purple-500 hover:bg-purple-600 text-white uppercase italic"
                >
                  <Send className="mr-2 h-5 w-5" />
                  FORWARD TICKET
                </Button>
              ) : isStaffUser ? (
                // Staff view - show REPLY or REOPEN button based on status
                <>
                  {(currentStatus?.toLowerCase() === "resolved" || currentStatus?.toLowerCase() === "closed") ? (
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
                </>
              ) : (
                // Student view - show REPLY or REOPEN behavior
                <>
                  {(currentStatus?.toLowerCase() === "resolved" || currentStatus?.toLowerCase() === "closed") ? (
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
        </div>

        {/* Feedback Dialog - Only for students */}
        {!isStaff && (
          <FeedbackDialog
            open={showFeedback}
            onClose={() => setShowFeedback(false)}
            departmentName={deptName}
            departmentId={ticket.department_id}
            onSuccess={onFeedbackSuccess}
          />
        )}
      </div>
    </div>
  );
};

export default TicketDetailModal;
