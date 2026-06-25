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
import { BarChart2 } from "lucide-react";

// Empty data — will be populated from real backend
const attendanceData = [];
const examPerformance = [];
const atRiskStudents = [];

export function Analytics() {
  const hasData =
    attendanceData.length > 0 ||
    examPerformance.length > 0 ||
    atRiskStudents.length > 0;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-text-primary mb-1">
          Analytics Dashboard
        </h1>
        <p className="text-text-secondary">
          Class performance metrics and insights
        </p>
      </div>

      {!hasData ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <BarChart2 className="w-12 h-12 text-text-muted" />
          <p className="text-base font-medium text-text-primary">
            No analytics data available
          </p>
          <p className="text-sm text-text-muted">
            Run at least one session to see performance insights.
          </p>
        </div>
      ) : (
        <>
          {/* Class Overview */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-text-primary">
              Class Overview
            </h2>

            <div className="grid grid-cols-2 gap-6">
              {/* Attendance Trend */}
              <div className="p-6 bg-bg-surface border border-border rounded-lg">
                <h3 className="text-sm font-semibold text-text-primary mb-4">
                  Attendance Rate Over Time
                </h3>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={attendanceData} id="attendance-trend-chart">
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
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#111118",
                        border: "1px solid #2A2A3A",
                        borderRadius: "8px",
                        color: "#F0F0F5",
                        fontFamily: "JetBrains Mono",
                        fontSize: 12,
                      }}
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

              {/* Exam Performance */}
              <div className="p-6 bg-bg-surface border border-border rounded-lg">
                <h3 className="text-sm font-semibold text-text-primary mb-4">
                  Exam Performance Comparison
                </h3>
                <ResponsiveContainer width="100%" height={200}>
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
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#111118",
                        border: "1px solid #2A2A3A",
                        borderRadius: "8px",
                        color: "#F0F0F5",
                        fontFamily: "JetBrains Mono",
                        fontSize: 12,
                      }}
                    />

                    <Bar dataKey="avg" name="exam-avg-score" fill="#22C55E" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* At-Risk Students */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-text-primary">
                At-Risk Students
              </h2>
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
                  {atRiskStudents.map((student) => (
                    <tr
                      key={student.id}
                      className="hover:bg-bg-elevated transition-colors"
                    >
                      <td className="px-4 py-3 text-sm text-text-primary">
                        {student.name}
                      </td>
                      <td className="px-4 py-3 text-sm font-mono text-text-secondary">
                        {student.attendance}
                      </td>
                      <td className="px-4 py-3 text-sm font-mono text-text-secondary">
                        {student.taskCompletion}
                      </td>
                      <td className="px-4 py-3 text-sm font-mono text-text-secondary">
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
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
