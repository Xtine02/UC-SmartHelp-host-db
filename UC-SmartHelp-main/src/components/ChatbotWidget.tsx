import { useEffect, useRef } from "react";

const ChatbotWidget = () => {
  const scriptRef = useRef<HTMLScriptElement | null>(null);

  const removeInjectedChatbotUi = () => {
    const selectors = [
      '[id*="flowise"]',
      '[class*="flowise"]',
      "flowise-chatbot",
      'iframe[src*="flowise"]',
      'iframe[id*="chatbot"]',
      'iframe[class*="chatbot"]'
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

  const teardown = () => {
    if (scriptRef.current && scriptRef.current.parentNode) {
      scriptRef.current.parentNode.removeChild(scriptRef.current);
      scriptRef.current = null;
    }
    removeInjectedChatbotUi();
  };

  const getUserId = () => {
    try {
      // Check for logged-in user
      const userJson = localStorage.getItem("user");
      if (userJson) {
        const user = JSON.parse(userJson);
        return user.userId || user.id || user.user_id || null;
      }

      // Check for guest user
      const isGuest = localStorage.getItem("uc_guest") === "1";
      if (isGuest) {
        console.log("👤 Guest user detected");
        return "guest";
      }
    } catch (e) {
      console.error("Failed to parse user from localStorage", e);
    }
    return null;
  };

  useEffect(() => {
    teardown();

    const userId = getUserId();
    if (!userId) {
      console.log("⚠️ No user logged in, chatbot will not load");
      return;
    }

    console.log("🤖 Initializing chatbot for user_id:", userId);

    // Listen for chatbot responses to detect redirect triggers
    const handleChatbotMessage = (event: MessageEvent) => {
      try {
        const data = event.data;
        if (typeof data === 'string' && data.includes('REDIRECT_TICKET')) {
          console.log("🎯 Redirect trigger detected from chatbot");
          // Dispatch custom event to open NewTicketDialog
          window.dispatchEvent(new CustomEvent('open-new-ticket-dialog', {
            detail: { source: 'chatbot' }
          }));
        }
      } catch (e) {
        // Silently ignore non-relevant messages
      }
    };

    window.addEventListener('message', handleChatbotMessage);

    const script = document.createElement("script");
    script.type = "module";
    script.text = `
      import Chatbot from "https://cdn.jsdelivr.net/npm/flowise-embed/dist/web.js";
      
      // Store original sendMessage for response detection
      let originalSendMessage = null;
      
      Chatbot.init({
        chatflowid: "879b246d-a9f5-44e6-9d5f-07b4a38bf65b",
        apiHost: "http://localhost:3001",
        chatflowConfig: {
          userId: "${userId}",
          apiUrl: "http://localhost:3000"
        },
        observersConfig: {
          // Listen to chatbot responses
          on_message: (message) => {
            console.log("💬 Chatbot response received:", message);
            if (typeof message === 'string' && message.includes('REDIRECT_TICKET')) {
              console.log("🎯 Redirect trigger detected");
              window.postMessage({
                source: 'flowise-chatbot',
                action: 'REDIRECT_TICKET',
                message: message
              }, '*');
            }
          }
        },
        theme: {
          button: {
            backgroundColor: '#3B81F6',
            right: 20,
            bottom: 20,
            size: 56,
            dragAndDrop: true,
            iconColor: 'white',
            customIconSrc: 'https://raw.githubusercontent.com/walkxcode/dashboard-icons/main/svg/google-messages.svg',
            autoWindowOpen: {
              autoOpen: false,
              openDelay: 2,
              autoOpenOnMobile: false
            }
          },
          tooltip: {
            showTooltip: true,
            tooltipMessage: 'Hi There 👋!',
            tooltipBackgroundColor: 'black',
            tooltipTextColor: 'white',
            tooltipFontSize: 16
          },
          disclaimer: {
            title: 'Disclaimer',
            message: "By using this chatbot, you agree to the <a target='_blank' href='https://flowiseai.com/terms'>Terms & Condition</a>",
            textColor: 'black',
            buttonColor: '#3b82f6',
            buttonText: 'Start Chatting',
            buttonTextColor: 'white',
            blurredBackgroundColor: 'rgba(0, 0, 0, 0.4)',
            backgroundColor: 'white'
          },
          customCSS: "",
          chatWindow: {
            showTitle: true,
            showAgentMessages: true,
            title: 'UC SmartHelp Assistant',
            welcomeMessage: 'Hello! Welcome to UC SmartHelp. How can I assist you today?',
            errorMessage: 'Sorry, I encountered an error. Please try again.',
            backgroundColor: '#ffffff',
            height: 700,
            width: 400,
            fontSize: 16,
            starterPrompts: [
              "How do I create a ticket?",
              "What departments are available?",
              "How do I check my ticket status?"
            ],
            clearChatOnReload: false,
            renderHTML: true,
            botMessage: { backgroundColor: '#f7f8ff', textColor: '#303235', showAvatar: true, avatarSrc: 'https://raw.githubusercontent.com/zahidkhawaja/langchain-chat-nextjs/main/public/parroticon.png' },
            userMessage: { backgroundColor: '#3B81F6', textColor: '#ffffff', showAvatar: true, avatarSrc: 'https://raw.githubusercontent.com/zahidkhawaja/langchain-chat-nextjs/main/public/usericon.png' },
            textInput: { placeholder: 'Type your question', backgroundColor: '#ffffff', textColor: '#303235', sendButtonColor: '#3B81F6', maxChars: 50, maxCharsWarningMessage: 'You exceeded the characters limit. Please input less than 50 characters.', autoFocus: true, sendMessageSound: true, receiveMessageSound: true },
            feedback: { color: '#303235' },
            dateTimeToggle: { date: true, time: true },
            footer: { textColor: '#303235', text: 'Powered by', company: 'UC SmartHelp', companyLink: 'https://uc-smarthelp.com' }
          }
        }
      });
    `;

    document.body.appendChild(script);
    scriptRef.current = script;

    const handleReset = () => teardown();
    window.addEventListener("chatbot-reset", handleReset);
    window.addEventListener("user-logout", handleReset);

    return () => {
      window.removeEventListener("message", handleChatbotMessage);
      window.removeEventListener("chatbot-reset", handleReset);
      window.removeEventListener("user-logout", handleReset);
      teardown();
    };
  }, []);

  return null;
};

export default ChatbotWidget;