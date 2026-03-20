import { Navigate } from "react-router-dom";
import Navbar from "@/components/Navbar";
import AuditTrail from "@/components/admin/AuditTrail";

const AuditTrailPage = () => {
  const savedUser = localStorage.getItem("user");
  const user = savedUser ? JSON.parse(savedUser) : null;
  const role = (user?.role || "").toString().trim().toLowerCase();
  const isAdminOrStaff = role === "admin" || role === "staff";
  
  if (!user) return <Navigate to="/login" replace />;
  if (!isAdminOrStaff) return <Navigate to="/settings" replace />;

  const userId = user.userId || user.id || user.user_id;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container max-w-2xl py-12 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="space-y-2 text-center sm:text-left">
          <h1 className="text-3xl font-black text-foreground uppercase italic tracking-tight">Audit Trail</h1>
          <p className="text-muted-foreground font-medium">Recent activity for your account.</p>
        </div>

        <div className="rounded-3xl border bg-card p-8 shadow-xl">
          <AuditTrail userId={userId} all={isAdminOrStaff} />
        </div>
      </div>
    </div>
  );
};

export default AuditTrailPage;
