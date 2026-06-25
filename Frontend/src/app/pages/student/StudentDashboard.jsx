import { useState, useEffect } from "react";
import { useNavigate, useOutletContext } from "react-router";
import { StatusBadge } from "../../components/StatusBadge";
import { Button } from "../../components/ui/button";
import { Timer } from "../../components/Timer";
import { Code, FileText, Clock, Calendar, WifiOff } from "lucide-react";
import { cn } from "../../components/ui/utils";
import { getSocket } from "../../store/socket";

// Mock data cleared - empty states shown
const mockActiveTask = null;
const mockRecentSubmissions = [];
const mockUpcomingExam = null;

export function StudentDashboard() {
  const navigate = useNavigate();
  const { setShowJoinModal, hasJoinedSession, activeSessions, joinedSession, wasKicked, setWasKicked } = useOutletContext();

  const [attendance, setAttendance] = useState([]);
  const [totalLectures, setTotalLectures] = useState(0);

  useEffect(() => {
    const fetchAttendance = async () => {
      try {
        const token = localStorage.getItem("edusync_token");
        if (!token) return;
        
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
        <div className="p-6 bg-bg-surface border border-border rounded-lg">
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
        <div className="p-8 bg-bg-surface border border-border rounded-lg flex flex-col items-center justify-center gap-3">
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
          <div className="bg-bg-surface border border-border rounded-lg p-6">
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

          {/* Upcoming Exam */}
          {mockUpcomingExam ? (
            <div className="bg-bg-surface border border-accent-locked/20 rounded-lg p-6">
              <div className="flex items-center gap-2 mb-4">
                <Clock className="w-5 h-5 text-accent-locked" />
                <h2 className="text-lg font-semibold text-text-primary">
                  Upcoming Exam
                </h2>
              </div>
              <div>
                <p className="font-semibold text-text-primary mb-2">
                  {mockUpcomingExam.title}
                </p>
                <div className="space-y-1 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-text-secondary">Date</span>
                    <span className="font-mono text-text-primary">
                      {mockUpcomingExam.date}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-text-secondary">Duration</span>
                    <span className="font-mono text-text-primary">
                      {mockUpcomingExam.duration}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-text-secondary">Total Marks</span>
                    <span className="font-mono text-text-primary">
                      {mockUpcomingExam.totalMarks}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-6 bg-bg-surface border border-border rounded-lg flex flex-col items-center justify-center gap-3">
              <Clock className="w-12 h-12 text-text-muted" />
              <h3 className="text-base font-medium text-text-primary">
                No upcoming exams
              </h3>
              <p className="text-sm text-text-secondary">
                You will be notified when an exam is scheduled.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
