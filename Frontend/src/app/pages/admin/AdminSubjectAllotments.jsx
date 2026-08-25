import { API_BASE_URL } from "../../config/api.js";
import { useState, useEffect, useMemo } from "react";
import {
  Plus,
  Edit2,
  Trash2,
  X,
  AlertTriangle,
  ClipboardList,
  Search,
  UserX,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";

const SEMESTERS = Array.from({ length: 8 }, (_, i) => i + 1);

export function AdminSubjectAllotments() {
  const [allotments, setAllotments] = useState([]);
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [filterClass, setFilterClass] = useState("all");
  const [filterSemester, setFilterSemester] = useState("all");
  const [filterTeacher, setFilterTeacher] = useState("all");

  // Create/Edit modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formClassId, setFormClassId] = useState("");
  const [formSubjectId, setFormSubjectId] = useState("");
  const [formSemester, setFormSemester] = useState("1");
  const [formTeacherId, setFormTeacherId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Delete confirm
  const [deletingItem, setDeletingItem] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("edusync_token");
      const headers = { Authorization: `Bearer ${token}` };

      const [allotmentsRes, classesRes, subjectsRes, teachersRes] = await Promise.all([
        fetch(`${API_BASE_URL}/admin/subject-allotments`, { headers }),
        fetch(`${API_BASE_URL}/classes`, { headers }),
        fetch(`${API_BASE_URL}/subjects`, { headers }),
        fetch(`${API_BASE_URL}/admin/users?role=teacher`, { headers }),
      ]);

      const [allotmentsData, classesData, subjectsData, teachersData] = await Promise.all([
        allotmentsRes.json(),
        classesRes.json(),
        subjectsRes.json(),
        teachersRes.json(),
      ]);

      if (!allotmentsRes.ok) throw new Error(allotmentsData.message || "Failed to load allotments");

      setAllotments(allotmentsData.allotments || []);
      setClasses(classesData.classes || []);
      setSubjects(subjectsData.subjects || []);
      setTeachers(teachersData.users || []);
    } catch (err) {
      toast.error(err.message || "Failed to load subject allotment data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredAllotments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allotments.filter((a) => {
      const matchesSearch =
        !q ||
        a.subject_name?.toLowerCase().includes(q) ||
        a.class_name?.toLowerCase().includes(q) ||
        a.teacher_name?.toLowerCase().includes(q);
      const matchesClass = filterClass === "all" || String(a.class_id) === String(filterClass);
      const matchesSemester = filterSemester === "all" || String(a.semester) === String(filterSemester);
      const matchesTeacher =
        filterTeacher === "all" ||
        (filterTeacher === "unassigned" ? !a.teacher_id : String(a.teacher_id) === String(filterTeacher));
      return matchesSearch && matchesClass && matchesSemester && matchesTeacher;
    });
  }, [allotments, searchQuery, filterClass, filterSemester, filterTeacher]);

  const handleOpenCreate = () => {
    setEditingItem(null);
    setFormClassId(classes[0]?.id ? String(classes[0].id) : "");
    setFormSubjectId(subjects[0]?.id ? String(subjects[0].id) : "");
    setFormSemester("1");
    setFormTeacherId("");
    setIsModalOpen(true);
  };

  const handleOpenEdit = (item) => {
    setEditingItem(item);
    setFormClassId(String(item.class_id));
    setFormSubjectId(String(item.subject_id));
    setFormSemester(String(item.semester));
    setFormTeacherId(item.teacher_id ? String(item.teacher_id) : "");
    setIsModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formClassId || !formSubjectId || !formSemester || submitting) return;

    setSubmitting(true);
    try {
      const token = localStorage.getItem("edusync_token");
      const url = editingItem
        ? `${API_BASE_URL}/admin/subject-allotments/${editingItem.id}`
        : `${API_BASE_URL}/admin/subject-allotments`;
      const method = editingItem ? "PUT" : "POST";

      const body = editingItem
        ? { semester: Number(formSemester), teacher_id: formTeacherId || null }
        : {
            class_id: Number(formClassId),
            subject_id: Number(formSubjectId),
            semester: Number(formSemester),
            teacher_id: formTeacherId || null,
          };

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.message || "Failed to save allotment");
        return;
      }

      toast.success(editingItem ? "Allotment updated successfully!" : "New allotment created successfully!");
      setIsModalOpen(false);
      fetchData();
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingItem || isDeleting) return;

    setIsDeleting(true);
    try {
      const token = localStorage.getItem("edusync_token");
      const res = await fetch(`${API_BASE_URL}/admin/subject-allotments/${deletingItem.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.message || "Failed to delete allotment");
        return;
      }

      toast.success("Allotment removed successfully.");
      setDeletingItem(null);
      fetchData();
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header + filters */}
      <div className="flex-shrink-0 px-6 pt-6 pb-4 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-text-primary mb-1">
              Subject Allotments
            </h1>
            <p className="text-sm text-text-secondary">
              Allot subjects to a class for a semester, and assign the teacher who will teach it
            </p>
          </div>
          <Button
            onClick={handleOpenCreate}
            disabled={classes.length === 0 || subjects.length === 0}
            className="bg-accent-info hover:bg-accent-info/90 text-white"
            title={subjects.length === 0 ? "Add a subject to the catalog first" : undefined}
          >
            <Plus className="w-4 h-4" strokeWidth={1.75} />
            New Allotment
          </Button>
        </div>

        {/* Filter and Search Bar */}
        <div className="p-4 bg-bg-surface border border-border rounded-[var(--radius-lg)] flex flex-col md:flex-row gap-4 items-center flex-shrink-0">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" strokeWidth={1.75} />
            <input
              type="text"
              placeholder="Search by subject, class, or teacher..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-bg-base border border-border rounded-[var(--radius-md)] pl-10 pr-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-info transition-colors"
            />
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto">
            <label className="text-xs text-text-secondary font-medium whitespace-nowrap">Class:</label>
            <select
              value={filterClass}
              onChange={(e) => setFilterClass(e.target.value)}
              className="bg-bg-base border border-border rounded-[var(--radius-md)] px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-info w-full md:w-36"
            >
              <option value="all">All Classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto">
            <label className="text-xs text-text-secondary font-medium whitespace-nowrap">Semester:</label>
            <select
              value={filterSemester}
              onChange={(e) => setFilterSemester(e.target.value)}
              className="bg-bg-base border border-border rounded-[var(--radius-md)] px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-info w-full md:w-32"
            >
              <option value="all">All Semesters</option>
              {SEMESTERS.map((s) => (
                <option key={s} value={s}>Semester {s}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto">
            <label className="text-xs text-text-secondary font-medium whitespace-nowrap">Teacher:</label>
            <select
              value={filterTeacher}
              onChange={(e) => setFilterTeacher(e.target.value)}
              className="bg-bg-base border border-border rounded-[var(--radius-md)] px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-info w-full md:w-40"
            >
              <option value="all">All Teachers</option>
              <option value="unassigned">Unassigned</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 min-h-0 px-6 pb-6 flex flex-col">
        <div className="flex-1 min-h-0 flex flex-col bg-bg-surface border border-border rounded-[var(--radius-lg)] overflow-hidden">
          {loading ? (
            <div className="p-4 space-y-2.5">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-11 rounded-[var(--radius-md)] bg-bg-surface-3 animate-pulse" />
              ))}
            </div>
          ) : filteredAllotments.length === 0 ? (
            <div className="py-20 text-center flex flex-col items-center justify-center text-text-muted">
              <ClipboardList className="w-8 h-8 mb-2" />
              <p className="text-sm font-semibold text-text-primary">No allotments found</p>
              <p className="text-xs text-text-secondary mt-1">
                {allotments.length === 0
                  ? "Click 'New Allotment' to assign a subject to a class and semester."
                  : "Try adjusting your search query or filters."}
              </p>
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-x-auto overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-bg-surface z-10">
                  <tr className="border-b border-border/80 text-[11px] font-semibold text-text-muted tracking-wider uppercase bg-bg-surface">
                    <th className="px-6 py-3.5">Class</th>
                    <th className="px-6 py-3.5">Subject</th>
                    <th className="px-6 py-3.5">Semester</th>
                    <th className="px-6 py-3.5">Teacher</th>
                    <th className="px-6 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filteredAllotments.map((row) => (
                    <tr key={row.id} className="hover:bg-white/[0.01] transition-colors">
                      <td className="px-6 py-4 text-sm">
                        <span className="inline-block px-2.5 py-0.5 rounded-[var(--radius-pill)] text-xs font-semibold border border-student-500/25 bg-student-500/10 text-student-400">
                          {row.class_name}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-text-primary">
                        {row.subject_name}
                        {row.subject_code && (
                          <span className="ml-2 text-xs font-mono text-text-muted">{row.subject_code}</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-text-secondary tnum">Sem {row.semester}</td>
                      <td className="px-6 py-4 text-sm">
                        {row.teacher_name ? (
                          <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-teacher-500 shrink-0" />
                            <span className="text-text-primary font-medium">{row.teacher_name}</span>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-text-muted">
                            <UserX className="w-3.5 h-3.5" />
                            Unassigned
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleOpenEdit(row)}
                            className="p-1.5 hover:bg-white/5 rounded text-text-secondary hover:text-text-primary transition-colors"
                            title="Edit allotment"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDeletingItem(row)}
                            className="p-1.5 hover:bg-white/5 rounded text-text-secondary hover:text-accent-critical transition-colors"
                            title="Delete allotment"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-bg-surface border border-border rounded-xl shadow-2xl max-w-md w-full flex flex-col p-6 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between border-b border-border pb-3 mb-4">
              <h3 className="text-lg font-semibold text-text-primary">
                {editingItem ? "Edit Allotment" : "Create Subject Allotment"}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 hover:bg-white/5 rounded-lg text-text-secondary hover:text-text-primary"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-text-secondary uppercase mb-1">Class</label>
                  <select
                    required
                    value={formClassId}
                    onChange={(e) => setFormClassId(e.target.value)}
                    disabled={Boolean(editingItem)}
                    className="w-full bg-bg-base border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-info disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <option value="" disabled>Select...</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text-secondary uppercase mb-1">Semester</label>
                  <select
                    required
                    value={formSemester}
                    onChange={(e) => setFormSemester(e.target.value)}
                    className="w-full bg-bg-base border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-info"
                  >
                    {SEMESTERS.map((s) => (
                      <option key={s} value={s}>Semester {s}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-secondary uppercase mb-1">Subject</label>
                <select
                  required
                  value={formSubjectId}
                  onChange={(e) => setFormSubjectId(e.target.value)}
                  disabled={Boolean(editingItem)}
                  className="w-full bg-bg-base border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-info disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <option value="" disabled>Select...</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}{s.code ? ` (${s.code})` : ""}
                    </option>
                  ))}
                </select>
                {editingItem && (
                  <p className="text-[10px] text-text-muted mt-1">
                    Class and subject are locked after creation — delete and recreate to change either.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-secondary uppercase mb-1">
                  Teacher <span className="text-[10px] text-text-muted normal-case">(optional — assign later if unsure)</span>
                </label>
                <select
                  value={formTeacherId}
                  onChange={(e) => setFormTeacherId(e.target.value)}
                  className="w-full bg-bg-base border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-info"
                >
                  <option value="">Unassigned</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>{t.name} ({t.email})</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 border-t border-border pt-4 mt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-bg-base hover:bg-white/5 border border-border rounded-lg text-sm text-text-primary font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!formClassId || !formSubjectId || submitting}
                  className="px-4 py-2 bg-accent-info hover:bg-accent-info/90 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
                >
                  {submitting ? "Saving…" : editingItem ? "Save Changes" : "Create Allotment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingItem && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-bg-surface border border-border rounded-xl shadow-2xl max-w-sm w-full flex flex-col p-6 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between border-b border-border pb-3 mb-4">
              <h3 className="text-lg font-semibold text-accent-critical flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                <span>Delete Allotment?</span>
              </h3>
              <button
                onClick={() => setDeletingItem(null)}
                className="p-1 hover:bg-white/5 rounded-lg text-text-secondary hover:text-text-primary"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <p className="text-sm text-text-secondary leading-relaxed">
                Remove <strong className="text-text-primary">{deletingItem.subject_name}</strong> (Semester {deletingItem.semester}) from{" "}
                <strong className="text-text-primary">{deletingItem.class_name}</strong>
                {deletingItem.teacher_name ? <> — taught by {deletingItem.teacher_name}</> : ""}?
              </p>

              <div className="flex justify-end gap-2 border-t border-border pt-4 mt-2">
                <button
                  type="button"
                  onClick={() => setDeletingItem(null)}
                  className="px-4 py-2 bg-bg-base hover:bg-white/5 border border-border rounded-lg text-sm text-text-primary font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="px-4 py-2 bg-accent-critical hover:bg-accent-critical/90 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
                >
                  {isDeleting ? "Deleting…" : "Confirm Delete"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
