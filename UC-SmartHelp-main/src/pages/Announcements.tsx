import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "@/components/Navbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { MoreHorizontal, Pencil, Trash2, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { getLoggedInRedirectPath } from "@/lib/utils";

interface User {
  id?: number;
  user_id?: number;
  userId?: number;
  role?: string;
  department?: string;
  first_name?: string;
  firstName?: string;
  last_name?: string;
  lastName?: string;
}

interface Announcement {
  announcement_id: number;
  id?: number;
  user_id?: number | null;
  role: string;
  department?: string | null;
  audience?: "all" | "students" | "staff";
  message: string;
  posted_at: string;
  created_at?: string;
  is_read?: boolean;
}

const Announcements = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [audience, setAudience] = useState<"all" | "students" | "staff">("all");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [editingAnnouncementId, setEditingAnnouncementId] = useState<number | null>(null);
  const [editMessage, setEditMessage] = useState("");
  const [editAudience, setEditAudience] = useState<"all" | "students" | "staff">("all");
  const [unreadCount, setUnreadCount] = useState(0);

  // Get user from localStorage
  useEffect(() => {
    try {
      const userJson = localStorage.getItem("user");
      if (userJson) {
        setUser(JSON.parse(userJson));
      }
    } catch (e) {
      console.error("Failed to parse user", e);
    }
  }, []);

  // Fetch unread announcement count
  useEffect(() => {
    if (user && (user.userId || user.id || user.user_id)) {
      const userId = user.userId || user.id || user.user_id;
      fetchUnreadCount(userId as number);
    }
  }, [user]);

  const fetchUnreadCount = async (userId: number) => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
      const response = await fetch(`${API_URL}/api/announcements/unread-count?user_id=${userId}`);
      if (response.ok) {
        const data = await response.json();
        setUnreadCount(data.count);
      }
    } catch (error) {
      console.error("Error fetching unread announcement count:", error);
    }
  };

  const markAnnouncementAsRead = async (announcementId: number) => {
    if (!user || (!user.userId && !user.id && !user.user_id)) return;
    
    try {
      const userId = user.userId || user.id || user.user_id;
      const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
      await fetch(`${API_URL}/api/announcements/${announcementId}/mark-as-read`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId })
      });
      
      // Decrement unread count
      setUnreadCount(prev => Math.max(0, prev - 1));
      
      // Update the announcement to mark it as read
      setAnnouncements(prev =>
        prev.map(a =>
          (a.announcement_id === announcementId || a.id === announcementId)
            ? { ...a, is_read: true }
            : a
        )
      );
    } catch (error) {
      console.error("Error marking announcement as read:", error);
    }
  };

  // Fetch announcements
  const fetchAnnouncements = async () => {
    try {
      setRefreshing(true);
      const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
      const viewerRole = (user?.role || "guest").toString().toLowerCase();
      const userId = user?.userId || user?.id || user?.user_id;
      console.log("🔍 Fetching announcements - user:", user, "userId:", userId, "viewerRole:", viewerRole);
      
      const params = new URLSearchParams({
        viewer_role: viewerRole
      });
      if (userId) {
        params.append('viewer_user_id', userId.toString());
      }
      const url = `${API_URL}/api/announcements?${params.toString()}`;
      console.log("🔍 Fetch URL:", url);
      
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        console.log("🔍 Fetched announcements:", data.length, "items");
        setAnnouncements(data);
      }
    } catch (error) {
      console.error("Error fetching announcements:", error);
      toast({ title: "Error", description: "Failed to fetch announcements", variant: "destructive" });
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAnnouncements();
    // Auto-refresh every 3 seconds
    const interval = setInterval(fetchAnnouncements, 3000);
    return () => clearInterval(interval);
  }, [user?.role]);

  // Handle scrolling to specific announcement from notification
  useEffect(() => {
    const hash = window.location.hash;
    if (hash && hash.startsWith('#announcement-')) {
      const announcementId = hash.replace('#announcement-', '');
      // Wait a bit for announcements to load, then scroll
      const scrollToAnnouncement = () => {
        const element = document.getElementById(`announcement-${announcementId}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          // Add a highlight effect
          element.classList.add('ring-2', 'ring-primary', 'ring-opacity-50');
          setTimeout(() => {
            element.classList.remove('ring-2', 'ring-primary', 'ring-opacity-50');
          }, 3000);
        } else if (announcements.length > 0) {
          // If element not found but announcements loaded, try again in case of timing
          setTimeout(scrollToAnnouncement, 100);
        }
      };
      setTimeout(scrollToAnnouncement, 500);
    }
  }, [announcements]);

  // Handle create announcement
  const handleCreateAnnouncement = async () => {
    if (!newMessage.trim()) {
      toast({ title: "Error", description: "Please enter a message", variant: "destructive" });
      return;
    }

    if (!user?.role || !["admin", "staff"].includes(user.role.toLowerCase())) {
      toast({ title: "Error", description: "Only admin and staff can create announcements", variant: "destructive" });
      return;
    }

    try {
      setLoading(true);
      const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
      const response = await fetch(`${API_URL}/api/announcements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: user.id || user.userId || user.user_id,
          role: user.role,
          audience,
          department: user.department || null,
          message: newMessage.trim()
        })
      });

      if (response.ok) {
        toast({ title: "Success", description: "Announcement created successfully" });
        setNewMessage("");
        setAudience("all");
        await fetchAnnouncements();
      } else {
        const data = await response.json();
        throw new Error(data.error || "Failed to create announcement");
      }
    } catch (error) {
      console.error("Error creating announcement:", error);
      const errorMsg = error instanceof Error ? error.message : "Failed to create announcement";
      toast({ title: "Error", description: errorMsg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleStartEdit = (announcement: Announcement) => {
    const announcementId = announcement.announcement_id || announcement.id;
    setEditingAnnouncementId(announcementId);
    setEditMessage(announcement.message);
    setEditAudience(announcement.audience || "all");
  };

  const handleCancelEdit = () => {
    setEditingAnnouncementId(null);
    setEditMessage("");
    setEditAudience("all");
  };

  const handleSaveEdit = async (announcement: Announcement) => {
    if (!editMessage.trim()) {
      toast({ title: "Error", description: "Message is required", variant: "destructive" });
      return;
    }

    try {
      setLoading(true);
      const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
      const announcementId = announcement.announcement_id || announcement.id;
      const response = await fetch(`${API_URL}/api/announcements/${announcementId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: user?.id || user?.userId || user?.user_id,
          role: user?.role,
          message: editMessage.trim(),
          audience: editAudience,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update announcement");
      }

      toast({ title: "Success", description: "Announcement updated" });
      handleCancelEdit();
      await fetchAnnouncements();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Failed to update announcement";
      toast({ title: "Error", description: errorMsg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAnnouncement = async (announcement: Announcement) => {
    try {
      setLoading(true);
      const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
      const announcementId = announcement.announcement_id || announcement.id;
      const response = await fetch(`${API_URL}/api/announcements/${announcementId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: user?.id || user?.userId || user?.user_id,
          role: user?.role,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete announcement");
      }

      toast({ title: "Success", description: "Announcement deleted" });
      if (editingAnnouncementId === announcementId) handleCancelEdit();
      await fetchAnnouncements();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Failed to delete announcement";
      toast({ title: "Error", description: errorMsg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const isStaffOrAdmin = user?.role?.toLowerCase() === "admin" || user?.role?.toLowerCase() === "staff";

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <div className="container py-12 space-y-8">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-4xl font-bold text-foreground mb-2">Announcements</h1>
            <p className="text-muted-foreground">Stay updated with latest news from University of Cebu</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(getLoggedInRedirectPath())}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-6 w-6" />
          </Button>
        </div>

        {/* Create Announcement Form - Only for Staff/Admin */}
        {isStaffOrAdmin && (
          <Card className="bg-card border-2">
            <CardHeader>
              <CardTitle>Create New Announcement</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium text-foreground mb-2 block">
                  Message
                </label>
                <Textarea
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Enter your announcement message..."
                  className="min-h-[100px]"
                />
              </div>
              {(user?.role?.toLowerCase() === "admin" || user?.role?.toLowerCase() === "staff") && (
                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">Audience</label>
                  <Select value={audience} onValueChange={(value: "all" | "students" | "staff") => setAudience(value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="students">Students</SelectItem>
                      <SelectItem value="staff">Staff</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <Button
                onClick={handleCreateAnnouncement}
                disabled={loading || !newMessage.trim()}
                className="w-full"
              >
                {loading ? "Creating..." : "Post Announcement"}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Announcements List */}
        <div className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            All Announcements
            {unreadCount > 0 && (
              <Badge className="bg-red-500 text-white">{unreadCount}</Badge>
            )}
            {refreshing && <span className="text-xs text-muted-foreground">Updating...</span>}
          </h2>

          {announcements.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <p className="text-center text-muted-foreground py-8">No announcements yet.</p>
              </CardContent>
            </Card>
          ) : (
            announcements.map((announcement) => {
              const roleNormalized = (announcement.role || "").toString().toLowerCase();
              const isAdminPost = roleNormalized === "admin";
              const roleLabel = isAdminPost ? "Admin" : "Staff";
              const staffDeptLabel = announcement.department ? ` - ${announcement.department}` : "";
              const announcementId = announcement.announcement_id || announcement.id;
              const isUnread = announcement.is_read === false;

              return (
              <Card 
                key={announcementId}
                id={`announcement-${announcementId}`}
                className={`overflow-hidden hover:shadow-lg transition-shadow cursor-pointer ${
                  isUnread ? 'border-primary/50 bg-primary/5' : ''
                }`}
                onClick={() => {
                  if (isUnread) {
                    markAnnouncementAsRead(announcementId);
                  }
                }}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex gap-2">
                        <Badge variant={isAdminPost ? "default" : "secondary"}>
                          {roleLabel}{!isAdminPost ? staffDeptLabel : ""}
                        </Badge>
                        <Badge variant="outline" className="capitalize">
                          {announcement.audience || "all"}
                        </Badge>
                        {isUnread && (
                          <Badge className="bg-red-500 text-white">NEW</Badge>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground whitespace-nowrap">
                      {announcement.posted_at || announcement.created_at
                        ? format(new Date(announcement.posted_at || announcement.created_at || ''), "MMM d, yyyy HH:mm")
                        : "No date"
                      }
                    </p>
                  </div>
                </CardHeader>
                <CardContent>
                  {editingAnnouncementId === announcementId ? (
                    <div className="space-y-3">
                      <Textarea
                        value={editMessage}
                        onChange={(e) => setEditMessage(e.target.value)}
                        className="min-h-[100px]"
                      />
                      {(user?.role?.toLowerCase() === "admin" || user?.role?.toLowerCase() === "staff") && (
                        <Select value={editAudience} onValueChange={(value: "all" | "students" | "staff") => setEditAudience(value)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All</SelectItem>
                            <SelectItem value="students">Students</SelectItem>
                            <SelectItem value="staff">Staff</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => handleSaveEdit(announcement)} disabled={loading || !editMessage.trim()}>
                          Save
                        </Button>
                        <Button size="sm" variant="outline" onClick={handleCancelEdit} disabled={loading}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-foreground leading-relaxed whitespace-pre-wrap flex-1">{announcement.message}</p>
                      {(user?.role?.toLowerCase() === "admin" || user?.role?.toLowerCase() === "staff") && 
                       (Number(announcement.user_id) === Number(user?.id || user?.userId || user?.user_id)) && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleStartEdit(announcement)}>
                              <Pencil className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => handleDeleteAnnouncement(announcement)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )})
          )}
        </div>
      </div>
    </div>
  );
};

export default Announcements;
