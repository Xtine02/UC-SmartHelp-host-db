import { useState, useEffect } from "react";

interface ChatEntry {
  id: number;
  sender_type: 'student' | 'ai';
  message: string;
  created_at: string;
}

const ChatHistory = () => {
  const [history, setHistory] = useState<ChatEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      const isGuest = localStorage.getItem("uc_guest") === "1";
      
      if (isGuest) {
        const guestHistory = JSON.parse(sessionStorage.getItem("guest_chat_history") || "[]");
        setHistory(guestHistory);
        setLoading(false);
        return;
      }

      const user = JSON.parse(localStorage.getItem("user") || "{}");
      const userId = user.id || user.userId || user.user_id;
      if (!userId) {
        setHistory([]);
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`http://localhost:3000/api/chatbot-history/${userId}`);
        if (response.ok) {
          const data = await response.json();
          setHistory(data);
        }
      } catch (error) {
        console.error("Failed to fetch chat history:", error);
      } finally {
        setLoading(false);
      }
    };

    const clearAfterGuestLogout = () => {
      setHistory([]);
      setLoading(false);
    };

    fetchHistory();

    const updateListener = () => fetchHistory();
    window.addEventListener('chatbot-history-updated', updateListener);
    window.addEventListener('user-logout', clearAfterGuestLogout);
    window.addEventListener('chatbot-reset', clearAfterGuestLogout);

    const intervalId = setInterval(fetchHistory, 3000);

    return () => {
      window.removeEventListener('chatbot-history-updated', updateListener);
      window.removeEventListener('user-logout', clearAfterGuestLogout);
      clearInterval(intervalId);
    };
  }, []);

  if (loading) return <div>Loading chat history...</div>;

  return (
    <div className="mt-8">
      <h2 className="text-xl font-bold mb-4">Today's Chat History</h2>
      {history.length === 0 ? (
        <p>No chats today.</p>
      ) : (
        <div className="space-y-4">
          {history.map((entry) => (
            <div key={entry.id} className={`border rounded-lg p-4 ${entry.sender_type === 'student' ? 'bg-blue-50' : 'bg-green-50'}`}>
              <div className="font-semibold">{entry.sender_type === 'student' ? 'You' : 'AI'}: {entry.message}</div>
              <div className="text-sm text-gray-500 mt-2">{new Date(entry.created_at).toLocaleTimeString()}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ChatHistory;