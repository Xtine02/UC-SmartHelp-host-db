import { useEffect, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Activity, Clock } from "lucide-react";

interface AuditEntry {
  id: string;
  action: string;
  entity_type?: string;
  entity_id?: string;
  details?: string;
  ip_address?: string;
  created_at: string;
}

interface AuditTrailProps {
  userId: string;
}

const AuditTrail = ({ userId }: AuditTrailProps) => {
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAuditTrail = async () => {
      try {
        const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
        const response = await fetch(`${API_URL}/api/audit-trail/${userId}?limit=20`);
        if (response.ok) {
          const data = await response.json();
          setAuditEntries(data);
        }
      } catch (error) {
        console.error("Error fetching audit trail:", error);
      } finally {
        setLoading(false);
      }
    };

    if (userId) {
      fetchAuditTrail();
    }
  }, [userId]);

  const getActionColor = (action: string) => {
    if (action.toLowerCase().includes('login')) return 'bg-green-100 text-green-800';
    if (action.toLowerCase().includes('logout')) return 'bg-red-100 text-red-800';
    if (action.toLowerCase().includes('forward')) return 'bg-blue-100 text-blue-800';
    if (action.toLowerCase().includes('update') || action.toLowerCase().includes('change')) return 'bg-yellow-100 text-yellow-800';
    return 'bg-gray-100 text-gray-800';
  };

  const getEntityTypeColor = (entityType?: string) => {
    if (!entityType) return 'bg-gray-100 text-gray-600';
    if (entityType === 'user') return 'bg-purple-100 text-purple-800';
    if (entityType === 'ticket') return 'bg-orange-100 text-orange-800';
    return 'bg-blue-100 text-blue-800';
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-lg font-semibold text-foreground">Activity History</h3>
        </div>
        <div className="flex items-center justify-center py-8">
          <div className="text-muted-foreground">Loading activity...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Activity className="h-5 w-5 text-muted-foreground" />
        <h3 className="text-lg font-semibold text-foreground">Activity History</h3>
        <Badge variant="secondary" className="text-xs">
          {auditEntries.length} entries
        </Badge>
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        <Table>
          <TableHead>
            <TableRow className="bg-muted/50">
              <TableHead className="font-bold">Action</TableHead>
              <TableHead className="font-bold">Entity</TableHead>
              <TableHead className="font-bold">Details</TableHead>
              <TableHead className="font-bold">Time</TableHead>
            </TableRow>
          </TableHead>
          <TableBody>
            {auditEntries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                  <div className="flex flex-col items-center gap-2">
                    <Clock className="h-8 w-8 text-muted-foreground/50" />
                    <span>No activity recorded yet</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              auditEntries.map((entry) => (
                <TableRow key={entry.id} className="hover:bg-muted/20">
                  <TableCell>
                    <Badge className={`${getActionColor(entry.action)} border-0 font-medium`}>
                      {entry.action}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {entry.entity_type && entry.entity_id ? (
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={`${getEntityTypeColor(entry.entity_type)} text-xs`}>
                          {entry.entity_type}
                        </Badge>
                        <span className="text-sm font-mono text-muted-foreground">
                          #{entry.entity_id}
                        </span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-xs">
                    <span className="text-sm">{entry.details || "—"}</span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(entry.created_at), "MMM dd, yyyy HH:mm")}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {auditEntries.length > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          Showing last 20 activities. Contact admin for full audit trail.
        </p>
      )}
    </div>
  );
};

export default AuditTrail;