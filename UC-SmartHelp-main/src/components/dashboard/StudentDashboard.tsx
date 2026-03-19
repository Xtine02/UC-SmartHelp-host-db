import { useState, useEffect } from "react";
import { Ticket as TicketIcon, ClipboardList } from "lucide-react";
import { useNavigate } from "react-router-dom";
import NewTicketDialog from "@/components/tickets/NewTicketDialog";
import TicketDetailModal from "@/components/tickets/TicketDetailModal";
import FeedbackDialog from "@/components/tickets/FeedbackDialog";
import Navbar from "@/components/Navbar";
import FlowiseChatbot from "@/components/FlowiseChatbot";
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

interface Ticket {
  id: string;
  ticket_number: string;
  subject: string;
  status: string;
  created_at: string;
  department_id: string;
  department?: string;
  user_id?: string;
  description?: string;
  acknowledge_at?: string | null;
  closed_at?: string | null;
  reopen_at?: string | null;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  departments?: { name: string } | null;
  profiles?: {
    first_name: string;
    last_name: string;
  } | null;
}

interface User {
  firstName?: string;
  id?: number;
  userId?: number;
  user_id?: number;
}

const StudentDashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [showNewTicket, setShowNewTicket] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [view, setView] = useState<"home" | "tickets">("home");

  const { showConfirm, handleConfirmLeave, handleStayOnPage } = useBackConfirm(
    view !== 'home' ? () => setView('home') : undefined
  );

  useEffect(() => {
    const checkAuth = () => {
      try {
        const savedUser = localStorage.getItem("user");
        const isGuest = localStorage.getItem("uc_guest") === "1";
        
        if (!savedUser && !isGuest) {
          navigate("/login");
          return;
        }

        if (savedUser) {
          setUser(JSON.parse(savedUser));
        }
        setLoading(false);
      } catch (e) {
        console.error("Dashboard Auth Error:", e);
        navigate("/login");
      }
    };

    checkAuth();
  }, [navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
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
        <div className="rounded-2xl border bg-card shadow-xl overflow-hidden min-h-[500px] p-6">
          <div className="rounded-xl uc-gradient px-8 py-6 bg-primary text-white text-center shadow-md mb-8">
            <h1 className="text-2xl font-bold italic md:text-3xl">
              Welcome {user?.firstName || (localStorage.getItem("uc_guest") === "1" ? "Guest" : "Student")}!
            </h1>
          </div>

          <div className="max-w-2xl mx-auto space-y-8">
            <div className="grid gap-6 sm:grid-cols-2">
              <button
                onClick={() => setShowNewTicket(true)}
                className="flex flex-col items-center gap-3 rounded-xl border bg-card p-8 shadow-sm transition-all hover:shadow-lg hover:-translate-y-1"
              >
                <div className="h-16 w-16 bg-primary/10 rounded-full flex items-center justify-center">
                  <TicketIcon className="h-8 w-8 text-primary" />
                </div>
                <span className="text-xl font-bold text-foreground">New Ticket</span>
                <p className="text-sm text-muted-foreground text-center">Create a new support ticket</p>
              </button>

              <button
                onClick={() => navigate("/tickets")}
                className="flex flex-col items-center gap-3 rounded-xl border bg-card p-8 shadow-sm transition-all hover:shadow-lg hover:-translate-y-1"
              >
                <div className="h-16 w-16 bg-primary/10 rounded-full flex items-center justify-center">
                  <ClipboardList className="h-8 w-8 text-primary" />
                </div>
                <span className="text-xl font-bold text-foreground">Check Status</span>
                <p className="text-sm text-muted-foreground text-center">View and manage your tickets</p>
              </button>
            </div>
          </div>
        </div>

        <FlowiseChatbot />
      </main>

      <NewTicketDialog open={showNewTicket} onOpenChange={setShowNewTicket} />
      <FeedbackDialog open={showFeedback} onClose={() => setShowFeedback(false)} />
      {selectedTicket && (
        <TicketDetailModal
          ticket={selectedTicket}
          onClose={() => { setSelectedTicket(null); }}
          isStaff={false}
        />
      )}
    </div>
  );
};

export default StudentDashboard;