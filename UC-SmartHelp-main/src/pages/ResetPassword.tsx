import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import Navbar from "@/components/Navbar";

const ResetPassword = () => {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
  const token = useMemo(() => new URLSearchParams(window.location.search).get("token"), []);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate token exists
    if (!token) {
      toast({ title: "Error", description: "Invalid or expired reset token", variant: "destructive" });
      return;
    }

    // Validate password is not empty
    if (!password || password.length < 6) {
      toast({ title: "Error", description: "Password must be at least 6 characters long", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await response.json();
      if (!response.ok) {
        // Check for specific token error from backend
        if (response.status === 400 || response.status === 401) {
          throw new Error("Invalid or expired reset token");
        }
        throw new Error(data.error || "Failed to update password");
      }
      toast({ title: "Success!", description: "Your password has been updated successfully." });
      navigate("/login");
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : "Failed to update password";
      toast({ title: "Error", description: errorMsg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4">
        <div className="w-full max-w-md space-y-6 rounded-2xl uc-gradient p-8 shadow-xl">
          <h2 className="text-center text-2xl font-bold text-primary-foreground">Set New Password</h2>
          <form onSubmit={handleUpdate} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-primary-foreground">New Password:</Label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter new password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="bg-card/90 border-0 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>
            <Button type="submit" disabled={loading} className="w-full uc-gradient-btn text-primary-foreground font-semibold">
              {loading ? "Updating..." : "Update Password"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
