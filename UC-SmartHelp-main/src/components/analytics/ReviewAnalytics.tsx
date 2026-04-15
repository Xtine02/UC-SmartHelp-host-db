import { useEffect, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

interface DepartmentFeedback {
  id: string;
  dept_feedback_id?: string;
  department: string;
  is_helpful: boolean;
  comment?: string;
  date_submitted?: string;
  created_at?: string;
  user_id?: string;
  profiles?: { first_name: string; last_name: string } | null;
}

interface ReviewAnalyticsProps {
  /**
   * When provided, limits department feedback to the given department and hides the department selector.
   */
  department?: string;
  /**
   * The user's department - used to restrict accounting feedback visibility
   */
  userDepartment?: string;
  /**
   * The user's role - used for access control
   */
  userRole?: string;
}

const ReviewAnalytics = ({ department, userDepartment, userRole }: ReviewAnalyticsProps) => {
  const [deptFeedback, setDeptFeedback] = useState<DepartmentFeedback[]>([]);
  const [websiteFeedback, setWebsiteFeedback] = useState<any[]>([]);
  const [allFeedback, setAllFeedback] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [selectedDept, setSelectedDept] = useState<string>(department || "all");
  const [exitIntentShown, setExitIntentShown] = useState<boolean>(false);
  const [feedbackType, setFeedbackType] = useState<"all" | "department" | "website">("all");

  // Keep selected department and type in sync with logged in user context
  useEffect(() => {
    if (!department) {
      // For staff users, lock to their own department only
      if (userDepartment && userRole?.toLowerCase() === "staff") {
        setSelectedDept(userDepartment);
        setFeedbackType("department");
      }
      // For admin users (no department), show all feedback by default
      else if (userDepartment) {
        setSelectedDept(userDepartment);
      }
    }
  }, [department, userDepartment, userRole]);

  // Helper function to normalize department names: remove "office" and "department" from the end
  const normalizeDept = (dept?: string) => {
    if (!dept) return "";
    return dept
      .toLowerCase()
      .trim()
      .replace(/\s+(office|department)\s*$/i, '')
      .trim();
  };

  const isAccountingDept = (deptName?: string) => {
    const normalized = normalizeDept(deptName);
    return normalized === "accounting";
  };

  // Check if user has access to accounting department feedback
  const canAccessAccountingFeedback = () => {
    if (!userDepartment) return true; // No user department specified, allow access
    return isAccountingDept(userDepartment);
  };

  const normalize = (value?: string) => (value || "").toString().trim().toLowerCase();

  // Helper function to safely parse date strings from database
  const parseDate = (dateString?: string | null): Date | null => {
    if (!dateString) return null;
    try {
      // Try parsing ISO format first (more reliable)
      const date = new Date(dateString);
      // Check if date is valid
      if (!isNaN(date.getTime())) {
        return date;
      }
      return null;
    } catch (e) {
      console.error("Error parsing date:", dateString, e);
      return null;
    }
  };

  // Helper function to safely format dates
  const formatDateSafe = (dateString?: string | null, fallback?: string | null): string => {
    const date = parseDate(dateString || fallback);
    if (!date) return "—";
    try {
      return format(date, "MMM dd, yyyy HH:mm:ss");
    } catch (e) {
      console.error("Error formatting date:", e);
      return "—";
    }
  };

  const fetchData = async () => {
    const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

    try {
      // Fetch department feedback (optionally scoped to a specific department)
      let deptUrl = new URL(`${API_URL}/api/department-feedback`);
      if (department) {
        deptUrl.searchParams.append("department", department);
        console.log('🔍 [Analytics] Fetching feedback for department:', department);
      } else if (userRole?.toLowerCase() === "staff" && userDepartment) {
        // For staff, only fetch their own department feedback
        deptUrl.searchParams.append("department", userDepartment);
        console.log('🔍 [Analytics] Staff user - fetching feedback for department:', userDepartment);
      } else {
        console.log('🔍 [Analytics] No department specified - fetching all feedback');
      }

      const deptResponse = await fetch(deptUrl.toString());
      const deptData: DepartmentFeedback[] = deptResponse.ok ? await deptResponse.json() : [];
      setDeptFeedback(deptData);

      // Fetch website feedback only for admins, NOT for staff
      if (userRole?.toLowerCase() !== "staff") {
        try {
          const websiteResponse = await fetch(`${API_URL}/api/website-feedback`);
          const websiteData = websiteResponse.ok ? await websiteResponse.json() : [];
          console.log('📊 [Analytics] Website feedback fetched:', websiteData.length, 'records');
          setWebsiteFeedback(websiteData);
        } catch (error) {
          console.error("❌ [Analytics] Error fetching website feedback:", error);
          setWebsiteFeedback([]);
        }
      } else {
        // Clear website feedback for staff users
        setWebsiteFeedback([]);
      }
    } catch (error) {
      console.error("❌ [Analytics] Error fetching department feedback:", error);
    }

    // Static department list to match the UI in other places
    setDepartments([
      { id: "all", name: "All Departments" },
      { id: "Accounting Office", name: "Accounting Office" },
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
    // Removed auto-refresh - was causing resource exhaustion
    // Data updates on filter/dropdown changes instead
  }, [department, userRole, userDepartment]);

  // Combine feedback based on filter and feedback type
  useEffect(() => {
    let combined: any[] = [];

    if (feedbackType === "all" || feedbackType === "department") {
      let feedbackToAdd = deptFeedback;
      
      // When a specific department is requested, strictly filter to only that department
      if (department) {
        const normalizedRequestedDept = normalizeDept(department);
        feedbackToAdd = feedbackToAdd.filter(f => {
          const normalizedFeedbackDept = normalizeDept(f.department);
          return normalizedFeedbackDept === normalizedRequestedDept;
        });
      } else {
        // Staff users can only see their own department - enforce this as a safety measure
        if (userRole?.toLowerCase() === "staff" && userDepartment) {
          const normalizedUserDept = normalizeDept(userDepartment);
          feedbackToAdd = feedbackToAdd.filter(f => {
            const normalizedFeedbackDept = normalizeDept(f.department);
            return normalizedFeedbackDept === normalizedUserDept;
          });
        } else {
          // Filter accounting feedback based on user access (only in admin/multi-dept view)
          if (!canAccessAccountingFeedback()) {
            feedbackToAdd = feedbackToAdd.filter(f => !isAccountingDept(f.department));
          }
          
          // Filter by selected department from dropdown
          if (selectedDept !== "all") {
            const normalizedSelectedDept = normalizeDept(selectedDept);
            feedbackToAdd = feedbackToAdd.filter(f => {
              const normalizedFeedbackDept = normalizeDept(f.department);
              return normalizedFeedbackDept === normalizedSelectedDept;
            });
          }
        }
      }
      
      combined = combined.concat(feedbackToAdd.map(f => ({ ...f, type: "department" })));
    }

    // Only include website feedback for admins, NEVER for staff
    if (userRole?.toLowerCase() !== "staff") {
      if (feedbackType === "all" || feedbackType === "website") {
        combined = combined.concat(websiteFeedback.map(f => ({ ...f, type: "website" })));
      }
    }

    // Sort by date_submitted descending (fallback to created_at for backward compatibility)
    combined.sort((a, b) => {
      const dateA = parseDate(a.date_submitted || a.created_at);
      const dateB = parseDate(b.date_submitted || b.created_at);
      const timeA = dateA ? dateA.getTime() : 0;
      const timeB = dateB ? dateB.getTime() : 0;
      return timeB - timeA;
    });

    setAllFeedback(combined);
  }, [deptFeedback, websiteFeedback, feedbackType, userDepartment, userRole, department, selectedDept]);

  const isHelpfulRating = (isHelpful: boolean | number | undefined) => !!isHelpful;

  // Show ALL feedback, not just those with comments
  const feedbackToDisplay = allFeedback;

  // Calculate metrics based on feedback type
  let filtered: any[] = [];
  
  if (feedbackType === "all" || feedbackType === "department") {
    // For department feedback or all feedback
    filtered = deptFeedback;
    
    // If a specific department is requested, filter metrics to that department only
    if (department) {
      const normalizedRequestedDept = normalizeDept(department);
      filtered = deptFeedback.filter(f => {
        const normalizedFeedbackDept = normalizeDept(f.department);
        return normalizedFeedbackDept === normalizedRequestedDept;
      });
    } else if (selectedDept !== "all") {
      // Filter metrics by selected department from dropdown
      const normalizedSelectedDept = normalizeDept(selectedDept);
      filtered = deptFeedback.filter(f => {
        const normalizedFeedbackDept = normalizeDept(f.department);
        return normalizedFeedbackDept === normalizedSelectedDept;
      });
    } else {
      // Filter accounting feedback based on user access (only in admin/multi-dept view)
      if (!canAccessAccountingFeedback()) {
        filtered = deptFeedback.filter(f => !isAccountingDept(f.department));
      }
    }
  }

  const helpfulCount = filtered.filter((r) => isHelpfulRating(r.is_helpful)).length;
  const notHelpfulCount = filtered.length - helpfulCount;
  const helpData = [
    { name: "Helpful", value: helpfulCount, color: "#22c55e" },
    { name: "Not Helpful", value: notHelpfulCount, color: "#a8e6c1" },
  ];



  const selectedDeptName = selectedDept === "all"
    ? "All Departments"
    : departments.find((d) => d.id === selectedDept)?.name || "";

  // For department-specific views, use simplified department names
  const getDisplayDeptName = (deptName: string) => {
    if (deptName === "Accounting Office") return "ACCOUNTING";
    if (deptName === "Scholarship Office") return "SCHOLARSHIP";
    return deptName.toUpperCase();
  };

  const feedbackHeader = feedbackType === "website"
    ? "Website feedback"
    : selectedDept === "all"
      ? "Department feedback"
      : `${getDisplayDeptName(selectedDeptName)} feedback`;
  const showTypeColumn = !department && userRole?.toLowerCase() !== "staff";
  const showDepartmentColumn = showTypeColumn && feedbackType !== "website";

  return (
    <div className="space-y-6 pt-4">
      {/* Access Restriction Message */}
      {!canAccessAccountingFeedback() && selectedDept !== "all" && isAccountingDept(selectedDept) && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
          <p className="font-semibold">🔒 Access Restricted</p>
          <p className="text-sm">You don't have permission to view Accounting Department feedback. Only Accounting staff can access this data.</p>
        </div>
      )}

      <div>
        <h2 className="text-xl font-bold text-foreground">Review Analytic</h2>
        <p className="text-sm text-muted-foreground">{feedbackHeader}</p>
        {feedbackType === "website" && (
          <p className="text-sm text-muted-foreground">Website feedback</p>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        {/* Feedback type filter - only for admins */}
        {userRole?.toLowerCase() !== "staff" && (
          <Select value={feedbackType} onValueChange={(v: any) => setFeedbackType(v)}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Select Feedback Type" />
            </SelectTrigger>
            <SelectContent>
              {!department && <SelectItem value="all">All Feedback</SelectItem>}
              <SelectItem value="department">Department Feedback</SelectItem>
              <SelectItem value="website">Website Feedback</SelectItem>
            </SelectContent>
          </Select>
        )}

        {/* Department filter (only for admins, not for staff) */}
        {!department && userRole?.toLowerCase() !== "staff" && (
          <Select value={selectedDept} onValueChange={setSelectedDept}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Select Office to View Reviews" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {departments.slice(1).map((d) => {
                // Hide accounting options if user is not from accounting
                if (isAccountingDept(d.id) && !canAccessAccountingFeedback()) {
                  return null;
                }
                return (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Chart - show for department feedback */}
      {(feedbackType === "all" || feedbackType === "department") && (
        <div>
          <h3 className="text-center font-semibold text-foreground mb-4">
            {selectedDept === "all" ? "DEPARTMENT FEEDBACK" : `${selectedDeptName.toUpperCase()} FEEDBACK`} (Helpful vs Not Helpful)
          </h3>
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

      {/* Website Feedback Chart - show only when website/all filter is active */}
      {userRole?.toLowerCase() !== "staff" && (feedbackType === "all" || feedbackType === "website") && (() => {
        const websiteHelpData = [
          { name: "Helpful", value: websiteFeedback.filter(f => f.is_helpful).length, color: "#22c55e" },
          { name: "Not Helpful", value: websiteFeedback.filter(f => !f.is_helpful).length, color: "#ea580c" },
        ];
        return (
          <div>
            <h3 className="text-center font-semibold text-foreground mb-4">
              WEBSITE FEEDBACK (Helpful vs Not Helpful)
            </h3>
            <div className="text-center text-sm text-muted-foreground mb-2">
              {websiteFeedback.length === 0
                ? "No website feedback yet."
                : `${websiteHelpData[0].value} helpful, ${websiteHelpData[1].value} not helpful (${websiteFeedback.length} total)`}
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={websiteHelpData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis label={{ value: "Count", angle: -90, position: "insideLeft" }} />
                  <Tooltip />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {websiteHelpData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        );
      })()}



      {/* Feedback table - show all feedback based on permissions */}
      <div>
        <h3 className="font-semibold text-foreground mb-3">
          {userRole?.toLowerCase() === "staff"
            ? `${getDisplayDeptName(userDepartment || "Your")} Department Feedback Details (${feedbackToDisplay.length})`
            : feedbackType === "website" 
              ? `Website Feedback Details (${feedbackToDisplay.length})`
              : selectedDept === "all" 
                ? `Feedback Details (${feedbackToDisplay.length})`
                : `${getDisplayDeptName(selectedDeptName)} Feedback Details (${feedbackToDisplay.length})`
          }
        </h3>
        <div className="rounded-xl border bg-card overflow-x-auto">
          <Table className="min-w-[900px] table-fixed">
            <colgroup>
              {showTypeColumn && <col style={{ width: 120 }} />}
              {showDepartmentColumn && <col style={{ width: 200 }} />}
              <col style={{ width: 150 }} />
              <col style={{ width: 360 }} />
              <col style={{ width: 180 }} />
            </colgroup>
            <TableHeader>
              <TableRow className="bg-muted/50">
                {showTypeColumn && <TableHead className="font-bold min-w-[120px] w-[120px] px-3 whitespace-nowrap">Type</TableHead>}
                {showDepartmentColumn && <TableHead className="font-bold min-w-[200px] w-[200px] px-3 whitespace-nowrap">Department</TableHead>}
                <TableHead className="font-bold min-w-[150px] w-[150px] px-3 whitespace-nowrap">Feedback</TableHead>
                <TableHead className="font-bold min-w-[360px] w-[360px] px-3 whitespace-nowrap">Comment</TableHead>
                <TableHead className="font-bold min-w-[180px] w-[180px] px-3 whitespace-nowrap text-right">Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {feedbackToDisplay.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={showDepartmentColumn ? 5 : showTypeColumn ? 4 : 3} className="text-center text-muted-foreground py-6">No feedback yet.</TableCell>
                </TableRow>
              ) : (
                feedbackToDisplay.map((f, idx) => {
                  const helpful = f.type === "website" ? f.is_helpful : !!f.is_helpful;
                  return (
                    <TableRow key={`${f.type}-${f.id || idx}`}>
                      {showTypeColumn && (
                        <TableCell className="w-[120px] align-top">
                          <Badge variant={f.type === "website" ? "secondary" : "default"}>
                            {f.type === "website" ? "Website" : "Department"}
                          </Badge>
                        </TableCell>
                      )}
                      {showDepartmentColumn && (
                        <TableCell className="w-[200px] align-top">
                          {f.type === "website" ? "—" : f.department || "N/A"}
                        </TableCell>
                      )}
                      <TableCell className="w-[150px] align-top">
                        <Badge className={helpful ? "bg-green-200 text-green-800" : "bg-orange-100 text-orange-700"}>
                          {helpful ? "Helpful" : "Not Helpful"}
                        </Badge>
                      </TableCell>
                      <TableCell className="w-[360px] align-top whitespace-normal break-words">{f.comment || "—"}</TableCell>
                      <TableCell className="w-[180px] text-sm text-muted-foreground align-top text-right">
                        {formatDateSafe(f.date_submitted, f.created_at)}
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
