import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
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
  const [linkedGmail, setLinkedGmail] = useState<string | null>(null);
  const [profile, setProfile] = useState<{
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
  const [selectedMethod, setSelectedMethod] = useState<"gmail" | "password">("gmail");
  const [profileLabel, setProfileLabel] = useState("");
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
      toast({ variant: "destructive", title: "Error", description: "Please enter your username or email." });
      return;
    }

    setLookupLoading(true);
    setProfileLabel(trimmedIdentifier);
    setSelectedMethod("gmail");

    try {
      console.log("🔍 Looking up account by identifier:", trimmedIdentifier);
      const response = await fetch(`${API_URL}/api/find-linked-gmail`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: trimmedIdentifier }),
      });
      const data = await response.json();
      console.log("📋 Lookup Response:", { status: response.status, data });
      setProfile(data.profile || null);
      setUserId(data.user_id || null);

      if (response.ok && data.gmail_account) {
        setLinkedGmail(data.gmail_account);
        setEmail(data.gmail_account);
        setShowManualEmail(false);
      } else if (response.ok) {
        setLinkedGmail(null);
        setEmail("");
        setShowManualEmail(true);
      } else {
        setLinkedGmail(null);
        setEmail("");
        setShowManualEmail(true);
        toast({ variant: "destructive", title: "Lookup failed", description: data.error || "Could not find a linked Gmail." });
      }
    } catch (error: unknown) {
      console.error("Lookup error", error);
      setLinkedGmail(null);
      setEmail("");
      setShowManualEmail(true);
      toast({ variant: "destructive", title: "Lookup error", description: "Unable to find the linked Gmail right now." });
    } finally {
      setLookupLoading(false);
      setStep(2);
    }
  };

  const handleConfirm = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (selectedMethod === "password") {
      navigate("/login");
      return;
    }

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      toast({ variant: "destructive", title: "Error", description: "Please enter a Gmail address." });
      return;
    }

    if (!trimmedEmail.toLowerCase().endsWith("@gmail.com")) {
      toast({ variant: "destructive", title: "Invalid Email", description: "Please use a valid Gmail address." });
      return;
    }

    console.log("🔐 Reset Password Process Started");
    console.log("📧 Email to reset:", trimmedEmail);
    console.log("👤 User ID:", userId);
    console.log("🔑 Show Manual Email:", showManualEmail);
    console.log("📍 Selected Method:", selectedMethod);

    setResetLoading(true);
    try {
      // If Gmail was manually entered, verify it belongs to this account
      if (showManualEmail && userId) {
        console.log("✓ Verifying Gmail ownership for manually entered email...");
        const verifyResponse = await fetch(`${API_URL}/api/verify-gmail-owner`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, gmail: trimmedEmail }),
        });
        const verifyData = await verifyResponse.json();
        console.log("🔍 Verification Response:", { status: verifyResponse.status, data: verifyData });
        if (!verifyResponse.ok) {
          toast({ variant: "destructive", title: "Gmail Not Linked", description: verifyData.error || "This Gmail is not linked to your account." });
          setResetLoading(false);
          return;
        }
        console.log("✅ Gmail verified successfully");
      }

      console.log("📤 Sending Supabase reset email to:", trimmedEmail);
      const resetResult = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      console.log("📨 Supabase Reset Result:", resetResult);
      toast({ title: "Check your email", description: "Password reset link sent to " + trimmedEmail });
    } catch (error: unknown) {
      console.error("❌ Reset error:", error);
      const errorMsg = error instanceof Error ? error.message : String(error);
      toast({ variant: "destructive", title: "Reset failed", description: errorMsg || "Unable to send reset link right now." });
    } finally {
      setResetLoading(false);
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
                <Label className="text-primary-foreground">Username or Email</Label>
                <Input
                  type="text"
                  placeholder="Enter your username or email"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  required
                  className="bg-card/90 border-0"
                />
                <p className="text-sm text-primary-foreground/80">
                  Enter your username again to fetch your linked Gmail account.
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
                    <p className="text-sm text-primary-foreground/80">{profile?.email || profileLabel}</p>
                  </div>
                </div>
                {linkedGmail && !showManualEmail ? (
                  <p className="text-sm text-primary-foreground/80">Linked Gmail: {maskEmail(linkedGmail)}</p>
                ) : (
                  <p className="text-sm text-primary-foreground/80">
                    No linked Gmail was found. Enter the Gmail address below to receive a reset link.
                  </p>
                )}
              </div>

              <div className="space-y-4">
                <Label className="text-primary-foreground">Choose recovery method</Label>
                <RadioGroup value={selectedMethod} onValueChange={(value) => setSelectedMethod(value as "gmail" | "password")} className="space-y-3">
                  <label className="flex items-start gap-3 rounded-xl border border-border bg-background p-4">
                    <RadioGroupItem value="gmail" />
                    <div>
                      <p className="font-medium text-foreground">Reset via linked Gmail</p>
                      <p className="text-sm text-muted-foreground">Send a reset link to your linked Gmail address.</p>
                    </div>
                  </label>
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
                {!linkedGmail && showManualEmail && selectedMethod === "gmail" && (
                  <div className="space-y-2">
                    <Label className="text-primary-foreground">Gmail Address</Label>
                    <Input
                      type="email"
                      placeholder="your.email@gmail.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="bg-card/90 border-0"
                    />
                  </div>
                )}
                <Button
                  type="submit"
                  disabled={selectedMethod === "gmail" ? resetLoading : false}
                  className="w-full uc-gradient-btn text-primary-foreground font-semibold"
                >
                  {selectedMethod === "gmail"
                    ? resetLoading
                      ? "Sending..."
                      : "Send Reset Link"
                    : "Continue to Login"}
                </Button>
              </form>

              <div className="grid gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep(1)}
                  className="w-full text-primary-foreground hover:bg-white/10"
                >
                  Back
                </Button>
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
