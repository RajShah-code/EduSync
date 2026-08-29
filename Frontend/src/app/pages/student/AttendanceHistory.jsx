import { API_BASE_URL } from "../../config/api.js";
import { useState, useEffect } from "react";
import { StatusBadge } from "../../components/StatusBadge";
import { Skeleton } from "../../components/ui/skeleton";
import { IconCalendarCheck as CalendarCheck, IconFilter as Filter, IconChevronLeft as ChevronLeft, IconChevronRight as ChevronRight, IconChevronDown as ChevronDown, IconArrowsUpDown as ArrowUpDown, IconAlertTriangle as TriangleAlert } from "@tabler/icons-react";
import { getSocket } from "../../store/socket";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { AppTour } from "../../components/AppTour";
import { attendancePageTourSteps } from "../../tours/studentTourSteps";
import { hasSeenPageTour, markPageTourSeen } from "../../tours/pageTours";
import PageShell from "../../components/PageShell";

export function AttendanceHistory() {
  const [attendance, setAttendance] = useState([]);
  const [totalSessions, setTotalSessions] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filter States
  const [selectedSubject, setSelectedSubject] = useState("");
  const [selectedTeacher, setSelectedTeacher] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const [sortOrder, setSortOrder] = useState("new"); // "new" = newest first, "old" = oldest first
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [runTour, setRunTour] = useState(false);

  // Pagination — 5 rows by default, keeps a large attendance history from
  // making the page endlessly long.
  const [pageSize, setPageSize] = useState(5);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    if (!hasSeenPageTour("attendance")) {
      const timer = setTimeout(() => setRunTour(true), 400);
      return () => clearTimeout(timer);
    }
  }, []);

  const fetchAttendance = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("edusync_token");
      if (!token) {
        setError("Your session has expired. Please log in again.");
        return;
      }

      // Decode student id from token payload
      const payload = JSON.parse(atob(token.split(".")[1]));
      const studentId = payload.id;
      if (!studentId) {
        setError("We couldn't verify your account. Please log in again.");
        return;
      }

      const res = await fetch(`${API_BASE_URL}/attendance/student/${studentId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAttendance(data.records || []);
        setTotalSessions(data.totalLectures || 0);
        setError(null);
      } else {
        setError("We couldn't load your attendance records. Please try again.");
      }
    } catch (err) {
      console.error(err);
      setError("A network error occurred while loading your attendance. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Derive unique Subjects and Teachers from fetched records
  const subjects = [...new Set(attendance.map((a) => a.subject).filter(Boolean))].sort();
  const teachers = [...new Set(attendance.map((a) => a.teacher_name).filter(Boolean))].sort();

  // Client-side filtering
  const filteredAttendance = attendance
    .filter((a) => {
      if (selectedSubject && a.subject !== selectedSubject) return false;
      if (selectedTeacher && a.teacher_name !== selectedTeacher) return false;
      if (selectedStatus && a.status !== selectedStatus) return false;
      return true;
    })
    .sort((a, b) => {
      const diff = new Date(a.started_at).getTime() - new Date(b.started_at).getTime();
      return sortOrder === "old" ? diff : -diff;
    });

  // Reset to page 1 whenever the filtered set or page size changes, so we
  // never land on a page that no longer exists.
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedSubject, selectedTeacher, selectedStatus, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filteredAttendance.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const pageStart = (safePage - 1) * pageSize;
  const paginatedAttendance = filteredAttendance.slice(pageStart, pageStart + pageSize);

  // Dynamic stats derived from the filtered set
  const activeFilterCount = [selectedSubject, selectedTeacher, selectedStatus].filter(Boolean).length;
  const isFiltered = activeFilterCount > 0;
  const totalCount = isFiltered ? filteredAttendance.length : totalSessions;
  const presentCount = filteredAttendance.filter((a) => a.status === "present").length;
  const absentCount = Math.max(0, totalCount - presentCount);
  const attendanceRate =
    totalCount > 0 ? ((presentCount / totalCount) * 100).toFixed(1) : "0.0";

  if (loading) {
    return (
      <PageShell>
        <div className="space-y-2">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>

        <div className="bg-bg-surface border border-border rounded-[var(--radius-lg)]">
          <div className="grid grid-cols-2 md:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="text-center py-5 px-4 space-y-2">
                <Skeleton className="h-8 w-12 mx-auto" />
                <Skeleton className="h-3 w-20 mx-auto" />
              </div>
            ))}
          </div>
        </div>

        <div className="bg-bg-surface border border-border rounded-[var(--radius-lg)] p-4 flex items-center justify-between gap-4">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-8 w-32" />
        </div>

        <div className="bg-bg-surface border border-border rounded-[var(--radius-lg)] overflow-hidden">
          <div className="divide-y divide-border">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </PageShell>
    );
  }

  if (error) {
    return (
      <PageShell>
        <div>
          <h1 className="text-2xl font-semibold text-text-primary mb-1">
            Attendance History
          </h1>
          <p className="text-text-secondary">Your session attendance record</p>
        </div>
        <div className="p-8 bg-bg-surface border border-accent-critical/25 rounded-[var(--radius-lg)] flex flex-col items-center justify-center gap-3 py-16">
          <TriangleAlert className="w-14 h-14 text-accent-critical" strokeWidth={1.75} />
          <h3 className="text-base font-medium text-text-primary">
            Couldn't load your attendance
          </h3>
          <p className="text-sm text-text-secondary text-center max-w-sm">{error}</p>
          <button
            type="button"
            onClick={fetchAttendance}
            className="mt-2 px-4 py-2 bg-accent-500 hover:bg-accent-500/90 text-white text-sm font-medium rounded-[var(--radius-md)] transition-colors"
          >
            Try again
          </button>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-text-primary mb-1">
          Attendance History
        </h1>
        <p className="text-text-secondary">Your session attendance record</p>
      </div>

      {attendance.length > 0 ? (
        <>
          {/* Summary Stats — hairline-divided row, reads as an instrument readout.
              Dividers float (inset top/bottom) rather than running edge-to-edge. */}
          <div className="bg-bg-surface border border-border rounded-[var(--radius-lg)]" data-tour="attendance-stats">
            <div className="grid grid-cols-2 md:grid-cols-4">
              <div className="relative text-center py-5 px-4">
                <div className="text-3xl tnum font-semibold text-text-primary mb-1">
                  {totalCount}
                </div>
                <div className="text-xs text-text-secondary uppercase tracking-wider">
                  Total Sessions
                </div>
              </div>
              <div className="relative text-center py-5 px-4">
                <span className="absolute left-0 top-3 bottom-3 w-px bg-border" aria-hidden="true" />
                <div className="text-3xl tnum font-semibold text-accent-success mb-1">
                  {presentCount}
                </div>
                <div className="text-xs text-text-secondary uppercase tracking-wider">
                  Present
                </div>
              </div>
              <div className="relative text-center py-5 px-4">
                <span className="absolute left-0 top-3 bottom-3 w-px bg-border" aria-hidden="true" />
                <div className="text-3xl tnum font-semibold text-accent-critical mb-1">
                  {absentCount}
                </div>
                <div className="text-xs text-text-secondary uppercase tracking-wider">
                  Absent
                </div>
              </div>
              <div className="relative text-center py-5 px-4">
                <span className="absolute left-0 top-3 bottom-3 w-px bg-border" aria-hidden="true" />
                <div className="text-3xl tnum font-semibold text-accent-500 mb-1">
                  {attendanceRate}%
                </div>
                <div className="text-xs text-text-secondary uppercase tracking-wider">
                  Attendance Rate
                </div>
              </div>
            </div>
          </div>

          {/* Filter/Sort Bar — filters collapse behind a disclosure so the page
              opens with 2 visible controls (Filters toggle, Sort), not 6. */}
          <div className="bg-bg-surface border border-border rounded-[var(--radius-lg)]" data-tour="attendance-filters">
            <div className="flex items-center justify-between gap-4 flex-wrap p-4">
              <button
                type="button"
                onClick={() => setFiltersOpen((v) => !v)}
                aria-expanded={filtersOpen}
                className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary hover:text-text-primary uppercase tracking-wider transition-colors rounded-[var(--radius-sm)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface"
              >
                <Filter className="w-4 h-4 text-text-muted shrink-0" strokeWidth={1.75} />
                Filters
                {activeFilterCount > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[1.1rem] h-[1.1rem] px-1 rounded-[var(--radius-pill)] bg-accent-500/15 text-accent-500 text-[10px] tnum normal-case tracking-normal">
                    {activeFilterCount}
                  </span>
                )}
                <ChevronDown
                  className={`w-4 h-4 text-text-muted transition-transform duration-150 ${filtersOpen ? "rotate-180" : ""}`}
                  strokeWidth={1.75}
                />
              </button>

              {/* Sort Order — a view control, not a filter, so it stays visible */}
              <div className="flex items-center gap-2">
                <label htmlFor="sort-order" className="text-xs font-medium text-text-secondary flex items-center gap-1.5">
                  <ArrowUpDown className="w-4 h-4 text-text-muted" strokeWidth={1.75} />
                  Sort
                </label>
                <Select value={sortOrder} onValueChange={setSortOrder}>
                  <SelectTrigger id="sort-order" size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">Newest first</SelectItem>
                    <SelectItem value="old">Oldest first</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {filtersOpen && (
              <div className="flex items-center justify-between gap-4 flex-wrap px-4 pb-4 pt-4 border-t border-border">
                <div className="flex items-center gap-4 flex-wrap">
                  {/* Subject Filter */}
                  <div className="flex items-center gap-2">
                    <label htmlFor="subject-filter" className="text-xs font-medium text-text-secondary">
                      Subject
                    </label>
                    <Select
                      value={selectedSubject || "__all__"}
                      onValueChange={(v) => setSelectedSubject(v === "__all__" ? "" : v)}
                    >
                      <SelectTrigger id="subject-filter" size="sm">
                        <SelectValue placeholder="All Subjects" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">All Subjects ({subjects.length})</SelectItem>
                        {subjects.map((subj) => (
                          <SelectItem key={subj} value={subj}>
                            {subj}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Teacher Filter */}
                  <div className="flex items-center gap-2">
                    <label htmlFor="teacher-filter" className="text-xs font-medium text-text-secondary">
                      Teacher
                    </label>
                    <Select
                      value={selectedTeacher || "__all__"}
                      onValueChange={(v) => setSelectedTeacher(v === "__all__" ? "" : v)}
                    >
                      <SelectTrigger id="teacher-filter" size="sm">
                        <SelectValue placeholder="All Teachers" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">All Teachers ({teachers.length})</SelectItem>
                        {teachers.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Status Filter */}
                  <div className="flex items-center gap-2">
                    <label htmlFor="status-filter" className="text-xs font-medium text-text-secondary">
                      Status
                    </label>
                    <Select
                      value={selectedStatus || "__all__"}
                      onValueChange={(v) => setSelectedStatus(v === "__all__" ? "" : v)}
                    >
                      <SelectTrigger id="status-filter" size="sm">
                        <SelectValue placeholder="All" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">All</SelectItem>
                        <SelectItem value="present">Present</SelectItem>
                        <SelectItem value="absent">Absent</SelectItem>
                        <SelectItem value="partial">Partial</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {isFiltered && (
                  <button
                    onClick={() => {
                      setSelectedSubject("");
                      setSelectedTeacher("");
                      setSelectedStatus("");
                    }}
                    className="text-xs text-accent-500 font-medium px-2 py-1 -my-1 rounded-[var(--radius-sm)] hover:bg-accent-500/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface"
                  >
                    Reset Filters
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Attendance Table */}
          <div className="bg-bg-surface border border-border rounded-[var(--radius-lg)] overflow-hidden" data-tour="attendance-table">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-bg-elevated">
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                      Session Date
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                      Session Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                      Subject
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                      Teacher
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paginatedAttendance.length > 0 ? (
                    paginatedAttendance.map((record, idx) => (
                      <tr
                        key={record.id}
                        className="table-row-hover transition-colors stagger-enter"
                        style={{ animationDelay: `${Math.min(idx, 8) * 35}ms` }}
                      >
                        <td className="px-4 py-3 text-sm text-text-primary tnum">
                          {new Date(record.started_at).toLocaleDateString(undefined, {
                            weekday: 'short',
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                          })}
                        </td>
                        <td className="px-4 py-3 text-sm text-text-primary font-medium">
                          {record.lecture_name}
                        </td>
                        <td className="px-4 py-3 text-sm text-text-secondary">
                          {record.subject || "—"}
                        </td>
                        <td className="px-4 py-3 text-sm text-text-secondary">
                          {record.teacher_name || "—"}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={record.status} />
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-xs text-text-secondary">
                        No attendance records match the selected filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {filteredAttendance.length > 0 && (
              <div className="flex items-center justify-between gap-4 flex-wrap px-4 py-3 border-t border-border">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-secondary">Rows per page</span>
                  <Select
                    value={String(pageSize)}
                    onValueChange={(v) => setPageSize(Number(v))}
                  >
                    <SelectTrigger size="sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[5, 10, 25, 50].map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-4">
                  <span className="text-xs tnum text-text-secondary">
                    {pageStart + 1}–{Math.min(pageStart + pageSize, filteredAttendance.length)} of {filteredAttendance.length}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={safePage <= 1}
                      className="p-1.5 rounded-[var(--radius-sm)] border border-border text-text-secondary hover:text-text-primary hover:border-border-hover transition-colors disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface"
                      aria-label="Previous page"
                    >
                      <ChevronLeft className="w-4 h-4" strokeWidth={1.75} />
                    </button>
                    <span className="text-xs tnum text-text-primary px-2 min-w-[4.5rem] text-center">
                      Page {safePage} / {totalPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={safePage >= totalPages}
                      className="p-1.5 rounded-[var(--radius-sm)] border border-border text-text-secondary hover:text-text-primary hover:border-border-hover transition-colors disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface"
                      aria-label="Next page"
                    >
                      <ChevronRight className="w-4 h-4" strokeWidth={1.75} />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="p-8 bg-bg-surface border border-border rounded-[var(--radius-lg)] flex flex-col items-center justify-center gap-3 py-16">
          <CalendarCheck className="w-14 h-14 text-text-muted" strokeWidth={1.75} />
          <h3 className="text-base font-medium text-text-primary">
            No attendance history
          </h3>
          <p className="text-sm text-text-secondary">
            You haven't attended any lab sessions yet.
          </p>
        </div>
      )}

      {attendance.length > 0 && (
        <AppTour
          steps={attendancePageTourSteps}
          run={runTour}
          isManualReplay={true}
          onFinish={() => {
            setRunTour(false);
            markPageTourSeen("attendance");
          }}
        />
      )}
    </PageShell>
  );
}
