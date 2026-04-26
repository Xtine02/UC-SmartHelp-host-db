import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import Navbar from "@/components/Navbar";

const ForgotPassword = () => {
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [userId, setUserId] = useState<string | number | null>(null);
  const [email, setEmail] = useState("");
  const [confirmGmail, setConfirmGmail] = useState("");
  const [linkedGmail, setLinkedGmail] = useState<string | null>(null);
  const [profile, setProfile] = useState<{
    username?: string | null;
    email?: string | null;
    image?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    full_name?: string | null;
  } | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [showManualEmail, setShowManualEmail] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedMethod, setSelectedMethod] = useState<"gmail" | "manual" | "password">("gmail");
  const [profileLabel, setProfileLabel] = useState("");
  const [manualEmail, setManualEmail] = useState("");
  const { toast } = useToast();

  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

  const maskEmail = (value: string) => {
    const [name, domain] = value.split("@");
    if (!domain) return value;
    if (name.length <= 2) return `${name}***@${domain}`;
    return `${name.substring(0, 2)}${"*".repeat(name.length - 2)}@${domain}`;
  };

  const handleLookupGmail = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmedIdentifier = identifier.trim();

    if (!trimmedIdentifier) {
      toast({ variant: "destructive", title: "Error", description: "Please enter your username." });
      return;
    }
    if (trimmedIdentifier.length < 3) {
      toast({ variant: "destructive", title: "Invalid Username", description: "Username must be at least 3 characters long." });
      return;
    }

    setLookupLoading(true);
    setProfileLabel(trimmedIdentifier);
    setSelectedMethod("gmail");

    let hasMatchedAccounts = false;
    try {
      const response = await fetch(`${API_URL}/api/find-linked-gmail`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: trimmedIdentifier }),
      });
      const data = await response.json();
      const matchedAccounts = Array.isArray(data.accounts)
        ? data.accounts
        : (data?.user_id
            ? [{
                user_id: data.user_id,
                email: data.profile?.email || data.email || trimmedIdentifier,
                gmail_account: data.gmail_account || null,
                profile: data.profile || null,
              }]
            : []);

      if (!response.ok || matchedAccounts.length === 0) {
        setLinkedGmail(null);
        setEmail(trimmedIdentifier);
        setConfirmGmail("");
        setProfile(null);
        setUserId(null);
        setShowManualEmail(true);
        toast({ variant: "destructive", title: "Account not found", description: "Username does not exists" });
      } else {
        hasMatchedAccounts = true;
        const first = matchedAccounts[0];
        setUserId(first.user_id);
        setProfile(first.profile || null);
        setLinkedGmail(first.gmail_account || null);
        setEmail(trimmedIdentifier);
        setConfirmGmail("");
        setShowManualEmail(!(first.gmail_account || "").trim());
      }
    } catch (error: unknown) {
      console.error("Lookup error", error);
      setLinkedGmail(null);
      setEmail("");
      setConfirmGmail("");
      setShowManualEmail(true);
      toast({ variant: "destructive", title: "Lookup error", description: "Unable to find the linked Gmail right now." });
    } finally {
      setLookupLoading(false);
      setStep(hasMatchedAccounts ? 2 : 1);
    }
  };

  const handleConfirm = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (selectedMethod === "password") {
      navigate("/login");
      return;
    }

    // Handle Gmail Recovery
    if (selectedMethod === "gmail") {
      const trimmedEmail = confirmGmail.trim();
      if (!trimmedEmail) {
        toast({ variant: "destructive", title: "Error", description: "Please retype your Gmail address." });
        return;
      }

      if (!trimmedEmail.toLowerCase().endsWith("@gmail.com")) {
        toast({ variant: "destructive", title: "Invalid Email", description: "Please use a valid Gmail address." });
        return;
      }

      if (linkedGmail && trimmedEmail.toLowerCase() !== linkedGmail.toLowerCase()) {
        toast({
          variant: "destructive",
          title: "Invalid Gmail",
          description: "This Gmail is not linked to your account",
        });
        return;
      }

      console.log("🔐 Reset Password Process Started - Gmail Method");
      console.log("📧 Email to reset:", trimmedEmail);
      console.log("👤 User ID:", userId);

      setResetLoading(true);
      try {
        console.log("📤 Sending reset email via backend to:", trimmedEmail);
        const payload: { username: string; user_id?: string | number | null } = { username: trimmedEmail };
        if (userId != null) {
          payload.user_id = userId;
        }
        const response = await fetch(`${API_URL}/api/request-password-reset`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Unable to send reset link right now.");
        }
        toast({ title: "Check your email", description: "We have sent a password reset link to your Gmail account." });
      } catch (error: unknown) {
        console.error("❌ Reset error:", error);
        const errorMsg = error instanceof Error ? error.message : String(error);
        toast({ variant: "destructive", title: "Reset failed", description: errorMsg || "Unable to send reset link right now." });
      } finally {
        setResetLoading(false);
      }
      return;
    }

    // Handle Manual Email Recovery
    if (selectedMethod === "manual") {
      const trimmedManualEmail = manualEmail.trim();
      if (!trimmedManualEmail) {
        toast({ variant: "destructive", title: "Error", description: "Please enter an email address." });
        return;
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(trimmedManualEmail)) {
        toast({ variant: "destructive", title: "Invalid Email", description: "Please enter a valid email address." });
        return;
      }

      console.log("🔐 Reset Password Process Started - Manual Email Method");
      console.log("📧 Email to reset:", trimmedManualEmail);
      console.log("👤 User ID:", userId);

      setResetLoading(true);
      try {
        console.log("📤 Sending reset email via backend to:", trimmedManualEmail);
        const payload: { username: string; user_id?: string | number | null } = { username: trimmedManualEmail };
        if (userId != null) {
          payload.user_id = userId;
        }
        const response = await fetch(`${API_URL}/api/request-password-reset`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Unable to send reset link right now.");
        }
        toast({ title: "Check your email", description: "We have sent a password reset link to your email address." });
      } catch (error: unknown) {
        console.error("❌ Reset error:", error);
        const errorMsg = error instanceof Error ? error.message : String(error);
        toast({ variant: "destructive", title: "Reset failed", description: errorMsg || "Unable to send reset link right now." });
      } finally {
        setResetLoading(false);
      }
    }
  };

  const getProfileInitials = () => {
    const name = profile?.full_name || profile?.email || profileLabel;
    if (!name) return "U";
    return name
      .split(/\s+/)
      .map((part) => part[0]?.toUpperCase())
      .slice(0, 2)
      .join("");
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4">
        <div className="w-full max-w-md space-y-6 rounded-2xl uc-gradient p-8 shadow-xl">
          <h2 className="text-center text-2xl font-bold text-primary-foreground">Reset Password</h2>

          {step === 1 ? (
            <form onSubmit={handleLookupGmail} className="space-y-4">
              <div className="space-y-2">
                <Label className="text-primary-foreground">Username</Label>
                <Input
                  type="text"
                  placeholder="Enter your username"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  required
                  className="bg-card/90 border-0"
                />
                <p className="text-sm text-primary-foreground/80">
                  Check if account exists
                </p>
              </div>
              <Button type="submit" disabled={lookupLoading} className="w-full uc-gradient-btn text-primary-foreground font-semibold">
                {lookupLoading ? "Looking up..." : "Next"}
              </Button>
            </form>
          ) : (
            <div className="space-y-6">
              <div className="bg-white/10 rounded-lg p-4 space-y-4">
                <p className="text-sm text-primary-foreground/80">Confirm account</p>
                <div className="flex items-center gap-4 rounded-2xl border border-white/15 bg-white/10 p-4">
                  <Avatar className="h-14 w-14 border border-white/20 bg-white/10">
                    {profile?.image ? (
                      <AvatarImage src={profile.image} alt="Profile picture" />
                    ) : (
                      <AvatarFallback>{getProfileInitials()}</AvatarFallback>
                    )}
                  </Avatar>
                  <div>
                    <p className="text-lg font-bold text-primary-foreground">{profile?.full_name || profile?.email || profileLabel || "Your account"}</p>
                    {profile?.username ? (
                      <p className="text-sm text-primary-foreground/80">Username: {profile.username}</p>
                    ) : null}
                    <p className="text-sm text-primary-foreground/80">{profile?.email || profileLabel}</p>
                  </div>
                </div>
                <p className="text-sm text-primary-foreground/80">
                  {linkedGmail
                    ? `Linked Gmail: ${maskEmail(linkedGmail)}`
                    : "No linked Gmail was found on this account yet."}
                </p>
              </div>

              <div className="space-y-4">
                <Label className="text-primary-foreground">Choose recovery method</Label>
                <RadioGroup value={selectedMethod} onValueChange={(value) => setSelectedMethod(value as "gmail" | "manual" | "password")} className="space-y-3">
                  {linkedGmail && (
                    <label className="flex items-start gap-3 rounded-xl border border-border bg-background p-4">
                      <RadioGroupItem value="gmail" />
                      <div>
                        <p className="font-medium text-foreground">Reset via linked Gmail</p>
                        <p className="text-sm text-muted-foreground">Send a reset link to {maskEmail(linkedGmail)}</p>
                      </div>
                    </label>
                  )}
                  {showManualEmail && (
                    <label className="flex items-start gap-3 rounded-xl border border-border bg-background p-4">
                      <RadioGroupItem value="manual" />
                      <div>
                        <p className="font-medium text-foreground">Reset via manual email entry</p>
                        <p className="text-sm text-muted-foreground">Enter your email address to receive a reset link.</p>
                      </div>
                    </label>
                  )}
                  <label className="flex items-start gap-3 rounded-xl border border-border bg-background p-4">
                    <RadioGroupItem value="password" />
                    <div>
                      <p className="font-medium text-foreground">Use password</p>
                      <p className="text-sm text-muted-foreground">Return to login and sign in with your existing password.</p>
                    </div>
                  </label>
                </RadioGroup>
              </div>

              <form onSubmit={handleConfirm} className="space-y-4">
                {selectedMethod === "gmail" && linkedGmail && (
                  <div className="space-y-2">
                    <Label className="text-primary-foreground">Confirm Linked Gmail</Label>
                    <p className="text-sm text-primary-foreground/80 mb-2">Retype your Gmail to confirm:</p>
                    <Input
                      type="email"
                      placeholder="your.email@gmail.com"
                      value={confirmGmail}
                      onChange={(e) => setConfirmGmail(e.target.value)}
                      required
                      className="bg-card/90 border-0"
                    />
                  </div>
                )}
                {selectedMethod === "manual" && (
                  <div className="space-y-2">
                    <Label className="text-primary-foreground">Enter Your Email Address</Label>
                    <Input
                      type="email"
                      placeholder="your.email@example.com"
                      value={manualEmail}
                      onChange={(e) => setManualEmail(e.target.value)}
                      required
                      className="bg-card/90 border-0"
                    />
                  </div>
                )}
                {(selectedMethod === "gmail" || selectedMethod === "manual") && (
                  <Button
                    type="submit"
                    disabled={resetLoading}
                    className="w-full uc-gradient-btn text-primary-foreground font-semibold"
                  >
                    {resetLoading ? "Sending..." : "Send Reset Link"}
                  </Button>
                )}
                {selectedMethod === "password" && (
                  <Button
                    type="submit"
                    className="w-full uc-gradient-btn text-primary-foreground font-semibold"
                  >
                    Continue to Login
                  </Button>
                )}
              </form>

              <div className="grid gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => navigate("/login")}
                  className="w-full text-primary-foreground hover:bg-white/10"
                >
                  Back to Login
                </Button>
              </div>
            </div>
          )}

          {step === 1 && (
            <p className="text-center text-sm text-primary-foreground/80">
              <Link to="/login" className="hover:underline">Back to Login</Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
