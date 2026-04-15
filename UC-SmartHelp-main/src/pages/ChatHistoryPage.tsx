import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import Navbar from "@/components/Navbar";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ChatHistoryMessage {
  id?: number | null;
  user_id?: number | string | null;
  message?: string | null;
  role?: string | null;
  created_at?: string | null;
}

const ChatHistoryPage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<ChatHistoryMessage[]>([]);
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<number>>(new Set());
  const [expandedDayKeys, setExpandedDayKeys] = useState<Set<string>>(new Set());
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

  useEffect(() => {
    if (!userId && !isGuest) {
      navigate("/login");
      return;
    }

    const fetchHistory = async () => {
      try {
        if (!userId) {
          setMessages([]);
          return;
        }

        const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
        const historyUrl = new URL(`${API_URL}/api/chat-history`);
        historyUrl.searchParams.set("user_id", String(userId));
        historyUrl.searchParams.set("limit", "500");

        const response = await fetch(historyUrl.toString());
        if (!response.ok) throw new Error("Failed to fetch chat history");

        const data = (await response.json()) as ChatHistoryMessage[];
        setMessages(Array.isArray(data) ? data : []);
      } catch {
        setMessages([]);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [navigate, userId, isGuest]);

  const sortedMessages = useMemo(
    () =>
      [...messages].sort((a, b) => {
        const t1 = a.created_at ? new Date(a.created_at).getTime() : 0;
        const t2 = b.created_at ? new Date(b.created_at).getTime() : 0;
        return t1 - t2;
      }),
    [messages]
  );

  const groupedMessages = useMemo(() => {
    const groups = new Map<string, ChatHistoryMessage[]>();
    sortedMessages.forEach((message) => {
      const rawDate = message.created_at;
      const date = rawDate ? new Date(rawDate) : new Date();
      const dayKey = format(date, "yyyy-MM-dd");
      const existing = groups.get(dayKey) || [];
      existing.push(message);
      groups.set(dayKey, existing);
    });
    return Array.from(groups.entries()).sort(([a], [b]) => (a < b ? 1 : -1));
  }, [sortedMessages]);

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

  const getSenderType = (message: ChatHistoryMessage): "User" | "Assistant" | "Unknown" => {
    const senderType = String(message.role || "").toLowerCase().trim();
    if (senderType === "user") return "User";
    if (senderType === "assistant") return "Assistant";
    return "Unknown";
  };

  const toggleSelect = (messageId: number) => {
    const next = new Set(selectedMessageIds);
    if (next.has(messageId)) next.delete(messageId);
    else next.add(messageId);
    setSelectedMessageIds(next);
  };

  const toggleSelectAll = () => {
    if (selectedMessageIds.size > 0 && selectedMessageIds.size === sortedMessages.length) {
      setSelectedMessageIds(new Set());
      return;
    }
    setSelectedMessageIds(new Set(sortedMessages.map((item) => Number(item.id)).filter((id) => Number.isFinite(id))));
  };

  const handleDeleteSelected = async () => {
    if (!userId || selectedMessageIds.size === 0) return;
    try {
      const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
      const response = await fetch(`${API_URL}/api/chat-history`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation: "delete",
          user_id: userId,
          ids: Array.from(selectedMessageIds),
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to delete selected messages");
      }

      setMessages((prev) => prev.filter((item) => !selectedMessageIds.has(Number(item.id))));
      window.dispatchEvent(new Event("chat-history-deleted"));
      setSelectedMessageIds(new Set());
      setShowDeleteConfirm(false);
    } catch {
      // Keep silent to match existing page behavior.
    }
  };

  const toggleDayExpansion = (dayKey: string) => {
    const next = new Set(expandedDayKeys);
    if (next.has(dayKey)) next.delete(dayKey);
    else next.add(dayKey);
    setExpandedDayKeys(next);
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
                checked={sortedMessages.length > 0 && selectedMessageIds.size === sortedMessages.length}
                onCheckedChange={toggleSelectAll}
              />
              <span className="text-sm text-muted-foreground">Select all</span>
            </div>
          </div>

          {selectedMessageIds.size > 0 && (
            <div className="mb-4 flex items-center justify-between bg-destructive/10 p-4 rounded-xl border border-destructive/20">
              <span className="text-sm font-bold text-destructive">
                {selectedMessageIds.size} message(s) selected
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
                <AlertDialogTitle>Delete selected messages?</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to permanently delete {selectedMessageIds.size} selected message(s)?
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
            {groupedMessages.map(([dateKey, entries]) => (
              <div key={dateKey} className="space-y-2">
                <button
                  type="button"
                  onClick={() => toggleDayExpansion(dateKey)}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-left hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">{formatGroupLabel(dateKey)}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {(entries[0]?.message || "").toString() || "No message"}
                      </p>
                      <p className="text-xs text-muted-foreground">{entries.length} message(s)</p>
                    </div>
                    {expandedDayKeys.has(dateKey) ? (
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                  </div>
                </button>
                {expandedDayKeys.has(dateKey) && (
                  <div className="space-y-2">
                    {entries.map((entry) => (
                      <div
                        key={String(entry.id)}
                        className="flex items-start justify-between rounded-lg border px-3 py-2 bg-background"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <Checkbox
                            checked={selectedMessageIds.has(Number(entry.id))}
                            onCheckedChange={() => toggleSelect(Number(entry.id))}
                          />
                          <div className="text-left min-w-0">
                            <p className="font-medium truncate max-w-[580px]">
                              {(entry.message || "").toString() || "No message"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {entry.created_at ? format(new Date(entry.created_at), "MMM d, yyyy h:mm a") : "No date"}
                            </p>
                          </div>
                        </div>
                        <span className="ml-3 shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {getSenderType(entry)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {groupedMessages.length === 0 && (
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
