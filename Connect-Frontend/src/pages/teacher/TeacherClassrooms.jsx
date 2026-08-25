import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "@/context/AuthContext";
import { fetchClassroomsByRole, ApiError } from "@/data/mockClassrooms";
import { ClassroomCard } from "@/components/common/ClassroomCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, BookOpen, RefreshCw, AlertCircle, Inbox } from "lucide-react";

export function TeacherClassrooms() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [classrooms, setClassrooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchClassroomsByRole("teacher");
      setClassrooms(data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        navigate("/login", { replace: true });
        return;
      }
      setError(err.message || "Failed to load classrooms. Please check your network connection.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredClassrooms = classrooms.filter((cls) => {
    const q = searchQuery.toLowerCase();
    return (
      (cls.display_name && cls.display_name.toLowerCase().includes(q)) ||
      (cls.class_name && cls.class_name.toLowerCase().includes(q)) ||
      (cls.subject_name && cls.subject_name.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6 page-enter">
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-text-primary tracking-tight">
            Assigned Classrooms
          </h1>
          <p className="text-xs text-text-secondary mt-0.5">
            Manage student cohorts, broadcast announcements, and monitor real-time class channels
          </p>
        </div>

        {/* Quick Stats Summary */}
        {!loading && !error && (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-[var(--radius-md)] bg-bg-surface border border-border">
              <BookOpen className="w-3.5 h-3.5 text-accent-500" />
              <span className="text-xs text-text-secondary">Classrooms:</span>
              <span className="text-xs font-semibold text-text-primary tnum">{classrooms.length}</span>
            </div>
          </div>
        )}
      </div>

      {/* Action Bar */}
      <div className="flex items-center justify-between gap-3">
        <div className="relative max-w-sm w-full">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search classes, subjects..."
            className="pl-9 bg-bg-surface border-border text-xs"
            disabled={loading || !!error}
          />
          <Search className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            disabled={loading}
            className="h-9 px-3 gap-1.5"
            title="Refresh classroom data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-accent-500" : ""}`} />
            <span className="hidden sm:inline text-xs">Sync</span>
          </Button>
        </div>
      </div>

      {/* Error State */}
      {error && !loading && (
        <div className="p-6 border border-accent-critical/30 rounded-[var(--radius-lg)] bg-accent-critical/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-accent-critical shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-accent-critical">Unable to load classrooms</h3>
              <p className="text-xs text-text-secondary mt-0.5">{error}</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            className="shrink-0 border-accent-critical/40 hover:bg-accent-critical/20 text-accent-critical text-xs"
          >
            Try Again
          </Button>
        </div>
      )}

      {/* Loading State Skeleton */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-44 rounded-[var(--radius-lg)] border border-border bg-bg-surface/50 relative overflow-hidden"
            >
              <div className="p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-[var(--radius-md)] bg-bg-surface-3 animate-pulse" />
                  <div className="space-y-2 flex-1">
                    <div className="h-4 w-28 bg-bg-surface-3 rounded animate-pulse" />
                    <div className="h-3 w-16 bg-bg-surface-3 rounded animate-pulse" />
                  </div>
                </div>
                <div className="h-3 w-full bg-bg-surface-3 rounded animate-pulse mt-4" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty State: Zero classrooms allotted */}
      {!loading && !error && classrooms.length === 0 && (
        <div className="p-12 text-center border border-border border-dashed rounded-[var(--radius-lg)] bg-bg-surface/30 flex flex-col items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-bg-surface-3 border border-border flex items-center justify-center text-text-muted mb-3">
            <Inbox className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-semibold text-text-primary">No classrooms assigned yet</h3>
          <p className="text-xs text-text-secondary max-w-sm mt-1 leading-relaxed">
            You haven&apos;t been allotted any class subjects yet. Please contact your system administrator to assign your classrooms.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            className="mt-4 text-xs gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Check again
          </Button>
        </div>
      )}

      {/* Empty State: Search filter yielded 0 results */}
      {!loading && !error && classrooms.length > 0 && filteredClassrooms.length === 0 && (
        <div className="p-10 text-center border border-border border-dashed rounded-[var(--radius-lg)] bg-bg-surface/30">
          <p className="text-sm text-text-secondary font-medium">No matching classrooms</p>
          <p className="text-xs text-text-muted mt-1">
            No classrooms found matching &ldquo;{searchQuery}&rdquo;
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSearchQuery("")}
            className="mt-3 text-xs text-accent-500 hover:text-accent-500/80"
          >
            Clear filter
          </Button>
        </div>
      )}

      {/* Classroom Cards Grid */}
      {!loading && !error && filteredClassrooms.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredClassrooms.map((cls) => (
            <ClassroomCard
              key={cls.id}
              classroom={cls}
              role="teacher"
              onSelect={(selected) => {
                navigate(`/teacher/classrooms/${selected.id}`, {
                  state: { classroom: selected },
                });
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
