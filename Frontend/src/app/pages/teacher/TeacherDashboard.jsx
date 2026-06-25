import { useNavigate } from "react-router";
import { Button } from "../../components/ui/button";
import {
  Radio,
  Monitor,
  ClipboardList,
  FileText,
  Play,
  Square,
  LayoutDashboard,
} from "lucide-react";

// Empty — will be populated from real sessions
const mockStats = {
  connectedStudents: 0,
  activeStudents: 0,
  idleStudents: 0,
  offlineStudents: 0,
};

const mockRecentActivity = [];

import { useOutletContext } from "react-router";

export function TeacherDashboard() {
  const navigate = useNavigate();
  const {
    broadcastState,
    setBroadcastState,
    recordingState,
    setRecordingState,
    sessionInfo,
    setSessionInfo,
    setSessionSeconds,
    setRecordingSeconds
  } = useOutletContext();

  const sessionActive = broadcastState !== "idle";

  const handleEndSession = () => {
    setBroadcastState("idle");
    setRecordingState("off");
    setSessionSeconds(0);
    setRecordingSeconds(0);
    setSessionInfo(null);
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-semibold text-text-primary mb-1">
          Control Center
        </h1>
        <p className="text-text-secondary">
          Manage your lab session and monitor students
        </p>
      </div>

      {/* Session Control */}
      <div className="p-6 bg-bg-surface border border-border rounded-lg">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">
              {sessionActive ? (sessionInfo?.lectureName || "Active Broadcast Session") : "Lab Session"}
            </h2>
            <p className="text-sm text-text-secondary">
              {sessionActive ? (sessionInfo?.subject || "Broadcasting") : "No active session"}
            </p>
          </div>
          {sessionActive ? (
            <Button
              onClick={handleEndSession}
              variant="outline"
              className="border-accent-critical text-accent-critical hover:bg-accent-critical/10"
            >
              <Square className="w-4 h-4 mr-2" />
              End Session
            </Button>
          ) : (
            <Button
              onClick={() => navigate("/teacher/broadcast")}
              className="bg-accent-success hover:bg-accent-success/90 text-white"
            >
              <Play className="w-4 h-4 mr-2" />
              Start Session
            </Button>
          )}
        </div>

        {/* Student Overview */}
        <div className="grid grid-cols-4 gap-4">
          <div className="p-4 bg-bg-base rounded border border-border">
            <div className="text-2xl font-mono font-semibold text-text-primary">
              {mockStats.connectedStudents}
            </div>
            <div className="text-xs text-text-secondary mt-1">
              TOTAL CONNECTED
            </div>
          </div>
          <div className="p-4 bg-bg-base rounded border border-accent-success/20">
            <div className="text-2xl font-mono font-semibold text-accent-success">
              {mockStats.activeStudents}
            </div>
            <div className="text-xs text-text-secondary mt-1">ACTIVE</div>
          </div>
          <div className="p-4 bg-bg-base rounded border border-accent-warning/20">
            <div className="text-2xl font-mono font-semibold text-accent-warning">
              {mockStats.idleStudents}
            </div>
            <div className="text-xs text-text-secondary mt-1">NOT VIEWING</div>
          </div>
          <div className="p-4 bg-bg-base rounded border border-border">
            <div className="text-2xl font-mono font-semibold text-text-muted">
              {mockStats.offlineStudents}
            </div>
            <div className="text-xs text-text-secondary mt-1">OFFLINE</div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-lg font-semibold text-text-primary mb-3">
          Quick Actions
        </h2>
        <div className="grid grid-cols-4 gap-4">
          <button
            onClick={() => navigate("/teacher/broadcast")}
            className="p-4 bg-bg-surface border border-border rounded hover:border-accent-info hover:bg-bg-elevated transition-all group"
          >
            <Radio className="w-6 h-6 text-accent-info mb-2" />
            <div className="text-sm font-medium text-text-primary">
              Broadcast
            </div>
            <div className="text-xs text-text-secondary mt-1">
              Share your screen
            </div>
          </button>

          <button
            onClick={() => navigate("/teacher/monitor")}
            className="p-4 bg-bg-surface border border-border rounded hover:border-accent-info hover:bg-bg-elevated transition-all group"
          >
            <Monitor className="w-6 h-6 text-accent-info mb-2" />
            <div className="text-sm font-medium text-text-primary">Monitor</div>
            <div className="text-xs text-text-secondary mt-1">
              View all screens
            </div>
          </button>

          <button
            onClick={() => navigate("/teacher/task/assign")}
            className="p-4 bg-bg-surface border border-border rounded hover:border-accent-info hover:bg-bg-elevated transition-all group"
          >
            <ClipboardList className="w-6 h-6 text-accent-info mb-2" />
            <div className="text-sm font-medium text-text-primary">
              Assign Task
            </div>
            <div className="text-xs text-text-secondary mt-1">
              Push coding tasks
            </div>
          </button>

          <button
            onClick={() => navigate("/teacher/exam/create")}
            className="p-4 bg-bg-surface border border-border rounded hover:border-accent-info hover:bg-bg-elevated transition-all group"
          >
            <FileText className="w-6 h-6 text-accent-info mb-2" />
            <div className="text-sm font-medium text-text-primary">
              Start Exam
            </div>
            <div className="text-xs text-text-secondary mt-1">
              Create assessment
            </div>
          </button>
        </div>
      </div>

      {/* Recent Activity */}
      <div>
        <h2 className="text-lg font-semibold text-text-primary mb-3">
          Recent Activity
        </h2>
        {mockRecentActivity.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 bg-bg-surface border border-border rounded-lg">
            <LayoutDashboard className="w-12 h-12 text-text-muted" />
            <p className="text-base font-medium text-text-primary">
              No activity yet
            </p>
            <p className="text-sm text-text-muted">
              Actions taken during sessions will appear here.
            </p>
          </div>
        ) : (
          <div className="bg-bg-surface border border-border rounded-lg overflow-hidden">
            {mockRecentActivity.map((activity, index) => (
              <div
                key={activity.id}
                className={`p-4 flex items-start justify-between ${
                  index !== mockRecentActivity.length - 1
                    ? "border-b border-border"
                    : ""
                }`}
              >
                <div className="flex-1">
                  <div className="text-sm font-medium text-text-primary">
                    {activity.event}
                  </div>
                  <div className="text-sm text-text-secondary mt-0.5">
                    {activity.details}
                  </div>
                </div>
                <div className="text-xs text-text-muted font-mono">
                  {activity.time}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
