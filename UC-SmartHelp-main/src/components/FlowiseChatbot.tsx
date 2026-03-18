import { useEffect, useRef, useState } from "react";

const CHATFLOW_ID = "879b246d-a9f5-44e6-9d5f-07b4a38bf65b";
const API_HOST = "http://localhost:3001";

const FlowiseChatbot = () => {
  const initialized = useRef(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const loadChatbot = async () => {
      try {
        const { default: Chatbot } = (await import(
          /* @vite-ignore */
          "https://cdn.jsdelivr.net/npm/flowise-embed/dist/web.js"
        )) as any;

        if (Chatbot?.initFull) {
          Chatbot.initFull({
            chatflowid: CHATFLOW_ID,
            apiHost: API_HOST,
          });
        } else {
          console.warn("Flowise Chatbot bundle loaded but initFull not found.");
        }
      } catch (error) {
        console.error("Failed to load Flowise Chatbot:", error);
      }
    };

    loadChatbot();
  }, []);

  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.origin !== API_HOST) return;
      
      const isGuest = localStorage.getItem("uc_guest") === "1";
      const user = JSON.parse(localStorage.getItem("user") || "{}");
      
      let sender_type: 'student' | 'ai';
      if (event.data.type === 'message') {
        sender_type = 'student';
      } else if (event.data.type === 'response') {
        sender_type = 'ai';
      } else {
        return;
      }

      if (isGuest) {
        // Store in sessionStorage for guest users
        const guestHistory = JSON.parse(sessionStorage.getItem("guest_chat_history") || "[]");
        guestHistory.push({
          id: Date.now(),
          sender_type,
          message: event.data.message,
          created_at: new Date().toISOString()
        });
        sessionStorage.setItem("guest_chat_history", JSON.stringify(guestHistory));
      } else if (user.id) {
        // Store in database for logged-in users
        try {
          await fetch('http://localhost:3000/api/chatbot-history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: user.id, sender_type, message: event.data.message })
          });
        } catch (error) {
          console.error("Failed to save message:", error);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  return (
    <div className="mt-6 flex flex-col items-center gap-6">
      <div className="w-full max-w-4xl flex items-center justify-between gap-4">
        <div>
          <div className="text-lg md:text-xl font-bold text-foreground">What can I help you?</div>

        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="rounded-2xl border border-primary/70 bg-primary/10 px-5 py-2 text-sm font-semibold text-primary shadow-sm transition hover:bg-primary/20 hover:shadow-md"
        >
          {open ? "Close chat" : "Chat now"}
        </button>
      </div>

      <div
        className={`thin-scrollbar w-full max-w-4xl rounded-2xl border bg-card shadow-sm ${
          open ? "block" : "hidden"
        }`}
        style={{ height: 340 }}
      >
        <flowise-fullchatbot className="h-full w-full" />
      </div>
    </div>
  );
};

export default FlowiseChatbot;
