import { API_BASE_URL } from "../../config/api.js";
import { useState, useEffect } from "react";
import { StatusBadge } from "../../components/StatusBadge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { Button } from "../../components/ui/button";
import { IconDownload as Download, IconCalendarCheck as CalendarCheck, IconAlertTriangle as AlertTriangle, IconCheck as Check, IconX as X, IconLoader2 as Loader2 } from "@tabler/icons-react";
import { Skeleton } from "../../components/ui/skeleton";
import PageShell from "../../components/PageShell";
import { formatTimeOfDay } from "../../utils/timeFormat";

const formatDuration = (secs) => {
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remainingSecs = secs % 60;
  return remainingSecs > 0 ? `${mins}m ${remainingSecs}s` : `${mins}m`;
};

const formatTime = (ts) => {
  if (!ts) return "—";
  return formatTimeOfDay(ts);
};

export function Attendance() {
  const [sessions, setSessions] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [attendance, setAttendance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);

  useEffect(() => {
    const fetchSessions = async () => {
      try {
        const token = localStorage.getItem("edusync_token");
        const res = await fetch(`${API_BASE_URL}/sessions/my-sessions`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setSessions(data.sessions || []);
          if (data.sessions && data.sessions.length > 0) {
            setSelectedSessionId(data.sessions[0].id.toString());
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchSessions();
  }, []);

  useEffect(() => {
    if (!selectedSessionId) return;
    const fetchAttendance = async () => {
      try {
        const token = localStorage.getItem("edusync_token");
        const res = await fetch(`${API_BASE_URL}/attendance/session/${selectedSessionId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setAttendance(data || []);
        }
      } catch (err) {
        console.error(err);
      }
    };
    fetchAttendance();
  }, [selectedSessionId]);

  const handleDecide = async (attendanceId, decision) => {
    setActionLoading(attendanceId);
    try {
      const token = localStorage.getItem("edusync_token");
      const res = await fetch(`${API_BASE_URL}/attendance/${attendanceId}/decide`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ decision }),
      });
      if (res.ok) {
        setAttendance((prev) =>
          prev.map((a) =>
            a.id === attendanceId
              ? {
                  ...a,
                  status: decision === "approved" ? "present" : "absent",
                  teacher_decision: decision,
                  decided_at: new Date().toISOString(),
                }
              : a
          )
        );
      }
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleExportCSV = () => {
    if (attendance.length === 0) return;
    const headers = ["Student Name", "Joined At", "Left At", "Present Seconds", "Fullscreen Exits", "Presence Percentage", "Status", "Teacher Decision"];
    const rows = attendance.map((a) => [
      a.student_name,
      a.joined_at,
      a.left_at || "—",
      a.total_present_seconds,
      a.fullscreen_exit_count,
      (a.presence_percentage * 100).toFixed(0) + "%",
      a.status,
      a.teacher_decision || "pending review",
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((r) => r.map((val) => `"${val}"`).join(","))].join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    const session = sessions.find((s) => s.id.toString() === selectedSessionId);
    const filename = `attendance_${session ? session.lecture_name.replace(/\s+/g, "_") : "session"}.csv`;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const selectedSession = sessions.find((s) => s.id.toString() === selectedSessionId);

  const getMinutesLate = (joinedAt) => {
    if (!selectedSession || !joinedAt) return 0;
    const sessionStart = new Date(selectedSession.started_at);
    const studentJoin = new Date(joinedAt);
    const diffMs = studentJoin - sessionStart;
    return Math.max(0, Math.round(diffMs / 60000));
  };

  const stats = {
    present: attendance.filter((a) => a.status === "present").length,
    absent: attendance.filter((a) => a.status === "absent").length,
  };

  if (loading) {
    return (
      <PageShell>
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div>
            <Skeleton className="h-7 w-56" />
          </div>
        </div>
        <div className="p-4 bg-bg-surface border border-border rounded-lg">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-4 w-14" />
              <Skeleton className="h-9 w-64" />
            </div>
            <div className="flex items-center gap-6">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-20" />
            </div>
          </div>
        </div>
        <div className="space-y-3">
          <Skeleton className="h-4 w-40" />
          <div className="bg-bg-surface border border-border rounded-lg overflow-hidden">
            <div className="divide-y divide-border">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-4 px-4 py-3">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-10" />
                  <Skeleton className="h-4 w-10" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div>
          <h1 className="text-[length:var(--text-xl)] font-semibold text-text-primary tracking-tight">
            Attendance Manager
          </h1>
        </div>
        {attendance.length > 0 && (
          <Button onClick={handleExportCSV} variant="outline">
            <Download className="w-[18px] h-[18px] mr-2" />
            Export CSV
          </Button>
        )}
      </div>

      {sessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <CalendarCheck className="w-14 h-14 text-text-muted" />
          <p className="text-base font-medium text-text-primary">
            No attendance records yet
          </p>
          <p className="text-sm text-text-muted text-center max-w-sm">
            Records will be generated automatically as soon as a student joins your session and you end the broadcast.
          </p>
        </div>
      ) : (
        <>
          {/* Session Selector & Stats */}
          <div className="p-4 bg-bg-surface border border-border rounded-lg">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <label className="text-sm text-text-secondary">Session:</label>
                <Select
                  value={selectedSessionId}
                  onValueChange={(val) => setSelectedSessionId(val)}
                >
                  <SelectTrigger className="w-64 bg-bg-base border-border text-text-primary">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {sessions.map((session) => (
                      <SelectItem key={session.id} value={session.id.toString()}>
                        {session.lecture_name} ({new Date(session.started_at).toLocaleDateString()})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-6 tnum text-sm">
                <div>
                  <span className="text-accent-success">PRESENT: </span>
                  <span className="text-accent-success font-semibold">
                    {stats.present}
                  </span>
                </div>
                <div className="h-4 w-px bg-border" />
                <div>
                  <span className="text-accent-critical">ABSENT: </span>
                  <span className="text-accent-critical font-semibold">
                    {stats.absent}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Attendance Table */}
          <div className="space-y-3">
            <h2 className="text-md font-semibold text-text-primary">Attendance Records</h2>
            <div className="bg-bg-surface border border-border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-bg-elevated">
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                      Student Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                      Join Time
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                      Leave Time
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                      Active Duration
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                      Exits
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                      Rate
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {attendance.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="px-4 py-8 text-center text-sm text-text-muted italic">
                        No students joined this session.
                      </td>
                    </tr>
                  ) : (
                    attendance.map((record) => (
                      <tr
                        key={record.id}
                        className="hover:bg-bg-elevated transition-colors"
                      >
                        <td className="px-4 py-3 text-sm text-text-primary font-medium">
                          {record.student_name}
                        </td>
                        <td className="px-4 py-3 text-sm tnum text-text-secondary">
                          {formatTime(record.joined_at)}
                        </td>
                        <td className="px-4 py-3 text-sm tnum text-text-secondary">
                          {record.left_at ? formatTime(record.left_at) : "—"}
                        </td>
                        <td className="px-4 py-3 text-sm tnum text-text-primary">
                          {formatDuration(record.total_present_seconds)}
                        </td>
                        <td className="px-4 py-3 text-sm tnum text-text-secondary">
                          {record.fullscreen_exit_count}
                        </td>
                        <td className="px-4 py-3 text-sm tnum text-text-secondary">
                          {(record.presence_percentage * 100).toFixed(0)}%
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={record.status} />
                        </td>
                        <td className="px-4 py-3">
                          {record.status === "absent" ? (
                            <Button
                              size="sm"
                              onClick={() => handleDecide(record.id, "approved")}
                              disabled={actionLoading === record.id}
                              className="px-2.5 bg-accent-success/15 hover:bg-accent-success/25 text-accent-success border border-accent-success/30 font-semibold text-xs h-7 flex items-center gap-1"
                            >
                              {actionLoading === record.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Check className="w-4 h-4 mr-1" />
                              )}
                              Mark Present
                            </Button>
                          ) : (
                            <span className="text-text-muted text-xs italic">—</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              </div>
            </div>
          </div>
        </>
      )}
    </PageShell>
  );
}
