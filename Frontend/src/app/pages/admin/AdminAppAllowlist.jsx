import { API_BASE_URL } from "../../config/api.js";
import { useState, useEffect, useMemo } from "react";
import { IconPlus as Plus, IconTrash as Trash2, IconX as X, IconAlertTriangle as AlertTriangle, IconShieldCheck as ShieldCheck, IconSearch as Search, IconInfoCircle as Info } from "@tabler/icons-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import Dropdown from "../../components/Dropdown";

export function AdminAppAllowlist() {
  const [entries, setEntries] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState("");
  const [filterClass, setFilterClass] = useState("all");

  // Create modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formClassId, setFormClassId] = useState("");
  const [formProcessName, setFormProcessName] = useState("");
  const [formDisplayName, setFormDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Delete confirm
  const [deletingItem, setDeletingItem] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("edusync_token");
      const headers = { Authorization: `Bearer ${token}` };

      const [entriesRes, classesRes] = await Promise.all([
        fetch(`${API_BASE_URL}/admin/app-allowlist`, { headers }),
        fetch(`${API_BASE_URL}/classes`, { headers }),
      ]);
      const [entriesData, classesData] = await Promise.all([entriesRes.json(), classesRes.json()]);

      if (!entriesRes.ok) throw new Error(entriesData.message || "Failed to load allow-list");

      setEntries(entriesData.entries || []);
      setClasses(classesData.classes || []);
    } catch (err) {
      toast.error(err.message || "Failed to load app allow-list data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return entries.filter((e) => {
      const matchesSearch =
        !q ||
        e.process_name?.toLowerCase().includes(q) ||
        e.display_name?.toLowerCase().includes(q) ||
        e.class_name?.toLowerCase().includes(q);
      const matchesClass = filterClass === "all" || String(e.class_id) === String(filterClass);
      return matchesSearch && matchesClass;
    });
  }, [entries, searchQuery, filterClass]);

  const handleOpenCreate = () => {
    setFormClassId(classes[0]?.id ? String(classes[0].id) : "");
    setFormProcessName("");
    setFormDisplayName("");
    setIsModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formClassId || !formProcessName.trim() || submitting) return;

    setSubmitting(true);
    try {
      const token = localStorage.getItem("edusync_token");
      const res = await fetch(`${API_BASE_URL}/admin/app-allowlist`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          class_id: Number(formClassId),
          process_name: formProcessName.trim(),
          display_name: formDisplayName.trim() || undefined,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.message || "Failed to add entry");
        return;
      }

      toast.success("App added to the allow-list!");
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
      const res = await fetch(`${API_BASE_URL}/admin/app-allowlist/${deletingItem.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.message || "Failed to remove entry");
        return;
      }

      toast.success("Entry removed successfully.");
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
      <div className="flex-shrink-0 px-6 pt-6 pb-4 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-text-primary mb-1">
              App Allow-List (Broadcast Sessions)
            </h1>
            <p className="text-sm text-text-secondary">
              Per-class list of applications students may keep open during a live broadcast — enforced automatically on the Electron desktop app
            </p>
          </div>
          <Button
            onClick={handleOpenCreate}
            disabled={classes.length === 0}
            className="bg-accent-info hover:bg-accent-info/90 text-white"
          >
            <Plus className="w-[18px] h-[18px]" strokeWidth={1.75} />
            Add App
          </Button>
        </div>

        <div className="p-3 bg-accent-info/5 border border-accent-info/20 rounded-[var(--radius-lg)] flex items-start gap-2.5 text-xs text-text-secondary">
          <Info className="w-[18px] h-[18px] text-accent-info shrink-0 mt-0.5" />
          <p>
            Enter the exact process/executable name (e.g. <span className="font-mono text-text-primary">chrome.exe</span>,{" "}
            <span className="font-mono text-text-primary">Code.exe</span>). A class with no entries below still allows core Windows
            system processes — those are always protected and never affected by this list, on Electron or otherwise. On the plain web
            build, this list is shown to students as information only; real enforcement only runs on the Electron desktop app.
          </p>
        </div>

        <div className="p-4 bg-bg-surface border border-border rounded-[var(--radius-lg)] flex flex-col md:flex-row gap-4 items-center flex-shrink-0">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-text-muted" strokeWidth={1.75} />
            <input
              type="text"
              placeholder="Search app or class..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-bg-base border border-border rounded-[var(--radius-md)] pl-10 pr-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-info transition-colors"
            />
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto">
            <label className="text-xs text-text-secondary font-medium whitespace-nowrap">Class:</label>
            <Dropdown
              value={filterClass}
              onChange={setFilterClass}
              aria-label="Filter by class"
              className="px-3 py-2 w-full md:w-40"
              options={[
                { value: "all", label: "All Classes" },
                ...classes.map((c) => ({ value: String(c.id), label: c.name })),
              ]}
            />
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 px-6 pb-6 flex flex-col">
        <div className="flex-1 min-h-0 flex flex-col bg-bg-surface border border-border rounded-[var(--radius-lg)] overflow-hidden">
          {loading ? (
            <div className="p-4 space-y-2.5">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-11 rounded-[var(--radius-md)] bg-bg-surface-3 animate-pulse" />
              ))}
            </div>
          ) : filteredEntries.length === 0 ? (
            <div className="py-20 text-center flex flex-col items-center justify-center text-text-muted">
              <ShieldCheck className="w-9 h-9 mb-2" />
              <p className="text-sm font-semibold text-text-primary">No allow-list entries found</p>
              <p className="text-xs text-text-secondary mt-1">
                {entries.length === 0
                  ? "Click 'Add App' to allow the first application for a class."
                  : "Try adjusting your search query or filters."}
              </p>
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-x-auto overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-bg-surface z-10">
                  <tr className="border-b border-border/80 text-[11px] font-semibold text-text-muted tracking-wider uppercase bg-bg-surface">
                    <th className="px-6 py-3.5">Class</th>
                    <th className="px-6 py-3.5">Process Name</th>
                    <th className="px-6 py-3.5">Display Name</th>
                    <th className="px-6 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filteredEntries.map((row) => (
                    <tr key={row.id} className="hover:bg-white/[0.01] transition-colors">
                      <td className="px-6 py-4 text-sm">
                        <span className="inline-block px-2.5 py-0.5 rounded-[var(--radius-pill)] text-xs font-semibold border border-student-500/25 bg-student-500/10 text-student-400">
                          {row.class_name}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm font-mono text-text-primary">{row.process_name}</td>
                      <td className="px-6 py-4 text-sm text-text-secondary">{row.display_name || "—"}</td>
                      <td className="px-6 py-4 text-sm text-right">
                        <button
                          onClick={() => setDeletingItem(row)}
                          className="p-1.5 hover:bg-white/5 rounded text-text-secondary hover:text-accent-critical transition-colors"
                          title="Remove from allow-list"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-bg-surface border border-border rounded-xl shadow-2xl max-w-md w-full flex flex-col p-6 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between border-b border-border pb-3 mb-4">
              <h3 className="text-lg font-semibold text-text-primary">Add Allowed App</h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 hover:bg-white/5 rounded-lg text-text-secondary hover:text-text-primary"
                aria-label="Close"
              >
                <X className="w-[22px] h-[22px]" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-text-secondary uppercase mb-1">Class</label>
                <Dropdown
                  value={formClassId}
                  onChange={setFormClassId}
                  aria-label="Class"
                  placeholder="Select..."
                  className="px-3 py-2 rounded-lg"
                  options={classes.map((c) => ({ value: String(c.id), label: c.name }))}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-secondary uppercase mb-1">
                  Process Name
                </label>
                <input
                  type="text"
                  required
                  value={formProcessName}
                  onChange={(e) => setFormProcessName(e.target.value)}
                  placeholder="e.g. chrome.exe"
                  className="w-full bg-bg-base border border-border rounded-lg px-3 py-2 text-sm font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-info"
                />
                <p className="text-[10px] text-text-muted mt-1">
                  Must match the exact executable name shown in Windows Task Manager.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-secondary uppercase mb-1">
                  Display Name <span className="text-[10px] text-text-muted normal-case">(optional)</span>
                </label>
                <input
                  type="text"
                  value={formDisplayName}
                  onChange={(e) => setFormDisplayName(e.target.value)}
                  placeholder="e.g. Google Chrome"
                  className="w-full bg-bg-base border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-info"
                />
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
                  disabled={!formClassId || !formProcessName.trim() || submitting}
                  className="px-4 py-2 bg-accent-info hover:bg-accent-info/90 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
                >
                  {submitting ? "Saving…" : "Add App"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deletingItem && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-bg-surface border border-border rounded-xl shadow-2xl max-w-sm w-full flex flex-col p-6 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between border-b border-border pb-3 mb-4">
              <h3 className="text-lg font-semibold text-accent-critical flex items-center gap-2">
                <AlertTriangle className="w-[22px] h-[22px]" />
                <span>Remove Allowed App?</span>
              </h3>
              <button
                onClick={() => setDeletingItem(null)}
                className="p-1 hover:bg-white/5 rounded-lg text-text-secondary hover:text-text-primary"
                aria-label="Close"
              >
                <X className="w-[22px] h-[22px]" />
              </button>
            </div>

            <div className="space-y-4">
              <p className="text-sm text-text-secondary leading-relaxed">
                Remove <strong className="text-text-primary font-mono">{deletingItem.process_name}</strong> from{" "}
                <strong className="text-text-primary">{deletingItem.class_name}</strong>'s allow-list? Students in this class will no
                longer be able to keep this app open during a broadcast.
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
                  {isDeleting ? "Removing…" : "Confirm Remove"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
