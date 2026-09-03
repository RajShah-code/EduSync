import { API_BASE_URL } from "../../config/api.js";
import { useState, useEffect } from "react";
import { useOutletContext } from "react-router";
import { StudentTile } from "../../components/StudentTile";
import { StatusBadge } from "../../components/StatusBadge";
import { WaitingRoomBadge } from "../../components/WaitingRoomBadge";
import {
  IconLayoutGrid as LayoutGrid,
  IconBinoculars as Monitor,
  IconEyeCheck as EyeCheck,
  IconEyeX as EyeX,
  IconUsers as Users,
} from "@tabler/icons-react";
import { getSocket } from "../../store/socket";
import { Button } from "../../components/ui/button";
import { deriveConnectionStatus } from "../../utils/statusHelper";
import { useTimeFormat } from "../../utils/timeFormat";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../../components/ui/dialog";
import "./StudentMonitor.css";

export function StudentMonitor() {
  const { sessionInfo, pendingRejoins, handleApproveRejoin, handleDenyRejoin } = useOutletContext();
  const { formatTimeOfDay } = useTimeFormat();
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState("all");
  const [selectedStudent, setSelectedStudent] = useState(null);

  const fetchStudents = async () => {
    if (!sessionInfo) return;
    setLoading(true);
    try {
      const token = localStorage.getItem("edusync_token");
      const res = await fetch(`${API_BASE_URL}/sessions/${sessionInfo.id}/students`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setStudents(data.students || []);
        setError(false);
      } else {
        setError(true);
      }
    } catch (err) {
      console.error("Failed to fetch students:", err);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!sessionInfo) {
      setStudents([]);
      return;
    }

    fetchStudents();

    let socket = getSocket();
    const setupListener = (s) => {
      const handleUpdate = (payload) => {
        if (payload.session_id === sessionInfo.id) {
          setStudents(payload.students || []);
        }
      };
      s.on("teacher:student_status_update", handleUpdate);
      return () => s.off("teacher:student_status_update", handleUpdate);
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
  }, [sessionInfo]);

  const filteredStudents = students.filter((student) => {
    if (filter === "all") return true;
    const status = deriveConnectionStatus(student, { useActive: true });
    return status === filter;
  });

  const stats = {
    all: students.length,
    active: students.filter((s) => deriveConnectionStatus(s, { useActive: true }) === "active").length,
    idle: students.filter((s) => deriveConnectionStatus(s, { useActive: true }) === "idle").length,
  };

  if (!sessionInfo) {
    return (
      <div className="sm-page">
        <div className="sm-state sm-state--fill">
          <Monitor />
          <h2 className="sm-state__title">No active session</h2>
          <p className="sm-state__text">
            Start a broadcast session first to monitor student activity.
          </p>
        </div>
      </div>
    );
  }

  const waitingStudents = (pendingRejoins || []).filter(
    (r) => r.session_id === sessionInfo.id
  );

  const segments = [
    { key: "all", label: "All", count: stats.all, Icon: LayoutGrid },
    { key: "active", label: "Viewing", count: stats.active, Icon: EyeCheck },
    { key: "idle", label: "Not Viewing", count: stats.idle, Icon: EyeX },
  ];

  return (
    <div className="sm-page">
      {/* Header — title on the left; count chips + filter segments on the
          right, over a single hairline divider (no panel of its own). */}
      <header className="sm-header">
        <h1 className="sm-title">
          <Monitor />
          Student monitor
        </h1>

        <div className="sm-controls">
          <WaitingRoomBadge
            className="sm-waitroom"
            pendingRejoins={waitingStudents}
            onApprove={handleApproveRejoin}
            onDeny={handleDenyRejoin}
            align="right"
          />

          <div className="sm-counts">
            <span className="sm-chip" title="Not viewing">
              <Users />
              {String(stats.idle).padStart(2, "0")}
            </span>
          </div>

          <div className="sm-filters" role="group" aria-label="Filter students">
            {segments.map(({ key, label, count, Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                aria-pressed={filter === key}
                className={`sm-seg${filter === key ? " is-active" : ""}`}
              >
                <Icon />
                {label}
                <span className="sm-seg__div">|</span>
                <span className="sm-seg__count">{String(count).padStart(2, "0")}</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="sm-scroll">
        {loading ? (
          <div className="sm-grid">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="sm-skeleton" />
            ))}
          </div>
        ) : error ? (
          <div className="sm-state">
            <p className="sm-state__text">Couldn&apos;t load the student roster.</p>
            <button type="button" onClick={fetchStudents} className="sm-retry">
              Try again
            </button>
          </div>
        ) : students.length === 0 ? (
          <div className="sm-state sm-state--fill">
            <Monitor />
            <p className="sm-state__title">No students connected yet</p>
            <p className="sm-state__text">
              Students will appear here once they join your session.
            </p>
          </div>
        ) : (
          <div className="sm-grid">
            {filteredStudents.map((student) => {
              const tileStudent = {
                id: student.student_id,
                name: student.student_name,
                rollNo: student.roll_no,
                status: deriveConnectionStatus(student, { useActive: true }),
                joinedAt: student.joined_at,
                lastExitAt: student.last_exit_at,
                violations: student.fullscreen_exit_count,
              };
              return (
                <StudentTile
                  key={student.student_id}
                  student={tileStudent}
                  onClick={() => setSelectedStudent(student)}
                />
              );
            })}

            {filteredStudents.length === 0 && students.length > 0 && (
              <div className="sm-empty-filter">No students match the active filter</div>
            )}
          </div>
        )}
      </div>

      {/* Student Detail Modal */}
      <Dialog
        open={!!selectedStudent}
        onOpenChange={(open) => {
          if (!open) setSelectedStudent(null);
        }}
      >
        <DialogContent className="bg-bg-surface border-border text-text-primary sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-text-primary">
              Student Details
            </DialogTitle>
          </DialogHeader>
          {selectedStudent && (
            <div className="space-y-4 my-2 text-sm">
              <div className="space-y-2.5 p-4 bg-bg-base border border-border rounded-[var(--radius-md)]">
                <div className="flex justify-between items-center">
                  <span className="text-text-secondary font-medium">Name:</span>
                  <span className="font-semibold text-text-primary">
                    {selectedStudent.student_name}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-text-secondary font-medium">Status:</span>
                  <StatusBadge
                    status={deriveConnectionStatus(selectedStudent, { useActive: true })}
                    className="[&>span:first-child]:hidden"
                  />
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-text-secondary font-medium">Joined:</span>
                  <span className="tnum text-text-primary text-xs">
                    {formatTimeOfDay(selectedStudent.joined_at, { seconds: true })}{" "}
                    ({Math.max(
                      0,
                      Math.round(
                        (new Date(selectedStudent.joined_at) -
                          new Date(sessionInfo.started_at)) /
                          60000
                      )
                    )}{" "}
                    mins into session)
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-text-secondary font-medium">
                    Fullscreen Exits:
                  </span>
                  <span className="font-semibold text-text-primary text-sm">
                    {selectedStudent.fullscreen_exit_count}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-text-secondary font-medium">
                    Last Exit:
                  </span>
                  <span className="tnum text-text-primary text-xs">
                    {selectedStudent.last_exit_at
                      ? formatTimeOfDay(selectedStudent.last_exit_at, { seconds: true })
                      : "Never"}
                  </span>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              onClick={() => setSelectedStudent(null)}
              className="bg-accent-info hover:bg-accent-info/90 text-white font-medium"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
