import { API_BASE_URL } from "../../config/api.js";
import { useState, useEffect } from "react";
import { useNavigate, useLocation, useOutletContext } from "react-router";
import { StatusBadge } from "../../components/StatusBadge";
import { Button } from "../../components/ui/button";
import { Timer } from "../../components/Timer";
import { Code, FileText, Clock, Calendar, WifiOff } from "lucide-react";
import { cn } from "../../components/ui/utils";
import { getSocket } from "../../store/socket";
import { toast } from "sonner";
import { AppTour } from "../../components/AppTour";
import { studentTourSteps } from "../../tours/studentTourSteps";

// Mock data cleared - empty states shown
const mockActiveTask = null;
const mockRecentSubmissions = [];
const mockUpcomingExam = null;

export function StudentDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setShowJoinModal, hasJoinedSession, activeSessions, joinedSession, wasKicked, setWasKicked } = useOutletContext();

  const [attendance, setAttendance] = useState([]);
  const [totalLectures, setTotalLectures] = useState(0);
  const [exams, setExams] = useState([]);

  const [runTour, setRunTour] = useState(false);
  const [isManualReplay, setIsManualReplay] = useState(false);

  useEffect(() => {
    const userStr = localStorage.getItem("edusync_user");
    const user = userStr ? JSON.parse(userStr) : {};

    if (location.state?.startTour) {
      setIsManualReplay(true);
      const timer = setTimeout(() => setRunTour(true), 400);
      return () => clearTimeout(timer);
    } else if (user.has_seen_tour !== true) {
      setIsManualReplay(false);
      const timer = setTimeout(() => setRunTour(true), 400);
      return () => clearTimeout(timer);
    }
  }, [location.state]);

  useEffect(() => {
    const fetchAvailableExams = async () => {
      try {
        const token = localStorage.getItem("edusync_token");
        if (!token) return;
        const res = await fetch(`${API_BASE_URL}/exams/available`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setExams(data.exams || []);
        }
      } catch (err) {
        console.error("Failed to fetch available exams:", err);
      }
    };
    fetchAvailableExams();

    let socket = getSocket();
    const handleRefresh = () => {
      fetchAvailableExams();
    };

    const setupListener = (s) => {
      s.on("exam:opened", handleRefresh);
      s.on("exam:start", handleRefresh);
      return () => {
        s.off("exam:opened", handleRefresh);
        s.off("exam:start", handleRefresh);
      };
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

  useEffect(() => {
    const fetchAttendance = async () => {
      try {
        const token = localStorage.getItem("edusync_token");
        if (!token) return;
        
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
    rate:
      totalLectures > 0
        ? (
            (attendance.filter((a) => a.status === "present").length /
              totalLectures) *
            100
          ).toFixed(1)
        : "0.0",
  };

  const handleJoinExam = async (examId) => {
    try {
      const token = localStorage.getItem("edusync_token");
      const res = await fetch(`${API_BASE_URL}/exams/${examId}/join`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to join exam");
      }
      navigate(`/student/exam/${examId}`);
    } catch (err) {
      toast.error(err.message);
      // Refresh available exams
      try {
        const token = localStorage.getItem("edusync_token");
        const refreshRes = await fetch(`${API_BASE_URL}/exams/available`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (refreshRes.ok) {
          const data = await refreshRes.json();
          setExams(data.exams || []);
        }
      } catch (refreshErr) {
        console.error("Failed to refresh exams list:", refreshErr);
      }
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Kick banner — shown when instructor ended the session the student was in */}
      {wasKicked && (
        <div className="p-4 bg-accent-critical/10 border border-accent-critical/30 rounded flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-accent-critical" />
            <span className="text-sm font-medium text-text-primary">
              Your session was ended by the instructor.
            </span>
          </div>
          <button
            onClick={() => setWasKicked(false)}
            className="text-xs text-text-secondary hover:text-text-primary"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Session Availability Banner */}
      {activeSessions.length > 0 ? (
        <div
          className="p-4 bg-accent-info/10 border border-accent-info/30 rounded flex items-center justify-between cursor-pointer hover:bg-accent-info/15 transition-colors"
          onClick={() => navigate('/student/sessions')}
        >
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-accent-success animate-pulse" />
            <div>
              <div className="text-sm font-semibold text-text-primary">
                {activeSessions.length} Live {activeSessions.length === 1 ? 'Session' : 'Sessions'} in Progress
              </div>
              <div className="text-xs text-text-secondary">
                Click to view and join your lab session
              </div>
            </div>
          </div>
          <span className="text-xs font-semibold text-accent-info">VIEW SESSIONS →</span>
        </div>
      ) : (
        <div className="p-4 bg-bg-surface border border-border rounded flex items-center gap-3">
          <WifiOff className="w-4 h-4 text-text-muted" />
          <div>
            <div className="text-sm font-semibold text-text-primary">No live sessions right now</div>
            <div className="text-xs text-text-secondary">Your instructor hasn't started a broadcast yet.</div>
          </div>
        </div>
      )}

      {/* Active Task */}
      {mockActiveTask ? (
        <div data-tour="student-tasks" className="p-6 bg-bg-surface border border-border rounded-lg">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Code className="w-5 h-5 text-accent-info" />
                <h2 className="text-lg font-semibold text-text-primary">
                  Current Task
                </h2>
              </div>
              <p className="text-2xl font-semibold text-text-primary mt-2">
                {mockActiveTask.title}
              </p>
            </div>
            <div className="text-right">
              <div className="text-xs text-text-secondary mb-1">
                TIME REMAINING
              </div>
              <Timer seconds={mockActiveTask.timeRemaining} size="lg" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={mockActiveTask.status} />
            <Button
              onClick={() => navigate(`/student/task/${mockActiveTask.id}`)}
              className="bg-accent-info hover:bg-accent-info/90 text-white"
            >
              Open Editor
            </Button>
          </div>
        </div>
      ) : (
        <div data-tour="student-tasks" className="p-8 bg-bg-surface border border-border rounded-lg flex flex-col items-center justify-center gap-3">
          <Code className="w-12 h-12 text-text-muted" />
          <h3 className="text-base font-medium text-text-primary">
            No active task assigned
          </h3>
          <p className="text-sm text-text-secondary">
            Your instructor hasn't assigned any task yet.
          </p>
        </div>
      )}

      {/* Two Column Layout */}
      <div className="grid grid-cols-2 gap-6">
        {/* Recent Submissions */}
        <div className="bg-bg-surface border border-border rounded-lg p-6 flex flex-col">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-5 h-5 text-accent-success" />
            <h2 className="text-lg font-semibold text-text-primary">
              Recent Submissions
            </h2>
          </div>
          {mockRecentSubmissions.length > 0 ? (
            <div className="space-y-3">
              {mockRecentSubmissions.map((submission) => (
                <div
                  key={submission.id}
                  className="p-3 bg-bg-base border border-border rounded hover:border-accent-info/50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="font-medium text-text-primary text-sm">
                        {submission.title}
                      </div>
                      <div className="text-xs text-text-secondary mt-1">
                        {submission.submittedAt}
                      </div>
                    </div>
                    <div className="text-right">
                      <StatusBadge status={submission.status} />
                      {submission.status === "graded" && (
                        <div className="text-sm font-mono text-accent-success mt-1">
                          {submission.score}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 py-12">
              <FileText className="w-12 h-12 text-text-muted" />
              <h3 className="text-base font-medium text-text-primary">
                No recent submissions
              </h3>
              <p className="text-sm text-text-secondary">
                Your submitted tasks will appear here.
              </p>
            </div>
          )}
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          {/* Attendance Summary */}
          <div data-tour="student-attendance" className="bg-bg-surface border border-border rounded-lg p-6">
            <div className="flex items-center gap-2 mb-4">
              <Calendar className="w-5 h-5 text-accent-warning" />
              <h2 className="text-lg font-semibold text-text-primary">
                Attendance
              </h2>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-text-secondary">Present</span>
                <span className="text-2xl font-mono font-semibold text-accent-success">
                  {stats.present}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-text-secondary">Total Sessions</span>
                <span className="text-2xl font-mono font-semibold text-text-primary">
                  {stats.total}
                </span>
              </div>
              <div className="pt-2 border-t border-border">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-secondary">
                    Attendance Rate
                  </span>
                  <span className="text-xl font-mono font-semibold text-accent-info">
                    {stats.rate}%
                  </span>
                </div>
              </div>
            </div>
            <Button
              variant="outline"
              onClick={() => navigate("/student/attendance")}
              className="w-full mt-4"
            >
              View History
            </Button>
          </div>

          {/* Available Exams */}
          {exams.length > 0 ? (
            <div data-tour="student-exams" className="bg-bg-surface border border-border rounded-lg p-6 space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-5 h-5 text-accent-info" />
                <h2 className="text-lg font-semibold text-text-primary">
                  Available Exams
                </h2>
              </div>
              <div className="space-y-3">
                {exams.map((exam) => {
                  const isWaiting = exam.status === "waiting_room";
                  return (
                    <div
                      key={exam.id}
                      className="p-4 bg-bg-base border border-border rounded-lg hover:border-accent-info/50 transition-colors flex items-center justify-between"
                    >
                      <div className="space-y-1">
                        <div className="font-semibold text-text-primary text-sm">
                          {exam.title}
                        </div>
                        <div className="text-xs text-text-secondary flex items-center gap-2">
                          <span>{exam.time_limit_minutes} mins</span>
                          <span>•</span>
                          <span className={isWaiting ? "text-accent-warning" : "text-accent-success"}>
                            {isWaiting ? "Waiting Room Open" : "Active / In Progress"}
                          </span>
                        </div>
                      </div>
                      <div>
                        {isWaiting ? (
                          <Button
                            size="sm"
                            onClick={() => handleJoinExam(exam.id)}
                            className="bg-accent-warning hover:bg-accent-warning/90 text-black font-semibold text-xs"
                          >
                            Join Waiting Room
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => navigate(`/student/exam/${exam.id}`)}
                            className="bg-accent-success hover:bg-accent-success/90 text-white font-semibold text-xs"
                          >
                            Enter Exam
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div data-tour="student-exams" className="p-6 bg-bg-surface border border-border rounded-lg flex flex-col items-center justify-center gap-3">
              <Clock className="w-12 h-12 text-text-muted" />
              <h3 className="text-base font-medium text-text-primary">
                No active/upcoming exams
              </h3>
              <p className="text-sm text-text-secondary">
                You will be notified when an exam is opened.
              </p>
            </div>
          )}
        </div>
      </div>

      <AppTour
        steps={studentTourSteps}
        run={runTour}
        isManualReplay={isManualReplay}
        onFinish={() => setRunTour(false)}
      />
    </div>
  );
}
