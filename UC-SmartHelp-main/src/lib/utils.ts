import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const normalizeDepartment = (department: string): string => {
  const raw = (department || "").toString().trim().toLowerCase();
  if (!raw) return "";

  const scholarshipValues = ["scholarship", "scholarship office", "scholarship dept", "scholarship department"];
  if (scholarshipValues.includes(raw)) return "scholarship";

  const accountingValues = ["accounting", "accounting office", "accounting dept", "accounting department"];
  if (accountingValues.includes(raw)) return "accounting";

  return raw;
};

export const getLoggedInRedirectPath = (): string => {
  const isGuest = localStorage.getItem("uc_guest") === "1";
  const userJson = localStorage.getItem("user");
  const user = userJson ? JSON.parse(userJson) : null;
  const role = (user?.role || "").toString().toLowerCase();
  const department = normalizeDepartment(user?.department || "");

  if (isGuest) return "/GuestDashboard";
  if (role === "admin") return "/AdminDashboard";
  if (role === "staff") return department === "scholarship" ? "/ScholarshipDashboard" : "/AccountingDashboard";
  if (role === "student") return "/StudentDashboard";
  return "/";
};

export const getDashboardPath = (): string => {
  const isGuest = localStorage.getItem("uc_guest") === "1";
  const userJson = localStorage.getItem("user");
  const user = userJson ? JSON.parse(userJson) : null;
  const role = (user?.role || "student").toLowerCase();
  const department = normalizeDepartment(user?.department || "");
  
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

export async function performLogout() {
  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
  const userJson = localStorage.getItem("user");
  const user = userJson ? JSON.parse(userJson) : null;
  const userId = user?.id || user?.userId || user?.user_id;

  // Clear UI/session first so logout feels immediate.
  localStorage.removeItem("uc_guest");
  localStorage.removeItem("user");
  localStorage.removeItem("website_feedback_shown_session");
  localStorage.removeItem("chatbot_last_scope");
  localStorage.setItem("theme", "light");
  document.documentElement.classList.remove("dark");
  sessionStorage.removeItem("website_feedback_shown_session");
  sessionStorage.removeItem("guest_chat_session_id");
  sessionStorage.removeItem("chatbot_last_scope");

  // Hard reset chatbot client cache on logout (keeps DB chat_history intact).
  const localKeysToDelete: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key) continue;
    const normalized = key.toLowerCase();
    if (
      normalized.startsWith("chatbot_active_session_") ||
      normalized.includes("flowise") ||
      normalized.includes("chatbot")
    ) {
      localKeysToDelete.push(key);
    }
  }
  localKeysToDelete.forEach((key) => localStorage.removeItem(key));

  const sessionKeysToDelete: string[] = [];
  for (let i = 0; i < sessionStorage.length; i += 1) {
    const key = sessionStorage.key(i);
    if (!key) continue;
    const normalized = key.toLowerCase();
    if (normalized.includes("flowise") || normalized.includes("chatbot")) {
      sessionKeysToDelete.push(key);
    }
  }
  sessionKeysToDelete.forEach((key) => sessionStorage.removeItem(key));

  // Force next login to start a brand-new chatbot session.
  localStorage.setItem("chatbot_force_fresh", "1");

  // Dispatch reset events before navigation.
  window.dispatchEvent(new Event("user-logout"));

  // Best-effort audit call, but do not block UX.
  if (userId) {
    void fetch(`${API_URL}/api/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
      keepalive: true,
    }).catch((error) => {
      console.error("Error logging out:", error);
    });
  }
  
  // Reload page to home immediately.
  window.location.href = "/";
}

