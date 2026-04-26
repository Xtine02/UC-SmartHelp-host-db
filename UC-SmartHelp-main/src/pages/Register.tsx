import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, X, Check } from "lucide-react";
import Navbar from "@/components/Navbar";

const Register = () => {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  // API URL from environment
  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

  // Password Validation Logic
  const validatePassword = (pass: string) => {
    const hasMinLength = pass.length >= 8;
    const hasCapitalLetter = /[A-Z]/.test(pass);
    const hasNumber = /[0-9]/.test(pass);
    return { hasMinLength, hasCapitalLetter, hasNumber };
  };

  const passwordCriteria = validatePassword(password);
  const isPasswordValid = passwordCriteria.hasMinLength && passwordCriteria.hasCapitalLetter && passwordCriteria.hasNumber;

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate password before submission
    if (!isPasswordValid) {
      toast({ 
        variant: "destructive", 
        title: "Invalid Password", 
        description: "Password must meet all requirements." 
      });
      return;
    }

    // Validate email
    if (!email.trim() || !email.includes('@')) {
      toast({ 
        variant: "destructive", 
        title: "Invalid Email", 
        description: "Please enter a valid email address." 
      });
      return;
    }

    setLoading(true);

    const userData = {
      firstName,
      lastName,
      username: username.toLowerCase().trim(),
      password,
      gmailAccount: email.toLowerCase().trim(),
    };

    try {
      const response = await fetch(`${API_URL}/api/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(userData),
      });

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("Invalid server response (Check Backend)");
      }

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Registration failed");

      toast({ 
        title: "Success!", 
        description: "Account created successfully. Please login to continue." 
      });
      navigate("/login");
    } catch (error: any) {
      toast({ 
        variant: "destructive", 
        title: "Registration Error", 
        description: error.message === "Failed to fetch" ? "Backend server is offline (Port 3000)." : error.message 
      });
    } finally {
      setLoading(false);
    }
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
        <div className="relative w-full max-w-md space-y-5 rounded-2xl uc-gradient p-8 shadow-xl animate-in fade-in zoom-in duration-300">
          <button 
            onClick={handleClose} 
            className="absolute right-4 top-4 text-white hover:scale-110 transition-transform"
          >
            <X className="h-6 w-6" />
          </button>

          <h2 className="text-center text-3xl font-bold text-white tracking-wide uppercase">Register</h2>

          <form onSubmit={handleRegister} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-white text-sm ml-1">First Name:</Label>
                <Input placeholder="Juan" value={firstName} onChange={(e) => setFirstName(e.target.value)} required className="bg-white/95 border-0 h-11" />
              </div>
              <div className="space-y-1">
                <Label className="text-white text-sm ml-1">Last Name:</Label>
                <Input placeholder="Dela Cruz" value={lastName} onChange={(e) => setLastName(e.target.value)} required className="bg-white/95 border-0 h-11" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-white text-sm ml-1">Username:</Label>
              <Input type="text" placeholder="example@username.com" value={username} onChange={(e) => setUsername(e.target.value)} required className="bg-white/95 border-0 h-11" />
            </div>
            <div className="space-y-2">
              <Label className="text-white text-sm ml-1">Password:</Label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="bg-white/95 border-0 pr-10 h-11"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              
              {/* Password Requirements Tip - Always Visible */}
              <div className="bg-blue-600/30 border border-blue-400/50 rounded-lg p-3 space-y-2">
                <p className="text-white text-xs font-bold uppercase tracking-wide">Requirements:</p>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    {passwordCriteria.hasMinLength ? (
                      <Check className="h-4 w-4 text-green-400 flex-shrink-0" />
                    ) : (
                      <div className="h-4 w-4 rounded-full border border-gray-400 flex-shrink-0" />
                    )}
                    <span className={`text-xs ${passwordCriteria.hasMinLength ? "text-green-300 font-semibold" : "text-gray-300"}`}>
                      At least 8 characters
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {passwordCriteria.hasCapitalLetter ? (
                      <Check className="h-4 w-4 text-green-400 flex-shrink-0" />
                    ) : (
                      <div className="h-4 w-4 rounded-full border border-gray-400 flex-shrink-0" />
                    )}
                    <span className={`text-xs ${passwordCriteria.hasCapitalLetter ? "text-green-300 font-semibold" : "text-gray-300"}`}>
                      At least 1 Capital Letter
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {passwordCriteria.hasNumber ? (
                      <Check className="h-4 w-4 text-green-400 flex-shrink-0" />
                    ) : (
                      <div className="h-4 w-4 rounded-full border border-gray-400 flex-shrink-0" />
                    )}
                    <span className={`text-xs ${passwordCriteria.hasNumber ? "text-green-300 font-semibold" : "text-gray-300"}`}>
                      At least 1 Number
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-white text-sm ml-1">Email:</Label>
              <Input 
                type="email" 
                placeholder="your.email@example.com" 
                value={email} 
                onChange={(e) => setEmail(e.target.value)} 
                required
                className="bg-white/95 border-0 h-11" 
              />
            </div>

            <Button type="submit" disabled={loading || !isPasswordValid || !firstName || !lastName || !username || !email} className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xl py-7 mt-2 rounded-xl shadow-lg transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? "SYNCING..." : "SIGN UP"}
            </Button>
          </form>

          <p className="text-center text-sm text-white/90">
            Already have an account?{" "}
            <Link to="/login" className="font-bold text-white hover:underline underline-offset-4">Login</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Register;