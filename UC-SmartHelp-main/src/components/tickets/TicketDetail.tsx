import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ArrowLeft, Send } from "lucide-react";

interface Props {
  ticket: any;
  onBack: () => void;
}

const TicketDetail = ({ ticket, onBack }: Props) => {
  // Manual Auth Patterns
  const userJson = localStorage.getItem("user");
  const user = userJson ? JSON.parse(userJson) : null;
  const roles = user?.role ? [user.role] : [];
  
  const { toast } = useToast();
  const [messages, setMessages] = useState<any[]>([]);
  const [reply, setReply] = useState("");
  const [status, setStatus] = useState(ticket.status);
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(ticket.staff_acknowledge_at || ticket.closed_at || ticket.reopen_at || ticket.created_at);
  const isStaffOrAdmin = roles.includes("staff") || roles.includes("admin");

  const fetchMessages = async () => {
    const { data } = await supabase
      .from("ticket_messages")
      .select("*, profiles:sender_id(first_name, last_name)")
      .eq("ticket_id", ticket.id)
      .order("created_at", { ascending: true });
    if (data) setMessages(data);
  };

  useEffect(() => {
    fetchMessages();
    // Removed polling - was causing resource exhaustion
    // Messages update through Supabase real-time subscriptions
  }, [ticket.id]);

  const handleSendReply = async () => {
    if (!reply.trim() || !user) return;
    setLoading(true);
    await supabase.from("ticket_messages").insert({
      ticket_id: ticket.id,
      sender_id: user.userId || user.id,
      content: reply,
    });
    setReply("");
    setLoading(false);
    // Wait for messages to be fetched before proceeding
    await fetchMessages();

    // Automatically change status to in-progress if staff replies to pending ticket
    if (status === "pending" && isStaffOrAdmin) {
      await supabase.from("tickets").update({ status: "in_progress" }).eq("id", ticket.id);
      setStatus("in_progress");
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    setStatus(newStatus);
    await supabase.from("tickets").update({ status: newStatus as any }).eq("id", ticket.id);
    toast({ title: "Status updated" });
  };

  return (
    <div className="space-y-6">
      <Button variant="outline" onClick={onBack}><ArrowLeft className="mr-2 h-4 w-4" /> Back</Button>

      <div className="rounded-xl border bg-card p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex-1">
            <h2 className="text-xl font-bold text-foreground">{ticket.subject}</h2>
            <p className="text-sm text-muted-foreground">
              Ticket {ticket.ticket_number} • {ticket.departments?.name}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Created at: {format(new Date(ticket.created_at), "MMM d, yyyy h:mm a")}
            </p>
            {ticket.closed_at && (
              <p className="text-sm text-red-600 font-medium">
                Closed/Resolved at: {format(new Date(ticket.closed_at), "MMM d, yyyy h:mm a")}
              </p>
            )}
            {ticket.reopen_at && (
              <p className="text-sm text-orange-600 font-medium">
                Reopened at: {format(new Date(ticket.reopen_at), "MMM d, yyyy h:mm a")}
              </p>
            )}
            {ticket.staff_acknowledge_at && !ticket.closed_at && (
              <p className="text-sm text-green-600 font-medium">
                Acknowledged at: {format(new Date(ticket.staff_acknowledge_at), "MMM d, yyyy h:mm a")}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-3 min-w-max">
            {isStaffOrAdmin ? (
              <Select value={status} onValueChange={handleStatusChange}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="in_progress">In-Progress</SelectItem>
                  <SelectItem value="resolved">Resolved/Closed</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Badge>{status === "in_progress" ? "In-Progress" : status === "resolved" ? "Resolved/Closed" : "Pending"}</Badge>
            )}
            <Select value={updatedAt ? "updated" : "none"} disabled={true}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ticket.staff_acknowledge_at && (
                  <SelectItem value="acknowledge">Acknowledged at: {format(new Date(ticket.staff_acknowledge_at), "MMM d, yyyy h:mm a")}</SelectItem>
                )}
                {ticket.closed_at && (
                  <SelectItem value="closed">Closed at: {format(new Date(ticket.closed_at), "MMM d, yyyy h:mm a")}</SelectItem>
                )}
                {ticket.reopen_at && (
                  <SelectItem value="reopen">Reopened at: {format(new Date(ticket.reopen_at), "MMM d, yyyy h:mm a")}</SelectItem>
                )}
                {!ticket.staff_acknowledge_at && !ticket.closed_at && !ticket.reopen_at && (
                  <SelectItem value="none">No updates yet</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Original message */}
        <div className="rounded-lg bg-secondary p-4">
          <p className="text-sm font-medium text-foreground">
            From: {isStaffOrAdmin ? `${ticket.profiles?.first_name} ${ticket.profiles?.last_name}` : "You"}
          </p>
          <p className="mt-2 text-foreground whitespace-pre-wrap">{ticket.description}</p>
        </div>

        {/* Thread */}
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {messages.map((m) => (
            <div key={m.id} className={`rounded-lg p-4 ${m.sender_id === ticket.sender_id ? "bg-secondary" : "bg-primary/10"}`}>
              <p className="text-xs font-medium text-muted-foreground mb-1">
                {!isStaffOrAdmin ? "You" : `${m.profiles?.first_name} ${m.profiles?.last_name}`} • {format(new Date(m.created_at), "MMM d, yyyy h:mm a")}
              </p>
              <p className="text-foreground whitespace-pre-wrap">{m.content}</p>
            </div>
          ))}
        </div>

        {/* Reply */}
        <div className="flex gap-2">
          <Textarea
            placeholder="Type your reply..."
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            className="flex-1"
          />
          <Button onClick={handleSendReply} disabled={loading || !reply.trim()} className="uc-gradient-btn text-primary-foreground self-end">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default TicketDetail;
