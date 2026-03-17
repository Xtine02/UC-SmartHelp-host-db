import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";

// Page Imports
import Index from "./pages/Index";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Settings from "./pages/Settings";
import Announcements from "./pages/Announcements";
import About from "./pages/About";
import Contact from "./pages/Contact";
import TicketsPage from "./pages/TicketsPage";
import NotFound from "./pages/NotFound";

// Component Imports
import StudentDashboard from "@/components/dashboard/StudentDashboard";
import AdminDashboard from "@/components/dashboard/AdminDashboard";
import GuestDashboard from "@/components/dashboard/GuestDashboard";
import AccountingDashboard from "@/components/dashboard/AccountingDashboard";
import ScholarshipDashboard from "@/components/dashboard/ScholarshipDashboard";
import { useEffect, useMemo, useState } from "react";
import ReviewModal from "@/components/ReviewModal";
import WebsiteFeedbackDialog from "@/components/tickets/WebsiteFeedbackDialog";

const queryClient = new QueryClient();

const App = () => {
  const [showWebsiteFeedback, setShowWebsiteFeedback] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(() => {
    return localStorage.getItem("website_feedback_submitted") === "1";
  });

  const user = useMemo(() => {
    try {
      const saved = localStorage.getItem("user");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  }, []);

  const shouldPrompt = useMemo(() => {
    // Only prompt for students/guests (not admins/staff)
    if (feedbackSubmitted) return false;
    if (!user) return true;
    return user.role === "student" || user.role === "guest";
  }, [feedbackSubmitted, user]);

  useEffect(() => {
    if (!shouldPrompt) return;

    const sessionId = localStorage.getItem("website_feedback_session") || `sess_${Date.now()}_${Math.random()}`;
    localStorage.setItem("website_feedback_session", sessionId);

    const sendBeacon = () => {
      // If feedback has already been submitted, nothing to do.
      if (localStorage.getItem("website_feedback_submitted") === "1") return;

      const payload = {
        session_id: sessionId,
        rating: 3,
        ease_of_use: 3,
        design: 3,
        speed: 3,
        comment: "User left without submitting feedback"
      };

      const url = (import.meta.env.VITE_API_URL || "http://localhost:3000") + "/api/website-feedback";
      const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
      navigator.sendBeacon(url, blob);
      localStorage.setItem("website_feedback_submitted", "1");
    };

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      // Show the native confirmation dialog
      if (!feedbackSubmitted) {
        setShowWebsiteFeedback(true);
        event.preventDefault();
        event.returnValue = "";
      }
    };

    const handlePageHide = () => {
      sendBeacon();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [feedbackSubmitted, shouldPrompt]);

  const handleFeedbackClose = () => {
    setShowWebsiteFeedback(false);
  };

  const handleFeedbackSubmitted = () => {
    setFeedbackSubmitted(true);
    localStorage.setItem("website_feedback_submitted", "1");
    setShowWebsiteFeedback(false);
  };

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <ReviewModal />
        <BrowserRouter>
          <Routes>
            {/* Main Public Routes */}
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            
            {/* Dashboard Routes by Role */}
            <Route path="/AdminDashboard" element={<AdminDashboard />} />
            <Route path="/admin-dashboard" element={<AdminDashboard />} />
            <Route path="/AccountingDashboard" element={<AccountingDashboard />} />
            <Route path="/ScholarshipDashboard" element={<ScholarshipDashboard />} />
            
            {/* Backward Compatibility */}
            <Route path="/StudentDashboard" element={<StudentDashboard />} />
            <Route path="/GuestDashboard" element={<GuestDashboard />} />
            <Route path="/dashboard" element={<StudentDashboard />} />
            
            {/* Tickets Page */}
            <Route path="/tickets" element={<TicketsPage />} />
            
            {/* Support Pages */}
            <Route path="/settings" element={<Settings />} />
            <Route path="/announcements" element={<Announcements />} />
            <Route path="/about" element={<About />} />
            <Route path="/contact" element={<Contact />} />
            
            {/* Catch-all 404 */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>

        <WebsiteFeedbackDialog
          open={showWebsiteFeedback}
          onClose={handleFeedbackClose}
          onSubmitted={handleFeedbackSubmitted}
        />
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
