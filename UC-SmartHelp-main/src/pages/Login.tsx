import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, X, User } from "lucide-react";
import Navbar from "../components/Navbar";
import { auth, googleProvider } from "@/lib/firebase"; 
import { signInWithPopup } from "firebase/auth";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  // Bulletproof API URL Selection
  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

  // Helper function to get redirect path based on user role
  const getRedirectPath = (user: any) => {
    const role = (user?.role || "student").toLowerCase();
    const department = (user?.department || "").toLowerCase();

    if (role === "admin") return "/AdminDashboard";
    if (role === "staff") {
      if (department === "scholarship") {
        return "/ScholarshipDashboard";
      }
      return "/AccountingDashboard";
    }
    return "/StudentDashboard";
  };

  const applyThemeForUser = (userData: any) => {
    const uid = userData?.userId || userData?.id || userData?.user_id;
    const key = uid ? `theme_user_${uid}` : null;
    const savedTheme = key ? localStorage.getItem(key) : null;
    const nextTheme = savedTheme === "dark" ? "dark" : "light";
    localStorage.setItem("theme", nextTheme);
    document.documentElement.classList.toggle("dark", nextTheme === "dark");
  };

  // --- GOOGLE LOGIN LOGIC ---
  const handleGoogleLogin = async () => {
    if (loading) return;
    setLoading(true); 

    try {
      const result = await signInWithPopup(auth, googleProvider);
      const gUser = result.user;

      const nameParts = gUser.displayName ? gUser.displayName.split(" ") : ["User"];
      const firstName = nameParts[0] || "User";
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "";

      const response = await fetch(`${API_URL}/api/google-auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: gUser.email,
          firstName: firstName,
          lastName: lastName,
          profileImage: gUser.photoURL || null
        }),
      });

      // Handle cases where server responds with non-JSON error pages
      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("Server returned an invalid response (Check Backend Logs)");
      }

      const data = await response.json();
      
      if (!response.ok) throw new Error(data.error || "Database sync failed");

      const userData = {
        ...data,
        gmail_account: data.gmail_account || gUser.email || null,
        id: data.id || data.userId || data.user_id,
        userId: data.userId || data.id || data.user_id,
      };

      localStorage.removeItem('uc_guest');
      localStorage.setItem("user", JSON.stringify(userData));
      applyThemeForUser(userData);

      // Reset chatbot on new login session
      window.dispatchEvent(new Event('profile-updated'));
      window.dispatchEvent(new Event('chatbot-reset'));
      
      toast({ title: "Welcome!", description: `Signed in as ${userData.firstName || 'User'}` });
      navigate(getRedirectPath(userData));

    } catch (error: any) {
      console.error("Auth Error:", error);
      
      // Check if popup was closed by user
      const isPopupClosed = error.code === "auth/popup-closed-by-user" || 
                           error.message?.includes("popup_closed_by_user") ||
                           error.message?.includes("closed") ||
                           error.message?.includes("popup") ||
                           error.message?.includes("Popup");
      
      if (isPopupClosed) {
        // Reset loading state immediately - no error message
        setLoading(false);
        return;
      }
      
      // specific handling for the "Closed Connection" error shown in your screenshots
      const isClosedState = error.message.includes("closed state");
      
      toast({ 
        variant: "destructive", 
        title: "Authentication Failed", 
        description: isClosedState 
          ? "Database connection lost. Please restart your XAMPP/MySQL and Backend." 
          : (error.message === "Failed to fetch" ? "Backend Server is offline (Port 3000)." : error.message)
      });
    } finally {
      setLoading(false); 
    }
  };

  // --- MANUAL LOGIN LOGIC ---
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          email: email.toLowerCase().trim(), 
          password 
        }),
      });

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("Invalid server response.");
      }

      const data = await response.json();

      if (response.ok) {
        localStorage.removeItem('uc_guest');
        // Add a safety check: make sure ID is present
        const userData = {
          ...data,
          id: data.id || data.userId || data.user_id,
          userId: data.userId || data.id || data.user_id
        };
        localStorage.setItem("user", JSON.stringify(userData));
        applyThemeForUser(userData);

        // Reset chatbot on new login session
        window.dispatchEvent(new Event('profile-updated'));
        window.dispatchEvent(new Event('chatbot-reset'));

        navigate(getRedirectPath(userData));
      } else {
        throw new Error(data.error || "Invalid credentials");
      }
    } catch (error: any) {
      toast({ 
        variant: "destructive", 
        title: "Login Error", 
        description: error.message === "Failed to fetch" ? "Backend server is offline." : error.message 
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGuestLogin = () => {
    localStorage.removeItem("user");
    localStorage.setItem('uc_guest', '1');
    localStorage.setItem("theme", "light");
    document.documentElement.classList.remove("dark");
    sessionStorage.removeItem('guest_chat_history'); // clear stale guest chat history before starting
    window.dispatchEvent(new Event('guest-logout'));
    window.dispatchEvent(new Event('chatbot-reset'));
    toast({ title: "Guest Mode Enabled" });
    navigate("/GuestDashboard");
  };

  const handleClose = () => {
    const isGuest = localStorage.getItem("uc_guest") === "1";
    if (isGuest) {
      navigate("/GuestDashboard");
    } else {
      navigate("/");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4">
        <div className="relative w-full max-w-md space-y-6 rounded-2xl uc-gradient p-8 shadow-xl animate-in fade-in zoom-in duration-300">
          <button 
            onClick={handleClose} 
            className="absolute right-4 top-4 text-white hover:scale-110 transition-all"
            disabled={loading}
          >
            <X className="h-6 w-6" />
          </button>
          
          <h2 className="text-center text-3xl font-bold text-white uppercase italic tracking-widest">Login</h2>

          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-1">
              <Label className="text-white text-sm ml-1">Email:</Label>
              <Input 
                type="email" 
                placeholder="Enter your email"
                value={email} 
                onChange={(e) => setEmail(e.target.value)} 
                required 
                className="bg-white/95 border-0 h-12" 
                disabled={loading}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-white text-sm ml-1">Password:</Label>
              <div className="relative">
                <Input 
                  type={showPassword ? "text" : "password"} 
                  placeholder="••••••••"
                  value={password} 
                  onChange={(e) => setPassword(e.target.value)} 
                  required 
                  className="bg-white/95 border-0 pr-10 h-12" 
                  disabled={loading}
                />
                <button 
                  type="button" 
                  onClick={() => setShowPassword(!showPassword)} 
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
              <div className="flex justify-end px-1">
                <Link 
                  to="/forgot-password" 
                  className="text-xs text-white/80 hover:text-white hover:underline transition-colors"
                >
                  Forgot Password?
                </Link>
              </div>
            </div>
            <Button 
              type="submit" 
              disabled={loading} 
              className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-6 rounded-xl transition-all active:scale-95 disabled:opacity-70"
            >
              {loading ? "PROCESSING..." : "LOGIN"}
            </Button>
          </form>

          <div className="relative flex items-center justify-center py-2 text-white/60">
            <div className="absolute w-full border-t border-white/20"></div>
            <span className="relative bg-[#2563eb] px-2 text-xs uppercase">or</span>
          </div>

          <div className="flex justify-center gap-4">
            <button 
              onClick={handleGoogleLogin} 
              disabled={loading}
              className="flex flex-col items-center gap-1 rounded-xl bg-white px-8 py-3 shadow hover:bg-gray-100 transition-all active:scale-95 disabled:opacity-50"
            >
              <svg className="h-6 w-6" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              <span className="text-[10px] font-bold text-gray-600">GOOGLE</span>
            </button>
            
            <button 
              onClick={handleGuestLogin} 
              disabled={loading}
              className="flex flex-col items-center gap-1 rounded-xl bg-white px-8 py-3 shadow hover:bg-gray-100 transition-all active:scale-95 disabled:opacity-50"
            >
              <User className="h-6 w-6 text-gray-500" />
              <span className="text-[10px] font-bold text-gray-600 uppercase">Guest</span>
            </button>
          </div>

          <p className="text-center text-sm text-white/90">
            Don't have an account?{" "}
            <Link to="/register" className="font-bold text-white hover:underline underline-offset-4">Sign Up</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;