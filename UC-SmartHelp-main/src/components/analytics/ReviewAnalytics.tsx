import { useEffect, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

interface DepartmentFeedback {
  id: string;
  department: string;
  rating: number;
  comment?: string;
  created_at?: string;
  user_id?: string;
  profiles?: { first_name: string; last_name: string } | null;
}

interface WebsiteFeedback {
  id: string;
  rating: number;
  ease_of_use: number;
  design: number;
  speed: number;
  comment?: string;
  created_at?: string;
  user_id?: string;
}

interface ReviewAnalyticsProps {
  /**
   * When provided, limits department feedback to the given department and hides the department selector.
   */
  department?: string;
}

const ReviewAnalytics = ({ department }: ReviewAnalyticsProps) => {
  const [deptFeedback, setDeptFeedback] = useState<DepartmentFeedback[]>([]);
  const [websiteFeedback, setWebsiteFeedback] = useState<WebsiteFeedback[]>([]);
  const [allFeedback, setAllFeedback] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [selectedDept, setSelectedDept] = useState<string>("all");
  const [feedbackType, setFeedbackType] = useState<"all" | "department" | "website">(department ? "department" : "all");

  const normalize = (value?: string) => (value || "").toString().trim().toLowerCase();

  const fetchData = async () => {
    const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

    try {
      // Fetch department feedback (optionally scoped to a specific department)
      let deptUrl = new URL(`${API_URL}/api/department-feedback`);
      if (department) {
        deptUrl.searchParams.append("department", department);
      }

      const deptResponse = await fetch(deptUrl.toString());
      const deptData: DepartmentFeedback[] = deptResponse.ok ? await deptResponse.json() : [];
      setDeptFeedback(deptData);
    } catch (error) {
      console.error("Error fetching department feedback:", error);
    }

    try {
      // Fetch website feedback
      const websiteResponse = await fetch(`${API_URL}/api/website-feedback`);
      const websiteData: WebsiteFeedback[] = websiteResponse.ok ? await websiteResponse.json() : [];
      setWebsiteFeedback(websiteData);
    } catch (error) {
      console.error("Error fetching website feedback:", error);
    }

    // Static department list to match the UI in other places
    setDepartments([
      { id: "all", name: "All Departments" },
      { id: "Accounting", name: "Accounting" },
      { id: "Accounting Office", name: "Accounting Office" },
      { id: "Scholarship", name: "Scholarship" },
      { id: "Scholarship Office", name: "Scholarship Office" },
      { id: "Registrar's Office", name: "Registrar's Office" },
      { id: "Clinic", name: "Clinic" },
      { id: "CCS Office", name: "CCS Office" },
      { id: "Cashier's Office", name: "Cashier's Office" },
      { id: "SAO", name: "SAO" },
    ]);
  };

  useEffect(() => {
    if (department) {
      setSelectedDept(department);
    }
  }, [department]);

  useEffect(() => {
    fetchData();
    // Auto-refresh analytics every 2 seconds
    const interval = setInterval(() => {
      fetchData();
    }, 2000);
    return () => clearInterval(interval);
  }, [department]);

  // Combine feedback based on filter and feedback type
  useEffect(() => {
    let combined: any[] = [];

    if (feedbackType === "all" || feedbackType === "department") {
      const filtered = selectedDept === "all"
        ? deptFeedback
        : deptFeedback.filter((r) => normalize(r.department) === normalize(selectedDept));
      combined = combined.concat(filtered.map(f => ({ ...f, type: "department" })));
    }

    if (feedbackType === "all" || feedbackType === "website") {
      combined = combined.concat(websiteFeedback.map(f => ({ ...f, type: "website" })));
    }

    // Sort by created_at descending
    combined.sort((a, b) => {
      const dateA = new Date(a.created_at || 0).getTime();
      const dateB = new Date(b.created_at || 0).getTime();
      return dateB - dateA;
    });

    setAllFeedback(combined);
  }, [deptFeedback, websiteFeedback, selectedDept, feedbackType]);

  const isHelpfulRating = (rating: number | undefined) => (rating ?? 0) >= 4;

  const filteredComments = allFeedback.filter((f) => f.comment);

  // Calculate metrics only from department feedback
  const filtered = selectedDept === "all"
    ? deptFeedback
    : deptFeedback.filter((r) => normalize(r.department) === normalize(selectedDept));

  const helpfulCount = filtered.filter((r) => isHelpfulRating(r.rating)).length;
  const notHelpfulCount = filtered.length - helpfulCount;
  const helpData = [
    { name: "Helpful", value: helpfulCount, color: "#22c55e" },
    { name: "Not Helpful", value: notHelpfulCount, color: "#ef4444" },
  ];

  // Calculate website feedback metrics
  const websiteAvgRating = websiteFeedback.length > 0
    ? (websiteFeedback.reduce((sum, f) => sum + (f.rating || 0), 0) / websiteFeedback.length).toFixed(1)
    : "0";
  const websiteAvgEaseOfUse = websiteFeedback.length > 0
    ? (websiteFeedback.reduce((sum, f) => sum + (f.ease_of_use || 0), 0) / websiteFeedback.length).toFixed(1)
    : "0";
  const websiteAvgDesign = websiteFeedback.length > 0
    ? (websiteFeedback.reduce((sum, f) => sum + (f.design || 0), 0) / websiteFeedback.length).toFixed(1)
    : "0";
  const websiteAvgSpeed = websiteFeedback.length > 0
    ? (websiteFeedback.reduce((sum, f) => sum + (f.speed || 0), 0) / websiteFeedback.length).toFixed(1)
    : "0";

  const websiteData = [
    { name: "Overall", value: parseFloat(websiteAvgRating), color: "#3b82f6" },
    { name: "Ease of Use", value: parseFloat(websiteAvgEaseOfUse), color: "#10b981" },
    { name: "Design", value: parseFloat(websiteAvgDesign), color: "#f59e0b" },
    { name: "Speed", value: parseFloat(websiteAvgSpeed), color: "#8b5cf6" },
  ];

  const selectedDeptName = selectedDept === "all"
    ? "All Departments"
    : departments.find((d) => d.id === selectedDept)?.name || "";

  return (
    <div className="space-y-6 pt-4">
      <div>
        <h2 className="text-xl font-bold text-foreground">Review Analytic</h2>
        {selectedDept !== "all" && feedbackType === "department" && (
          <p className="text-sm text-muted-foreground">Department feedback for {selectedDeptName}</p>
        )}
        {feedbackType === "website" && (
          <p className="text-sm text-muted-foreground">Website feedback</p>
        )}
        {feedbackType === "all" && (
          <p className="text-sm text-muted-foreground">All feedback (department + website)</p>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        {/* Feedback type filter */}
        <Select value={feedbackType} onValueChange={(v: any) => setFeedbackType(v)}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Select Feedback Type" />
          </SelectTrigger>
          <SelectContent>
            {!department && <SelectItem value="all">All Feedback</SelectItem>}
            <SelectItem value="department">Department Feedback</SelectItem>
            {!department && <SelectItem value="website">Website Feedback</SelectItem>}
          </SelectContent>
        </Select>

        {/* Department filter (only for department feedback) */}
        {feedbackType !== "website" && !department && (
          <Select value={selectedDept} onValueChange={setSelectedDept}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Select Office to View Reviews" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {departments.slice(1).map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Chart - only show for department feedback */}
      {(feedbackType === "all" || feedbackType === "department") && (
        <div>
          <h3 className="text-center font-semibold text-foreground mb-4">DEPARTMENT FEEDBACK (Helpful vs Not Helpful)</h3>
          <div className="text-center text-sm text-muted-foreground mb-2">
        {filtered.length === 0
          ? "No department feedback yet."
          : `${helpfulCount} helpful, ${notHelpfulCount} not helpful (${filtered.length} total)`}
      </div>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={helpData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis label={{ value: "Count", angle: -90, position: "insideLeft" }} />
            <Tooltip />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {helpData.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Website feedback chart */}
      {(feedbackType === "all" || feedbackType === "website") && (
        <div>
          <h3 className="text-center font-semibold text-foreground mb-4">WEBSITE FEEDBACK (Average Ratings)</h3>
          <div className="text-center text-sm text-muted-foreground mb-2">
            {websiteFeedback.length === 0
              ? "No website feedback yet."
              : `${websiteFeedback.length} feedback submission(s)`}
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={websiteData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis domain={[0, 5]} label={{ value: "Rating (1-5)", angle: -90, position: "insideLeft" }} />
                <Tooltip />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {websiteData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Comments table */}
      <div>
        <h3 className="font-semibold text-foreground mb-3">Comments / Suggestions ({filteredComments.length})</h3>
        <div className="rounded-xl border bg-card overflow-hidden">
          <Table>
            <TableHead>
              <TableRow className="bg-muted/50">
                {!department && <TableHead className="font-bold">Type</TableHead>}
                {!department && <TableHead className="font-bold">Department</TableHead>}
                {!department && feedbackType !== "website" && <TableHead className="font-bold">Feedback</TableHead>}
                {!department && feedbackType === "website" && <TableHead className="font-bold">Overall Rating</TableHead>}
                <TableHead className="font-bold">Comment</TableHead>
                <TableHead className="font-bold">Date</TableHead>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredComments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={department ? 2 : 5} className="text-center text-muted-foreground py-6">No comments yet.</TableCell>
                </TableRow>
              ) : (
                filteredComments.map((f, idx) => {
                  const helpful = isHelpfulRating(f.rating);
                  return (
                    <TableRow key={`${f.type}-${f.id || idx}`}>
                      {!department && (
                        <TableCell>
                          <Badge variant={f.type === "website" ? "secondary" : "default"}>
                            {f.type === "website" ? "Website" : "Department"}
                          </Badge>
                        </TableCell>
                      )}
                      {!department && (
                        <TableCell>
                          {f.type === "website" ? "—" : f.department || "N/A"}
                        </TableCell>
                      )}
                      {!department && feedbackType !== "website" && (
                        <TableCell>
                          <Badge variant={helpful ? "secondary" : "destructive"}>
                            {helpful ? "Helpful" : "Not Helpful"}
                          </Badge>
                        </TableCell>
                      )}
                      {!department && feedbackType === "website" && (
                        <TableCell>
                          <Badge className="bg-blue-100 text-blue-700">
                            {f.rating || 0} / 5
                          </Badge>
                        </TableCell>
                      )}
                      <TableCell className="max-w-md">{f.comment}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {f.created_at ? format(new Date(f.created_at), "MMM dd, yyyy") : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
};

export default ReviewAnalytics;
