import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

interface User {
  id: string;
  userId?: string;
  user_id?: string;
  email?: string;
}

const ChatbotWidget = () => {
  const scriptRef = useRef<HTMLScriptElement | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isGuest, setIsGuest] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const navigate = useNavigate();

  const cleanupChatbot = () => {
    // Remove the Flowise script
    if (scriptRef.current && scriptRef.current.parentNode) {
      try {
        scriptRef.current.parentNode.removeChild(scriptRef.current);
      } catch (e) {
        // Already removed
      }
      scriptRef.current = null;
    }

    // Remove Flowise DOM elements - multiple selector patterns for thorough cleanup
    try {
      const selectors = [
        '[id^="flowise"]',
        '.flowise-container',
        '[class*="flowise"]',
        'div[style*="flowise"]',
        'iframe[title*="chat"]',
        'iframe[title*="flowise"]'
      ];
      
      selectors.forEach(selector => {
        try {
          const elements = document.querySelectorAll(selector);
          elements.forEach((el) => {
            try {
              el.parentNode?.removeChild(el);
            } catch (e) {
              // Already removed
            }
          });
        } catch (e) {
          // Selector error, continue
        }
      });
    } catch (e) {
      // Ignore errors
    }

    // Clear ALL Flowise data from localStorage and sessionStorage
    const keys = [...Object.keys(localStorage), ...Object.keys(sessionStorage)];
    keys.forEach((key) => {
      if (
        key.toLowerCase().includes("flowise") || 
        key.toLowerCase().includes("conversation") ||
        key.toLowerCase().includes("chatbot") ||
        key.toLowerCase().includes("chat_")
      ) {
        try {
          localStorage.removeItem(key);
          sessionStorage.removeItem(key);
        } catch (e) {
          // Ignore
        }
      }
    });
  };

  const reloadCharbot = async (userId?: string | null) => {
    // Remove old chatbot first
    cleanupChatbot();

    const user: User = userId 
      ? { id: userId } 
      : JSON.parse(localStorage.getItem("user") || "{}");
    
    const actualUserId = userId || user.id || user.userId || user.user_id;
    const isGuest = localStorage.getItem("uc_guest") === "1";

    // For logged-in users, namespace Flowise localStorage keys by userId
    // This ensures each user has their own independent Flowise conversation state
    if (!isGuest && actualUserId) {
      const originalSetItem = Storage.prototype.setItem;
      const originalGetItem = Storage.prototype.getItem;
      const originalRemoveItem = Storage.prototype.removeItem;

      Storage.prototype.setItem = function (key: string, value: string) {
        const isFlowiseKey = key.toLowerCase().includes("flowise") || 
                             key.toLowerCase().includes("conversation") ||
                             key.toLowerCase().includes("chatbot");
        const newKey = isFlowiseKey ? `user_${actualUserId}_${key}` : key;
        return originalSetItem.call(this, newKey, value);
      };

      Storage.prototype.getItem = function (key: string) {
        const isFlowiseKey = key.toLowerCase().includes("flowise") || 
                             key.toLowerCase().includes("conversation") ||
                             key.toLowerCase().includes("chatbot");
        const newKey = isFlowiseKey ? `user_${actualUserId}_${key}` : key;
        return originalGetItem.call(this, newKey);
      };

      Storage.prototype.removeItem = function (key: string) {
        const isFlowiseKey = key.toLowerCase().includes("flowise") || 
                             key.toLowerCase().includes("conversation") ||
                             key.toLowerCase().includes("chatbot");
        const newKey = isFlowiseKey ? `user_${actualUserId}_${key}` : key;
        return originalRemoveItem.call(this, newKey);
      };
    }

    // Fetch and restore chat history for logged-in users
    if (!isGuest && actualUserId) {
      try {
        const historyResponse = await fetch(`http://localhost:3000/api/chatbot-history/${actualUserId}?all=true`);
        if (historyResponse.ok) {
          const history = await historyResponse.json();
          // Store history in sessionStorage to restore in Flowise context
          if (history.length > 0) {
            sessionStorage.setItem(`user_${actualUserId}_chat_history`, JSON.stringify(history));
          }
        }
      } catch (error) {
        console.error('Failed to fetch chat history:', error);
      }
    }

    // Reload the Flowise script with user context
    const script = document.createElement("script");
    script.type = "module";
    
    // Pass userId as query parameter for Flowise to identify the conversation context
    const userQueryParam = !isGuest && actualUserId ? `&conversationId=${actualUserId}` : "";
    
    script.innerHTML = `
      import Chatbot from "https://cdn.jsdelivr.net/npm/flowise-embed/dist/web.js"
      Chatbot.init({
        chatflowid: "879b246d-a9f5-44e6-9d5f-07b4a38bf65b",
        apiHost: "http://localhost:3001${userQueryParam}",
        theme: {
          button: {
            backgroundColor: "#3B81F6",
            right: 20,
            bottom: 20,
            size: 50,
            iconColor: "white",
          },
          chatWindow: {
            showTitle: true,
            title: 'Ask My AI Assistant',
            welcomeMessage: 'Hi there! How can I help?',
            backgroundColor: "#ffffff",
            height: 600,
            width: 400,
            fontSize: 16,
            botMessage: {
              backgroundColor: "#f7f8ff",
              textColor: "#303235",
              showAvatar: true,
              avatarSrc: "",
            },
            userMessage: {
              backgroundColor: "#3B81F6",
              textColor: "#ffffff",
              showAvatar: true,
              avatarSrc: "",
            },
            textInput: {
              placeholder: 'Type your question',
              backgroundColor: '#ffffff',
              textColor: '#303235',
              sendButtonColor: '#3B81F6',
            },
          }
        }
      })
    `;
    document.body.appendChild(script);
    scriptRef.current = script;
  };

  // Check user login state on mount and when events occur
  useEffect(() => {
    const checkLoginState = () => {
      const user: User = JSON.parse(localStorage.getItem("user") || "{}");
      const userId = user.id || user.userId || user.user_id;
      const isGuest = localStorage.getItem("uc_guest") === "1";
      // Allow chatbot for both logged-in users AND guests
      const hasSession = !!userId || isGuest;
      
      setIsLoggedIn(!!userId && !isGuest);
      
      // If user ID changed, reload chatbot with new user's data
      if (userId && userId !== currentUserId) {
        setCurrentUserId(userId);
      }

      if (!hasSession) {
        // No user session at all (not logged in and not a guest), clean up chatbot
        setCurrentUserId(null);
        cleanupChatbot();
      }
    };

    // Immediate logout handler - destroy chatbot instantly
    const handleUserLogout = () => {
      console.log('User logout detected, cleaning up chatbot...');
      setCurrentUserId(null);
      cleanupChatbot();
      setIsLoggedIn(false);
    };

    checkLoginState();

    // Listen for logout and profile update events
    window.addEventListener("storage", checkLoginState);
    window.addEventListener("chatbot-reset", checkLoginState);
    window.addEventListener("profile-updated", checkLoginState);
    window.addEventListener("user-logout", handleUserLogout);

    return () => {
      window.removeEventListener("storage", checkLoginState);
      window.removeEventListener("chatbot-reset", checkLoginState);
      window.removeEventListener("profile-updated", checkLoginState);
      window.removeEventListener("user-logout", handleUserLogout);
    };
  }, [currentUserId]);

  // When user ID changes, reload chatbot with new user's database history
  useEffect(() => {
    // Check if we have a valid session (either logged in user or guest)
    const isGuest = localStorage.getItem("uc_guest") === "1";
    const user: User = JSON.parse(localStorage.getItem("user") || "{}");
    const userId = user.id || user.userId || user.user_id;
    
    // Load chatbot if either logged in or guest
    if (!userId && !isGuest) {
      cleanupChatbot();
      return;
    }

    // Add styles for chat container
    const style = document.createElement("style");
    style.innerHTML = `
      /* Flowise chat window styling */
      iframe[title*="chat"],
      iframe[title*="flowise"],
      .flowise-container {
        border-radius: 12px !important;
      }

      /* Hide Flowise branding */
      [class*="poweredBy"] {
        display: none !important;
      }

      /* Bouncing animation for chat button */
      button[id*="flowise"],
      div[id*="flowise"] button,
      [class*="flowise"] button {
        animation: bounce 2s infinite !important;
      }
      
      @keyframes bounce {
        0%, 100% {
          transform: translateY(0);
        }
        50% {
          transform: translateY(-10px);
        }
      }
    `;
    document.head.appendChild(style);

    // Intercept Flowise messages for database storage
    const handleFlowiseMessage = async (event: MessageEvent) => {
      // Only capture messages from Flowise iframe (port 3001)
      if (!event.origin.includes("localhost:3001")) return;

      const user: User = JSON.parse(localStorage.getItem("user") || "{}");
      const isGuest = localStorage.getItem("uc_guest") === "1";
      const userId = user.id || user.userId || user.user_id;

      let messageData = null;
      let senderType: 'student' | 'ai' = 'student';

      // Parse Flowise message format
      if (event.data?.message) {
        messageData = event.data.message;
        // Determine if it's a user message or AI response
        if (event.data.type === 'apiMessage' || event.data.type === 'response') {
          senderType = 'ai';
        } else if (event.data.type === 'userMessage' || event.data.type === 'message') {
          senderType = 'student';
        }
      }

      if (messageData) {
        if (isGuest) {
          // Store guest messages in sessionStorage ONLY (temporary, lost on logout/tab close - NO DATABASE)
          try {
            const guestHistory = JSON.parse(sessionStorage.getItem("guest_chat_history") || "[]");
            guestHistory.push({
              id: Date.now(),
              sender_type: senderType,
              message: messageData,
              created_at: new Date().toISOString()
            });
            sessionStorage.setItem("guest_chat_history", JSON.stringify(guestHistory));
          } catch (error) {
            console.error("Failed to save guest chat:", error);
          }
        } else if (userId) {
          // Store logged-in user messages in database (persistent, user-specific)
          try {
            await fetch('http://localhost:3000/api/chatbot-history', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                user_id: userId,
                sender_type: senderType,
                message: messageData
              })
            });
          } catch (error) {
            console.error("Failed to save message to database:", error);
          }
        }
      }
    };

    const handleChatbotReset = () => {
      // Check if we still have an active session before reloading
      const user: User = JSON.parse(localStorage.getItem("user") || "{}");
      const userId = user.id || user.userId || user.user_id;
      const isGuest = localStorage.getItem("uc_guest") === "1";
      
      if (!userId && !isGuest) {
        // No session, clean up completely
        cleanupChatbot();
        return;
      }
      
      // Session still active, reload
      reloadCharbot(currentUserId);
    };

    const handleBeforeUnload = () => {
      const isGuest = localStorage.getItem("uc_guest") === "1";
      if (isGuest) {
        sessionStorage.removeItem("guest_chat_history");
      }
    };

    // Immediate logout handler for the second effect
    const handleUserLogoutCleanup = () => {
      cleanupChatbot();
      clearTimeout(historyTimer);
    };

    window.addEventListener('message', handleFlowiseMessage);
    window.addEventListener('user-logout', handleUserLogoutCleanup);
    window.addEventListener('beforeunload', handleBeforeUnload);

    // Load chatbot with current user ID
    reloadCharbot(currentUserId);

    // Restore chat history in Flowise
    const restoreChatHistory = async () => {
      const user: User = JSON.parse(localStorage.getItem("user") || "{}");
      const userId = user.id || user.userId || user.user_id;
      const isGuest = localStorage.getItem("uc_guest") === "1";

      if (isGuest || !userId) return;

      try {
        // Wait for Flowise to load
        await new Promise(resolve => setTimeout(resolve, 2000));

        const historyKey = `user_${userId}_chat_history`;
        const historyData = sessionStorage.getItem(historyKey);
        
        if (historyData) {
          const history = JSON.parse(historyData);
          
          // Inject history into Flowise messages display
          history.forEach((entry: any) => {
            // Find Flowise message container
            const messageContainer = document.querySelector('[class*="flowise"] [class*="messages"]') || 
                                     document.querySelector('iframe[title*="chat"]')?.contentDocument?.querySelector('[class*="messages"]');
            
            if (messageContainer) {
              const messageDiv = document.createElement('div');
              messageDiv.className = `flowise-history-message ${entry.sender_type}`;
              messageDiv.innerHTML = `
                <div style="margin: 12px 0; padding: 8px 12px; border-radius: 8px; ${
                  entry.sender_type === 'student' 
                    ? 'background-color: #3B81F6; color: white; margin-left: 20%; text-align: right;' 
                    : 'background-color: #f7f8ff; color: #303235; margin-right: 20%;'
                }">
                  ${entry.message}
                </div>
              `;
              messageContainer.appendChild(messageDiv);
            }
          });
        }
      } catch (error) {
        console.log('Chat history restore (non-critical):', error);
      }
    };

    // Wait for Flowise to initialize, then restore history
    const historyTimer = setTimeout(restoreChatHistory, 3000);

    return () => {
      try {
        clearTimeout(historyTimer);
        cleanupChatbot();
        if (style.parentNode) {
          style.parentNode.removeChild(style);
        }
        window.removeEventListener('message', handleFlowiseMessage);
        window.removeEventListener('user-logout', handleUserLogoutCleanup);
        window.removeEventListener('beforeunload', handleBeforeUnload);
      } catch (e) {
        // Ignore if already removed
      }
    };
  }, [currentUserId]);

  return null;
};

export default ChatbotWidget;
