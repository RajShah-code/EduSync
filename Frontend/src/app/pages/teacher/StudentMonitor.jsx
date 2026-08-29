import { API_BASE_URL } from "../../config/api.js";
import { useState, useEffect } from "react";
import { useOutletContext } from "react-router";
import { StudentTile } from "../../components/StudentTile";
import { StatusBadge } from "../../components/StatusBadge";
import { IconFilter as Filter, IconGrid3x3 as Grid3x3, IconLayoutGrid as Grid2x2, IconDeviceDesktop as Monitor, IconEyeCheck as EyeCheck, IconEyeX as EyeX } from "@tabler/icons-react";
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
  const { sessionInfo } = useOutletContext();
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState("all");
  const [gridSize, setGridSize] = useState(5);
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

  return (
    <div className="h-full flex flex-col bg-bg-base">
      {/* Top Bar */}
      <div className="px-6 py-4 border-b border-border bg-bg-surface flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-text-primary">
            Student Monitor
          </h1>
          <p className="text-sm text-text-secondary tnum">
            {filteredStudents.length} of {students.length} students shown
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Filter Buttons */}
          <div className="flex items-center gap-2">
            <Filter className="w-[18px] h-[18px] text-text-secondary" />
            <button
              onClick={() => setFilter("all")}
              aria-pressed={filter === "all"}
              className={`px-3 py-1.5 text-xs font-medium rounded-[var(--radius-sm)] border transition-[transform,background-color,border-color,color] duration-150 ease-[var(--ease-out-strong)] active:scale-[0.96] ${
                filter === "all"
                  ? "bg-accent-info/10 border-accent-info/30 text-accent-info"
                  : "border-transparent text-text-secondary hover:text-text-primary"
              }`}
            >
              All ({stats.all})
            </button>
            <button
              onClick={() => setFilter("active")}
              aria-pressed={filter === "active"}
              className={`px-3 py-1.5 text-xs font-medium rounded-[var(--radius-sm)] border transition-[transform,background-color,border-color,color] duration-150 ease-[var(--ease-out-strong)] active:scale-[0.96] ${
                filter === "active"
                  ? "bg-accent-success/10 border-accent-success/30 text-accent-success"
                  : "border-transparent text-text-secondary hover:text-text-primary"
              }`}
            >
              <span className="inline-flex items-center gap-1.5">
                <EyeCheck className="w-3.5 h-3.5" />
                Active ({stats.active})
              </span>
            </button>
            <button
              onClick={() => setFilter("idle")}
              aria-pressed={filter === "idle"}
              className={`px-3 py-1.5 text-xs font-medium rounded-[var(--radius-sm)] border transition-[transform,background-color,border-color,color] duration-150 ease-[var(--ease-out-strong)] active:scale-[0.96] ${
                filter === "idle"
                  ? "bg-accent-warning/10 border-accent-warning/30 text-accent-warning"
                  : "border-transparent text-text-secondary hover:text-text-primary"
              }`}
            >
              <span className="inline-flex items-center gap-1.5">
                <EyeX className="w-3.5 h-3.5" />
                Not Viewing ({stats.idle})
              </span>
            </button>
          </div>

          <div className="h-6 w-px bg-border shrink-0" aria-hidden="true" />

          {/* Grid Size Toggle */}
          <div className="flex items-center gap-1 border border-border rounded-[var(--radius-sm)]">
            <button
              type="button"
              onClick={() => setGridSize(4)}
              aria-label="Show 4 students per row"
              aria-pressed={gridSize === 4}
              className={`p-2 transition-[transform,background-color,color] duration-150 ease-[var(--ease-out-strong)] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface ${
                gridSize === 4
                  ? "bg-accent-info/10 text-accent-info"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              <Grid2x2 className="w-[18px] h-[18px]" />
            </button>
            <button
              type="button"
              onClick={() => setGridSize(5)}
              aria-label="Show 5 students per row"
              aria-pressed={gridSize === 5}
              className={`p-2 transition-[transform,background-color,color] duration-150 ease-[var(--ease-out-strong)] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface ${
                gridSize === 5
                  ? "bg-accent-info/10 text-accent-info"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              <Grid3x3 className="w-[18px] h-[18px]" />
            </button>
          </div>
        </div>
      </div>

      {/* Student Grid */}
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className={`grid gap-4 ${gridSize === 4 ? "grid-cols-4" : "grid-cols-5"}`}>
            {Array.from({ length: gridSize }).map((_, i) => (
              <div key={i} className="rounded-[var(--radius-lg)] bg-bg-surface border border-border overflow-hidden">
                <Skeleton className="h-24 w-full rounded-none" />
                <div className="p-3">
                  <Skeleton className="h-4 w-3/4" />
                </div>
              </div>
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
          <div
            className={`grid gap-4 ${
              gridSize === 4 ? "grid-cols-4" : "grid-cols-5"
            }`}
          >
            {filteredStudents.map((student) => {
              const tileStudent = {
                id: student.student_id,
                name: student.student_name,
                status: deriveConnectionStatus(student, { useActive: true }),
                joinedAt: student.joined_at,
                lastExitAt: student.last_exit_at,
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
