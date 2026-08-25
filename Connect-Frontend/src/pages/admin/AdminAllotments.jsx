import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "@/context/AuthContext";
import {
  fetchAllClassSubjectsAdmin,
  createClassSubjectAllotment,
  updateClassSubjectAllotment,
  deleteClassSubjectAllotment,
  fetchTeachersAdmin,
  fetchClassesAdmin,
  ApiError,
} from "@/data/mockClassrooms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  BookOpen,
  Users,
  GraduationCap,
  Plus,
  Edit2,
  Trash2,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Search,
  Lock,
  MessagesSquare,
  AlertTriangle,
  X,
  Layers,
  Sparkles,
  Filter,
} from "lucide-react";

export function AdminAllotments() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  // Allotments and Helpers data
  const [allotments, setAllotments] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [classes, setClasses] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMode, setFilterMode] = useState("all"); // "all" | "open" | "teacher_only"
  const [filterClass, setFilterClass] = useState("all");

  // Create / Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null); // null if creating, allotment obj if editing
  const [formTeacherId, setFormTeacherId] = useState("");
  const [formClassId, setFormClassId] = useState("");
  const [formSubjectName, setFormSubjectName] = useState("");
  const [formPostingMode, setFormPostingMode] = useState("teacher_only");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  // Delete Confirmation Modal State
  const [deletingItem, setDeletingItem] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Load all data
  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [allotmentsData, teachersData, classesData] = await Promise.all([
        fetchAllClassSubjectsAdmin(),
        fetchTeachersAdmin(),
        fetchClassesAdmin(),
      ]);

      setAllotments(allotmentsData);
      setTeachers(teachersData);
      setClasses(classesData);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        navigate("/login", { replace: true });
        return;
      }
      setError(err.message || "Failed to load classroom allotments data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Compute Cross-Classroom Overview Metrics
  const overview = useMemo(() => {
    const totalClassrooms = allotments.length;
    const uniqueTeacherIds = new Set(allotments.map((a) => a.teacher_id));
    const uniqueClassIds = new Set(allotments.map((a) => a.class_id));
    const openDiscussions = allotments.filter((a) => a.posting_mode === "open").length;
    const teacherOnly = allotments.filter((a) => a.posting_mode === "teacher_only").length;

    return {
      totalClassrooms,
      totalTeachers: uniqueTeacherIds.size,
      totalClasses: uniqueClassIds.size,
      openDiscussions,
      teacherOnly,
    };
  }, [allotments]);

  // Client-Side Duplicate-Prevention Check
  const duplicateWarning = useMemo(() => {
    if (!formTeacherId || !formClassId || !formSubjectName.trim()) return null;

    const normalizedSubject = formSubjectName.trim().toLowerCase();
    const match = allotments.find(
      (a) =>
        String(a.teacher_id) === String(formTeacherId) &&
        String(a.class_id) === String(formClassId) &&
        a.subject_name.trim().toLowerCase() === normalizedSubject &&
        (!editingItem || a.id !== editingItem.id)
    );

    if (match) {
      return `Warning: ${match.teacher_name || "This teacher"} is already assigned to "${match.subject_name}" for ${match.class_name || "this class"}.`;
    }
    return null;
  }, [formTeacherId, formClassId, formSubjectName, allotments, editingItem]);

  // Open Create Modal
  const handleOpenCreate = () => {
    setEditingItem(null);
    setFormTeacherId(teachers[0]?.id ? String(teachers[0].id) : "");
    setFormClassId(classes[0]?.id ? String(classes[0].id) : "");
    setFormSubjectName("");
    setFormPostingMode("teacher_only");
    setFormError(null);
    setIsModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (item) => {
    setEditingItem(item);
    setFormTeacherId(String(item.teacher_id));
    setFormClassId(String(item.class_id));
    setFormSubjectName(item.subject_name);
    setFormPostingMode(item.posting_mode || "teacher_only");
    setFormError(null);
    setIsModalOpen(true);
  };

  // Save Allotment (Create or Update)
  const handleSaveAllotment = async (e) => {
    if (e) e.preventDefault();
    if (!formTeacherId || !formClassId || !formSubjectName.trim() || submitting) return;

    setSubmitting(true);
    setFormError(null);
    setError(null);

    try {
      if (editingItem) {
        // Edit Allotment
        const updated = await updateClassSubjectAllotment(editingItem.id, {
          teacher_id: Number(formTeacherId),
          subject_name: formSubjectName.trim(),
          posting_mode: formPostingMode,
        });

        // Re-join names for local state update
        const teacherObj = teachers.find((t) => Number(t.id) === Number(formTeacherId));
        const classObj = classes.find((c) => Number(c.id) === Number(formClassId));

        setAllotments((prev) =>
          prev.map((a) =>
            a.id === editingItem.id
              ? {
                  ...a,
                  ...updated,
                  teacher_name: teacherObj?.name || a.teacher_name,
                  class_name: classObj?.name || a.class_name,
                }
              : a
          )
        );

        setSuccessMsg(`Allotment #${editingItem.id} updated successfully!`);
      } else {
        // Create Allotment
        const created = await createClassSubjectAllotment({
          teacher_id: Number(formTeacherId),
          class_id: Number(formClassId),
          subject_name: formSubjectName.trim(),
          posting_mode: formPostingMode,
        });

        const teacherObj = teachers.find((t) => Number(t.id) === Number(formTeacherId));
        const classObj = classes.find((c) => Number(c.id) === Number(formClassId));

        setAllotments((prev) => [
          {
            ...created,
            teacher_name: teacherObj?.name || "Teacher",
            class_name: classObj?.name || "Class",
          },
          ...prev,
        ]);

        setSuccessMsg(`New classroom allotment created successfully!`);
      }

      setIsModalOpen(false);
      setTimeout(() => setSuccessMsg(null), 3500);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        navigate("/login", { replace: true });
        return;
      }
      setFormError(err.message || "Failed to save allotment.");
    } finally {
      setSubmitting(false);
    }
  };

  // Delete Allotment
  const handleDeleteAllotment = async () => {
    if (!deletingItem || isDeleting) return;

    setIsDeleting(true);
    setError(null);

    try {
      await deleteClassSubjectAllotment(deletingItem.id);
      setAllotments((prev) => prev.filter((a) => a.id !== deletingItem.id));
      setSuccessMsg(`Allotment for "${deletingItem.subject_name}" removed successfully.`);
      setDeletingItem(null);
      setTimeout(() => setSuccessMsg(null), 3500);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        navigate("/login", { replace: true });
        return;
      }
      setError(err.message || "Failed to delete allotment.");
      setDeletingItem(null);
    } finally {
      setIsDeleting(false);
    }
  };

  // Filtered List
  const filteredAllotments = allotments.filter((item) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      item.subject_name?.toLowerCase().includes(q) ||
      item.teacher_name?.toLowerCase().includes(q) ||
      item.class_name?.toLowerCase().includes(q) ||
      String(item.id).includes(q);

    const matchesMode =
      filterMode === "all" || item.posting_mode === filterMode;

    const matchesClass =
      filterClass === "all" || String(item.class_id) === String(filterClass);

    return matchesSearch && matchesMode && matchesClass;
  });

  return (
    <div className="space-y-8 page-enter">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-text-primary tracking-tight">
            Classroom Allotments & Cohort Control
          </h1>
          <p className="text-xs text-text-secondary mt-0.5">
            Configure faculty subject assignments, manage classroom channels, and set posting permissions
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            disabled={loading}
            className="h-9 px-3 text-xs gap-1.5 border-border"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${loading ? "animate-spin text-admin-500" : ""}`}
            />
            <span>Refresh</span>
          </Button>

          <Button
            size="sm"
            onClick={handleOpenCreate}
            className="h-9 px-3 text-xs font-semibold gap-1.5 btn-press bg-admin-700 hover:bg-admin-700/90 text-white"
          >
            <Plus className="w-4 h-4" />
            <span>New Allotment</span>
          </Button>
        </div>
      </div>

      {/* Global Alerts */}
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

      {/* SECTION 1: Cross-Classroom Overview Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Card 1: Total Classrooms */}
        <Card className="border-border bg-bg-surface p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-text-secondary">Classrooms Active</span>
            <div className="w-8 h-8 rounded-[var(--radius-md)] bg-admin-500/10 border border-admin-500/20 flex items-center justify-center text-admin-500">
              <BookOpen className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-text-primary tnum font-mono">
              {overview.totalClassrooms}
            </span>
            <span className="text-[11px] text-text-muted">allotted channels</span>
          </div>
        </Card>

        {/* Card 2: Faculty Members */}
        <Card className="border-border bg-bg-surface p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-text-secondary">Faculty Allotted</span>
            <div className="w-8 h-8 rounded-[var(--radius-md)] bg-teacher-500/10 border border-teacher-500/20 flex items-center justify-center text-teacher-500">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-text-primary tnum font-mono">
              {overview.totalTeachers}
            </span>
            <span className="text-[11px] text-text-muted">assigned instructors</span>
          </div>
        </Card>

        {/* Card 3: Academic Classes */}
        <Card className="border-border bg-bg-surface p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-text-secondary">Academic Classes</span>
            <div className="w-8 h-8 rounded-[var(--radius-md)] bg-student-500/10 border border-student-500/20 flex items-center justify-center text-student-500">
              <GraduationCap className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-text-primary tnum font-mono">
              {overview.totalClasses}
            </span>
            <span className="text-[11px] text-text-muted">student cohorts</span>
          </div>
        </Card>

        {/* Card 4: Posting Permissions */}
        <Card className="border-border bg-bg-surface p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-text-secondary">Discussion Modes</span>
            <div className="w-8 h-8 rounded-[var(--radius-md)] bg-accent-success/10 border border-accent-success/20 flex items-center justify-center text-accent-success">
              <MessagesSquare className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-center gap-3 text-xs">
            <span className="text-text-primary font-medium flex items-center gap-1 tnum">
              <span className="w-2 h-2 rounded-full bg-accent-success" />
              {overview.openDiscussions} Open
            </span>
            <span className="text-text-muted flex items-center gap-1 tnum">
              <span className="w-2 h-2 rounded-full bg-text-muted" />
              {overview.teacherOnly} Broadcast
            </span>
          </div>
        </Card>
      </div>

      {/* SECTION 2: Allotments Table & Search Controls */}
      <Card className="border-border bg-bg-surface overflow-hidden">
        <CardHeader className="p-5 border-b border-border bg-bg-surface-3/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <CardTitle className="text-sm font-semibold text-text-primary flex items-center gap-2">
            <Layers className="w-4 h-4 text-admin-500" />
            <span>Classroom Allotments Directory</span>
            <span className="text-xs font-normal text-text-muted tnum">
              ({filteredAllotments.length} shown)
            </span>
          </CardTitle>

          {/* Search and Filters */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Search Input */}
            <div className="relative min-w-[200px]">
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search subject, faculty, or class..."
                className="pl-8 bg-bg-base border-border text-xs h-8"
              />
              <Search className="w-3.5 h-3.5 text-text-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
            </div>

            {/* Filter by Mode */}
            <select
              value={filterMode}
              onChange={(e) => setFilterMode(e.target.value)}
              className="bg-bg-base border border-border rounded-[var(--radius-md)] text-xs h-8 px-2 text-text-secondary focus:outline-none focus:ring-1 focus:ring-admin-500"
            >
              <option value="all">All Modes</option>
              <option value="open">Open Discussion</option>
              <option value="teacher_only">Announcements Only</option>
            </select>

            {/* Filter by Class */}
            <select
              value={filterClass}
              onChange={(e) => setFilterClass(e.target.value)}
              className="bg-bg-base border border-border rounded-[var(--radius-md)] text-xs h-8 px-2 text-text-secondary focus:outline-none focus:ring-1 focus:ring-admin-500"
            >
              <option value="all">All Classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </CardHeader>

        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <div className="p-8 space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-12 rounded-[var(--radius-md)] bg-bg-surface-3 animate-pulse"
                />
              ))}
            </div>
          ) : filteredAllotments.length === 0 ? (
            <div className="p-12 text-center flex flex-col items-center justify-center text-text-muted">
              <BookOpen className="w-8 h-8 text-text-muted mb-2" />
              <p className="text-sm font-semibold text-text-primary">No classroom allotments found</p>
              <p className="text-xs text-text-secondary mt-1">
                {searchQuery || filterMode !== "all" || filterClass !== "all"
                  ? "Try adjusting your search query or filters."
                  : "Click 'New Allotment' to assign subjects to faculty members."}
              </p>
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border bg-bg-surface-3/40 text-text-secondary font-medium">
                  <th className="py-3 px-4 w-16">ID</th>
                  <th className="py-3 px-4">Subject Name</th>
                  <th className="py-3 px-4">Class / Cohort</th>
                  <th className="py-3 px-4">Assigned Faculty</th>
                  <th className="py-3 px-4">Posting Mode</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredAllotments.map((row) => {
                  const isOpen = row.posting_mode === "open";
                  return (
                    <tr
                      key={row.id}
                      className="hover:bg-bg-surface-3/30 transition-colors group"
                    >
                      <td className="py-3.5 px-4 font-mono text-text-muted tnum">
                        #{row.id}
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="font-semibold text-text-primary">
                          {row.subject_name}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <Badge
                          variant="secondary"
                          className="bg-student-500/10 text-student-400 border-student-500/20 text-[10px] py-0 px-2 font-medium"
                        >
                          {row.class_name}
                        </Badge>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-teacher-500 shrink-0" />
                          <span className="text-text-primary font-medium">
                            {row.teacher_name}
                          </span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        {isOpen ? (
                          <Badge
                            variant="outline"
                            className="bg-accent-success/10 text-accent-success border-accent-success/30 text-[10px] py-0 px-1.5 gap-1 font-normal"
                          >
                            <MessagesSquare className="w-3 h-3" />
                            <span>Open Discussion</span>
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="bg-bg-surface-3 text-text-muted border-border text-[10px] py-0 px-1.5 gap-1 font-normal"
                          >
                            <Lock className="w-3 h-3" />
                            <span>Faculty Broadcast</span>
                          </Badge>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenEdit(row)}
                            className="h-7 w-7 text-text-muted hover:text-text-primary hover:bg-bg-surface-3"
                            title="Edit allotment"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>

                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeletingItem(row)}
                            className="h-7 w-7 text-text-muted hover:text-accent-critical hover:bg-accent-critical/10"
                            title="Delete allotment"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* ─────────────────────────────────────────────────────────────
          MODAL 1: CREATE / EDIT ALLOTMENT
          ───────────────────────────────────────────────────────────── */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="w-full max-w-lg rounded-[var(--radius-lg)] border border-border bg-bg-surface shadow-2xl overflow-hidden animate-scaleIn">
            <div className="p-4 px-6 border-b border-border bg-bg-surface-3/40 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-admin-500" />
                <span>{editingItem ? `Edit Allotment #${editingItem.id}` : "Create New Classroom Allotment"}</span>
              </h3>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsModalOpen(false)}
                className="h-7 w-7 text-text-muted hover:text-text-primary"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <form onSubmit={handleSaveAllotment} className="p-6 space-y-4">
              {/* Form Error Banner */}
              {formError && (
                <div className="p-3 bg-accent-critical/10 border border-accent-critical/30 rounded-[var(--radius-md)] flex items-center gap-2 text-xs text-accent-critical">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Client-Side Duplicate-Prevention Hint */}
              {duplicateWarning && (
                <div className="p-3 bg-accent-warning/10 border border-accent-warning/30 rounded-[var(--radius-md)] flex items-center gap-2 text-xs text-accent-warning">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{duplicateWarning}</span>
                </div>
              )}

              {/* Teacher Picker */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-text-primary">
                  Faculty Member
                </label>
                <select
                  value={formTeacherId}
                  onChange={(e) => setFormTeacherId(e.target.value)}
                  className="w-full bg-bg-base border border-border rounded-[var(--radius-md)] text-xs h-9 px-3 text-text-primary focus:outline-none focus:ring-2 focus:ring-admin-500/20"
                  required
                >
                  <option value="" disabled>Select faculty teacher...</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.email})
                    </option>
                  ))}
                </select>
              </div>

              {/* Class Picker */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-text-primary">
                  Academic Class Cohort
                </label>
                <select
                  value={formClassId}
                  onChange={(e) => setFormClassId(e.target.value)}
                  disabled={Boolean(editingItem)} // Class is fixed during edit per backend schema
                  className="w-full bg-bg-base border border-border rounded-[var(--radius-md)] text-xs h-9 px-3 text-text-primary focus:outline-none focus:ring-2 focus:ring-admin-500/20 disabled:opacity-60 disabled:cursor-not-allowed"
                  required
                >
                  <option value="" disabled>Select target class...</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {editingItem && (
                  <p className="text-[10px] text-text-muted">
                    Class cohort is locked after allotment creation.
                  </p>
                )}
              </div>

              {/* Subject Name Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-text-primary">
                  Subject / Course Name
                </label>
                <Input
                  value={formSubjectName}
                  onChange={(e) => setFormSubjectName(e.target.value)}
                  placeholder="e.g. Data Structures & Algorithms"
                  className="bg-bg-base border-border text-xs h-9"
                  required
                />
              </div>

              {/* Posting Mode Selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-text-primary">
                  Default Posting Permission
                </label>
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setFormPostingMode("teacher_only")}
                    className={`p-3 rounded-[var(--radius-md)] border text-left flex items-center justify-between transition-colors cursor-pointer ${
                      formPostingMode === "teacher_only"
                        ? "border-admin-500 bg-admin-500/10 text-text-primary"
                        : "border-border bg-bg-base hover:bg-bg-surface-3 text-text-secondary"
                    }`}
                  >
                    <div>
                      <span className="text-xs font-semibold block">Faculty Only</span>
                      <span className="text-[10px] text-text-muted">Broadcast channel</span>
                    </div>
                    <Lock className={`w-3.5 h-3.5 ${formPostingMode === "teacher_only" ? "text-admin-500" : "text-text-muted"}`} />
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormPostingMode("open")}
                    className={`p-3 rounded-[var(--radius-md)] border text-left flex items-center justify-between transition-colors cursor-pointer ${
                      formPostingMode === "open"
                        ? "border-admin-500 bg-admin-500/10 text-text-primary"
                        : "border-border bg-bg-base hover:bg-bg-surface-3 text-text-secondary"
                    }`}
                  >
                    <div>
                      <span className="text-xs font-semibold block">Open Discussion</span>
                      <span className="text-[10px] text-text-muted">Students can chat</span>
                    </div>
                    <MessagesSquare className={`w-3.5 h-3.5 ${formPostingMode === "open" ? "text-admin-500" : "text-text-muted"}`} />
                  </button>
                </div>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsModalOpen(false)}
                  disabled={submitting}
                  className="h-8 text-xs text-text-secondary"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={!formTeacherId || !formClassId || !formSubjectName.trim() || submitting}
                  className="h-8 text-xs font-semibold gap-1.5 btn-press bg-admin-700 hover:bg-admin-700/90 text-white"
                >
                  {submitting ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <>
                      <span>{editingItem ? "Save Changes" : "Create Allotment"}</span>
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL 2: CONFIRM DELETE ALLOTMENT
          ───────────────────────────────────────────────────────────── */}
      {deletingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="w-full max-w-md rounded-[var(--radius-lg)] border border-accent-critical/30 bg-bg-surface shadow-2xl p-6 space-y-4 animate-scaleIn">
            <div className="flex items-center gap-3 text-accent-critical">
              <div className="w-10 h-10 rounded-full bg-accent-critical/10 border border-accent-critical/20 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-accent-critical" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-text-primary">
                  Delete Classroom Allotment?
                </h3>
                <p className="text-xs text-text-muted">
                  Action will remove channel #{deletingItem.id} permanently.
                </p>
              </div>
            </div>

            <p className="text-xs text-text-secondary leading-relaxed bg-bg-base p-3 rounded-[var(--radius-md)] border border-border">
              Are you sure you want to remove the allotment of{" "}
              <strong className="text-text-primary">{deletingItem.subject_name}</strong> for class{" "}
              <strong className="text-text-primary">{deletingItem.class_name}</strong> (taught by Prof.{" "}
              {deletingItem.teacher_name})?
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setDeletingItem(null)}
                disabled={isDeleting}
                className="h-8 text-xs text-text-secondary"
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleDeleteAllotment}
                disabled={isDeleting}
                className="h-8 text-xs font-semibold gap-1.5 px-3 bg-accent-critical hover:bg-accent-critical/90 text-white"
              >
                {isDeleting ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Confirm Delete</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
