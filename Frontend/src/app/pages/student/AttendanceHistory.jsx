import { API_BASE_URL } from "../../config/api.js";
import { useState, useEffect } from "react";
import { StatusBadge } from "../../components/StatusBadge";
import { CalendarCheck, Loader2, Filter } from "lucide-react";
import { getSocket } from "../../store/socket";

export function AttendanceHistory() {
  const [attendance, setAttendance] = useState([]);
  const [totalLectures, setTotalLectures] = useState(0);
  const [loading, setLoading] = useState(true);

  // Filter States
  const [selectedSubject, setSelectedSubject] = useState("");
  const [selectedTeacher, setSelectedTeacher] = useState("");

  useEffect(() => {
    const fetchAttendance = async () => {
      try {
        const token = localStorage.getItem("edusync_token");
        if (!token) return;
        
        // Decode student id from token payload
        const payload = JSON.parse(atob(token.split(".")[1]));
        const studentId = payload.id;
        if (!studentId) return;

        const res = await fetch(`${API_BASE_URL}/attendance/student/${studentId}`, {
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

  // Derive unique Subjects and Teachers from fetched records
  const subjects = [...new Set(attendance.map((a) => a.subject).filter(Boolean))].sort();
  const teachers = [...new Set(attendance.map((a) => a.teacher_name).filter(Boolean))].sort();

  // Client-side filtering
  const filteredAttendance = attendance.filter((a) => {
    if (selectedSubject && a.subject !== selectedSubject) return false;
    if (selectedTeacher && a.teacher_name !== selectedTeacher) return false;
    return true;
  });

  // Dynamic stats derived from the filtered set
  const isFiltered = Boolean(selectedSubject || selectedTeacher);
  const totalCount = isFiltered ? filteredAttendance.length : totalLectures;
  const presentCount = filteredAttendance.filter((a) => a.status === "present").length;
  const absentCount = Math.max(0, totalCount - presentCount);
  const attendanceRate =
    totalCount > 0 ? ((presentCount / totalCount) * 100).toFixed(1) : "0.0";

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
      <div>
        <h1 className="text-2xl font-semibold text-text-primary mb-1">
          Attendance History
        </h1>
        <p className="text-text-secondary">Your session attendance record</p>
      </div>

      {attendance.length > 0 ? (
        <>
          {/* Summary Stats */}
          <div className="p-6 bg-bg-surface border border-border rounded-lg shadow-[var(--shadow-card)]">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div className="text-center">
                <div className="text-3xl font-mono font-semibold text-text-primary mb-1">
                  {totalCount}
                </div>
                <div className="text-xs text-text-secondary uppercase tracking-wider">
                  Total Sessions
                </div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-mono font-semibold text-accent-success mb-1">
                  {presentCount}
                </div>
                <div className="text-xs text-text-secondary uppercase tracking-wider">
                  Present
                </div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-mono font-semibold text-accent-critical mb-1">
                  {absentCount}
                </div>
                <div className="text-xs text-text-secondary uppercase tracking-wider">
                  Absent
                </div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-mono font-semibold text-accent-info mb-1">
                  {attendanceRate}%
                </div>
                <div className="text-xs text-text-secondary uppercase tracking-wider">
                  Attendance Rate
                </div>
              </div>
            </div>
          </div>

          {/* Filter Dropdowns Bar */}
          <div className="flex items-center justify-between gap-4 flex-wrap p-4 bg-bg-surface border border-border rounded-lg shadow-[var(--shadow-card)]">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-text-muted shrink-0" />
                <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  Filters:
                </span>
              </div>

              {/* Subject Filter */}
              <div className="flex items-center gap-2">
                <label htmlFor="subject-filter" className="text-xs font-medium text-text-secondary">
                  Subject
                </label>
                <select
                  id="subject-filter"
                  value={selectedSubject}
                  onChange={(e) => setSelectedSubject(e.target.value)}
                  className="bg-bg-base border border-border text-text-primary text-xs rounded-md px-3 py-1.5 focus:outline-none focus:border-accent-info"
                >
                  <option value="">All Subjects ({subjects.length})</option>
                  {subjects.map((subj) => (
                    <option key={subj} value={subj}>
                      {subj}
                    </option>
                  ))}
                </select>
              </div>

              {/* Teacher Filter */}
              <div className="flex items-center gap-2">
                <label htmlFor="teacher-filter" className="text-xs font-medium text-text-secondary">
                  Teacher
                </label>
                <select
                  id="teacher-filter"
                  value={selectedTeacher}
                  onChange={(e) => setSelectedTeacher(e.target.value)}
                  className="bg-bg-base border border-border text-text-primary text-xs rounded-md px-3 py-1.5 focus:outline-none focus:border-accent-info"
                >
                  <option value="">All Teachers ({teachers.length})</option>
                  {teachers.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {isFiltered && (
              <button
                onClick={() => {
                  setSelectedSubject("");
                  setSelectedTeacher("");
                }}
                className="text-xs text-accent-info hover:underline font-medium"
              >
                Reset Filters
              </button>
            )}
          </div>

          {/* Attendance Table */}
          <div className="bg-bg-surface border border-border rounded-lg overflow-hidden shadow-[var(--shadow-card)]">
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
                    Subject
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                    Teacher
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredAttendance.length > 0 ? (
                  filteredAttendance.map((record) => (
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
                      <td className="px-4 py-3 text-sm text-text-primary font-medium">
                        {record.lecture_name}
                      </td>
                      <td className="px-4 py-3 text-sm text-text-secondary">
                        {record.subject || "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-text-secondary">
                        {record.teacher_name || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={record.status} />
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-xs text-text-secondary">
                      No attendance records match the selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="p-8 bg-bg-surface border border-border rounded-lg flex flex-col items-center justify-center gap-3 py-16 shadow-[var(--shadow-card)]">
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
