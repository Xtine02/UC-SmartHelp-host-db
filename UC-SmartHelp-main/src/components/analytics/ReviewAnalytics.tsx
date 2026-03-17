import { useEffect, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList } from "recharts";

const ReviewAnalytics = () => {
  const [reviews, setReviews] = useState<any[]>([]);
  const [comments, setComments] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [selectedDept, setSelectedDept] = useState<string>("all");

  useEffect(() => {
    const fetchData = async () => {
      try {
        const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
        const response = await fetch(`${API_URL}/api/department-feedback`);
        const data = await response.json();
        setReviews(data);
        setComments(data.filter((r: any) => r.comment));
      } catch (error) {
        console.error("Error fetching department feedback:", error);
      }

      // Static department list to match the UI in other places
      setDepartments([
        { id: "all", name: "All Departments" },
        { id: "Accounting", name: "Accounting" },
        { id: "Scholarship", name: "Scholarship" },
        { id: "Registrar's Office", name: "Registrar's Office" },
        { id: "Clinic", name: "Clinic" },
        { id: "CCS Office", name: "CCS Office" },
        { id: "Cashier's Office", name: "Cashier's Office" },
        { id: "SAO", name: "SAO" },
      ]);
    };
    fetchData();
  }, []);

  const filtered = selectedDept === "all"
    ? reviews
    : reviews.filter((r) => r.department === selectedDept);

  const filteredComments = selectedDept === "all"
    ? comments
    : comments.filter((r) => r.department === selectedDept);

  const ratings = filtered.map((r) => r.rating || 0);
  const averageRating = ratings.length > 0 ? ratings.reduce((sum, value) => sum + value, 0) / ratings.length : 0;
  const ratingCounts = [1, 2, 3, 4, 5].map((value) => ({ name: `${value}★`, value: filtered.filter((r) => r.rating === value).length }));

  const chartData = [
    { name: "Helpful", value: helpful },
    { name: "Not Helpful", value: notHelpful },
  ];

  const selectedDeptName = selectedDept === "all"
    ? "All Departments"
    : departments.find((d) => d.id === selectedDept)?.name || "";

  return (
    <div className="space-y-6 pt-4">
      <div>
        <h2 className="text-xl font-bold text-foreground">Review Analytic</h2>
        {selectedDept !== "all" && (
          <p className="text-sm text-muted-foreground">This review is only for {selectedDeptName}</p>
        )}
      </div>

      {/* Department filter */}
      <Select value={selectedDept} onValueChange={setSelectedDept}>
        <SelectTrigger className="w-64">
          <SelectValue placeholder="Select Office to View Reviews" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Departments</SelectItem>
          {departments.map((d) => (
            <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Chart */}
      <div>
        <h3 className="text-center font-semibold text-foreground mb-4">USER FEEDBACK</h3>
        <div className="text-center text-sm text-muted-foreground mb-2">
          {filtered.length === 0 ? "No feedback yet." : `Average rating: ${averageRating.toFixed(1)} / 5`}
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={ratingCounts}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis label={{ value: "Count", angle: -90, position: "insideLeft" }} />
              <Tooltip />
              <Bar dataKey="value" radius={[4, 4, 0, 0]} fill="hsl(217, 85%, 45%)">
                <LabelList dataKey="value" position="top" />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Comments table */}
      <div>
        <h3 className="font-semibold text-foreground mb-3">Comments/ Suggestions</h3>
        <div className="rounded-xl border bg-card overflow-hidden">
          <Table>
            <TableBody>
              {filteredComments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={2} className="text-center text-muted-foreground py-6">No comments yet.</TableCell>
                </TableRow>
              ) : (
                filteredComments.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium w-48">
                      {c.profiles?.first_name} {c.profiles?.last_name}
                    </TableCell>
                    <TableCell>{c.comment}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
};

export default ReviewAnalytics;
