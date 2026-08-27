import { API_BASE_URL } from "../../config/api.js";
import { useState, useEffect, useCallback, useRef } from "react";
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
import { IconChartBar as BarChart2, IconUsers as Users, IconCircleCheck as CheckCircle2, IconAward as Award, IconAlertTriangle as AlertTriangle, IconChevronDown as ChevronDown, IconCheck as Check, IconChalkboard as School } from "@tabler/icons-react";
import { getSocket } from "../../store/socket";
import { Skeleton } from "../../components/ui/skeleton";
import PageShell from "../../components/PageShell";

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
  const [error, setError] = useState(null);

  // Class picker — a manually-built dropdown rather than the shared Select
  // primitive: Select's popper-mode Viewport is height-locked to its
  // trigger (a known Radix/shadcn quirk), which clips a class list under a
  // compact trigger to almost nothing. Same pattern already used for
  // CodeOutputPanel.jsx's dock-position picker.
  const [isClassMenuOpen, setIsClassMenuOpen] = useState(false);
  const classMenuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (classMenuRef.current && !classMenuRef.current.contains(e.target)) {
        setIsClassMenuOpen(false);
      }
    };
    const handleEscape = (e) => {
      if (e.key === "Escape") setIsClassMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  // Fetch target classes on mount
  const fetchClasses = useCallback(async () => {
    setLoading(true);
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
        setError(null);
      } else {
        setError("We couldn't load your classes. Please try again.");
      }
    } catch (err) {
      console.error("Failed to fetch classes:", err);
      setError("A network error occurred while loading your classes. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchClasses();
  }, [fetchClasses]);

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
        setError(null);
      } else {
        console.error("Failed to fetch class analytics");
        if (!silent) setError("We couldn't load analytics for this class. Please try again.");
      }
    } catch (err) {
      console.error("Error fetching class analytics:", err);
      if (!silent) setError("A network error occurred while loading analytics. Please try again.");
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
      <PageShell>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-border pb-4 gap-4">
          <div>
            <Skeleton className="h-7 w-56" />
          </div>
          <Skeleton className="h-8 w-48" />
        </div>
        <AnalyticsContentSkeleton />
      </PageShell>
    );
  }

  if (error) {
    return (
      <PageShell>
        <h1 className="text-[length:var(--text-xl)] font-semibold text-text-primary tracking-tight border-b border-border pb-4">Analytics Dashboard</h1>
        <div className="p-8 bg-bg-surface border border-accent-critical/25 rounded-lg flex flex-col items-center justify-center gap-3 py-16">
          <p className="text-sm text-text-secondary text-center max-w-sm">{error}</p>
          <button
            type="button"
            onClick={() => (selectedClassId ? fetchAnalytics(selectedClassId) : fetchClasses())}
            className="px-4 py-2 bg-accent-700 hover:bg-accent-700/90 text-white text-sm font-medium rounded-[var(--radius-md)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface"
          >
            Try again
          </button>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      {/* Header & Class Picker */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-border pb-4 gap-4">
        <div>
          <h1 className="text-[length:var(--text-xl)] font-semibold text-text-primary tracking-tight">
            Analytics Dashboard
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <span id="class-select-label" className="text-xs text-text-muted font-medium uppercase tracking-wider">
            Select Class:
          </span>
          <div className="relative" ref={classMenuRef}>
            <button
              type="button"
              onClick={() => setIsClassMenuOpen((prev) => !prev)}
              aria-haspopup="listbox"
              aria-expanded={isClassMenuOpen}
              aria-labelledby="class-select-label"
              className="flex items-center gap-2 pl-3 pr-2.5 py-1.5 rounded-[var(--radius-md)] bg-bg-surface border border-border text-sm font-medium text-text-primary hover:border-border-hover transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
            >
              <School className="w-3.5 h-3.5 text-accent-500 shrink-0" strokeWidth={1.75} />
              <span className="truncate max-w-[180px]">
                {classes.find((c) => String(c.id) === String(selectedClassId))?.name || "Select a class"}
              </span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-text-muted shrink-0 transition-transform duration-150 ${
                  isClassMenuOpen ? "rotate-180" : ""
                }`}
                strokeWidth={1.75}
              />
            </button>

            {isClassMenuOpen && (
              <div
                role="listbox"
                aria-labelledby="class-select-label"
                className="absolute right-0 top-full mt-1.5 w-56 max-h-72 overflow-y-auto bg-bg-elevated border border-border rounded-[var(--radius-md)] shadow-[var(--shadow-modal)] z-50 py-1"
              >
                {classes.map((cls) => {
                  const isSelected = String(cls.id) === String(selectedClassId);
                  return (
                    <button
                      key={cls.id}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => {
                        setSelectedClassId(cls.id.toString());
                        setIsClassMenuOpen(false);
                      }}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 text-sm text-left transition-colors duration-100 ${
                        isSelected
                          ? "text-accent-500 font-semibold bg-accent-500/10"
                          : "text-text-primary hover:bg-bg-surface-3"
                      }`}
                    >
                      <span className="truncate">{cls.name}</span>
                      {isSelected && <Check className="w-3.5 h-3.5 shrink-0" strokeWidth={2.25} />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
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
              <div className="text-2xl font-bold tnum text-text-primary">
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
              <div className="text-2xl font-bold tnum text-text-primary">
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
              <div className="text-2xl font-bold tnum text-text-primary">
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
              <div className="text-2xl font-bold tnum text-text-primary">
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
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    dataKey="date"
                    stroke="var(--text-secondary)"
                    style={{ fontSize: 11 }}
                    tick={{ fontFamily: "var(--font-sans)" }}
                  />
                  <YAxis
                    stroke="var(--text-secondary)"
                    style={{ fontSize: 11, fontVariantNumeric: "tabular-nums" }}
                    tick={{ fontFamily: "var(--font-sans)" }}
                    domain={[0, 100]}
                  />
                  <Tooltip
                    cursor={{ stroke: "color-mix(in srgb, var(--text-primary) 10%, transparent)", strokeWidth: 1 }}
                    contentStyle={{
                      backgroundColor: "var(--bg-elevated)",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      color: "var(--text-primary)",
                      fontFamily: "var(--font-sans)",
                      fontSize: 12,
                      fontVariantNumeric: "tabular-nums",
                    }}
                    formatter={(value) => [`${value}%`, "Attendance Rate"]}
                  />
                  <Line
                    type="monotone"
                    dataKey="rate"
                    name="attendance-rate"
                    stroke="var(--accent-info)"
                    strokeWidth={2.5}
                    dot={{ fill: "var(--accent-info)", r: 4 }}
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
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    dataKey="exam"
                    stroke="var(--text-secondary)"
                    style={{ fontSize: 11 }}
                    tick={{ fontFamily: "var(--font-sans)" }}
                  />
                  <YAxis
                    stroke="var(--text-secondary)"
                    style={{ fontSize: 11, fontVariantNumeric: "tabular-nums" }}
                    tick={{ fontFamily: "var(--font-sans)" }}
                    domain={[0, 100]}
                  />
                  <Tooltip
                    cursor={{ fill: "color-mix(in srgb, var(--text-primary) 6%, transparent)" }}
                    contentStyle={{
                      backgroundColor: "var(--bg-elevated)",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      color: "var(--text-primary)",
                      fontFamily: "var(--font-sans)",
                      fontSize: 12,
                      fontVariantNumeric: "tabular-nums",
                    }}
                    formatter={(value, name, item) => [
                      `${value}% (${item.payload.graded_count}/${item.payload.total_count} graded)`,
                      "Exam Avg Score",
                    ]}
                  />
                  <Bar dataKey="avg" name="exam-avg-score" fill="var(--accent-success)" />
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
              <span className="text-xs text-text-muted tnum">
                Thresholds: Attn &lt;75% · Task &lt;50% · Exam &lt;40%
              </span>
            </div>

            <div className="bg-bg-surface border border-border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
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
                            <span className="ml-2 text-xs tnum text-text-muted">
                              ({student.roll_no})
                            </span>
                          )}
                        </td>
                        <td className={`px-4 py-3 text-sm tnum ${student.triggeredRisks?.attendance ? 'text-accent-critical font-semibold' : 'text-text-secondary'}`}>
                          {student.attendance}
                        </td>
                        <td className={`px-4 py-3 text-sm tnum ${student.triggeredRisks?.task ? 'text-accent-critical font-semibold' : 'text-text-secondary'}`}>
                          {student.taskCompletion}
                        </td>
                        <td className={`px-4 py-3 text-sm tnum ${student.triggeredRisks?.exam ? 'text-accent-critical font-semibold' : 'text-text-secondary'}`}>
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
            </div>
            <p className="text-xs text-text-muted italic text-right mt-1">
              * = exam not yet fully graded, score may change
            </p>
          </div>
        </>
      )}
    </PageShell>
  );
}
