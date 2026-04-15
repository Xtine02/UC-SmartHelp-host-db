import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const FlowiseChatbot = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [authRefreshKey, setAuthRefreshKey] = useState(0);
  const ticketPromptPendingRef = useRef(false);

  useEffect(() => {
    const refreshChatbot = () => setAuthRefreshKey((v) => v + 1);
    const handleUserLogout = () => {
      sessionStorage.removeItem("chatbot_last_scope");
      localStorage.removeItem("chatbot_last_scope");
      refreshChatbot();
    };
    const handleGuestLogout = () => {
      sessionStorage.removeItem("guest_chat_session_id");
      sessionStorage.removeItem("chatbot_last_scope");
      localStorage.removeItem("chatbot_last_scope");
      refreshChatbot();
    };
    window.addEventListener("profile-updated", refreshChatbot);
    window.addEventListener("user-logout", handleUserLogout);
    window.addEventListener("guest-logout", handleGuestLogout);
    window.addEventListener("chat-history-deleted", refreshChatbot);
    window.addEventListener("chat-session-selected", refreshChatbot);
    return () => {
      window.removeEventListener("profile-updated", refreshChatbot);
      window.removeEventListener("user-logout", handleUserLogout);
      window.removeEventListener("guest-logout", handleGuestLogout);
      window.removeEventListener("chat-history-deleted", refreshChatbot);
      window.removeEventListener("chat-session-selected", refreshChatbot);
    };
  }, []);

  useEffect(() => {
    const openStudentTicketDialog = () => {
      window.dispatchEvent(new Event("open-new-ticket-dialog"));
    };

    const handleChatbotTicketRedirect = () => {
      const isGuest = localStorage.getItem("uc_guest") === "1";
      if (isGuest) {
        navigate("/register");
        return;
      }

      const isOnStudentDashboard = location.pathname === "/dashboard" || location.pathname === "/StudentDashboard";
      if (isOnStudentDashboard) {
        openStudentTicketDialog();
        return;
      }

      navigate("/dashboard");
      // Allow dashboard to mount, then open the New Ticket dialog.
      window.setTimeout(openStudentTicketDialog, 250);
    };

    window.addEventListener("chatbot-redirect-ticket", handleChatbotTicketRedirect);

    return () => {
      window.removeEventListener("chatbot-redirect-ticket", handleChatbotTicketRedirect);
    };
  }, [location.pathname, navigate]);

  useEffect(() => {
    const removeInjectedChatbotUi = () => {
      const selectors = [
        '[id*="flowise"]',
        '[class*="flowise"]',
        "flowise-chatbot",
        'iframe[src*="flowise"]',
        'iframe[id*="chatbot"]',
        'iframe[class*="chatbot"]',
      ];
      const seen = new Set<Element>();
      for (const selector of selectors) {
        document.querySelectorAll(selector).forEach((el) => {
          if (seen.has(el)) return;
          seen.add(el);
          el.remove();
        });
      }
    };

    removeInjectedChatbotUi();

    const dashboardPaths = new Set([
      "/StudentDashboard",
      "/dashboard",
      "/GuestDashboard",
      "/AccountingDashboard",
      "/ScholarshipDashboard",
      "/AdminDashboard",
      "/admin-dashboard",
    ]);

    const isGuest = localStorage.getItem("uc_guest") === "1";
    const userRaw = localStorage.getItem("user");
    let forceFreshAfterLogout = localStorage.getItem("chatbot_force_fresh") === "1";
    let user: any = null;
    try {
      user = userRaw ? JSON.parse(userRaw) : null;
    } catch {
      user = null;
    }
    const accountId = user?.id || user?.userId || user?.user_id || null;
    let accountScope: string | null = null;
    const CHAT_SCOPE_TTL_MS = 24 * 60 * 60 * 1000;
    const getUserScopeForCurrentWindow = (normalizedAccountId: string) => {
      // Shared across devices: same account + same 24h window => same chatbot scope.
      const windowIndex = Math.floor(Date.now() / CHAT_SCOPE_TTL_MS);
      return `user-${normalizedAccountId}-w${windowIndex}`;
    };

    if (isGuest) {
      let guestSessionId = sessionStorage.getItem("guest_chat_session_id");
      if (!guestSessionId) {
        guestSessionId = `guest-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        sessionStorage.setItem("guest_chat_session_id", guestSessionId);
      }
      accountScope = guestSessionId;
    } else if (accountId) {
      accountScope = getUserScopeForCurrentWindow(String(accountId));
    }
    const role = (user?.role || "").toString().toLowerCase();
    const isAllowedRole = role === "student" || role === "staff" || role === "admin";
    const isStaffOrAdmin = role === "staff" || role === "admin";
    const isAllowedPath = dashboardPaths.has(location.pathname);

    const prevScopeSession = sessionStorage.getItem("chatbot_last_scope");
    const prevScopePersistent = localStorage.getItem("chatbot_last_scope");
    const prevScope = prevScopeSession || prevScopePersistent;
    const hasScopeChanged = !!prevScope && !!accountScope && prevScope !== accountScope;

    if (hasScopeChanged) {
      removeInjectedChatbotUi();
    }

    if (accountScope) {
      sessionStorage.setItem("chatbot_last_scope", accountScope);
      localStorage.setItem("chatbot_last_scope", accountScope);
    }

    if (!isAllowedPath || (!isGuest && !isAllowedRole) || !accountScope) {
      return;
    }

    const handleChatHistoryDeleted = () => {
      if (isGuest) {
        const nextGuestSession = `guest-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        sessionStorage.setItem("guest_chat_session_id", nextGuestSession);
      }
      setAuthRefreshKey((v) => v + 1);
    };
    window.addEventListener("chat-history-deleted", handleChatHistoryDeleted);

    const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
    const originalFetch = window.fetch.bind(window);
    const starterPrompts = isStaffOrAdmin
      ? []
      : ["How do I create a ticket?", "How do I check my ticket status?"];
    const persistChatHistory = async (
      message: string,
      role: "user" | "assistant",
      metadata?: Record<string, unknown>,
    ) => {
      const cleanMessage = String(message || "").trim();
      if (!cleanMessage) return;
      try {
        const response = await originalFetch(`${API_URL}/api/chat-history`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: accountId || null,
            sender_type: role,
            message: cleanMessage,
          }),
        });
        if (!response.ok) {
          console.error("Failed to save chat history:", response.status, response.statusText);
        }
      } catch {
        // Best-effort logging only; never break chat flow.
        console.error("Failed to save chat history: network/request error");
      }
    };

    const wantsTicketIntent = (text: string) =>
      /(submit|create|open).{0,25}ticket|ticket.{0,25}(submit|create|open)/i.test(text);
    const affirmativeIntent = (text: string) =>
      /^(yes|yep|yeah|sure|ok|okay|please|i agree|agree|go ahead|do it|yes please)\b/i.test(text.trim());
    const asksToSubmitTicket = (text: string) =>
      /(would you like|do you want|can i).{0,35}(submit|create|open).{0,20}ticket|submit a ticket\?/i.test(text);

    const extractBotText = (payload: any): string => {
      if (!payload) return "";
      if (typeof payload === "string") return payload.trim();

      const direct = String(
        payload?.text || payload?.message || payload?.output || payload?.content || payload?.answer || payload?.response || ""
      ).trim();
      if (direct) return direct;

      if (Array.isArray(payload?.messages) && payload.messages.length > 0) {
        const last = payload.messages[payload.messages.length - 1];
        const lastText = String(last?.text || last?.message || last?.content || "").trim();
        if (lastText) return lastText;
      }

      if (Array.isArray(payload?.data) && payload.data.length > 0) {
        const joined = payload.data
          .map((item: any) => String(item?.text || item?.message || item?.content || "").trim())
          .filter(Boolean)
          .join("\n");
        if (joined) return joined;
      }

      if (Array.isArray(payload?.outputs) && payload.outputs.length > 0) {
        const joined = payload.outputs
          .map((item: any) => String(item?.text || item?.message || item?.content || item?.output || "").trim())
          .filter(Boolean)
          .join("\n");
        if (joined) return joined;
      }

      return "";
    };

    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      try {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        const isPredictionCall = url.includes("/api/v1/prediction/8e70e238-a6f4-419d-afae-5a72d0a02247");
        const method = (init?.method || "GET").toUpperCase();

        if (isPredictionCall && method === "POST") {
          const rawBody = init?.body;
          if (typeof rawBody === "string") {
            const parsed = JSON.parse(rawBody || "{}");
            const userMessage = parsed.question || parsed.input || parsed.chatInput || "";
            if (typeof userMessage === "string" && userMessage.trim()) {
              const cleanUserMessage = userMessage.trim();
              void persistChatHistory(cleanUserMessage, "user");
              if (
                wantsTicketIntent(cleanUserMessage) ||
                (ticketPromptPendingRef.current && affirmativeIntent(cleanUserMessage))
              ) {
                ticketPromptPendingRef.current = false;
                window.dispatchEvent(new Event("chatbot-redirect-ticket"));
              }
            }
            const nextBody = {
              ...parsed,
              overrideConfig: {
                ...(parsed.overrideConfig || {}),
                sessionId: accountScope,
                userId: accountScope,
                user_id: accountScope,
              },
            };
            const predictionResponse = await originalFetch(input, { ...init, body: JSON.stringify(nextBody) });
            try {
              const cloned = predictionResponse.clone();
              const predictionJson = await cloned.json();
              const assistantReply = extractBotText(predictionJson);
              if (assistantReply && !assistantReply.includes("REDIRECT_TICKET")) {
                void persistChatHistory(assistantReply, "assistant");
              }
              if (assistantReply) {
                if (asksToSubmitTicket(assistantReply)) {
                  ticketPromptPendingRef.current = true;
                }
                if (assistantReply.toUpperCase().includes("REDIRECT_TICKET")) {
                  ticketPromptPendingRef.current = false;
                  window.dispatchEvent(new Event("chatbot-redirect-ticket"));
                }
              }
            } catch {
              // Non-JSON or unexpected response shape from chatbot API.
            }
            return predictionResponse;
          }
        }
      } catch {
        // Fall through to original request on parse/shape errors.
      }
      return originalFetch(input, init);
    }) as typeof window.fetch;

    const script = document.createElement("script");
    script.type = "module";
    script.textContent = `
      import Chatbot from "https://cdn.jsdelivr.net/npm/flowise-embed/dist/web.js";
      Chatbot.init({
        chatflowid: "8e70e238-a6f4-419d-afae-5a72d0a02247",
        apiHost: "http://localhost:3001",
        sessionId: "${accountScope}",
        chatflowConfig: {
          sessionId: "${accountScope}",
          userId: "${accountScope}",
          user_id: "${accountScope}"
        },
        overrideConfig: {
          sessionId: "${accountScope}",
          userId: "${accountScope}",
          user_id: "${accountScope}"
        },
        metadata: {
          userId: "${accountScope}",
          user_id: "${accountScope}",
          sessionId: "${accountScope}"
        },
        observersConfig: {
          on_message: (response) => {
            const messageText = (${extractBotText.toString()})(response);
            if (String(messageText || "").toUpperCase().includes("REDIRECT_TICKET")) {
              window.dispatchEvent(new Event("chatbot-redirect-ticket"));
            }
          },
        },
        theme: {
          button: {
            backgroundColor: "#3B81F6",
            right: 20,
            bottom: 20,
            size: 56,
            dragAndDrop: true,
            iconColor: "white",
            customIconSrc: "https://raw.githubusercontent.com/walkxcode/dashboard-icons/main/svg/google-messages.svg",
            autoWindowOpen: {
              autoOpen: false,
              openDelay: 2,
              autoOpenOnMobile: false,
            },
          },
          tooltip: {
            showTooltip: true,
            tooltipMessage: "Hi There 👋!",
            tooltipBackgroundColor: "black",
            tooltipTextColor: "white",
            tooltipFontSize: 16,
          },
          disclaimer: {
            title: "Disclaimer",
            message: "By using this chatbot, you agree to the <a target='_blank' href='https://flowiseai.com/terms'>Terms & Condition</a>",
            textColor: "black",
            buttonColor: "#3b82f6",
            buttonText: "Start Chatting",
            buttonTextColor: "white",
            blurredBackgroundColor: "rgba(0, 0, 0, 0.4)",
            backgroundColor: "white",
          },
          customCSS: "",
          chatWindow: {
            showTitle: true,
            showAgentMessages: false,
            title: "UC SmartHelp Assistant",
            welcomeMessage: "Hello! Welcome to UC SmartHelp. How can I assist you today?",
            errorMessage: "Sorry, I encountered an error. Please try again.",
            backgroundColor: "#ffffff",
            height: 700,
            width: 400,
            fontSize: 16,
            starterPrompts: ${JSON.stringify(starterPrompts)},
            clearChatOnReload: ${(isGuest || forceFreshAfterLogout) ? "true" : "false"},
            renderHTML: true,
            botMessage: {
              backgroundColor: "#f7f8ff",
              textColor: "#303235",
              showAvatar: true,
              avatarSrc: "https://raw.githubusercontent.com/zahidkhawaja/langchain-chat-nextjs/main/public/parroticon.png"
            },
            userMessage: {
              backgroundColor: "#3B81F6",
              textColor: "#ffffff",
              showAvatar: true,
              avatarSrc: "https://raw.githubusercontent.com/zahidkhawaja/langchain-chat-nextjs/main/public/usericon.png"
            },
            textInput: {
              placeholder: "Type your question",
              backgroundColor: "#ffffff",
              textColor: "#303235",
              sendButtonColor: "#3B81F6",
              maxChars: 50,
              maxCharsWarningMessage: "You exceeded the characters limit. Please input less than 50 characters.",
              autoFocus: true,
              sendMessageSound: true,
              receiveMessageSound: true
            },
            feedback: { color: "#303235" },
            dateTimeToggle: { date: true, time: true },
            footer: {
              textColor: "#303235",
              text: "Powered by",
              company: "UC SmartHelp",
              companyLink: "https://uc-smarthelp.com"
            }
          }
        },
      });
    `;

    document.body.appendChild(script);
    if (forceFreshAfterLogout) {
      localStorage.removeItem("chatbot_force_fresh");
      forceFreshAfterLogout = false;
    }

    return () => {
      window.removeEventListener("chat-history-deleted", handleChatHistoryDeleted);
      window.fetch = originalFetch;
      script.remove();
      removeInjectedChatbotUi();
    };
  }, [location.pathname, authRefreshKey]);

  return null;
};

export default FlowiseChatbot;
