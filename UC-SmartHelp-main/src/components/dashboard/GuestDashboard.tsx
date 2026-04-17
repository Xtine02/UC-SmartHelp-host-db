import { Ticket, ClipboardList, MessagesSquare } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import Navbar from "@/components/Navbar";

const GuestDashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  // Check if user is a guest, redirect if not
  useEffect(() => {
    const checkGuestStatus = () => {
      const isGuest = localStorage.getItem("uc_guest") === "1";
      if (!isGuest) {
        navigate("/");
        return;
      }
      setLoading(false);
    };

    checkGuestStatus();

    // Listen for logout events
    const handleLogout = () => {
      navigate("/");
    };

    window.addEventListener("user-logout", handleLogout);
    window.addEventListener("storage", checkGuestStatus);

    return () => {
      window.removeEventListener("user-logout", handleLogout);
      window.removeEventListener("storage", checkGuestStatus);
    };
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

      <main className="flex-1 container mx-auto p-4 md:p-8 animate-in fade-in duration-500">
        <div className="space-y-8">
          {/* Welcome banner - Simplified for the inner view */}
          <div className="rounded-xl uc-gradient px-8 py-10 bg-primary text-white text-center shadow-md">
            <h1 className="text-3xl font-bold italic md:text-4xl">Welcome, Guest!</h1>
            <p className="mt-2 text-primary-foreground/90">Explore our campus assistant below.</p>
          </div>

          <div className="max-w-4xl mx-auto space-y-10">
            {/* Locked Features Grid */}
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="relative group flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed bg-muted/30 p-8 transition-all">
                <div className="absolute top-4 right-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground bg-secondary px-2 py-1 rounded">
                  Locked
                </div>
                <div className="h-16 w-16 rounded-full bg-background flex items-center justify-center shadow-inner">
                  <Ticket className="h-8 w-8 text-muted-foreground opacity-40" />
                </div>
                <span className="text-xl font-bold text-muted-foreground">New Ticket</span>
                <p className="text-sm text-muted-foreground text-center">
                  Please <Link to="/register" className="text-primary underline font-medium">Register</Link> to submit formal support requests.
                </p>
              </div>

              <div className="relative group flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed bg-muted/30 p-8 transition-all">
                <div className="absolute top-4 right-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground bg-secondary px-2 py-1 rounded">
                  Locked
                </div>
                <div className="h-16 w-16 rounded-full bg-background flex items-center justify-center shadow-inner">
                  <ClipboardList className="h-8 w-8 text-muted-foreground opacity-40" />
                </div>
                <span className="text-xl font-bold text-muted-foreground">Track Tickets</span>
                <p className="text-sm text-muted-foreground text-center">
                  Sign in to view the history and status of your tickets.
                </p>
              </div>
            </div>

            <div className="flex justify-center">
              <button
                onClick={() => navigate("/chat-history")}
                className="w-full max-w-md flex flex-col items-center gap-3 rounded-2xl border bg-card p-6 shadow-sm transition-all hover:shadow-lg hover:-translate-y-1"
              >
                <div className="h-14 w-14 bg-primary/10 rounded-full flex items-center justify-center">
                  <MessagesSquare className="h-7 w-7 text-primary" />
                </div>
                <span className="text-lg font-bold text-foreground">Chat History</span>
                <p className="text-sm text-muted-foreground text-center">View and continue your guest chatbot conversation</p>
              </button>
            </div>

            {/* Call to Action for Guests */}
            <div className="bg-card border rounded-2xl p-6 text-center shadow-sm">
              <h3 className="text-lg font-semibold mb-2">Want the full experience?</h3>
              <p className="text-muted-foreground mb-4 text-sm">Create an account to track tickets and get personalized updates.</p>
              <div className="flex gap-3 justify-center">
                <Button asChild variant="default" className="uc-gradient-btn">
                  <Link to="/register">Create Account</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/about">Learn More</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default GuestDashboard;
