import { useState, useEffect } from "react";
import { StatusBadge } from "../../components/StatusBadge";
import { Button } from "../../components/ui/button";
import { Download, CalendarCheck, Loader2 } from "lucide-react";
import { getSocket } from "../../store/socket";

export function AttendanceHistory() {
  const [attendance, setAttendance] = useState([]);
  const [totalLectures, setTotalLectures] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAttendance = async () => {
      try {
        const token = localStorage.getItem("edusync_token");
        if (!token) return;
        
        // Decode student id from token payload
        const payload = JSON.parse(atob(token.split(".")[1]));
        const studentId = payload.id;
        if (!studentId) return;

        const res = await fetch(`http://localhost:3000/attendance/student/${studentId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setAttendance(data.records || []);
          setTotalLectures(data.totalLectures || 0);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchAttendance();

    let socket = getSocket();
    const setupListener = (s) => {
      s.on("session:ended", fetchAttendance);
      return () => s.off("session:ended", fetchAttendance);
    };

    let cleanup = null;
    if (socket) {
      cleanup = setupListener(socket);
    } else {
      const interval = setInterval(() => {
        const s = getSocket();
        if (s) {
          clearInterval(interval);
          cleanup = setupListener(s);
        }
      }, 200);
      return () => {
        clearInterval(interval);
        if (cleanup) cleanup();
      };
    }

    return () => {
      if (cleanup) cleanup();
    };
  }, []);

  const stats = {
    total: totalLectures,
    present: attendance.filter((a) => a.status === "present").length,
    absent: Math.max(0, totalLectures - attendance.filter((a) => a.status === "present").length),
    rate:
      totalLectures > 0
        ? (
            (attendance.filter((a) => a.status === "present").length /
              totalLectures) *
            100
          ).toFixed(1)
        : "0.0",
  };

  const handleDownloadPDF = () => {
    // Generate simple print/save layout
    window.print();
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="w-8 h-8 text-accent-info animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary mb-1">
            Attendance History
          </h1>
          <p className="text-text-secondary">Your session attendance record</p>
        </div>
        {attendance.length > 0 && (
          <Button onClick={handleDownloadPDF} variant="outline">
            <Download className="w-4 h-4 mr-2" />
            Print Report
          </Button>
        )}
      </div>

      {attendance.length > 0 ? (
        <>
          {/* Summary Stats */}
          <div className="p-6 bg-bg-surface border border-border rounded-lg">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div className="text-center">
                <div className="text-3xl font-mono font-semibold text-text-primary mb-1">
                  {stats.total}
                </div>
                <div className="text-xs text-text-secondary uppercase tracking-wider">
                  Total Sessions
                </div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-mono font-semibold text-accent-success mb-1">
                  {stats.present}
                </div>
                <div className="text-xs text-text-secondary uppercase tracking-wider">
                  Present
                </div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-mono font-semibold text-accent-critical mb-1">
                  {stats.absent}
                </div>
                <div className="text-xs text-text-secondary uppercase tracking-wider">
                  Absent
                </div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-mono font-semibold text-accent-info mb-1">
                  {stats.rate}%
                </div>
                <div className="text-xs text-text-secondary uppercase tracking-wider">
                  Attendance Rate
                </div>
              </div>
            </div>
          </div>

          {/* Attendance Table */}
          <div className="bg-bg-surface border border-border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-bg-elevated">
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                    Session Date
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                    Session Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {attendance.map((record) => (
                  <tr
                    key={record.id}
                    className="hover:bg-bg-elevated transition-colors"
                  >
                    <td className="px-4 py-3 text-sm text-text-primary">
                      {new Date(record.started_at).toLocaleDateString(undefined, {
                        weekday: 'short',
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </td>
                    <td className="px-4 py-3 text-sm text-text-secondary">
                      {record.lecture_name}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={record.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="p-8 bg-bg-surface border border-border rounded-lg flex flex-col items-center justify-center gap-3 py-16">
          <CalendarCheck className="w-12 h-12 text-text-muted" />
          <h3 className="text-base font-medium text-text-primary">
            No attendance history
          </h3>
          <p className="text-sm text-text-secondary">
            You haven't attended any lab sessions yet.
          </p>
        </div>
      )}
    </div>
  );
}
