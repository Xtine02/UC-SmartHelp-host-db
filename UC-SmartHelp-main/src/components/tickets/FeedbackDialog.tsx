import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { X, ThumbsUp, ThumbsDown } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  departmentName?: string;
  departmentId?: string;
  ticketId?: string;
}

const FeedbackDialog = ({ open, onClose, departmentName, departmentId, ticketId }: Props) => {
  // Manual Auth
  let user = null;
  try {
    const savedUser = localStorage.getItem("user");
    user = savedUser ? JSON.parse(savedUser) : null;
  } catch (e) {
    console.error("FeedbackDialog: Failed to parse user", e);
  }
  
  const { toast } = useToast();
  const [helpful, setHelpful] = useState<boolean | null>(null);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const title = departmentName
    ? `Rate ${departmentName}`
    : "How was your experience?";

  const handleSubmit = async () => {
    if (helpful === null) {
      toast({ title: "Please select a rating", variant: "destructive" });
      return;
    }

    setLoading(true);

    try {
      const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
      const userId = user?.userId || user?.id || null;

      const rating = helpful ? 5 : 1;

      const response = await fetch(`${API_URL}/api/department-feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticket_id: ticketId || null,
          user_id: userId,
          department: departmentName || departmentId || "",
          rating,
          comment: comment.trim() || null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to save feedback");
      }

      toast({ 
        title: "Feedback Submitted!", 
        description: "Your input helps us improve University of Cebu services." 
      });
      setHelpful(null);
      setComment("");
      onClose();
    } catch (error: any) {
      toast({ title: "Error", description: error?.message || "Unable to submit feedback", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-md px-4" onClick={onClose}>
      <div
        className="relative w-full max-w-md rounded-3xl bg-background border p-8 shadow-2xl animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <button 
          onClick={onClose} 
          className="absolute right-6 top-6 h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground transition-all"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="space-y-8">
          <div className="space-y-2 text-center">
            <h2 className="text-2xl font-black text-foreground uppercase italic tracking-tight">{title}</h2>
            <p className="text-sm text-muted-foreground font-medium italic">Help us serve you better!</p>
          </div>

          {/* Rating Selection */}
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setHelpful(true)}
              className={`flex-1 flex flex-col items-center gap-2 p-6 rounded-2xl border-2 transition-all ${
                helpful === true 
                  ? "bg-green-500 border-green-600 text-white shadow-lg scale-105" 
                  : "bg-secondary/30 border-transparent text-muted-foreground hover:bg-secondary/50"
              }`}
            >
              <ThumbsUp className={`h-8 w-8 ${helpful === true ? 'animate-bounce' : ''}`} />
              <span className="text-xs font-black uppercase tracking-widest">Helpful</span>
            </button>
            <button
              type="button"
              onClick={() => setHelpful(false)}
              className={`flex-1 flex flex-col items-center gap-2 p-6 rounded-2xl border-2 transition-all ${
                helpful === false 
                  ? "bg-red-500 border-red-600 text-white shadow-lg scale-105" 
                  : "bg-secondary/30 border-transparent text-muted-foreground hover:bg-secondary/50"
              }`}
            >
              <ThumbsDown className={`h-8 w-8 ${helpful === false ? 'animate-bounce' : ''}`} />
              <span className="text-xs font-black uppercase tracking-widest">Poor</span>
            </button>
          </div>

          {/* Comment Area */}
          <div className="space-y-2">
            <label className="text-xs font-black text-muted-foreground uppercase tracking-widest ml-1">
              Your Suggestions
            </label>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="What can we improve?"
              className="bg-muted/30 border-none focus:ring-primary min-h-[120px] rounded-2xl resize-none shadow-inner"
            />
          </div>

          <Button
            onClick={handleSubmit}
            disabled={helpful === null || loading}
            className="w-full py-8 text-xl font-black rounded-2xl shadow-xl transition-all active:scale-95 uc-gradient-btn"
          >
            {loading ? "SUBMITTING..." : "SUBMIT FEEDBACK"}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default FeedbackDialog;
