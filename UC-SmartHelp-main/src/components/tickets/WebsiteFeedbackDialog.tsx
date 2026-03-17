import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { X, Star } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmitted?: () => void;
}

const WebsiteFeedbackDialog = ({ open, onClose, onSubmitted }: Props) => {
  // Manual Auth
  let user = null;
  try {
    const savedUser = localStorage.getItem("user");
    user = savedUser ? JSON.parse(savedUser) : null;
  } catch (e) {
    console.error("WebsiteFeedbackDialog: Failed to parse user", e);
  }

  const { toast } = useToast();
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

  const handleSubmit = async () => {
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
        onClose();
        onSubmitted?.();
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
      <label className="text-sm font-medium">{label}</label>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            onClick={() => handleRatingChange(category, star)}
            className="p-1 hover:scale-110 transition-transform"
          >
            <Star
              className={`h-6 w-6 ${
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold">Website Feedback</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6">
          <p className="text-sm text-gray-600">
            Help us improve! Please rate your experience with our website.
          </p>

          <StarRating category="overall" label="Overall Experience" />
          <StarRating category="ease_of_use" label="Ease of Use" />
          <StarRating category="design" label="Design & Layout" />
          <StarRating category="speed" label="Speed & Performance" />

          <div className="space-y-2">
            <label className="text-sm font-medium">Additional Comments (Optional)</label>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Tell us what you think..."
              className="min-h-[80px]"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              onClick={onClose}
              variant="outline"
              className="flex-1"
              disabled={loading}
            >
              Skip
            </Button>
            <Button
              onClick={handleSubmit}
              className="flex-1"
              disabled={loading}
            >
              {loading ? "Submitting..." : "Submit Feedback"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WebsiteFeedbackDialog;