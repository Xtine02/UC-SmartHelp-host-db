import { Link, useNavigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, User as UserIcon, ArrowLeft } from "lucide-react";
import logo from "@/assets/uc-smarthelp-logo.jpg";

interface User {
  id?: number;
  user_id?: number;
  userId?: number;
  role?: string;
  email?: string;
  first_name?: string;
  firstName?: string;
  fullName?: string;
  last_name?: string;
  lastName?: string;
  department?: string;
}

const Navbar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<User | null>(null);
  const [isGuest, setIsGuest] = useState(false);

  useEffect(() => {
    try {
      const userJson = localStorage.getItem("user");
      if (userJson && userJson !== "null") {
        setUser(JSON.parse(userJson));
      } else {
        setUser(null);
      }
      setIsGuest(localStorage.getItem("uc_guest") === "1");
    } catch (e) {
      console.error("Navbar: Failed to parse user from localStorage", e);
      setUser(null);
    }
  }, [location.pathname]);

  const handleSignOut = async () => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
      const userId = user?.id || user?.userId || user?.user_id;
      
      if (userId) {
        await fetch(`${API_URL}/api/logout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId })
        });
      }
    } catch (error) {
      console.error("Error logging logout:", error);
    }

    localStorage.removeItem("uc_guest");
    localStorage.removeItem("user");
    setUser(null);
    setIsGuest(false);
    navigate("/");
  };

  const role = user?.role?.toLowerCase();
  const isAdmin = role === "admin";
  const isStaff = role === "staff";
  
  // High-precision login check
  const isLoggedIn = (user && (user.userId || user.id || user.user_id)) || isGuest;

  const getDashboardPath = () => {
    const role = (user?.role || "student").toLowerCase();
    const department = (user?.department || "").toLowerCase();
    
    if (role === "admin") return "/AdminDashboard";
    if (role === "staff") {
      if (department === "scholarship") {
        return "/ScholarshipDashboard";
      }
      return "/AccountingDashboard";
    }
    if (isGuest) return "/GuestDashboard";
    return "/StudentDashboard";
  };

  const handleDashboardClick = () => {
    const path = getDashboardPath();
    if (location.pathname === path) {
      navigate(path, { replace: true });
      window.location.href = path; 
    } else {
      navigate(path);
    }
  };

  const handleAuditTrailClick = () => {
    navigate("/audit-trail");
  };

  // Determine if we should show a back button
  const dashboardPaths = ["/student-dashboard", "/StudentDashboard", "/AdminDashboard", "/AccountingDashboard", "/ScholarshipDashboard", "/GuestDashboard", "/guest-dashboard", "/dashboard"];
  const isDashboard = dashboardPaths.some(path => location.pathname.toLowerCase() === path.toLowerCase());
  const isIndex = location.pathname === "/";
  const isLogin = location.pathname === "/login";
  const isStudent = user?.role?.toLowerCase() === "student";
  const showBackButton = !isDashboard && !isIndex && !isLogin && !isStudent;

  // Format full name: Use server provided firstName and lastName
  const fullName = user?.firstName && user?.lastName 
    ? `${user.firstName} ${user.lastName}` 
    : (user?.fullName || "User");
  const initial = (user?.firstName?.[0] || user?.fullName?.[0] || "U").toUpperCase();

  return (
    <nav className="sticky top-0 z-50 border-b bg-card/80 backdrop-blur-sm">
      <div className="container flex h-16 items-center justify-between px-4 sm:px-8">
        <div className="flex items-center gap-4">
          {showBackButton && (
            <button 
              onClick={() => navigate(-1)} 
              className="p-2 rounded-full hover:bg-secondary transition-all active:scale-90 bg-secondary/50"
              title="Go Back"
            >
              <ArrowLeft className="h-5 w-5 text-primary" />
            </button>
          )}
          <Link to="/?noRedirect=1" className="flex items-center gap-2 animate-in fade-in duration-300">
            <img src={logo} alt="UC SmartHelp" className="h-10 w-auto" />
          </Link>
        </div>

        {/* Navigation Links */}
        <div className="hidden items-center gap-6 md:flex">
          <Link to="/announcements" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            Announcements
          </Link>
          <Link to="/about" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            About Us
          </Link>
          <Link to="/contact" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            Contact Us
          </Link>
        </div>

        {/* User Actions */}
        <div className="flex items-center gap-3">
          {isLoggedIn && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="h-10 w-10 rounded-full bg-primary flex items-center justify-center text-sm font-bold text-primary-foreground shadow-sm hover:scale-105 active:scale-95 transition-all">
                  {isGuest ? (
                    <UserIcon className="h-5 w-5" />
                  ) : (
                    <span>{initial}</span>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 p-2 rounded-xl">
                {/* Profile Header */}
                <div className="flex flex-col px-2 py-3 border-b mb-2">
                  <span className="text-sm font-black text-foreground uppercase tracking-tight">
                    {isGuest ? "Guest User" : fullName}
                  </span>
                  {!isGuest && (
                    <span className="text-[10px] font-bold text-primary tracking-widest uppercase mt-0.5">
                      {user?.role}
                    </span>
                  )}
                </div>

                {/* Menu Items */}
                <DropdownMenuItem onClick={handleDashboardClick} className="rounded-lg font-medium cursor-pointer">
                  Dashboard
                </DropdownMenuItem>
                
                {!isGuest && (
                  <>
                    <DropdownMenuItem onClick={() => navigate("/settings")} className="rounded-lg font-medium cursor-pointer">
                      Account Settings
                    </DropdownMenuItem>
                    {(isAdmin || isStaff) && (
                      <DropdownMenuItem onClick={handleAuditTrailClick} className="rounded-lg font-medium cursor-pointer">
                        Audit Trail
                      </DropdownMenuItem>
                    )}
                  </>
                )}

                <div className="my-1 border-t border-muted" />
                
                <DropdownMenuItem onClick={handleSignOut} className="rounded-lg font-bold text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer">
                  <LogOut className="mr-2 h-4 w-4" /> Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
