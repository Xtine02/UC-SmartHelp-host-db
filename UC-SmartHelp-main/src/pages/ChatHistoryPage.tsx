import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import Navbar from "@/components/Navbar";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ChatConversation {
  session_id: string;
  title?: string | null;
  first_message_at?: string | null;
  last_message_at?: string | null;
  message_count?: number;
}

interface RawChatRow {
  session_id?: string | null;
  role?: string | null;
  message?: string | null;
  created_at?: string | null;
}

const ChatHistoryPage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const userRaw = localStorage.getItem("user");

  let user: any = null;
  try {
    user = userRaw ? JSON.parse(userRaw) : null;
  } catch {
    user = null;
  }

  const userId = user?.id || user?.userId || user?.user_id || null;
  const isGuest = localStorage.getItem("uc_guest") === "1";
  const guestSessionId = sessionStorage.getItem("guest_chat_session_id") || "";
  const activeSessionKey = userId ? `chatbot_active_session_${String(userId)}` : "";
  const [activeSessionId, setActiveSessionId] = useState<string>(
    activeSessionKey ? localStorage.getItem(activeSessionKey) || "" : guestSessionId
  );

  useEffect(() => {
    if (!userId && !isGuest) {
      navigate("/login");
      return;
    }

    const fetchHistory = async () => {
      try {
        const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
        const buildFromRawRows = (rows: RawChatRow[]): ChatConversation[] => {
          const groups = new Map<string, { title: string; firstAt?: string | null; lastAt?: string | null; count: number }>();
          rows.forEach((row) => {
            const key = String(row.session_id || `legacy-${userId || "guest"}`).trim();
            if (!groups.has(key)) {
              groups.set(key, { title: "", firstAt: row.created_at || null, lastAt: row.created_at || null, count: 0 });
            }
            const entry = groups.get(key)!;
            entry.count += 1;
            if (!entry.firstAt || (row.created_at && new Date(row.created_at).getTime() < new Date(entry.firstAt).getTime())) {
              entry.firstAt = row.created_at || entry.firstAt;
            }
            if (!entry.lastAt || (row.created_at && new Date(row.created_at).getTime() > new Date(entry.lastAt).getTime())) {
              entry.lastAt = row.created_at || entry.lastAt;
            }
            if (!entry.title && (row.role || "").toLowerCase() === "user" && row.message) {
              entry.title = String(row.message).trim();
            }
            if (!entry.title && row.message) {
              entry.title = String(row.message).trim();
            }
          });
          return Array.from(groups.entries()).map(([session_id, entry]) => ({
            session_id,
            title: entry.title || "Untitled chat",
            first_message_at: entry.firstAt || null,
            last_message_at: entry.lastAt || null,
            message_count: entry.count,
          }));
        };

        const summaryUrl = new URL(`${API_URL}/api/chat-history/conversations`);
        if (userId) summaryUrl.searchParams.set("user_id", String(userId));
        else if (guestSessionId) summaryUrl.searchParams.set("session_id", guestSessionId);
        summaryUrl.searchParams.set("limit", "300");

        const summaryResponse = await fetch(summaryUrl.toString());
        if (summaryResponse.ok) {
          const summaryData = (await summaryResponse.json()) as ChatConversation[];
          setConversations(Array.isArray(summaryData) ? summaryData : []);
        } else {
          const rawUrl = new URL(`${API_URL}/api/chat-history`);
          if (userId) rawUrl.searchParams.set("user_id", String(userId));
          else if (guestSessionId) rawUrl.searchParams.set("session_id", guestSessionId);
          rawUrl.searchParams.set("limit", "500");
          const rawResponse = await fetch(rawUrl.toString());
          if (!rawResponse.ok) throw new Error("Failed to fetch chat history");
          const rawData = (await rawResponse.json()) as RawChatRow[];
          setConversations(buildFromRawRows(Array.isArray(rawData) ? rawData : []));
        }
      } catch (error) {
        setConversations([]);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [navigate, userId, isGuest, guestSessionId]);

  const sortedConversations = useMemo(
    () =>
      [...conversations].sort((a, b) => {
        const t1 = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
        const t2 = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
        return t1 - t2;
      }),
    [conversations]
  );

  const groupedConversations = useMemo(() => {
    const groups = new Map<string, ChatConversation[]>();
    sortedConversations.forEach((conversation) => {
      const rawDate = conversation.last_message_at || conversation.first_message_at;
      const date = rawDate ? new Date(rawDate) : new Date();
      const dayKey = format(date, "yyyy-MM-dd");
      const existing = groups.get(dayKey) || [];
      existing.push(conversation);
      groups.set(dayKey, existing);
    });
    return Array.from(groups.entries()).sort(([a], [b]) => (a < b ? 1 : -1));
  }, [sortedConversations]);

  const formatGroupLabel = (dateKey: string) => {
    const date = new Date(`${dateKey}T00:00:00`);
    const todayKey = format(new Date(), "yyyy-MM-dd");
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = format(yesterday, "yyyy-MM-dd");
    if (dateKey === todayKey) return "Today";
    if (dateKey === yesterdayKey) return "Yesterday";
    return format(date, "MMMM d, yyyy");
  };

  const chooseConversation = (sessionId: string) => {
    if (userId) {
      const key = `chatbot_active_session_${String(userId)}`;
      localStorage.setItem(key, sessionId);
    } else {
      sessionStorage.setItem("guest_chat_session_id", sessionId);
    }
    setActiveSessionId(sessionId);
    window.dispatchEvent(new CustomEvent("chat-session-selected", { detail: { sessionId } }));
    navigate(isGuest ? "/GuestDashboard" : "/dashboard");
  };

  const toggleSelect = (sessionId: string) => {
    const next = new Set(selectedSessionIds);
    if (next.has(sessionId)) next.delete(sessionId);
    else next.add(sessionId);
    setSelectedSessionIds(next);
  };

  const toggleSelectAll = () => {
    if (selectedSessionIds.size > 0 && selectedSessionIds.size === sortedConversations.length) {
      setSelectedSessionIds(new Set());
      return;
    }
    setSelectedSessionIds(new Set(sortedConversations.map((item) => item.session_id)));
  };

  const handleDeleteSelected = async () => {
    if ((!userId && !guestSessionId) || selectedSessionIds.size === 0) return;
    try {
      const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
      const response = await fetch(`${API_URL}/api/chat-history/conversations/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId || undefined,
          session_id: !userId ? guestSessionId : undefined,
          session_ids: Array.from(selectedSessionIds),
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to delete selected conversations");
      }

      setConversations((prev) => prev.filter((item) => !selectedSessionIds.has(item.session_id)));
      window.dispatchEvent(new Event("chat-history-deleted"));
      setSelectedSessionIds(new Set());
      setShowDeleteConfirm(false);
    } catch (error) {
      // Keep silent to match existing page behavior.
    }
  };

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
        <div className="rounded-2xl border bg-card shadow-xl overflow-hidden p-4 min-h-[720px]">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-foreground">Chat History</h1>
          </div>

          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2 ml-auto">
              <Checkbox
                checked={sortedConversations.length > 0 && selectedSessionIds.size === sortedConversations.length}
                onCheckedChange={toggleSelectAll}
              />
              <span className="text-sm text-muted-foreground">Select all</span>
            </div>
          </div>

          {selectedSessionIds.size > 0 && (
            <div className="mb-4 flex items-center justify-between bg-destructive/10 p-4 rounded-xl border border-destructive/20">
              <span className="text-sm font-bold text-destructive">
                {selectedSessionIds.size} conversation(s) selected
              </span>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center gap-2 bg-destructive text-white px-4 py-2 rounded-lg font-bold text-xs hover:bg-destructive/90 transition-all shadow-lg active:scale-95"
              >
                <Trash2 className="h-4 w-4" />
                DELETE SELECTED
              </button>
            </div>
          )}

          <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete selected conversations?</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to permanently delete {selectedSessionIds.size} selected conversation(s)?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="flex gap-3 justify-end">
                <AlertDialogCancel onClick={() => setShowDeleteConfirm(false)}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction onClick={handleDeleteSelected} className="bg-destructive hover:bg-destructive/90">
                  Yes, Delete
                </AlertDialogAction>
              </div>
            </AlertDialogContent>
          </AlertDialog>

          <div className="space-y-6">
            {groupedConversations.map(([dateKey, entries]) => (
              <div key={dateKey} className="space-y-2">
                <h2 className="text-sm font-semibold text-muted-foreground">{formatGroupLabel(dateKey)}</h2>
                <div className="space-y-2">
                  {entries.map((conversation) => (
                    <div
                      key={conversation.session_id}
                      className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
                        activeSessionId === conversation.session_id ? "bg-primary/10 border-primary/30" : "bg-background"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Checkbox
                          checked={selectedSessionIds.has(conversation.session_id)}
                          onCheckedChange={() => toggleSelect(conversation.session_id)}
                        />
                        <button
                          onClick={() => chooseConversation(conversation.session_id)}
                          className="text-left min-w-0"
                        >
                          <p className="font-medium truncate max-w-[580px]">
                            {(conversation.title || "Untitled chat").toString()}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {conversation.last_message_at
                              ? format(new Date(conversation.last_message_at), "MMM d, yyyy h:mm a")
                              : "No date"}
                          </p>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {groupedConversations.length === 0 && (
              <div className="text-center text-muted-foreground py-10">
                No chat history yet.
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default ChatHistoryPage;
