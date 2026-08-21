import { API_BASE_URL } from "../../config/api.js";
import { useState, useEffect, useCallback } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { BarChart2, Users, CheckCircle2, Award, AlertTriangle } from "lucide-react";
import { getSocket } from "../../store/socket";
import { Skeleton } from "../../components/ui/skeleton";

function AnalyticsContentSkeleton() {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="p-4 bg-bg-surface border border-border rounded-lg space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-16" />
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[0, 1].map((i) => (
          <div key={i} className="p-6 bg-bg-surface border border-border rounded-lg space-y-4">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-[220px] w-full" />
          </div>
        ))}
      </div>
      <div className="space-y-4">
        <Skeleton className="h-5 w-32" />
        <div className="bg-bg-surface border border-border rounded-lg overflow-hidden">
          <div className="divide-y divide-border">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

export function Analytics() {
  const [classes, setClasses] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [analyticsData, setAnalyticsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetchingClass, setFetchingClass] = useState(false);

  // Fetch target classes on mount
  useEffect(() => {
    const fetchClasses = async () => {
      try {
        const token = localStorage.getItem("edusync_token");
        const res = await fetch(`${API_BASE_URL}/classes`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          const classList = data.classes || [];
          setClasses(classList);
          if (classList.length > 0) {
            setSelectedClassId(classList[0].id.toString());
          }
        }
      } catch (err) {
        console.error("Failed to fetch classes:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchClasses();
  }, []);

  // Fetch analytics for selected class
  const fetchAnalytics = useCallback(async (classId, silent = false) => {
    if (!classId) return;
    if (!silent) setFetchingClass(true);
    try {
      const token = localStorage.getItem("edusync_token");
      const res = await fetch(`${API_BASE_URL}/analytics/class/${classId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAnalyticsData(data);
      } else {
        console.error("Failed to fetch class analytics");
      }
    } catch (err) {
      console.error("Error fetching class analytics:", err);
    } finally {
      if (!silent) setFetchingClass(false);
    }
  }, []);

  useEffect(() => {
    if (selectedClassId) {
      fetchAnalytics(selectedClassId);
    }
  }, [selectedClassId, fetchAnalytics]);

  // Socket listener for real-time silent refetch
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleAnalyticsUpdated = () => {
      if (selectedClassId) {
        fetchAnalytics(selectedClassId, true); // silent refetch
      }
    };

    socket.on("analytics:updated", handleAnalyticsUpdated);
    return () => {
      socket.off("analytics:updated", handleAnalyticsUpdated);
    };
  }, [selectedClassId, fetchAnalytics]);

  const summary = analyticsData?.summary ?? {
    avgAttendance: 0,
    avgTaskCompletion: 0,
    avgExamScore: 0,
    atRiskCount: 0,
    totalGradedAnswers: 0,
    totalExamAnswers: 0,
  };

  const attendanceTrend = analyticsData?.attendanceTrend ?? [];
  const examPerformance = analyticsData?.examPerformance ?? [];
  const atRiskStudents = analyticsData?.atRiskStudents ?? [];

  const hasData =
    attendanceTrend.length > 0 ||
    examPerformance.length > 0 ||
    atRiskStudents.length > 0;

  if (loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-border pb-4 gap-4">
          <div className="space-y-2">
            <Skeleton className="h-7 w-56" />
            <Skeleton className="h-4 w-80" />
          </div>
          <Skeleton className="h-8 w-48" />
        </div>
        <AnalyticsContentSkeleton />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header & Class Picker */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-border pb-4 gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary mb-1">
            Analytics Dashboard
          </h1>
          <p className="text-sm text-text-secondary">
            Class performance metrics, attendance trends, and at-risk student tracking
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label htmlFor="class-select" className="text-xs text-text-muted font-medium uppercase tracking-wider">
            Select Class:
          </label>
          <select
            id="class-select"
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(e.target.value)}
            className="bg-bg-surface border border-border rounded-lg px-3 py-1.5 text-sm text-text-primary font-medium focus:outline-none focus:border-accent-info"
          >
            {classes.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {fetchingClass ? (
        <AnalyticsContentSkeleton />
      ) : !hasData ? (
        /* Preserved Empty State */
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <BarChart2 className="w-12 h-12 text-text-muted" />
          <p className="text-base font-medium text-text-primary">
            No analytics data available
          </p>
          <p className="text-sm text-text-muted">
            Run at least one session for this class to see performance insights.
          </p>
        </div>
      ) : (
        <>
          {/* 4 KPI Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Avg Attendance */}
            <div className="p-4 bg-bg-surface border border-border rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                  Avg Attendance
                </span>
                <Users className="w-4 h-4 text-accent-info" />
              </div>
              <div className="text-2xl font-bold font-mono text-text-primary">
                {summary.avgAttendance}%
              </div>
              <p className="text-xs text-text-secondary">Across class sessions</p>
            </div>

            {/* Task Completion */}
            <div className="p-4 bg-bg-surface border border-border rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                  Task Completion
                </span>
                <CheckCircle2 className="w-4 h-4 text-accent-info" />
              </div>
              <div className="text-2xl font-bold font-mono text-text-primary">
                {summary.avgTaskCompletion}%
              </div>
              <p className="text-xs text-text-secondary">Submitted lab tasks</p>
            </div>

            {/* Avg Exam Score */}
            <div className="p-4 bg-bg-surface border border-border rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                  Avg Exam Score
                </span>
                <Award className="w-4 h-4 text-accent-success" />
              </div>
              <div className="text-2xl font-bold font-mono text-text-primary">
                {summary.avgExamScore}%
              </div>
              <p className="text-xs text-text-secondary">
                {summary.examsExcludedFromAvg > 0
                  ? `Excludes ${summary.examsExcludedFromAvg} exam(s) still being graded.`
                  : summary.totalExamAnswers > 0
                  ? `${summary.totalGradedAnswers}/${summary.totalExamAnswers} answers graded`
                  : "Exam aggregate average"}
              </p>
            </div>

            {/* At-Risk Students */}
            <div className="p-4 bg-bg-surface border border-border rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                  At-Risk Students
                </span>
                <AlertTriangle className="w-4 h-4 text-accent-warning" />
              </div>
              <div className="text-2xl font-bold font-mono text-text-primary">
                {summary.atRiskCount}
              </div>
              <p className="text-xs text-text-secondary">Needs academic support</p>
            </div>
          </div>

          {/* Charts Side-by-Side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Attendance Rate Over Time */}
            <div className="p-6 bg-bg-surface border border-border rounded-lg">
              <h3 className="text-sm font-semibold text-text-primary mb-4">
                Attendance Rate Over Time
              </h3>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={attendanceTrend} id="attendance-trend-chart">
                  <CartesianGrid strokeDasharray="3 3" stroke="#2A2A3A" />
                  <XAxis
                    dataKey="date"
                    stroke="#8B8BA7"
                    style={{ fontSize: 11 }}
                    tick={{ fontFamily: "JetBrains Mono" }}
                  />
                  <YAxis
                    stroke="#8B8BA7"
                    style={{ fontSize: 11 }}
                    tick={{ fontFamily: "JetBrains Mono" }}
                    domain={[0, 100]}
                  />
                  <Tooltip
                    cursor={{ stroke: "rgba(255,255,255,0.1)", strokeWidth: 1 }}
                    contentStyle={{
                      backgroundColor: "#111118",
                      border: "1px solid #2A2A3A",
                      borderRadius: "8px",
                      color: "#F0F0F5",
                      fontFamily: "JetBrains Mono",
                      fontSize: 12,
                    }}
                    formatter={(value) => [`${value}%`, "Attendance Rate"]}
                  />
                  <Line
                    type="monotone"
                    dataKey="rate"
                    name="attendance-rate"
                    stroke="#4F8EF7"
                    strokeWidth={2.5}
                    dot={{ fill: "#4F8EF7", r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Exam Performance Comparison */}
            <div className="p-6 bg-bg-surface border border-border rounded-lg">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-text-primary">
                  Exam Performance Comparison
                </h3>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={examPerformance} id="exam-performance-chart">
                  <CartesianGrid strokeDasharray="3 3" stroke="#2A2A3A" />
                  <XAxis
                    dataKey="exam"
                    stroke="#8B8BA7"
                    style={{ fontSize: 11 }}
                    tick={{ fontFamily: "JetBrains Mono" }}
                  />
                  <YAxis
                    stroke="#8B8BA7"
                    style={{ fontSize: 11 }}
                    tick={{ fontFamily: "JetBrains Mono" }}
                    domain={[0, 100]}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(255,255,255,0.06)" }}
                    contentStyle={{
                      backgroundColor: "#111118",
                      border: "1px solid #2A2A3A",
                      borderRadius: "8px",
                      color: "#F0F0F5",
                      fontFamily: "JetBrains Mono",
                      fontSize: 12,
                    }}
                    formatter={(value, name, item) => [
                      `${value}% (${item.payload.graded_count}/${item.payload.total_count} graded)`,
                      "Exam Avg Score",
                    ]}
                  />
                  <Bar dataKey="avg" name="exam-avg-score" fill="#22C55E" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* At-Risk Students Table */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-text-primary">
                At-Risk Students
              </h2>
              <span className="text-xs text-text-muted font-mono">
                Thresholds: Attn &lt;75% · Task &lt;50% · Exam &lt;40%
              </span>
            </div>

            <div className="bg-bg-surface border border-border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-bg-elevated">
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                      Student Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                      Attendance
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                      Task Completion
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                      Avg Score
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                      Risk Level
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {atRiskStudents.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-sm text-text-muted">
                        No at-risk students identified for this class. Excellent performance!
                      </td>
                    </tr>
                  ) : (
                    atRiskStudents.map((student) => (
                      <tr
                        key={student.id}
                        className="hover:bg-bg-elevated transition-colors"
                      >
                        <td className="px-4 py-3 text-sm text-text-primary font-medium">
                          {student.name}
                          {student.roll_no && (
                            <span className="ml-2 text-xs font-mono text-text-muted">
                              ({student.roll_no})
                            </span>
                          )}
                        </td>
                        <td className={`px-4 py-3 text-sm font-mono ${student.triggeredRisks?.attendance ? 'text-accent-critical font-semibold' : 'text-text-secondary'}`}>
                          {student.attendance}
                        </td>
                        <td className={`px-4 py-3 text-sm font-mono ${student.triggeredRisks?.task ? 'text-accent-critical font-semibold' : 'text-text-secondary'}`}>
                          {student.taskCompletion}
                        </td>
                        <td className={`px-4 py-3 text-sm font-mono ${student.triggeredRisks?.exam ? 'text-accent-critical font-semibold' : 'text-text-secondary'}`}>
                          {student.avgScore}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 text-xs font-medium rounded-sm ${
                              student.riskLevel === "high"
                                ? "bg-accent-critical/10 border border-accent-critical/20 text-accent-critical"
                                : "bg-accent-warning/10 border border-accent-warning/20 text-accent-warning"
                            }`}
                          >
                            {student.riskLevel.toUpperCase()}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-text-muted italic text-right mt-1">
              * = exam not yet fully graded, score may change
            </p>
          </div>
        </>
      )}
    </div>
  );
}
