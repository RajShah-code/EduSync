import { useState, useEffect } from "react";
import { useOutletContext } from "react-router";
import { StudentTile } from "../../components/StudentTile";
import { StatusBadge } from "../../components/StatusBadge";
import { Filter, Grid3x3, Grid2x2, Monitor, Loader2 } from "lucide-react";
import { getSocket } from "../../store/socket";
import { Button } from "../../components/ui/button";
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
  const [filter, setFilter] = useState("all");
  const [gridSize, setGridSize] = useState(5);
  const [selectedStudent, setSelectedStudent] = useState(null);

  useEffect(() => {
    if (!sessionInfo) {
      setStudents([]);
      return;
    }

    const fetchStudents = async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem("edusync_token");
        const res = await fetch(`http://localhost:3000/sessions/${sessionInfo.id}/students`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setStudents(data.students || []);
        }
      } catch (err) {
        console.error("Failed to fetch students:", err);
      } finally {
        setLoading(false);
      }
    };
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
          <Monitor className="w-16 h-16 text-text-muted mx-auto mb-4" />
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
          <p className="text-sm text-text-secondary font-mono">
            {filteredStudents.length} of {students.length} students shown
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Filter Buttons */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-text-secondary" />
            <button
              onClick={() => setFilter("all")}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                filter === "all"
                  ? "bg-accent-info/10 text-accent-info"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              All ({stats.all})
            </button>
            <button
              onClick={() => setFilter("active")}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                filter === "active"
                  ? "bg-accent-success/10 text-accent-success"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              Active ({stats.active})
            </button>
            <button
              onClick={() => setFilter("idle")}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                filter === "idle"
                  ? "bg-accent-warning/10 text-accent-warning"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              Not Viewing ({stats.idle})
            </button>
          </div>

          {/* Grid Size Toggle */}
          <div className="flex items-center gap-1 border border-border rounded">
            <button
              onClick={() => setGridSize(4)}
              className={`p-2 transition-colors ${
                gridSize === 4
                  ? "bg-accent-info/10 text-accent-info"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              <Grid2x2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setGridSize(5)}
              className={`p-2 transition-colors ${
                gridSize === 5
                  ? "bg-accent-info/10 text-accent-info"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              <Grid3x3 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Student Grid */}
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="w-8 h-8 text-accent-info animate-spin" />
          </div>
        ) : students.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 py-16">
            <Monitor className="w-12 h-12 text-text-muted" />
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
              <div className="space-y-2.5 p-4 bg-bg-base border border-border rounded-lg">
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
                  />
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-text-secondary font-medium">Joined:</span>
                  <span className="font-mono text-text-primary text-xs">
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
                  <span className="font-mono text-text-primary text-xs">
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
