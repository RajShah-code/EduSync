import { API_BASE_URL } from "../../config/api.js";
import { useState, useEffect } from "react";
import { useOutletContext } from "react-router";
import { StudentTile } from "../../components/StudentTile";
import { StatusBadge } from "../../components/StatusBadge";
import { WaitingRoomBadge } from "../../components/WaitingRoomBadge";
import { IconLayoutGrid as LayoutGrid, IconBinoculars as Monitor, IconEyeCheck as EyeCheck, IconEyeX as EyeX, IconUsers as Users } from "@tabler/icons-react";
import { getSocket } from "../../store/socket";
import { Button } from "../../components/ui/button";
import { Skeleton } from "../../components/ui/skeleton";
import { deriveConnectionStatus } from "../../utils/statusHelper";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../../components/ui/dialog";

export function StudentMonitor() {
  const { sessionInfo, pendingRejoins, handleApproveRejoin, handleDenyRejoin } = useOutletContext();
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
    offline: 0,
  };

  if (!sessionInfo) {
    return (
      <div className="h-full flex items-center justify-center bg-bg-base">
        <div className="text-center p-8">
          <Monitor className="w-[72px] h-[72px] text-text-muted mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-text-primary mb-1">
            No Active Session
          </h2>
          <p className="text-sm text-text-muted max-w-sm mx-auto">
            Start a broadcast session first to monitor student activity.
          </p>
        </div>
      </div>
    );
  }

  const waitingStudents = (pendingRejoins || []).filter(
    (r) => r.session_id === sessionInfo.id
  );

  return (
    <div className="h-full flex flex-col bg-bg-base">
      {/* Top Bar — binoculars + title on the left; Waiting Room / total
          students / filter pills on the right. No panel background of its
          own — a floating <hr> below it is the only separator, instead of a
          filled/bordered box. */}
      <div className="px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-lg font-semibold text-text-primary flex items-center gap-2">
          <Monitor className="w-5 h-5 text-accent-500" />
          Student monitor
        </h1>

        <div className="flex items-center gap-2.5">
          <WaitingRoomBadge
            pendingRejoins={waitingStudents}
            onApprove={handleApproveRejoin}
            onDeny={handleDenyRejoin}
            align="right"
          />
          <div className="flex items-center gap-1.5 h-[29px] px-2.5 bg-bg-surface rounded-full text-xs text-text-secondary font-medium">
            <Users className="w-4 h-4 text-accent-500" />
            <span className="tnum">{students.length}</span>
          </div>

          {/* Filter segmented control — bordered outline (no fill), 47px
              tall, 16px radius. Only the ACTIVE segment gets its own solid
              highlight pill (#8f5ce1, 30px tall, 9px radius); inactive
              segments sit directly on the transparent strip with no box of
              their own. */}
          <div className="flex items-center gap-1 h-[47px] px-2 rounded-[16px] border border-border">
            <button
              onClick={() => setFilter("all")}
              aria-pressed={filter === "all"}
              className={`flex items-center gap-1.5 h-[30px] px-3 rounded-[9px] text-sm font-semibold transition-colors duration-150 ${
                filter === "all"
                  ? "bg-[#8f5ce1] text-white"
                  : "text-text-secondary"
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
              All <span className="opacity-60">|</span> <span className="tnum">{stats.all}</span>
            </button>
            <button
              onClick={() => setFilter("active")}
              aria-pressed={filter === "active"}
              className={`flex items-center gap-1.5 h-[30px] px-3 rounded-[9px] text-sm font-medium transition-colors duration-150 ${
                filter === "active"
                  ? "bg-[#8f5ce1] text-white"
                  : "text-text-secondary"
              }`}
            >
              <EyeCheck className="w-4 h-4" />
              Viewing <span className="opacity-60">|</span> <span className="tnum">{stats.active}</span>
            </button>
            <button
              onClick={() => setFilter("idle")}
              aria-pressed={filter === "idle"}
              className={`flex items-center gap-1.5 h-[30px] px-3 rounded-[9px] text-sm font-medium transition-colors duration-150 ${
                filter === "idle"
                  ? "bg-[#8f5ce1] text-white"
                  : "text-text-secondary"
              }`}
            >
              <EyeX className="w-4 h-4" />
              Not Viewing <span className="opacity-60">|</span> <span className="tnum">{stats.idle}</span>
            </button>
          </div>
        </div>
      </div>
      <hr className="mx-6 border-t border-border" />

      {/* Student Grid — fixed 4 columns, matching the design. */}
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="grid gap-4 grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[88px] w-full rounded-[var(--radius-lg)]" />
            ))}
          </div>
        ) : error ? (
          <div className="p-8 bg-bg-surface border border-accent-critical/25 rounded-lg flex flex-col items-center justify-center gap-3 py-16">
            <p className="text-sm text-text-secondary">Couldn't load the student roster.</p>
            <button
              type="button"
              onClick={fetchStudents}
              className="px-4 py-2 bg-accent-700 hover:bg-accent-700/90 text-white text-sm font-medium rounded-[var(--radius-md)] transition-[transform,background-color] duration-150 ease-[var(--ease-out-strong)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface"
            >
              Try again
            </button>
          </div>
        ) : students.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 py-16">
            <Monitor className="w-14 h-14 text-text-muted" />
            <p className="text-base font-medium text-text-primary">
              No students connected yet
            </p>
            <p className="text-sm text-text-muted">
              Students will appear here once they join your session.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 grid-cols-4">
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
              <div className="col-span-full flex items-center justify-center h-64">
                <div className="text-center">
                  <p className="text-text-muted">
                    No students match the active filter
                  </p>
                </div>
              </div>
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
                    {new Date(selectedStudent.joined_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}{" "}
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
                      ? new Date(selectedStudent.last_exit_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })
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
