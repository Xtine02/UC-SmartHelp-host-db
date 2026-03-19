import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { X, Star } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirmLeave: () => void;
}

const LeaveWithFeedbackDialog = ({ open, onClose, onConfirmLeave }: Props) => {
  let user = null;
  try {
    const savedUser = localStorage.getItem("user");
    user = savedUser ? JSON.parse(savedUser) : null;
  } catch (e) {
    console.error("LeaveWithFeedbackDialog: Failed to parse user", e);
  }

  const { toast } = useToast();
  const [showFeedback, setShowFeedback] = useState(false);
  const [ratings, setRatings] = useState({
    overall: 0,
    ease_of_use: 0,
    design: 0,
    speed: 0
  });
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const handleRatingChange = (category: keyof typeof ratings, rating: number) => {
    setRatings(prev => ({ ...prev, [category]: rating }));
  };

  const handleSubmitFeedback = async () => {
    if (ratings.overall === 0 || ratings.ease_of_use === 0 || ratings.design === 0 || ratings.speed === 0) {
      toast({ title: "Please rate all categories", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
      const sessionId = localStorage.getItem("website_feedback_session") || `sess_${Date.now()}_${Math.random()}`;
      localStorage.setItem("website_feedback_session", sessionId);

      const response = await fetch(`${API_URL}/api/website-feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: user?.id || user?.userId || null,
          session_id: sessionId,
          rating: ratings.overall,
          ease_of_use: ratings.ease_of_use,
          design: ratings.design,
          speed: ratings.speed,
          comment: comment.trim() || null
        })
      });

      if (response.ok) {
        toast({ title: "Thank you for your feedback!" });
        localStorage.setItem("website_feedback_submitted", "1");
        onConfirmLeave();
      } else {
        throw new Error("Failed to submit feedback");
      }
    } catch (error) {
      console.error("Error submitting website feedback:", error);
      toast({ title: "Error submitting feedback", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const StarRating = ({ category, label }: { category: keyof typeof ratings; label: string }) => (
    <div className="space-y-2">
      <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{label}</label>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            onClick={() => handleRatingChange(category, star)}
            className="p-1 hover:scale-110 transition-transform"
          >
            <Star
              className={`h-5 w-5 ${
                star <= ratings[category]
                  ? "fill-yellow-400 text-yellow-400"
                  : "text-gray-300"
              }`}
            />
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="relative w-full max-w-md rounded-3xl bg-background border shadow-2xl animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
        {/* Close button */}
        <button 
          onClick={onClose} 
          className="absolute right-6 top-6 h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground transition-all z-10 bg-background"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="p-8 space-y-6">
          {!showFeedback ? (
            <>
              {/* Confirmation message */}
              <div className="space-y-4">
                <div className="space-y-2 text-center">
                  <h2 className="text-2xl font-black text-foreground uppercase italic tracking-tight">Hold on!</h2>
                  <p className="text-sm text-muted-foreground font-medium">
                    Do you want to leave this page?
                  </p>
                </div>

                <div className="bg-secondary/50 p-4 rounded-lg text-sm text-muted-foreground text-center">
                  Before you go, would you like to share feedback about your experience? It only takes a minute!
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex flex-col gap-3 pt-4">
                <Button
                  onClick={() => setShowFeedback(true)}
                  className="w-full py-6 text-lg font-black rounded-xl shadow-lg hover:scale-[1.01] active:scale-[0.99] transition-all uc-gradient-btn text-white"
                >
                  SHARE FEEDBACK & LEAVE
                </Button>
                <Button
                  onClick={onConfirmLeave}
                  variant="outline"
                  className="w-full py-6 text-lg font-black rounded-xl"
                >
                  JUST LEAVE
                </Button>
                <Button
                  onClick={onClose}
                  variant="ghost"
                  className="w-full py-6 text-lg font-black rounded-xl"
                >
                  STAY ON PAGE
                </Button>
              </div>
            </>
          ) : (
            <>
              {/* Feedback form */}
              <div className="space-y-2 text-center">
                <h2 className="text-xl font-black text-foreground uppercase italic tracking-tight">Quick Feedback</h2>
                <p className="text-xs text-muted-foreground font-medium">How was your experience?</p>
              </div>

              <div className="space-y-4">
                <StarRating category="overall" label="Overall Experience" />
                <StarRating category="ease_of_use" label="Ease of Use" />
                <StarRating category="design" label="Design & Layout" />
                <StarRating category="speed" label="Speed & Performance" />

                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Comments (Optional)</label>
                  <Textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Tell us what you think..."
                    className="min-h-[80px] bg-muted/30 border-none focus:ring-primary rounded-lg resize-none"
                  />
                </div>
              </div>

              {/* Feedback action buttons */}
              <div className="flex flex-col gap-3 pt-4">
                <Button
                  onClick={handleSubmitFeedback}
                  disabled={loading}
                  className="w-full py-6 text-lg font-black rounded-xl shadow-lg hover:scale-[1.01] active:scale-[0.99] transition-all uc-gradient-btn text-white"
                >
                  {loading ? "SUBMITTING..." : "SUBMIT & LEAVE"}
                </Button>
                <Button
                  onClick={() => setShowFeedback(false)}
                  variant="outline"
                  disabled={loading}
                  className="w-full py-6 text-lg font-black rounded-xl"
                >
                  BACK
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default LeaveWithFeedbackDialog;
