import { useState, useEffect } from "react";
import { Plus, Edit2, X, Check, BookOpen } from "lucide-react";
import { toast } from "sonner";

export function AdminClasses() {
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Forms
  const [newClassName, setNewClassName] = useState("");
  const [editingClassId, setEditingClassId] = useState(null);
  const [editingClassName, setEditingClassName] = useState("");

  const fetchClasses = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("edusync_token");
      const res = await fetch("http://localhost:3000/classes", {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setClasses(data.classes || []);
      } else {
        toast.error(data.message || "Failed to load classes");
      }
    } catch {
      toast.error("Network error loading classes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClasses();
  }, []);

  const handleAddClass = async (e) => {
    e.preventDefault();
    if (!newClassName.trim()) return;

    try {
      const token = localStorage.getItem("edusync_token");
      const res = await fetch("http://localhost:3000/classes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ name: newClassName.trim() })
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.message || "Failed to add class");
        return;
      }

      toast.success("New class added successfully!");
      setNewClassName("");
      fetchClasses();
    } catch {
      toast.error("Network error. Please try again.");
    }
  };

  const handleStartEdit = (cls) => {
    setEditingClassId(cls.id);
    setEditingClassName(cls.name);
  };

  const handleCancelEdit = () => {
    setEditingClassId(null);
    setEditingClassName("");
  };

  const handleSaveEdit = async (id) => {
    if (!editingClassName.trim()) return;

    try {
      const token = localStorage.getItem("edusync_token");
      const res = await fetch(`http://localhost:3000/classes/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ name: editingClassName.trim() })
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.message || "Failed to save changes");
        return;
      }

      toast.success("Class renamed successfully!");
      setEditingClassId(null);
      setEditingClassName("");
      fetchClasses();
    } catch {
      toast.error("Network error. Please try again.");
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString([], {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-text-primary mb-1">
          Class Directory
        </h1>
        <p className="text-sm text-text-secondary">
          Configure class names (e.g. FYBCA, SYBCA, TYBCA) to assign students
        </p>
      </div>

      {/* Add Class Card */}
      <div className="p-6 bg-bg-surface border border-border rounded-lg shadow-xl">
        <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider mb-3 flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-accent-info" />
          <span>Add New Class</span>
        </h3>
        <form onSubmit={handleAddClass} className="flex gap-3">
          <input
            type="text"
            required
            placeholder="e.g. FYBCA, SYBCA, TYBCA..."
            value={newClassName}
            onChange={(e) => setNewClassName(e.target.value)}
            className="flex-1 bg-bg-base border border-border rounded-lg px-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-info transition-colors"
          />
          <button
            type="submit"
            className="btn-press bg-accent-info hover:bg-accent-info/90 text-white px-5 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Create Class</span>
          </button>
        </form>
      </div>

      {/* Classes Directory list */}
      <div className="bg-bg-surface border border-border rounded-lg overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-sm text-text-muted">
            Loading directory...
          </div>
        ) : classes.length === 0 ? (
          <div className="py-12 text-center text-sm text-text-muted">
            No classes defined. Add a class above.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border/80 text-[11px] font-semibold text-text-muted tracking-wider uppercase bg-white/[0.01]">
                  <th className="px-6 py-3.5 w-16">ID</th>
                  <th className="px-6 py-3.5">Class Name</th>
                  <th className="px-6 py-3.5">Created At</th>
                  <th className="px-6 py-3.5 text-right w-28">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {classes.map((cls) => (
                  <tr key={cls.id} className="hover:bg-white/[0.01] transition-colors">
                    <td className="px-6 py-4 text-sm font-mono text-text-muted">
                      {cls.id}
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-text-primary">
                      {editingClassId === cls.id ? (
                        <input
                          type="text"
                          value={editingClassName}
                          onChange={(e) => setEditingClassName(e.target.value)}
                          className="bg-bg-base border border-accent-info rounded px-3 py-1 text-sm text-text-primary focus:outline-none w-full max-w-xs"
                          autoFocus
                        />
                      ) : (
                        cls.name
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-text-secondary">
                      {formatDate(cls.created_at)}
                    </td>
                    <td className="px-6 py-4 text-sm text-right">
                      {editingClassId === cls.id ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleSaveEdit(cls.id)}
                            className="p-1.5 bg-accent-success/15 hover:bg-accent-success/25 text-accent-success rounded border border-accent-success/20 transition-all"
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
                        <button
                          onClick={() => handleStartEdit(cls)}
                          className="p-1.5 hover:bg-white/5 rounded text-text-secondary hover:text-text-primary transition-colors inline-flex items-center gap-1"
                          title="Rename Class"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          <span className="text-xs">Rename</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
