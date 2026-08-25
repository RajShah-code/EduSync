import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "@/context/AuthContext";
import {
  createAnnouncement,
  fetchAdminAnnouncements,
  fetchAllClassSubjectsAdmin,
  ApiError,
} from "@/data/mockClassrooms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Megaphone,
  Globe,
  CheckSquare,
  Square,
  Send,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Search,
  Calendar,
  Layers,
  Sparkles,
} from "lucide-react";

export function AdminAnnouncements() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  // Composer Form State
  const [content, setContent] = useState("");
  const [isGlobal, setIsGlobal] = useState(true); // Mutually exclusive with targetIds
  const [targetIds, setTargetIds] = useState([]);
  const [classrooms, setClassrooms] = useState([]);
  const [classroomSearch, setClassroomSearch] = useState("");

  // History & Async Status
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [loadingClassrooms, setLoadingClassrooms] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Load classrooms for targeted selection
  const loadClassrooms = async () => {
    setLoadingClassrooms(true);
    try {
      const list = await fetchAllClassSubjectsAdmin();
      setClassrooms(list);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        navigate("/login", { replace: true });
        return;
      }
      console.warn("Failed to load class subjects:", err);
    } finally {
      setLoadingClassrooms(false);
    }
  };

  // Load admin announcement history
  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const data = await fetchAdminAnnouncements();
      setHistory(data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        navigate("/login", { replace: true });
        return;
      }
      setError(err.message || "Failed to load broadcast history.");
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    loadClassrooms();
    loadHistory();
  }, []);

  // Scope toggle handler (Enforces strict Mutual Exclusivity)
  const handleScopeChange = (globalState) => {
    setIsGlobal(globalState);
    if (globalState) {
      setTargetIds([]); // Clear targets if switching to Global
    }
  };

  // Target checkbox toggle
  const toggleTargetId = (id) => {
    const numId = Number(id);
    setTargetIds((prev) =>
      prev.includes(numId) ? prev.filter((i) => i !== numId) : [...prev, numId]
    );
  };

  // Select all / Deselect all
  const selectAllTargets = () => {
    setTargetIds(classrooms.map((c) => c.id));
  };
  const deselectAllTargets = () => {
    setTargetIds([]);
  };

  // Submit announcement
  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!content.trim() || publishing) return;

    if (!isGlobal && targetIds.length === 0) {
      setError("Please select at least one classroom or toggle 'Send to All Classrooms'.");
      return;
    }

    setPublishing(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const payload = {
        content: content.trim(),
        is_global: isGlobal,
        target_class_subject_ids: isGlobal ? [] : targetIds,
      };

      const result = await createAnnouncement(payload);
      if (result) {
        setSuccessMsg(
          isGlobal
            ? "Campus-wide announcement successfully broadcast to all classrooms!"
            : `Announcement successfully dispatched to ${targetIds.length} target classroom(s)!`
        );
        setContent("");
        if (!isGlobal) setTargetIds([]);
        loadHistory();
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        navigate("/login", { replace: true });
        return;
      }
      setError(err.message || "Failed to publish announcement.");
    } finally {
      setPublishing(false);
    }
  };

  const filteredClassrooms = classrooms.filter((cls) => {
    const q = classroomSearch.toLowerCase();
    return (
      cls.class_name?.toLowerCase().includes(q) ||
      cls.subject_name?.toLowerCase().includes(q) ||
      cls.teacher_name?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-8 page-enter">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-text-primary tracking-tight">
            Campus Announcements & Cohort Broadcasts
          </h1>
          <p className="text-xs text-text-secondary mt-0.5">
            Dispatch official college notices campus-wide or target specific class cohorts
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              loadHistory();
              loadClassrooms();
            }}
            disabled={loadingHistory || loadingClassrooms}
            className="h-9 px-3 text-xs gap-1.5 border-border"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${
                loadingHistory || loadingClassrooms ? "animate-spin text-admin-500" : ""
              }`}
            />
            <span>Sync</span>
          </Button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-4 border border-accent-critical/30 rounded-[var(--radius-lg)] bg-accent-critical/10 flex items-center justify-between gap-3 text-xs text-accent-critical">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setError(null)}
            className="h-6 px-2 text-xs text-accent-critical hover:bg-accent-critical/20"
          >
            Dismiss
          </Button>
        </div>
      )}

      {successMsg && (
        <div className="p-4 border border-accent-success/30 rounded-[var(--radius-lg)] bg-accent-success/10 flex items-center justify-between gap-3 text-xs text-accent-success">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSuccessMsg(null)}
            className="h-6 px-2 text-xs text-accent-success hover:bg-accent-success/20"
          >
            Dismiss
          </Button>
        </div>
      )}

      {/* Two-Column Grid: Left Composer, Right History */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* LEFT COLUMN: Composer Form */}
        <div className="lg:col-span-6 space-y-6">
          <Card className="border-border bg-bg-surface overflow-hidden">
            <CardHeader className="p-5 border-b border-border bg-bg-surface-3/30">
              <CardTitle className="text-sm font-semibold text-text-primary flex items-center gap-2">
                <Megaphone className="w-4 h-4 text-admin-500" />
                Publish Announcement
              </CardTitle>
            </CardHeader>

            <CardContent className="p-5 space-y-5">
              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Scope Selection: Mutually Exclusive */}
                <div className="space-y-3">
                  <label className="text-xs font-semibold text-text-primary block">
                    Distribution Scope
                  </label>

                  <div className="grid grid-cols-2 gap-3">
                    {/* Option 1: Send to All */}
                    <button
                      type="button"
                      onClick={() => handleScopeChange(true)}
                      className={`p-3.5 rounded-[var(--radius-md)] border text-left flex flex-col justify-between gap-2 transition-colors cursor-pointer ${
                        isGlobal
                          ? "border-admin-500 bg-admin-500/10 text-text-primary"
                          : "border-border bg-bg-surface hover:border-border-hover text-text-secondary"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold">Campus Global</span>
                        <Globe className={`w-4 h-4 ${isGlobal ? "text-admin-500" : "text-text-muted"}`} />
                      </div>
                      <span className="text-[11px] leading-tight text-text-muted">
                        Broadcast to all classrooms & cohorts
                      </span>
                    </button>

                    {/* Option 2: Target Specific Classrooms */}
                    <button
                      type="button"
                      onClick={() => handleScopeChange(false)}
                      className={`p-3.5 rounded-[var(--radius-md)] border text-left flex flex-col justify-between gap-2 transition-colors cursor-pointer ${
                        !isGlobal
                          ? "border-admin-500 bg-admin-500/10 text-text-primary"
                          : "border-border bg-bg-surface hover:border-border-hover text-text-secondary"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold">Targeted Cohorts</span>
                        <Layers className={`w-4 h-4 ${!isGlobal ? "text-admin-500" : "text-text-muted"}`} />
                      </div>
                      <span className="text-[11px] leading-tight text-text-muted">
                        Select specific class subjects
                      </span>
                    </button>
                  </div>
                </div>

                {/* Target Classrooms Multi-Select (Only visible when NOT global) */}
                {!isGlobal && (
                  <div className="space-y-3 p-4 rounded-[var(--radius-md)] border border-border bg-bg-surface-3/20">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-text-primary">
                        Select Target Classrooms ({targetIds.length} chosen)
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={selectAllTargets}
                          className="text-[11px] text-admin-300 hover:underline cursor-pointer"
                        >
                          Select All
                        </button>
                        <span className="text-text-muted">•</span>
                        <button
                          type="button"
                          onClick={deselectAllTargets}
                          className="text-[11px] text-text-muted hover:text-text-primary cursor-pointer"
                        >
                          Clear
                        </button>
                      </div>
                    </div>

                    {/* Search box for classrooms */}
                    <div className="relative">
                      <Input
                        value={classroomSearch}
                        onChange={(e) => setClassroomSearch(e.target.value)}
                        placeholder="Search class, subject, or faculty..."
                        className="pl-8 bg-bg-base border-border text-xs h-8"
                      />
                      <Search className="w-3.5 h-3.5 text-text-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
                    </div>

                    {/* Classrooms Checklist */}
                    <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1 border border-border/60 rounded-[var(--radius-sm)] p-2 bg-bg-base">
                      {filteredClassrooms.length === 0 ? (
                        <p className="text-xs text-text-muted text-center py-3">
                          No matching classrooms found
                        </p>
                      ) : (
                        filteredClassrooms.map((cls) => {
                          const isChecked = targetIds.includes(cls.id);
                          return (
                            <div
                              key={cls.id}
                              onClick={() => toggleTargetId(cls.id)}
                              className={`flex items-center justify-between p-2 rounded-[var(--radius-sm)] text-xs cursor-pointer transition-colors ${
                                isChecked
                                  ? "bg-admin-500/15 border border-admin-500/30 text-text-primary"
                                  : "hover:bg-bg-surface-3 text-text-secondary border border-transparent"
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                {isChecked ? (
                                  <CheckSquare className="w-4 h-4 text-admin-500 shrink-0" />
                                ) : (
                                  <Square className="w-4 h-4 text-text-muted shrink-0" />
                                )}
                                <div>
                                  <span className="font-semibold text-text-primary">
                                    {cls.class_name}
                                  </span>
                                  <span className="text-text-muted ml-1.5 font-normal">
                                    ({cls.subject_name})
                                  </span>
                                </div>
                              </div>

                              <span className="text-[10px] text-text-muted">
                                Prof. {cls.teacher_name}
                              </span>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}

                {/* Announcement Content Input */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-text-primary">
                      Announcement Content
                    </label>
                    <span className="text-[10px] text-text-muted tnum">
                      {content.length} characters
                    </span>
                  </div>
                  <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Enter the official announcement text..."
                    rows={4}
                    className="w-full rounded-[var(--radius-md)] border border-border bg-bg-base p-3 text-xs sm:text-sm text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-admin-500/20"
                    required
                  />
                </div>

                {/* Submit Action Button */}
                <Button
                  type="submit"
                  disabled={!content.trim() || publishing}
                  className="w-full h-10 font-semibold text-xs gap-2 btn-press bg-admin-700 hover:bg-admin-700/90 text-white"
                >
                  {publishing ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <span>
                        {isGlobal
                          ? "Broadcast Campus Global Notice"
                          : `Publish to ${targetIds.length} Selected Classroom(s)`}
                      </span>
                      <Send className="w-3.5 h-3.5" />
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* RIGHT COLUMN: History of Sent Announcements */}
        <div className="lg:col-span-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <span>Admin Broadcast History</span>
              {history.length > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-admin-500/15 text-admin-300 font-semibold tnum">
                  {history.length}
                </span>
              )}
            </h2>
            <span className="text-xs text-text-muted">Your dispatches</span>
          </div>

          {loadingHistory ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-28 rounded-[var(--radius-lg)] border border-border bg-bg-surface animate-pulse"
                />
              ))}
            </div>
          ) : history.length === 0 ? (
            <div className="p-12 text-center border border-border border-dashed rounded-[var(--radius-lg)] bg-bg-surface/30 flex flex-col items-center justify-center">
              <Megaphone className="w-6 h-6 text-text-muted mb-2" />
              <p className="text-sm font-semibold text-text-primary">No broadcasts sent yet</p>
              <p className="text-xs text-text-secondary mt-1">
                Announcements published from this panel will be tracked here.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {history.map((item) => {
                const formattedDate = item.created_at
                  ? new Date(item.created_at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  : "";
                const formattedTime = item.created_at
                  ? new Date(item.created_at).toLocaleTimeString(undefined, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "";

                const targetCount = Array.isArray(item.target_class_subject_ids)
                  ? item.target_class_subject_ids.length
                  : 0;

                return (
                  <div
                    key={item.id}
                    className="p-4 rounded-[var(--radius-lg)] border border-border bg-bg-surface space-y-3 card-hover"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2">
                        {item.is_global ? (
                          <Badge
                            variant="outline"
                            className="bg-admin-500/10 text-admin-300 border-admin-500/30 text-[10px] py-0.5 px-2 gap-1"
                          >
                            <Globe className="w-3 h-3 text-admin-500" />
                            <span>Campus Global Notice</span>
                          </Badge>
                        ) : (
                          <Badge
                            variant="secondary"
                            className="text-[10px] py-0.5 px-2 gap-1 font-medium text-text-secondary"
                          >
                            <Layers className="w-3 h-3" />
                            <span>{targetCount} Target Classroom(s)</span>
                          </Badge>
                        )}

                        <span className="text-[11px] text-text-muted">
                          Notice #{item.id}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 text-xs text-text-muted">
                        <Calendar className="w-3 h-3" />
                        <span className="tnum">
                          {formattedDate} {formattedTime ? `• ${formattedTime}` : ""}
                        </span>
                      </div>
                    </div>

                    <div className="p-3 rounded-[var(--radius-md)] bg-bg-base border border-border/70 text-xs sm:text-sm text-text-primary leading-relaxed">
                      <p className="whitespace-pre-wrap break-words">{item.content}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
