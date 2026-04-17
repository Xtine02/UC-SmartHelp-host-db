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
import Map from "./pages/Map";
import About from "./pages/About";
import Contact from "./pages/Contact";
import Help from "./pages/Help";
import TicketsPage from "./pages/TicketsPage";
import ChatHistoryPage from "./pages/ChatHistoryPage";
import DepartmentAnalytics from "./pages/DepartmentAnalytics";
import NotFound from "./pages/NotFound";
import NotificationsPage from "./pages/NotificationsPage";

// Component Imports
import StudentDashboard from "@/components/dashboard/StudentDashboard";
import AdminDashboard from "@/components/dashboard/AdminDashboard";
import GuestDashboard from "@/components/dashboard/GuestDashboard";
import AccountingDashboard from "@/components/dashboard/AccountingDashboard";
import ScholarshipDashboard from "@/components/dashboard/ScholarshipDashboard";
import FlowiseChatbot from "@/components/FlowiseChatbot";
import { useEffect, useState, useRef } from "react";
import WebsiteFeedbackDialog from "@/components/tickets/WebsiteFeedbackDialog";
const queryClient = new QueryClient();

const App = () => {
  const [user, setUser] = useState<any>(null);
  const [showWebsiteFeedback, setShowWebsiteFeedback] = useState(false);
  const prevUserRef = useRef<any>(null);
  const feedbackTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Read user from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("user");
      setUser(saved ? JSON.parse(saved) : null);
    } catch (e) {
      console.error("Failed to parse user:", e);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    const userId = user?.id || user?.userId || user?.user_id;
    const prevUserId = prevUserRef.current?.id || prevUserRef.current?.userId || prevUserRef.current?.user_id;

    // Detect login (user changed from null/no-id to having an id)
    if (userId && !prevUserId) {
      console.log('✅ User logged in. Starting 30-second countdown for website feedback');
      
      // Clear any existing timeout
      if (feedbackTimeoutRef.current) {
        clearTimeout(feedbackTimeoutRef.current);
      }

      // Set new timeout for 30 seconds
      feedbackTimeoutRef.current = setTimeout(() => {
        console.log('⏰ 30 seconds elapsed - checking if feedback should show');
        // Only show if feedback hasn't been shown/skipped in this session
        if (!sessionStorage.getItem("website_feedback_shown_session")) {
          console.log('📢 Showing website feedback dialog');
          setShowWebsiteFeedback(true);
        } else {
          console.log('⏭️ Feedback already shown/skipped in this session');
        }
      }, 30000); // 30 seconds
    }

    if (!userId && prevUserId) {
      console.log('👋 User logged out');
      sessionStorage.removeItem("website_feedback_shown_session");
    }

    // Update previous user ref
    prevUserRef.current = user;

    // Cleanup timeout on component unmount or logout
    return () => {
      if (feedbackTimeoutRef.current) {
        clearTimeout(feedbackTimeoutRef.current);
      }
    };
  }, [user]);

  // Listen for manual feedback trigger from navbar
  useEffect(() => {
    const handleOpenFeedback = () => setShowWebsiteFeedback(true);
    const handleProfileUpdated = () => {
      // User logged in - refresh user state
      try {
        const saved = localStorage.getItem("user");
        setUser(saved ? JSON.parse(saved) : null);
        console.log('👤 Profile updated event detected - user state refreshed');
      } catch (e) {
        console.error("Failed to parse user from storage:", e);
      }
    };
    
    window.addEventListener('open-website-feedback', handleOpenFeedback);
    window.addEventListener('profile-updated', handleProfileUpdated);
    return () => {
      window.removeEventListener('open-website-feedback', handleOpenFeedback);
      window.removeEventListener('profile-updated', handleProfileUpdated);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <WebsiteFeedbackDialog 
          open={showWebsiteFeedback} 
          onClose={() => setShowWebsiteFeedback(false)}
        />
        <BrowserRouter>
          <FlowiseChatbot />
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
            <Route path="/chat-history" element={<ChatHistoryPage />} />
            
            {/* Support Pages */}
            <Route path="/settings" element={<Settings />} />
            <Route path="/audit-trail" element={<AuditTrail />} />
            <Route path="/announcements" element={<Announcements />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/analytics" element={<DepartmentAnalytics />} />
            <Route path="/map" element={<Map />} />
            <Route path="/about" element={<About />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/help" element={<Help />} />
            
            {/* Catch-all 404 */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
