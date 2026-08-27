import { API_BASE_URL } from "../../config/api.js";
import { useState, useEffect } from "react";
import { Plus, PencilSimple as Edit2, X, Check, BookBookmark as BookMarked, Trash as Trash2, Warning as AlertTriangle } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import PageShell from "../../components/PageShell";

export function AdminSubjects() {
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);

  // Add form
  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // Inline edit
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState("");
  const [editingCode, setEditingCode] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Delete confirm
  const [deletingSubject, setDeletingSubject] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchSubjects = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("edusync_token");
      const res = await fetch(`${API_BASE_URL}/subjects`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setSubjects(data.subjects || []);
      } else {
        toast.error(data.message || "Failed to load subjects");
      }
    } catch {
      toast.error("Network error loading subjects");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubjects();
  }, []);

  const handleAddSubject = async (e) => {
    e.preventDefault();
    if (!newName.trim() || isCreating) return;

    setIsCreating(true);
    try {
      const token = localStorage.getItem("edusync_token");
      const res = await fetch(`${API_BASE_URL}/subjects`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: newName.trim(), code: newCode.trim() || undefined }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.message || "Failed to add subject");
        return;
      }

      toast.success("New subject added to the catalog!");
      setNewName("");
      setNewCode("");
      fetchSubjects();
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleStartEdit = (subject) => {
    setEditingId(subject.id);
    setEditingName(subject.name);
    setEditingCode(subject.code || "");
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingName("");
    setEditingCode("");
  };

  const handleSaveEdit = async (id) => {
    if (!editingName.trim() || isSaving) return;

    setIsSaving(true);
    try {
      const token = localStorage.getItem("edusync_token");
      const res = await fetch(`${API_BASE_URL}/subjects/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: editingName.trim(), code: editingCode.trim() || undefined }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.message || "Failed to save changes");
        return;
      }

      toast.success("Subject updated successfully!");
      handleCancelEdit();
      fetchSubjects();
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteSubject = async () => {
    if (!deletingSubject || isDeleting) return;

    setIsDeleting(true);
    try {
      const token = localStorage.getItem("edusync_token");
      const res = await fetch(`${API_BASE_URL}/subjects/${deletingSubject.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.message || "Failed to delete subject");
        return;
      }

      toast.success("Subject removed from the catalog.");
      setDeletingSubject(null);
      fetchSubjects();
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <PageShell>
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-text-primary mb-1">
          Subject Catalog
        </h1>
        <p className="text-sm text-text-secondary">
          Maintain the shared list of subjects (e.g. Data Structures, DBMS) available to allot to classes by semester
        </p>
      </div>

      {/* Add Subject Card */}
      <div className="p-6 bg-bg-surface border border-border rounded-[var(--radius-lg)]">
        <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider mb-3 flex items-center gap-2">
          <BookMarked className="w-4 h-4 text-accent-info" strokeWidth={1.75} />
          <span>Add New Subject</span>
        </h3>
        <form onSubmit={handleAddSubject} className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            required
            placeholder="e.g. Data Structures & Algorithms"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="flex-1 bg-bg-base border border-border rounded-[var(--radius-md)] px-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-info transition-colors"
          />
          <input
            type="text"
            placeholder="Code (optional, e.g. CS201)"
            value={newCode}
            onChange={(e) => setNewCode(e.target.value)}
            className="sm:w-48 bg-bg-base border border-border rounded-[var(--radius-md)] px-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-info transition-colors"
          />
          <Button type="submit" disabled={isCreating} className="bg-accent-info hover:bg-accent-info/90 text-white shrink-0">
            <Plus className="w-4 h-4" strokeWidth={1.75} />
            {isCreating ? "Adding..." : "Add Subject"}
          </Button>
        </form>
      </div>

      {/* Subjects Directory list */}
      <div className="bg-bg-surface border border-border rounded-[var(--radius-lg)] overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-2.5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-11 rounded-[var(--radius-md)] bg-bg-surface-3 animate-pulse" />
            ))}
          </div>
        ) : subjects.length === 0 ? (
          <div className="py-12 text-center text-sm text-text-muted">
            No subjects defined yet. Add one above to start building the catalog.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border/80 text-[11px] font-semibold text-text-muted tracking-wider uppercase bg-bg-elevated">
                  <th className="px-6 py-3.5 w-16">ID</th>
                  <th className="px-6 py-3.5">Subject Name</th>
                  <th className="px-6 py-3.5 w-40">Code</th>
                  <th className="px-6 py-3.5">Created At</th>
                  <th className="px-6 py-3.5 text-right w-32">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {subjects.map((subject) => {
                  const isEditing = editingId === subject.id;
                  return (
                    <tr key={subject.id} className="hover:bg-white/[0.01] transition-colors">
                      <td className="px-6 py-4 text-sm font-mono text-text-muted">{subject.id}</td>
                      <td className="px-6 py-4 text-sm font-medium text-text-primary">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            className="bg-bg-base border border-accent-info rounded px-3 py-1 text-sm text-text-primary focus:outline-none w-full max-w-xs"
                            autoFocus
                          />
                        ) : (
                          subject.name
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-text-secondary font-mono">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editingCode}
                            onChange={(e) => setEditingCode(e.target.value)}
                            placeholder="—"
                            className="bg-bg-base border border-accent-info rounded px-3 py-1 text-sm text-text-primary focus:outline-none w-full max-w-[8rem]"
                          />
                        ) : (
                          subject.code || <span className="text-text-muted">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-text-secondary">
                        {new Date(subject.created_at).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" })}
                      </td>
                      <td className="px-6 py-4 text-sm text-right">
                        {isEditing ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleSaveEdit(subject.id)}
                              disabled={isSaving}
                              className="p-1.5 bg-accent-success/15 hover:bg-accent-success/25 text-accent-success rounded border border-accent-success/20 transition-all disabled:opacity-50"
                              title="Save"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              className="p-1.5 bg-white/5 hover:bg-white/10 rounded border border-border transition-all"
                              title="Cancel"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleStartEdit(subject)}
                              className="p-1.5 hover:bg-white/5 rounded text-text-secondary hover:text-text-primary transition-colors"
                              title="Edit Subject"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setDeletingSubject(subject)}
                              className="p-1.5 hover:bg-white/5 rounded text-text-secondary hover:text-accent-critical transition-colors"
                              title="Delete Subject"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deletingSubject && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-bg-surface border border-border rounded-xl shadow-2xl max-w-sm w-full flex flex-col p-6 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between border-b border-border pb-3 mb-4">
              <h3 className="text-lg font-semibold text-accent-critical flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                <span>Delete Subject?</span>
              </h3>
              <button
                onClick={() => setDeletingSubject(null)}
                className="p-1 hover:bg-white/5 rounded-lg text-text-secondary hover:text-text-primary"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <p className="text-sm text-text-secondary leading-relaxed">
                Remove <strong className="text-text-primary">{deletingSubject.name}</strong> from the catalog permanently?
              </p>
              <div className="p-3 bg-accent-critical/5 border border-accent-critical/15 rounded-lg text-xs text-accent-critical">
                This will fail if the subject is still allotted to any class — remove those allotments first.
              </div>

              <div className="flex justify-end gap-2 border-t border-border pt-4 mt-2">
                <button
                  type="button"
                  onClick={() => setDeletingSubject(null)}
                  className="px-4 py-2 bg-bg-base hover:bg-white/5 border border-border rounded-lg text-sm text-text-primary font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteSubject}
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
    </PageShell>
  );
}
