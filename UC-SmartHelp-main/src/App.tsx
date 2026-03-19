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
import AuditTrail from "./pages/AuditTrail";
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
import LeaveWithFeedbackDialog from "@/components/tickets/LeaveWithFeedbackDialog";

const queryClient = new QueryClient();

const App = () => {
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
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

    const performLogout = async () => {
      // Log user logout when tab/browser is closed
      try {
        const userJson = localStorage.getItem("user");
        if (userJson) {
          const user = JSON.parse(userJson);
          const userId = user?.id || user?.userId || user?.user_id;
          if (userId) {
            const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
            const logoutPayload = JSON.stringify({ userId });
            const blob = new Blob([logoutPayload], { type: "application/json" });
            navigator.sendBeacon(`${API_URL}/api/logout`, blob);
          }
        }
      } catch (error) {
        console.error("Error logging logout on tab close:", error);
      }
      
      // Clear user session data when tab is closed
      localStorage.removeItem("user");
      localStorage.removeItem("uc_guest");
      sessionStorage.removeItem("guest_chat_history");
    };

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      // Show the leave dialog instead of default browser confirmation
      if (!feedbackSubmitted) {
        setShowLeaveDialog(true);
        event.preventDefault();
        event.returnValue = "";
      }
    };

    const handlePageHide = async () => {
      await performLogout();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [feedbackSubmitted, shouldPrompt]);

  const handleConfirmLeave = async () => {
    setShowLeaveDialog(false);
    localStorage.setItem("website_feedback_submitted", "1");
    
    // Perform logout
    try {
      const userJson = localStorage.getItem("user");
      if (userJson) {
        const user = JSON.parse(userJson);
        const userId = user?.id || user?.userId || user?.user_id;
        if (userId) {
          const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
          const logoutPayload = JSON.stringify({ userId });
          const blob = new Blob([logoutPayload], { type: "application/json" });
          navigator.sendBeacon(`${API_URL}/api/logout`, blob);
        }
      }
    } catch (error) {
      console.error("Error logging logout:", error);
    }
    
    localStorage.removeItem("user");
    localStorage.removeItem("uc_guest");
    sessionStorage.removeItem("guest_chat_history");
  };

  const handleLeaveClose = () => {
    setShowLeaveDialog(false);
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
            <Route path="/audit-trail" element={<AuditTrail />} />
            <Route path="/announcements" element={<Announcements />} />
            <Route path="/about" element={<About />} />
            <Route path="/contact" element={<Contact />} />
            
            {/* Catch-all 404 */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>

        <LeaveWithFeedbackDialog
          open={showLeaveDialog}
          onClose={handleLeaveClose}
          onConfirmLeave={handleConfirmLeave}
        />
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
