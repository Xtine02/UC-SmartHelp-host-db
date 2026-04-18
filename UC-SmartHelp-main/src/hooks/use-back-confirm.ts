import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

export const useBackConfirm = (onBack?: () => void, onLogout?: () => void) => {
  const navigate = useNavigate();
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    // Initial setup
    window.history.pushState(null, "", window.location.pathname);

    // Handle popstate event (back button click)
    const handlePopState = () => {
      if (onBack) {
        onBack();
      } else {
        setShowConfirm(true);
      }
      // Push state back to prevent navigation and keep the interceptor active
      window.history.pushState(null, "", window.location.pathname);
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [onBack]);

  const handleConfirmLeave = () => {
    setShowConfirm(false);

    if (onLogout) {
      onLogout();
      return;
    }

    // Logout user
    localStorage.removeItem("uc_guest");
    localStorage.removeItem("user");
    
    window.dispatchEvent(new Event('profile-updated'));
    
    // Navigate to home page
    navigate("/");
  };

  const handleStayOnPage = () => {
    setShowConfirm(false);
  };

  return {
    showConfirm,
    handleConfirmLeave,
    handleStayOnPage,
  };
};
