import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, X } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const NewTicketDialog = ({ open, onOpenChange }: Props) => {
  const { toast } = useToast();
  
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [departmentName, setDepartmentName] = useState("");
  const [topic, setTopic] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [ticketRef, setTicketRef] = useState("");

  const topicMap: { [key: string]: string[] } = {
    "Accounting Office": ["Balance inquiry", "Official receipt request", "Payment verification (GCash, bank, etc.)", "Promissory Notes", "Refund requests", "Tuition fee breakdown"].sort(),
    "Cashiers Office": ["Balance Inquiry", "Down Payment Concern", "GCash/Online Payment Issue", "Installment Payment", "Lost Receipt Concern", "Miscellaneous Fees Payment", "Official Receipt Request", "Overpayment Concern", "Payment Adjustment Request", "Payment Deadline Inquiry", "Payment Inquiry", "Payment Posting Delay", "Payment Verification", "Refund Request", "Tuition Payment"].sort(),
    "Clinic": ["Clinic Schedule Inquiry", "Dental Checkup Inquiry", "Emergency Assistance", "First Aid Concern", "Health Assessment", "Health Record Request", "Medical Certificate Request", "Medical Consultation", "Medicine Availability Inquiry", "Vaccination Inquiry"].sort(),
    "CCS Office": ["Academic Advising", "Capstone/Thesis Guidelines", "Curriculum Inquiry", "Department Announcement/Update", "Department Clearance Request", "Faculty Consultation Request", "Internship/OJT Requirements", "Schedule Conflict Concern", "Section Assignment Concern", "Student Organization/Club Concern", "Subject Enrollment Assistance", "Subject Prerequisites Inquiry"].sort(),
    "Registrar Office": ["Add/Drop Subjects", "Certificate Request", "Clearance Concern", "Diploma Request", "Enrollment Concern", "Grade Correction", "Grade Inquiry", "Graduation Requirements", "Honorable Dismissal", "Schedule Concern", "Section Change Request", "Student Records Update", "Subject Registration", "Transcript of Records Request", "Transfer Credentials"].sort(),
    "SAO (Student Affairs Office)": ["Bullying or complaint reports", "Enrollment Requirements", "Student discipline concerns", "Uniform Exemption Requirements"].sort(),
    "Scholarship Office": ["External Scholarship Concern", "Scholarship Allowance", "Scholarship Appeal", "Scholarship Application", "Scholarship Cancellation", "Scholarship Deadline Inquiry", "Scholarship Discount Concern", "Scholarship Document Submission", "Scholarship Eligibility", "Scholarship Grades Compliance", "Scholarship Renewal", "Scholarship Requirements", "Scholarship Status", "Scholarship Transfer", "Scholarship Verification"].sort(),
  };

  useEffect(() => {
    const depts = [
      { id: "1", name: "Accounting Office" },
      { id: "2", name: "Cashiers Office" },
      { id: "3", name: "Clinic" },
      { id: "4", name: "CCS Office" },
      { id: "5", name: "Registrar Office" },
      { id: "6", name: "SAO (Student Affairs Office)" },
      { id: "7", name: "Scholarship Office" },
    ].sort((a, b) => a.name.localeCompare(b.name));
    setDepartments(depts);
  }, []);

  useEffect(() => {
    if (open) {
      setSubmitted(false);
      setTicketRef("");
      setDepartmentName("");
      setTopic("");
      setDescription("");
    }
  }, [open]);

  useEffect(() => {
    setTopic("");
  }, [departmentName]);

  const handleSubmit = async () => {
    const userJson = localStorage.getItem("user");
    let currentUser = null;
    try { currentUser = userJson ? JSON.parse(userJson) : null; } catch(e) {}

    const senderId = currentUser?.userId || currentUser?.id || currentUser?.user_id;

    if (!departmentName || !topic || !description.trim()) {
      toast({ title: "Validation Error", description: "All fields are required.", variant: "destructive" });
      return;
    }

    if (!senderId) {
      toast({ title: "Session Error", description: "Please logout and login again.", variant: "destructive" });
      return;
    }

    const dbDeptName = departmentName;

    setLoading(true);
    const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

    try {
      const response = await fetch(`${API_URL}/api/tickets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: topic,
          description: description.trim(),
          department: dbDeptName,
          sender_id: senderId,
          status: "pending"
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.details || data.error || "Failed");
      
      setTicketRef(`TICKET #${data.ticketId}`);
      setSubmitted(true);
      window.dispatchEvent(new CustomEvent('ticket-updated', { detail: { ticketId: data.ticketId } }));
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg rounded-3xl p-0 overflow-hidden border-none shadow-2xl">
        {submitted ? (
          <div className="relative p-12 text-center space-y-6 bg-background">

            <div className="flex justify-center">
              <div className="h-24 w-24 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle2 className="h-16 w-16 text-green-600 animate-bounce" />
              </div>
            </div>
            <h2 className="text-3xl font-black text-foreground uppercase italic tracking-tighter">Ticket Created Successfully!</h2>
          </div>
        ) : (
          <>
            <div className="bg-primary p-8 text-white relative">

              <DialogHeader>
                <DialogTitle className="text-3xl font-black uppercase italic tracking-tighter">New Ticket</DialogTitle>
                <p className="text-primary-foreground/80 font-medium italic">Filing a formal concern to University of Cebu.</p>
              </DialogHeader>
            </div>
            <div className="p-8 space-y-6 bg-background">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">Office/Department</Label>
                  <Select value={departmentName} onValueChange={setDepartmentName}>
                    <SelectTrigger className="h-12 rounded-xl border-2 shadow-sm"><SelectValue placeholder="Which office?" /></SelectTrigger>
                    <SelectContent>
                      {departments.map((d) => <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">Topic/Subject</Label>
                  {departmentName ? (
                    <Select value={topic} onValueChange={setTopic}>
                      <SelectTrigger className="h-12 rounded-xl border-2 shadow-sm"><SelectValue placeholder="Select topic" /></SelectTrigger>
                      <SelectContent>
                        {topicMap[departmentName]?.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : <div className="h-12 flex items-center px-4 rounded-xl bg-muted/30 border-2 border-dashed text-sm italic">Select office first</div>}
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">Description</Label>
                  <Textarea 
                    placeholder={departmentName && topic ? "Details..." : "Select office and topic first..."} 
                    value={description} 
                    onChange={(e) => setDescription(e.target.value)} 
                    disabled={!departmentName || !topic}
                    className="min-h-[120px] rounded-2xl border-2 resize-none shadow-sm disabled:bg-muted/10 disabled:cursor-not-allowed" 
                  />
                  <p className="text-[10px] text-muted-foreground font-medium italic ml-1">
                    tip: if you're a student, please include your student ID number for faster processing.
                  </p>
                </div>
              </div>
              <Button 
                onClick={handleSubmit} 
                disabled={loading || !departmentName || !topic || !description.trim()} 
                className="w-full py-8 text-xl font-black rounded-2xl shadow-xl uc-gradient-btn disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "SAVING..." : "SUBMIT TICKET"}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default NewTicketDialog;
