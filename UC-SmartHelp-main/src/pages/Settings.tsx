import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Navigate, useLocation } from "react-router-dom";
import { Camera, Lock, Eye, EyeOff, ShieldCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import AuditTrail from "@/components/admin/AuditTrail";
const Settings = () => {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  
  // Profile States
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [saving, setSaving] = useState(false);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Password Modal States
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showOldPass, setShowOldPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [passLoading, setPassLoading] = useState(false);

  const location = useLocation();

  useEffect(() => {
    const savedUser = localStorage.getItem("user");
    if (savedUser) {
      try {
        const parsedUser = JSON.parse(savedUser);
        setUser(parsedUser);
        setFirstName(parsedUser.firstName || "");
        setLastName(parsedUser.lastName || "");
        setProfileImage(parsedUser.profileImage || null);
      } catch (e) {
        console.error("Settings: Failed to parse user", e);
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (location.hash === "#audit-trail") {
      const el = document.getElementById("audit-trail");
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  }, [location.hash]);

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;

  // Password Validation Logic
  const validatePassword = (pass: string) => {
    const hasCapital = /[A-Z]/.test(pass);
    const hasNumber = /[0-9]/.test(pass);
    const isLongEnough = pass.length >= 8;
    return { hasCapital, hasNumber, isLongEnough };
  };

  const passCriteria = validatePassword(newPassword);
  const isPassValid = passCriteria.hasCapital && passCriteria.hasNumber && passCriteria.isLongEnough;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setProfileImage(reader.result as string);
        toast({ title: "Photo updated locally!" });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveProfile = async () => {
    if (!firstName || !lastName) {
      toast({ title: "Validation Error", description: "First and last names are required.", variant: "destructive" });
      return;
    }

    setSaving(true);
    const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

    try {
      const response = await fetch(`${API_URL}/api/update-profile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.userId || user.id,
          firstName,
          lastName
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to update profile");

      // Update local storage with the new data from server
      const updatedUser = { 
        ...user, 
        ...data,
        profileImage // Keep the local profile image for now as it's not in DB
      };
      localStorage.setItem("user", JSON.stringify(updatedUser));
      setUser(updatedUser);
      
      toast({ title: "Profile saved successfully!", description: "Your changes have been updated in our database." });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Update Failed", description: error.message });
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!isPassValid) return;
    setPassLoading(true);
    
    const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
    
    try {
      const response = await fetch(`${API_URL}/api/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.userId || user.id,
          oldPassword,
          newPassword
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to update password");

      toast({ title: "Password Changed!", description: "Your security settings have been updated." });
      setShowPasswordModal(false);
      setOldPassword("");
      setNewPassword("");
    } catch (error: any) {
      toast({ variant: "destructive", title: "Update Failed", description: error.message });
    } finally {
      setPassLoading(false);
    }
  };

  const initial = (firstName?.[0] || user.fullName?.[0] || "U").toUpperCase();

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <div className="container max-w-2xl py-12 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="space-y-2 text-center sm:text-left">
          <h1 className="text-3xl font-black text-foreground uppercase italic tracking-tight">Account Settings</h1>
          <p className="text-muted-foreground font-medium">Manage your personal information and security.</p>
        </div>

        <div className="rounded-3xl border bg-card p-8 shadow-xl space-y-8">
          {/* Profile Photo */}
          <div className="flex flex-col items-center gap-4 py-4 border-b">
            <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
              <div className="h-32 w-32 rounded-full border-4 border-primary/20 bg-secondary flex items-center justify-center overflow-hidden transition-all group-hover:border-primary">
                {profileImage ? (
                  <img src={profileImage} alt="Profile" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-4xl font-black text-primary">{initial}</span>
                )}
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <Camera className="text-white h-8 w-8" />
                </div>
              </div>
              <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />
            </div>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Change Photo</p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-xs font-black uppercase tracking-widest ml-1">First Name</Label>
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} className="h-12 rounded-xl border-2" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-black uppercase tracking-widest ml-1">Last Name</Label>
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} className="h-12 rounded-xl border-2" />
            </div>
          </div>

          <div className="space-y-6">
            <div className="space-y-2">
              <Label className="text-xs font-black uppercase tracking-widest ml-1">Email</Label>
              <Input value={user.email || "N/A"} disabled className="h-12 rounded-xl bg-muted/50 border-2" />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-black uppercase tracking-widest ml-1">Password</Label>
              <div className="flex gap-2">
                <Input value="••••••••••••" disabled className="h-12 rounded-xl bg-muted/50 border-2 flex-1 tracking-widest" />
                <Button variant="outline" onClick={() => setShowPasswordModal(true)} className="h-12 px-6 rounded-xl border-2 font-bold hover:bg-primary hover:text-white transition-all">
                  CHANGE
                </Button>
              </div>
            </div>
          </div>

          <div className="pt-4">
            <Button onClick={handleSaveProfile} disabled={saving} className="w-full py-8 text-xl font-black rounded-2xl shadow-xl uc-gradient-btn active:scale-95 transition-all">
              {saving ? "SAVING..." : "SAVE PROFILE"}
            </Button>
          </div>
        </div>

        {/* Audit Trail - Only for admin and staff */}
        {(user?.role?.toLowerCase() === "admin" || user?.role?.toLowerCase() === "staff") && (
          <div id="audit-trail" className="rounded-3xl border bg-card p-8 shadow-xl">
            <AuditTrail userId={user.userId || user.id} />
          </div>
        )}
      </div>

      {/* CHANGE PASSWORD MODAL */}
      <Dialog open={showPasswordModal} onOpenChange={setShowPasswordModal}>
        <DialogContent className="sm:max-w-md rounded-3xl p-0 overflow-hidden border-none shadow-2xl">
          <div className="bg-primary p-8 text-white">
            <DialogHeader>
              <DialogTitle className="text-2xl font-black uppercase italic tracking-tighter">Change Password</DialogTitle>
              <p className="text-primary-foreground/80 text-sm">Update your security credentials.</p>
            </DialogHeader>
          </div>

          <div className="p-8 space-y-6 bg-background">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs font-black uppercase text-muted-foreground ml-1">Current Password</Label>
                <div className="relative">
                  <Input 
                    type={showOldPass ? "text" : "password"} 
                    value={oldPassword} 
                    onChange={(e) => setOldPassword(e.target.value)}
                    className="h-12 rounded-xl border-2 pr-10"
                  />
                  <button onClick={() => setShowOldPass(!showOldPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {showOldPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-black uppercase text-muted-foreground ml-1">New Password</Label>
                <div className="relative">
                  <Input 
                    type={showNewPass ? "text" : "password"} 
                    value={newPassword} 
                    onChange={(e) => setNewPassword(e.target.value)}
                    className={`h-12 rounded-xl border-2 pr-10 ${newPassword && !isPassValid ? 'border-amber-400' : ''}`}
                  />
                  <button onClick={() => setShowNewPass(!showNewPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {showNewPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                
                {/* Requirements Checklist */}
                <div className="p-4 bg-secondary/30 rounded-2xl space-y-2 mt-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Requirements:</p>
                  <div className="grid grid-cols-1 gap-2">
                    <div className={`flex items-center gap-2 text-xs font-bold ${passCriteria.isLongEnough ? 'text-green-600' : 'text-muted-foreground'}`}>
                      <ShieldCheck className={`h-3 w-3 ${passCriteria.isLongEnough ? 'opacity-100' : 'opacity-30'}`} />
                      At least 8 characters
                    </div>
                    <div className={`flex items-center gap-2 text-xs font-bold ${passCriteria.hasCapital ? 'text-green-600' : 'text-muted-foreground'}`}>
                      <ShieldCheck className={`h-3 w-3 ${passCriteria.hasCapital ? 'opacity-100' : 'opacity-30'}`} />
                      At least 1 Capital Letter
                    </div>
                    <div className={`flex items-center gap-2 text-xs font-bold ${passCriteria.hasNumber ? 'text-green-600' : 'text-muted-foreground'}`}>
                      <ShieldCheck className={`h-3 w-3 ${passCriteria.hasNumber ? 'opacity-100' : 'opacity-30'}`} />
                      At least 1 Number
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <Button 
              onClick={handleChangePassword}
              disabled={passLoading || !isPassValid || !oldPassword}
              className="w-full py-8 text-xl font-black rounded-2xl shadow-xl uc-gradient-btn active:scale-95 transition-all"
            >
              {passLoading ? "UPDATING..." : "UPDATE PASSWORD"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Settings;
