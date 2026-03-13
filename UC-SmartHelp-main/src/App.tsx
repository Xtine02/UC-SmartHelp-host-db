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
import StaffDashboard from "@/components/dashboard/StaffDashboard";
import AdminDashboard from "@/components/dashboard/AdminDashboard";
import GuestDashboard from "@/components/dashboard/GuestDashboard";
import AccountingDashboard from "@/components/dashboard/AccountingDashboard";
import ScholarshipDashboard from "@/components/dashboard/ScholarshipDashboard";
import ReviewModal from "@/components/ReviewModal";

const queryClient = new QueryClient();

const App = () => (
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
          <Route path="/StaffDashboard" element={<StaffDashboard />} />
          <Route path="/AdminDashboard" element={<AdminDashboard />} />
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
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
