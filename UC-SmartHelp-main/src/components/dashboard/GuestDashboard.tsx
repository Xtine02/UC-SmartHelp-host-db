import { Ticket, ClipboardList } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
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

const GuestDashboard = () => {
  const { showConfirm, handleConfirmLeave, handleStayOnPage } = useBackConfirm();

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

        <FlowiseChatbot />
      </main>
    </div>
  );
};

export default GuestDashboard;
