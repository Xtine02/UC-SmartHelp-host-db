import { useState, useEffect, useRef, type ChangeEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useLocation, useNavigate } from "react-router-dom";
import { Camera, Eye, EyeOff, ShieldCheck, Mail, Unlink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTheme } from "next-themes";
const Settings = () => {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  
  // Profile States
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [saving, setSaving] = useState(false);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [imageChanged, setImageChanged] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false);

  // Password Modal States
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showOldPass, setShowOldPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [passLoading, setPassLoading] = useState(false);

  // Gmail Linking States
  const [linkedGmail, setLinkedGmail] = useState<string | null>(null);
  const [gmailLinking, setGmailLinking] = useState(false);
  const [gmailModalOpen, setGmailModalOpen] = useState(false);
  const [gmailInput, setGmailInput] = useState("");
  const [isDeactivated, setIsDeactivated] = useState(false);
  const [deactivateLoading, setDeactivateLoading] = useState(false);

  const location = useLocation();

  const getUserThemeKey = (userObj: any) => {
    const uid = userObj?.userId || userObj?.id || userObj?.user_id;
    return uid ? `theme_user_${uid}` : null;
  };

  useEffect(() => {
    let mounted = true;
    try {
      const savedUser = localStorage.getItem("user");
      if (savedUser) {
        const parsedUser = JSON.parse(savedUser);
        if (!mounted) return;
        setUser(parsedUser);
        setFirstName(parsedUser.firstName || parsedUser.first_name || "");
        setLastName(parsedUser.lastName || parsedUser.last_name || "");
        setProfileImage(parsedUser.profileImage || parsedUser.profile_image || parsedUser.image || null);
        setLinkedGmail(parsedUser.gmail_account || null);
        setIsDeactivated(Number(parsedUser.is_disabled || 0) === 1);
      }
    } catch (e) {
      console.error("Settings: Failed to parse user", e);
      if (mounted) setUser(null);
    } finally {
      if (mounted) setLoading(false);
    }

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    const key = getUserThemeKey(user);
    if (!key) return;
    const savedTheme = localStorage.getItem(key);
    if (savedTheme === "dark" || savedTheme === "light") {
      setTheme(savedTheme);
    }
  }, [user, setTheme]);

  useEffect(() => {
    if (location.hash === "#audit-trail") {
      const el = document.getElementById("audit-trail");
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  }, [location.hash]);

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }

  useEffect(() => {
    return () => stopCamera();
  }, []);

  if (loading) return null;
  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container max-w-xl py-16">
          <div className="rounded-2xl border bg-card p-8 text-center space-y-4">
            <h2 className="text-2xl font-bold">Account Settings</h2>
            <p className="text-muted-foreground">Session not found. Please log in again to open settings.</p>
            <Button onClick={() => navigate("/login")} className="uc-gradient-btn text-primary-foreground">
              Go to Login
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Password Validation Logic
  const validatePassword = (pass: string) => {
    const hasCapital = /[A-Z]/.test(pass);
    const hasNumber = /[0-9]/.test(pass);
    const isLongEnough = pass.length >= 8;
    return { hasCapital, hasNumber, isLongEnough };
  };

  const passCriteria = validatePassword(newPassword);
  const isPassValid = passCriteria.hasCapital && passCriteria.hasNumber && passCriteria.isLongEnough;

  const compressImage = (base64String: string, callback: (compressed: string) => void) => {
    const img = new Image();
    img.src = base64String;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      const maxSize = 420;
      if (width > height) {
        if (width > maxSize) {
          height = (height * maxSize) / width;
          width = maxSize;
        }
      } else {
        if (height > maxSize) {
          width = (width * maxSize) / height;
          height = maxSize;
        }
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        const compressed = canvas.toDataURL('image/jpeg', 0.55);
        callback(compressed);
      }
    };
  };

  const persistProfileImage = async (imageToSave: string) => {
    if (!user) return;
    const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
    try {
      setSaving(true);
      const response = await fetch(`${API_URL}/api/update-profile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.userId || user.id || user.user_id,
          firstName,
          lastName,
          profileImage: imageToSave
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.details || data.error || "Failed to save profile picture");

      const updatedUser = {
        ...user,
        ...data,
        profileImage: data.profileImage || data.profile_image || data.image || imageToSave
      };
      localStorage.setItem("user", JSON.stringify(updatedUser));
      setUser(updatedUser);
      setProfileImage(updatedUser.profileImage || imageToSave);
      setImageChanged(false);
      window.dispatchEvent(new CustomEvent('profile-updated', { detail: updatedUser }));
      toast({ title: "Profile photo saved!" });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Photo Save Failed", description: error.message || "Failed to save profile photo." });
    } finally {
      setSaving(false);
    }
  };

  const applySelectedImage = (imageData: string, onReady?: (finalImage: string) => void) => {
    // Compress image if it's too large
    if (imageData.length > 250000) {
      compressImage(imageData, (compressed) => {
        setProfileImage(compressed);
        setImageChanged(true);
        toast({ title: "Profile photo changed!" });
        onReady?.(compressed);
      });
    } else {
      setProfileImage(imageData);
      setImageChanged(true);
      toast({ title: "Profile photo changed!" });
      onReady?.(imageData);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const imageData = reader.result as string;
        applySelectedImage(imageData);
      };
      reader.readAsDataURL(file);
    }
    e.target.value = "";
  };

  const openCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast({ title: "Camera not supported", description: "This device/browser does not support camera access.", variant: "destructive" });
      return;
    }
    setCameraLoading(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOpen(true);
      // Let dialog mount first
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      }, 50);
    } catch (error) {
      toast({ title: "Cannot open camera", description: "Please allow camera permission and try again.", variant: "destructive" });
    } finally {
      setCameraLoading(false);
    }
  };

  const takePhotoFromCamera = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const snapshot = canvas.toDataURL("image/jpeg", 0.75);
    applySelectedImage(snapshot, (finalImage) => {
      void persistProfileImage(finalImage);
    });
    stopCamera();
    setCameraOpen(false);
  };

  const handleSaveProfile = async () => {
    if (!firstName || !lastName) {
      toast({ title: "Validation Error", description: "First and last names are required.", variant: "destructive" });
      return;
    }

    setSaving(true);
    const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

    try {
      if (imageChanged && profileImage && profileImage.length > 2_000_000) {
        throw new Error("Profile picture is too large. Please choose a smaller image.");
      }

      const response = await fetch(`${API_URL}/api/update-profile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.userId || user.id || user.user_id,
          firstName,
          lastName,
          profileImage: imageChanged ? (profileImage || null) : undefined
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.details || data.error || "Failed to update profile");

      // Update local storage with the new data from server
      const updatedUser = {
        ...user,
        ...data,
        // Keep auth identity/role stable for this session.
        id: user.id || user.userId || user.user_id,
        userId: user.userId || user.id || user.user_id,
        user_id: user.user_id || user.userId || user.id,
        role: user.role || "student",
        profileImage: data.profileImage || data.profile_image || data.image || profileImage
      };
      localStorage.setItem("user", JSON.stringify(updatedUser));
      setUser(updatedUser);
      setImageChanged(false);
      window.dispatchEvent(new CustomEvent('profile-updated', { detail: updatedUser }));
      
      toast({ title: "Profile saved successfully!", description: "Your changes have been updated." });
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

  const maskEmail = (email: string) => {
    const [name, domain] = email.split('@');
    if (name.length <= 2) return `${name}***@${domain}`;
    return `${name.substring(0, 2)}${'*'.repeat(name.length - 2)}@${domain}`;
  };

  const handleLinkGmail = async () => {
    if (!gmailInput.trim()) {
      toast({ variant: "destructive", title: "Error", description: "Please enter a Gmail address" });
      return;
    }
    
    if (!gmailInput.includes('@gmail.com')) {
      toast({ variant: "destructive", title: "Error", description: "Please enter a valid Gmail address" });
      return;
    }

    setGmailLinking(true);
    const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
    const userIdToSend = user.userId || user.id || user.user_id;
    console.log("📝 Linking Gmail - userId:", userIdToSend, "gmail:", gmailInput.trim());

    try {
      const response = await fetch(`${API_URL}/api/link-gmail`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: userIdToSend,
          gmail: gmailInput.trim()
        }),
      });

      const data = await response.json();
      console.log("✅ Link Gmail Response:", { status: response.status, data });

      setLinkedGmail(gmailInput.trim());
      const updatedUser = { ...user, gmail_account: gmailInput.trim() };
      localStorage.setItem("user", JSON.stringify(updatedUser));
      setUser(updatedUser);
      setGmailInput("");
      setGmailModalOpen(false);
      toast({ title: "Success", description: "Gmail account linked successfully!", variant: "default" });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setGmailLinking(false);
    }
  };

  const handleUnlinkGmail = async () => {
    setGmailLinking(true);
    const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

    try {
      const response = await fetch(`${API_URL}/api/link-gmail`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.userId || user.id || user.user_id,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to unlink Gmail");
      }

      setLinkedGmail(null);
      const updatedUser = { ...user, gmail_account: null };
      localStorage.setItem("user", JSON.stringify(updatedUser));
      setUser(updatedUser);
      toast({ title: "Success", description: "Gmail account unlinked", variant: "default" });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setGmailLinking(false);
    }
  };

  const initial = ((firstName?.[0] || "") + (lastName?.[0] || "") || "U").toUpperCase();

  const handleThemeToggle = (checked: boolean) => {
    const nextTheme = checked ? "dark" : "light";
    setTheme(nextTheme);
    const key = getUserThemeKey(user);
    if (key) {
      localStorage.setItem(key, nextTheme);
    }
  };

  const handleToggleDeactivate = async () => {
    if (!user) return;
    const proceed = isDeactivated
      ? window.confirm("Do you want your account to be activated again?")
      : window.confirm("The account will be deactivated after 30 days, do you want to proceed?");
    if (!proceed) return;

    setDeactivateLoading(true);
    const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
    const nextDeactivated = !isDeactivated;
    try {
      const response = await fetch(`${API_URL}/api/account/deactivation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.userId || user.id || user.user_id,
          deactivate: nextDeactivated,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to update account status");
      }

      const updatedUser = {
        ...user,
        is_disabled: Number(data.is_disabled || 0),
        deactivated_at: data.deactivated_at || null,
      };
      localStorage.setItem("user", JSON.stringify(updatedUser));
      setUser(updatedUser);
      setIsDeactivated(Number(data.is_disabled || 0) === 1);

      toast({
        title: nextDeactivated ? "Account deactivation scheduled" : "Account reactivated",
        description: nextDeactivated
          ? "Your account is now set for auto-deletion after 30 days."
          : "Your deactivation schedule has been cancelled.",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Update Failed",
        description: error.message || "Could not update account status.",
      });
    } finally {
      setDeactivateLoading(false);
    }
  };

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
            <div className="relative group">
              <div className="h-32 w-32 rounded-full border-4 border-primary/20 bg-secondary flex items-center justify-center overflow-hidden transition-all group-hover:border-primary">
                {profileImage ? (
                  <button
                    type="button"
                    onClick={() => setImagePreviewOpen(true)}
                    className="h-full w-full"
                    aria-label="Preview profile picture"
                  >
                    <img src={profileImage} alt="Profile" className="h-full w-full object-cover cursor-zoom-in" />
                  </button>
                ) : (
                  <span className="text-4xl font-black text-primary">{initial}</span>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
                Upload Photo
              </Button>
              <Button type="button" variant="outline" onClick={openCamera} disabled={cameraLoading}>
                <Camera className="h-4 w-4 mr-2" />
                {cameraLoading ? "Opening..." : "Use Camera"}
              </Button>
            </div>
            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />
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
              <Label className="text-xs font-black uppercase tracking-widest ml-1">Theme</Label>
              <div className="flex items-center justify-between rounded-xl border-2 bg-muted/20 px-4 py-3">
                <span className="text-sm font-semibold text-foreground">
                  {theme === "dark" ? "Dark Mode" : "Light Mode"}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Light</span>
                  <Switch
                    checked={theme === "dark"}
                    onCheckedChange={handleThemeToggle}
                    aria-label="Toggle dark mode"
                  />
                  <span className="text-xs text-muted-foreground">Dark</span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-black uppercase tracking-widest ml-1\">Email</Label>
              <Input value={user.email || "N/A"} disabled className="h-12 rounded-xl bg-muted/50 border-2" />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-black uppercase tracking-widest ml-1">Password</Label>
              <div className="flex gap-2">
                <Input value="••••••••••••" disabled className="h-12 rounded-xl bg-muted/50 border-2 flex-1 tracking-widest" />
                <Button variant="outline" onClick={() => setShowPasswordModal(true)} className="h-12 px-6 rounded-xl border-2 font-bold hover:bg-primary hover:text-white transition-all">
                  Change
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-black uppercase tracking-widest ml-1">Link Account</Label>
              <div className="flex gap-2">
                {linkedGmail ? (
                  <div className="flex-1 flex items-center justify-between rounded-xl border-2 bg-green-50 dark:bg-green-900/20 px-4 py-3 border-green-200 dark:border-green-800">
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-green-600 dark:text-green-400" />
                      <span className="text-sm font-semibold text-green-700 dark:text-green-300">{maskEmail(linkedGmail)}</span>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setGmailInput(linkedGmail || "");
                        setGmailModalOpen(true);
                      }}
                      className="h-8 px-4 rounded-xl font-bold"
                    >
                      Change
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setGmailModalOpen(true)}
                    className="h-12 rounded-xl border-2 font-bold flex-1"
                  >
                    <Mail className="h-4 w-4 mr-2" />
                    Link Gmail Account
                  </Button>
                )}
              </div>
              {linkedGmail ? (
                <p className="text-xs text-muted-foreground">This email will be used for password recovery if you forget your password.</p>
              ) : (
                <p className="text-xs text-muted-foreground">No Gmail account is linked yet. Link one now so it is available in Forgot Password.</p>
              )}
            </div>
          </div>

          <div className="pt-2 border-t">
            <Label className="text-xs font-black uppercase tracking-widest ml-1">Account Status</Label>
            <div className="mt-3 rounded-xl border-2 p-4 bg-muted/20 flex items-center justify-between gap-4">
              <p className="text-sm text-muted-foreground">
                {isDeactivated
                  ? "This account is deactivated and scheduled for auto-deletion after 30 days."
                  : "Deactivate your account if you want it queued for deletion after 30 days."}
              </p>
              <Button
                type="button"
                variant={isDeactivated ? "default" : "destructive"}
                onClick={handleToggleDeactivate}
                disabled={deactivateLoading}
                className="min-w-32 font-bold"
              >
                {deactivateLoading ? "Please wait..." : isDeactivated ? "Activate" : "Deactivate"}
              </Button>
            </div>
          </div>

          <div className="pt-4">
            <Button onClick={handleSaveProfile} disabled={saving} className="w-full py-8 text-xl font-black rounded-2xl shadow-xl uc-gradient-btn active:scale-95 transition-all">
              {saving ? "SAVING..." : "SAVE PROFILE"}
            </Button>
          </div>
        </div>
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

      <Dialog
        open={cameraOpen}
        onOpenChange={(open) => {
          if (!open) stopCamera();
          setCameraOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Take Profile Photo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="overflow-hidden rounded-xl border bg-black">
              <video ref={videoRef} className="h-[320px] w-full object-cover" playsInline muted autoPlay />
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  stopCamera();
                  setCameraOpen(false);
                }}
              >
                Cancel
              </Button>
              <Button type="button" onClick={takePhotoFromCamera}>
                Capture Photo
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={imagePreviewOpen} onOpenChange={setImagePreviewOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Profile Picture</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center">
            {profileImage ? (
              <img
                src={profileImage}
                alt="Profile preview"
                className="max-h-[70vh] w-auto rounded-xl object-contain"
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      {/* LINK GMAIL MODAL */}
      <Dialog open={gmailModalOpen} onOpenChange={setGmailModalOpen}>
        <DialogContent className="sm:max-w-md rounded-3xl p-0 overflow-hidden border-none shadow-2xl">
          <div className="bg-primary p-8 text-white">
            <DialogHeader>
              <DialogTitle className="text-2xl font-black uppercase italic tracking-tighter">Link Gmail Account</DialogTitle>
              <p className="text-primary-foreground/80 text-sm">This will be used for password recovery.</p>
            </DialogHeader>
          </div>

          <div className="p-8 space-y-6 bg-background">
            <div className="space-y-2">
              <Label className="text-xs font-black uppercase text-muted-foreground ml-1">Gmail Address</Label>
              <Input
                type="email"
                value={gmailInput}
                onChange={(e) => setGmailInput(e.target.value)}
                placeholder="your.email@gmail.com"
                className="h-12 rounded-xl border-2"
              />
              <p className="text-xs text-muted-foreground">Enter a valid Gmail address</p>
            </div>

            <div className="flex gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setGmailModalOpen(false)}
                className="px-6 py-2 rounded-xl"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleLinkGmail}
                disabled={gmailLinking || !gmailInput.trim()}
                className="px-6 py-2 rounded-xl uc-gradient-btn text-white font-bold"
              >
                {gmailLinking ? "Linking..." : "Link Gmail"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Settings;
