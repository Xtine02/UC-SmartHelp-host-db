import { Link, useNavigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, User as UserIcon, Bell } from "lucide-react";
import { performLogout } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
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
  profileImage?: string;
  profile_image?: string;
  image?: string;
}

interface Notification {
  id: number;
  type: string;
  title: string;
  message: string;
  is_read: number;
  created_at: string;
  announcement_id?: number;
  ticket_id?: number;
}

const Navbar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<User | null>(null);
  const [isGuest, setIsGuest] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    const syncUserFromLocalStorage = () => {
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
    };

    syncUserFromLocalStorage();

    window.addEventListener('profile-updated', syncUserFromLocalStorage);

    return () => {
      window.removeEventListener('profile-updated', syncUserFromLocalStorage);
    };
  }, [location.pathname]);

  // Fetch unread notification count
  useEffect(() => {
    if (user && (user.userId || user.id || user.user_id)) {
      const userId = user.userId || user.id || user.user_id;
      fetchUnreadCount(userId as number);
      
      // Refresh count every 30 seconds
      const interval = setInterval(() => {
        fetchUnreadCount(userId as number);
      }, 30000);
      
      return () => clearInterval(interval);
    }
  }, [user]);

  const fetchUnreadCount = async (userId: number) => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
      const response = await fetch(`${API_URL}/api/notifications/unread-count?user_id=${userId}`);
      if (response.ok) {
        const data = await response.json();
        setUnreadCount(data.count);
      }
    } catch (error) {
      console.error("Error fetching unread count:", error);
    }
  };

  const fetchNotifications = async (userId: number) => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
      const response = await fetch(`${API_URL}/api/notifications?user_id=${userId}`);
      if (response.ok) {
        const data = await response.json();
        setNotifications(data);
      }
    } catch (error) {
      console.error("Error fetching notifications:", error);
    }
  };

  const handleNotificationBellClick = async () => {
    if (user && (user.userId || user.id || user.user_id)) {
      const userId = user.userId || user.id || user.user_id;
      await fetchNotifications(userId as number);
      setShowNotifications(!showNotifications);
    }
  };

  const markAllAsRead = async () => {
    if (user && (user.userId || user.id || user.user_id)) {
      const userId = user.userId || user.id || user.user_id;
      try {
        const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
        await fetch(`${API_URL}/api/notifications/mark-all-as-read`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: userId })
        });
        setUnreadCount(0);
        await fetchNotifications(userId as number);
      } catch (error) {
        console.error("Error marking all as read:", error);
      }
    }
  };

  // Group notifications by day
  const groupNotificationsByDay = (notifications: Notification[]) => {
    const groups: { [key: string]: Notification[] } = {};
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    notifications.forEach(notification => {
      const notificationDate = new Date(notification.created_at);
      const dateKey = notificationDate.toDateString();

      let groupKey = dateKey;
      if (notificationDate.toDateString() === today.toDateString()) {
        groupKey = 'Today';
      } else if (notificationDate.toDateString() === yesterday.toDateString()) {
        groupKey = 'Yesterday';
      } else {
        groupKey = notificationDate.toLocaleDateString('en-US', { 
          weekday: 'long', 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        });
      }

      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(notification);
    });

    return groups;
  };

  const groupedNotifications = groupNotificationsByDay(notifications);
  const notificationEntries = Object.entries(groupedNotifications);
  
  // Get first 5 notifications for dropdown
  const recentNotifications = notifications.slice(0, 5);

  const handleSignOut = async () => {
    setIsLoggingOut(true);
    await performLogout();
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

  const handleTopNavClick = (path: string) => {
    // Prevent duplicate history stacking for same route.
    if (location.pathname.toLowerCase() === path.toLowerCase()) return;
    // Replace keeps navbar tab switching from piling browser history entries.
    navigate(path, { replace: true });
  };

  // Determine current view state
  const dashboardPaths = ["/student-dashboard", "/StudentDashboard", "/AdminDashboard", "/AccountingDashboard", "/ScholarshipDashboard", "/GuestDashboard", "/guest-dashboard", "/dashboard"];
  const isDashboard = dashboardPaths.some(path => location.pathname.toLowerCase() === path.toLowerCase());
  const isIndex = location.pathname === "/";
  const isLogin = location.pathname === "/login";
  const isStudent = user?.role?.toLowerCase() === "student";

  // Format full name: Use server provided firstName and lastName
  const fullName = user?.firstName && user?.lastName 
    ? `${user.firstName} ${user.lastName}` 
    : (user?.fullName || "User");
  const initial = ((user?.firstName?.[0] || "") + (user?.lastName?.[0] || "") || "U").toUpperCase();
  const profileImage = user?.profileImage || user?.profile_image || user?.image || null;

  return (
    <nav className="sticky top-0 z-50 border-b bg-card/80 backdrop-blur-sm">
      <div className="container flex h-16 items-center justify-between px-4 sm:px-8">
        <div className="flex items-center gap-4">
          <Link to="/?noRedirect=1" className="flex items-center gap-2 animate-in fade-in duration-300">
            <img src={logo} alt="UC SmartHelp" className="h-10 w-auto" />
          </Link>
        </div>

        {/* Navigation Links */}
        <div className="hidden items-center gap-6 md:flex">
          <button
            type="button"
            onClick={() => handleTopNavClick("/announcements")}
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Announcements
          </button>
          <button
            type="button"
            onClick={() => handleTopNavClick("/about")}
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            About Us
          </button>
          <button
            type="button"
            onClick={() => handleTopNavClick("/contact")}
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Contact Us
          </button>
          <button
            type="button"
            onClick={() => handleTopNavClick("/map")}
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Map
          </button>
          <button
            type="button"
            onClick={() => handleTopNavClick("/help")}
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            FAQ Section
          </button>
        </div>

        {/* User Actions */}
        <div className="flex items-center gap-3">
          {isLoggedIn && !isGuest && (
            <DropdownMenu open={showNotifications} onOpenChange={setShowNotifications}>
              <DropdownMenuTrigger asChild>
                <button 
                  onClick={handleNotificationBellClick}
                  className="relative h-10 w-10 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors"
                  aria-label="Notifications"
                >
                  <Bell className="h-5 w-5 text-foreground" />
                  {unreadCount > 0 && (
                    <Badge className="absolute -top-2 -right-2 h-6 w-6 flex items-center justify-center p-0 bg-red-500 text-white text-xs font-bold rounded-full">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </Badge>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80 p-2 rounded-xl max-h-96 overflow-y-auto">
                {/* Notifications Header */}
                <div className="flex items-center justify-between px-2 py-3 border-b mb-2">
                  <span className="text-sm font-black text-foreground uppercase tracking-tight">Notifications</span>
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllAsRead}
                      className="text-xs font-bold text-primary hover:underline"
                    >
                      Mark all as read
                    </button>
                  )}
                </div>

                {/* Notifications List */}
                {recentNotifications.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No notifications yet
                  </div>
                ) : (
                  <div className="space-y-4">
                    {notificationEntries.map(([dateGroup, groupNotifications]) => (
                      <div key={dateGroup}>
                        <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 px-2">
                          {dateGroup}
                        </div>
                        <div className="space-y-2">
                          {groupNotifications.slice(0, 5).map((notification) => (
                            <div
                              key={notification.id}
                              className={`p-3 rounded-lg text-sm cursor-pointer transition-colors ${
                                notification.is_read === 0
                                  ? 'bg-primary/5 border border-primary/20'
                                  : 'bg-muted/50'
                              } hover:bg-muted`}
                              onClick={() => {
                                // Mark as read if not already
                                if (notification.is_read === 0) {
                                  markAsRead(notification.id);
                                }
                                // Navigate based on notification type
                                if (notification.type === 'ticket_reply' || notification.type === 'student_ticket_reply' || notification.type === 'ticket_status_changed' || notification.type === 'ticket_overdue') {
                                  navigate('/tickets');
                                } else if (notification.type === 'announcement') {
                                  // Navigate to announcements page with the specific announcement ID
                                  navigate(`/announcements#announcement-${notification.announcement_id || notification.id}`);
                                } else if (notification.type === 'ticket_auto_closed') {
                                  // Show department feedback dialog
                                  window.dispatchEvent(new CustomEvent('show-department-feedback'));
                                } else if (notification.type === 'new_ticket' || notification.type === 'overdue_tickets_detected') {
                                  navigate('/tickets');
                                }
                              }}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1">
                                  <p className="font-semibold text-foreground">{notification.title}</p>
                                  {notification.message && (
                                    <p className="text-xs text-muted-foreground mt-1">{notification.message}</p>
                                  )}
                                </div>
                                {notification.is_read === 0 && (
                                  <div className="h-2 w-2 rounded-full bg-red-500 mt-1 flex-shrink-0" />
                                )}
                              </div>
                              <p className="text-[10px] text-muted-foreground mt-2">
                                {new Date(notification.created_at).toLocaleTimeString('en-US', { 
                                  hour: '2-digit', 
                                  minute: '2-digit' 
                                })}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                    
                    {notifications.length > 5 && (
                      <div className="pt-2 border-t">
                        <button
                          onClick={() => navigate('/notifications')}
                          className="w-full text-center text-sm font-medium text-primary hover:underline py-2"
                        >
                          Show more notifications →
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {isLoggedIn && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="h-10 w-10 rounded-full bg-primary flex items-center justify-center text-sm font-bold text-primary-foreground shadow-sm hover:scale-105 active:scale-95 transition-all overflow-hidden">
                  {isGuest ? (
                    <UserIcon className="h-5 w-5" />
                  ) : profileImage ? (
                    <img src={profileImage} alt={fullName} className="h-full w-full object-cover" />
                  ) : (
                    <span>{initial}</span>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72 p-2 rounded-xl">
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
                    {isAdmin && (
                      <DropdownMenuItem onClick={handleAuditTrailClick} className="rounded-lg font-medium cursor-pointer">
                        Audit Trail
                      </DropdownMenuItem>
                    )}
                  </>
                )}

                <div className="my-1 border-t border-muted" />
                
                <DropdownMenuItem 
                  onClick={handleSignOut} 
                  disabled={isLoggingOut}
                  className="rounded-lg font-bold text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <LogOut className={`mr-2 h-4 w-4 ${isLoggingOut ? 'animate-spin' : ''}`} /> 
                  {isLoggingOut ? 'Logging out...' : 'Log out'}
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
