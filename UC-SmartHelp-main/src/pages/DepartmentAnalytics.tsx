import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "@/components/Navbar";
import ReviewAnalytics from "@/components/analytics/ReviewAnalytics";

const DepartmentAnalytics = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedUser = localStorage.getItem("user");
    if (savedUser) {
      const userData = JSON.parse(savedUser);
      setUser(userData);
    }
    setLoading(false);
  }, []);

  // Redirect to login if no user is logged in
  useEffect(() => {
    if (!loading && !user) {
      navigate("/login");
    }
  }, [loading, user, navigate]);

  // Only allow staff, admins, and department heads to access this page
  const canAccess = user && ["staff", "admin", "accountant", "scholarship"].includes(user.role?.toLowerCase());

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  if (!canAccess) {
    return (
      <>
        <Navbar />
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-4">Access Denied</h1>
            <p className="text-gray-600">You do not have permission to access this page.</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold mb-8">Department Analytics</h1>
          <ReviewAnalytics department={user?.department} />
        </div>
      </div>
    </>
  );
};

export default DepartmentAnalytics;
