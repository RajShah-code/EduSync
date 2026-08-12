import { API_BASE_URL } from "../../config/api.js";
import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import {
  Calendar,
  Clock,
  BookOpen,
  School,
  Bell,
  Plus,
  Trash2,
  Edit3,
  Loader2,
  FileSpreadsheet,
  Download,
  Upload,
  X,
  CheckCircle2,
  AlertTriangle,
  Sliders,
  FlaskConical,
  Building,
  CalendarOff,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";

// Monday through Saturday (day_of_week 0–5)
const DAYS = [
  { id: 0, fullName: "Monday" },
  { id: 1, fullName: "Tuesday" },
  { id: 2, fullName: "Wednesday" },
  { id: 3, fullName: "Thursday" },
  { id: 4, fullName: "Friday" },
  { id: 5, fullName: "Saturday" },
];

/**
 * Format time string HH:MM:SS to HH:MM
 */
function formatTimeHHMM(timeStr) {
  if (!timeStr) return "09:00";
  return timeStr.slice(0, 5);
}

/**
 * Helper to compute 1-hour end time given start time "HH:MM"
 */
function computeDefaultEndTime(startTimeStr) {
  if (!startTimeStr) return "10:00";
  const [h, m] = startTimeStr.split(":").map(Number);
  const nextH = (h + 1) % 24;
  const hStr = String(nextH).padStart(2, "0");
  const mStr = String(m || 0).padStart(2, "0");
  return `${hStr}:${mStr}`;
}

export function TimetableSetup() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  // Core state
  const [classes, setClasses] = useState([]);
  const [entries, setEntries] = useState([]);
  const [exceptions, setExceptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);

  // Global Timetable Options State (Teacher-level single setting)
  const [defaultDelayMinutes, setDefaultDelayMinutes] = useState(5);
  const [updatingDelay, setUpdatingDelay] = useState(false);
  const [newExceptionDate, setNewExceptionDate] = useState("");
  const [addingException, setAddingException] = useState(false);

  // Modal State for Add / Edit Entry
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState(null); // null for new, ID for edit
  const [formDayOfWeek, setFormDayOfWeek] = useState(0);
  const [formStartTime, setFormStartTime] = useState("09:00");
  const [formEndTime, setFormEndTime] = useState("10:00");
  const [formSubject, setFormSubject] = useState("");
  const [formClassId, setFormClassId] = useState("");
  const [formRoom, setFormRoom] = useState("");
  const [formSessionType, setFormSessionType] = useState("standard"); // 'standard' | 'lab'
  const [formReminderEnabled, setFormReminderEnabled] = useState(true);
  const [formError, setFormError] = useState("");

  // Excel Import Report Modal State
  const [importReport, setImportReport] = useState(null);

  // Fetch classes, timetable, global settings, and exceptions on mount
  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    setLoading(true);
    const token = localStorage.getItem("edusync_token");
    if (!token) {
      navigate("/login");
      return;
    }

    try {
      // 1. Fetch classes
      const classesRes = await fetch(`${API_BASE_URL}/classes`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (classesRes.ok) {
        const cData = await classesRes.json();
        const loadedClasses = cData.classes || [];
        setClasses(loadedClasses);
        if (loadedClasses.length > 0) {
          setFormClassId(String(loadedClasses[0].id));
        }
      }

      // 2. Fetch teacher's timetable & global reminder delay setting
      const timetableRes = await fetch(`${API_BASE_URL}/timetable/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (timetableRes.ok) {
        const tData = await timetableRes.json();
        setEntries(tData.entries || []);
        setDefaultDelayMinutes(tData.default_reminder_delay_minutes ?? 5);
      }

      // 3. Fetch reminder suppression exception dates
      const exceptionsRes = await fetch(`${API_BASE_URL}/timetable/exceptions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (exceptionsRes.ok) {
        const exData = await exceptionsRes.json();
        setExceptions(exData.exceptions || []);
      }
    } catch (err) {
      toast.error("Error connecting to server");
    } finally {
      setLoading(false);
    }
  };

  // Update global reminder delay setting
  const handleUpdateGlobalDelay = async (newVal) => {
    setDefaultDelayMinutes(newVal);
    setUpdatingDelay(true);
    const token = localStorage.getItem("edusync_token");
    try {
      const res = await fetch(`${API_BASE_URL}/timetable/settings`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ default_reminder_delay_minutes: newVal }),
      });

      if (!res.ok) {
        toast.error("Failed to update global late warning delay");
      }
    } catch (err) {
      toast.error("Network error updating late warning delay");
    } finally {
      setUpdatingDelay(false);
    }
  };

  // Organize entries per day (sorted by start_time ascending)
  const getDayEntries = (dayIndex) => {
    return entries
      .filter((e) => Number(e.day_of_week) === dayIndex)
      .sort((a, b) => (a.start_time || "").localeCompare(b.start_time || ""));
  };

  // Compute serial-number rows count: max lecture count among all 6 days + 1 extra empty row
  const maxLecturesAcrossDays = Math.max(
    0,
    ...DAYS.map((day) => getDayEntries(day.id).length)
  );
  const totalSerialRows = maxLecturesAcrossDays + 1;
  const serialRowIndices = Array.from({ length: totalSerialRows }, (_, i) => i + 1);

  // Open modal to add a new lecture
  const handleOpenAddModal = (dayIndex) => {
    setEditingEntryId(null);
    setFormDayOfWeek(dayIndex);
    setFormStartTime("09:00");
    setFormEndTime("10:00");
    setFormSubject("");
    if (classes.length > 0) setFormClassId(String(classes[0].id));
    setFormRoom("");
    setFormSessionType("standard");
    setFormReminderEnabled(true);
    setFormError("");
    setIsModalOpen(true);
  };

  // Open modal to edit an existing entry
  const handleOpenEditModal = (entry, e) => {
    e.stopPropagation();
    setEditingEntryId(entry.id);
    setFormDayOfWeek(Number(entry.day_of_week));
    setFormStartTime(formatTimeHHMM(entry.start_time));
    setFormEndTime(formatTimeHHMM(entry.end_time));
    setFormSubject(entry.subject);
    setFormClassId(String(entry.class_id));
    setFormRoom(entry.room || "");
    setFormSessionType(entry.session_type || "standard");
    setFormReminderEnabled(Boolean(entry.reminder_enabled));
    setFormError("");
    setIsModalOpen(true);
  };

  // Save (Create / Update) timetable entry
  const handleSaveModalEntry = async () => {
    setFormError("");
    if (!formSubject.trim()) {
      setFormError("Subject name is required.");
      return;
    }
    if (!formStartTime) {
      setFormError("Start time is required.");
      return;
    }
    if (!formEndTime) {
      setFormError("End time is required.");
      return;
    }
    if (formStartTime >= formEndTime) {
      setFormError("End time must be later than start time.");
      return;
    }
    if (!formClassId) {
      setFormError("Please select a class.");
      return;
    }

    setSaving(true);
    const token = localStorage.getItem("edusync_token");

    const payload = {
      day_of_week: Number(formDayOfWeek),
      start_time: formStartTime,
      end_time: formEndTime,
      subject: formSubject.trim(),
      class_id: Number(formClassId),
      room: formRoom.trim() ? formRoom.trim() : null,
      session_type: formSessionType,
      reminder_enabled: formReminderEnabled,
    };

    try {
      const isEdit = editingEntryId !== null;
      const url = isEdit
        ? `${API_BASE_URL}/timetable/entries/${editingEntryId}`
        : `${API_BASE_URL}/timetable/entries`;
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setFormError(data.message || "Failed to save entry");
        return;
      }

      toast.success(isEdit ? "Entry updated successfully" : "Entry added successfully");
      setIsModalOpen(false);
      fetchInitialData();
    } catch (err) {
      setFormError("Network error while saving entry");
    } finally {
      setSaving(false);
    }
  };

  // Delete entry handler
  const handleDeleteEntry = async (entryId, e) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this lecture from your timetable?")) {
      return;
    }

    const token = localStorage.getItem("edusync_token");
    try {
      const res = await fetch(`${API_BASE_URL}/timetable/entries/${entryId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        toast.success("Entry deleted successfully");
        setEntries((prev) => prev.filter((item) => item.id !== entryId));
      } else {
        const data = await res.json();
        toast.error(data.message || "Failed to delete entry");
      }
    } catch (err) {
      toast.error("Error deleting timetable entry");
    }
  };

  // Download Excel Template (Authenticated Blob Download)
  const handleDownloadTemplate = async () => {
    const token = localStorage.getItem("edusync_token");
    try {
      const res = await fetch(`${API_BASE_URL}/timetable/template`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        toast.error("Failed to download template");
        return;
      }
      const arrayBuffer = await res.arrayBuffer();
      const blob = new Blob([arrayBuffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "timetable_template.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Timetable template downloaded");
    } catch (err) {
      toast.error("Error downloading template");
    }
  };

  // Handle Excel Import File Select
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const token = localStorage.getItem("edusync_token");
    const formData = new FormData();
    formData.append("file", file);

    setImporting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/timetable/import`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.message || "Import failed");
      } else {
        setImportReport(data.results || []);
        toast.success(data.message || "Bulk import complete");
        fetchInitialData();
      }
    } catch (err) {
      toast.error("Network error during file import");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Add Date Exception (Reminder Suppression)
  const handleAddException = async () => {
    if (!newExceptionDate) {
      toast.error("Please select a date first");
      return;
    }

    setAddingException(true);
    const token = localStorage.getItem("edusync_token");
    try {
      const res = await fetch(`${API_BASE_URL}/timetable/exceptions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ exception_date: newExceptionDate }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.message || "Failed to add date exception");
      } else {
        toast.success("Reminder suppression date added");
        setNewExceptionDate("");
        fetchInitialData();
      }
    } catch (err) {
      toast.error("Network error adding exception date");
    } finally {
      setAddingException(false);
    }
  };

  // Remove Date Exception
  const handleDeleteException = async (id) => {
    const token = localStorage.getItem("edusync_token");
    try {
      const res = await fetch(`${API_BASE_URL}/timetable/exceptions/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        toast.success("Suppression date removed");
        setExceptions((prev) => prev.filter((item) => item.id !== id));
      } else {
        toast.error("Failed to remove suppression date");
      }
    } catch (err) {
      toast.error("Error removing suppression date");
    }
  };

  if (loading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center text-text-muted gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
        <p className="text-sm font-medium">Loading weekly timetable grid...</p>
      </div>
    );
  }

  return (
    <div className="w-full p-6 space-y-6">
      {/* Hidden File Input for Excel Import */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".xlsx, .xls"
        className="hidden"
      />

      {/* A. HEADER ROW */}
      <div
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-bg-surface border border-border rounded-xl p-5 shadow-lg"
        style={{
          backgroundColor: "var(--bg-surface, #111118)",
          borderColor: "var(--border, #2A2A3A)",
        }}
      >
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight flex items-center gap-2.5">
            <Calendar className="w-6 h-6 text-emerald-400" />
            Weekly Timetable Setup Grid
          </h1>
          <p className="text-xs text-text-secondary mt-1">
            Directly configure your weekly lecture and lab schedule across Monday through Saturday.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="border-border text-text-secondary hover:text-text-primary hover:bg-bg-base cursor-pointer flex items-center gap-2 text-xs h-9"
          >
            {importing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Upload className="w-3.5 h-3.5" />
            )}
            Import Excel
          </Button>

          <Button
            onClick={handleDownloadTemplate}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium flex items-center gap-2 cursor-pointer text-xs h-9 shadow-md shadow-emerald-950/40"
          >
            <Download className="w-3.5 h-3.5" />
            Download Template
          </Button>
        </div>
      </div>

      {/* B. WEEKLY GRID (SERIAL NUMBER ROWS 1, 2, 3...) */}
      <div
        className="bg-bg-surface border border-border rounded-2xl p-5 shadow-2xl overflow-x-auto w-full"
        style={{
          backgroundColor: "var(--bg-surface, #111118)",
          borderColor: "var(--border, #2A2A3A)",
        }}
      >
        <table className="w-full border-collapse min-w-[900px]">
          <thead>
            <tr>
              <th className="w-16 pb-4 pt-1 text-center text-xs font-mono font-semibold text-text-muted uppercase tracking-wider border-b border-border/80 px-2">
                #
              </th>
              {DAYS.map((day) => (
                <th
                  key={day.id}
                  className="pb-4 pt-1 text-center text-xs font-bold text-text-primary uppercase tracking-wider border-b border-border/80 px-2"
                >
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-bg-base border border-border/60">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span>{day.fullName}</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-border/40">
            {serialRowIndices.map((serialNum) => (
              <tr key={serialNum} className="group hover:bg-bg-base/20 transition-colors">
                {/* Serial Number Column */}
                <td className="py-4 px-2 text-center text-xs font-mono font-bold text-text-muted align-middle">
                  <span className="w-6 h-6 rounded-full bg-bg-base border border-border/60 inline-flex items-center justify-center">
                    {serialNum}
                  </span>
                </td>

                {/* Days MON-SAT (0-5) */}
                {DAYS.map((day) => {
                  const dayLectures = getDayEntries(day.id);
                  const entry = dayLectures[serialNum - 1]; // 0-indexed lecture for this row

                  return (
                    <td key={day.id} className="p-2 align-top w-1/6 min-w-[140px]">
                      {!entry ? (
                        /* Empty Cell: Dashed border with (+) Add Lecture */
                        <button
                          onClick={() => handleOpenAddModal(day.id)}
                          className="w-full h-24 rounded-xl border border-dashed border-border/80 hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all flex flex-col items-center justify-center gap-1 text-text-muted hover:text-emerald-400 cursor-pointer group/cell"
                        >
                          <div className="w-7 h-7 rounded-full bg-bg-base border border-border/60 group-hover/cell:border-emerald-500/40 flex items-center justify-center transition-colors">
                            <Plus className="w-4 h-4" />
                          </div>
                          <span className="text-[11px] font-medium">Add Lecture</span>
                        </button>
                      ) : (
                        /* Filled Cell Card */
                        <div
                          className={`group/card relative rounded-xl p-3.5 border transition-all shadow-md flex flex-col justify-between gap-2.5 h-28 ${
                            entry.session_type === "lab"
                              ? "bg-emerald-500/10 border-emerald-500/30 hover:border-emerald-500/60 text-emerald-300"
                              : "bg-blue-500/10 border-blue-500/30 hover:border-blue-500/60 text-blue-300"
                          }`}
                        >
                          {/* Action buttons on hover */}
                          <div className="absolute top-2.5 right-2.5 opacity-0 group-hover/card:opacity-100 transition-opacity flex items-center gap-1 bg-bg-base/90 p-1 rounded-md border border-border shadow-sm z-10">
                            <button
                              onClick={(e) => handleOpenEditModal(entry, e)}
                              className="p-1 hover:text-emerald-400 text-text-muted transition-colors cursor-pointer"
                              title="Edit lecture"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={(e) => handleDeleteEntry(entry.id, e)}
                              className="p-1 hover:text-rose-400 text-text-muted transition-colors cursor-pointer"
                              title="Delete lecture"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <div>
                            {/* Subject Bold Header */}
                            <div className="font-bold text-text-primary text-sm line-clamp-1 pr-12 flex items-center gap-1.5">
                              {entry.session_type === "lab" ? (
                                <FlaskConical className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                              ) : (
                                <BookOpen className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                              )}
                              <span className="truncate">{entry.subject}</span>
                            </div>

                            {/* Class / Room Line */}
                            <div className="text-[11px] text-text-secondary mt-1 flex items-center gap-1.5 truncate">
                              <School className="w-3 h-3 text-text-muted shrink-0" />
                              <span className="truncate">
                                {entry.class_name || "Class #" + entry.class_id}
                                {entry.room && ` • ${entry.room}`}
                              </span>
                            </div>
                          </div>

                          {/* Time Range Badge & Reminder Indicator */}
                          <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[10px] font-mono">
                            <span
                              className={`px-2 py-0.5 rounded font-semibold ${
                                entry.session_type === "lab"
                                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                  : "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                              }`}
                            >
                              {formatTimeHHMM(entry.start_time)} - {formatTimeHHMM(entry.end_time)}
                            </span>

                            {entry.reminder_enabled ? (
                              <span className="flex items-center gap-1 text-amber-400 text-[10px]" title="Reminder enabled">
                                <Bell className="w-3 h-3" /> Alert On
                              </span>
                            ) : null}
                          </div>
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* C. GLOBAL OPTIONS & REMINDER SUPPRESSION DATES PANEL */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Global Timetable Options Card (Single Teacher Setting) */}
        <div
          className="bg-bg-surface border border-border rounded-xl p-5 shadow-lg space-y-4 flex flex-col justify-between"
          style={{
            backgroundColor: "var(--bg-surface, #111118)",
            borderColor: "var(--border, #2A2A3A)",
          }}
        >
          <div className="space-y-0.5">
            <h3 className="text-base font-semibold text-text-primary flex items-center gap-2">
              <Sliders className="w-4 h-4 text-emerald-400" />
              Global Timetable Options
            </h3>
            <p className="text-xs text-text-secondary">
              Configure your single global late warning email threshold applied to all enabled lecture reminders.
            </p>
          </div>

          <div className="flex items-center gap-4 bg-bg-base/80 border border-border/80 px-4 py-3 rounded-lg">
            <label className="text-xs font-medium text-text-secondary flex items-center gap-1.5 whitespace-nowrap">
              <Bell className="w-3.5 h-3.5 text-amber-400" />
              Set Late Warning Email:
            </label>
            <input
              type="range"
              min="0"
              max="30"
              value={defaultDelayMinutes}
              onChange={(e) => handleUpdateGlobalDelay(Number(e.target.value))}
              className="w-full accent-emerald-500 cursor-pointer"
            />
            <span className="text-xs font-mono font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded shrink-0">
              {defaultDelayMinutes} min
            </span>
          </div>
        </div>

        {/* Reminder Suppression Dates Card */}
        <div
          className="bg-bg-surface border border-border rounded-xl p-5 shadow-lg space-y-4"
          style={{
            backgroundColor: "var(--bg-surface, #111118)",
            borderColor: "var(--border, #2A2A3A)",
          }}
        >
          <div className="space-y-0.5">
            <h3 className="text-base font-semibold text-text-primary flex items-center gap-2">
              <CalendarOff className="w-4 h-4 text-amber-400" />
              Reminder Suppression Dates
            </h3>
            <p className="text-xs text-text-secondary">
              Mark specific dates (holidays, leave) when email alerts are paused.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Input
              type="date"
              value={newExceptionDate}
              onChange={(e) => setNewExceptionDate(e.target.value)}
              className="bg-bg-base border-border text-text-primary text-xs h-9 w-44"
            />
            <Button
              onClick={handleAddException}
              disabled={addingException}
              className="bg-amber-600 hover:bg-amber-500 text-white font-medium text-xs h-9 cursor-pointer flex items-center gap-1.5"
            >
              {addingException ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Plus className="w-3.5 h-3.5" />
              )}
              Mark Date
            </Button>
          </div>

          {/* List of Marked Exception Dates */}
          {exceptions.length === 0 ? (
            <p className="text-xs text-text-muted italic pt-1">No suppression dates marked.</p>
          ) : (
            <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto pt-1">
              {exceptions.map((ex) => (
                <div
                  key={ex.id}
                  className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono"
                >
                  <span>{ex.exception_date}</span>
                  <button
                    onClick={() => handleDeleteException(ex.id)}
                    className="hover:text-rose-400 text-amber-400 transition-colors cursor-pointer"
                    title="Remove suppression date"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ADD / EDIT LECTURE MODAL (SIMPLIFIED — NO PER-LECTURE DELAY INPUT) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm overflow-y-auto">
          <div
            className="relative max-w-md w-full my-8 bg-bg-surface border border-border rounded-2xl p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-200"
            style={{
              backgroundColor: "var(--bg-surface, #111118)",
              borderColor: "var(--border, #2A2A3A)",
            }}
          >
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <h2 className="text-lg font-bold text-text-primary flex items-center gap-2">
                {editingEntryId ? (
                  <>
                    <Edit3 className="w-5 h-5 text-emerald-400" /> Edit Lecture
                  </>
                ) : (
                  <>
                    <Plus className="w-5 h-5 text-emerald-400" /> Add New Lecture
                  </>
                )}
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-text-muted hover:text-text-primary p-1 rounded transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
                <X className="w-4 h-4 shrink-0" />
                {formError}
              </div>
            )}

            <div className="space-y-4 text-xs">
              {/* Subject */}
              <div>
                <label className="font-medium text-text-secondary mb-1 flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-emerald-400" /> Subject Name *
                </label>
                <Input
                  type="text"
                  placeholder="e.g. Operating Systems"
                  value={formSubject}
                  onChange={(e) => setFormSubject(e.target.value)}
                  className="bg-bg-base border-border text-text-primary text-sm"
                />
              </div>

              {/* Class & Room */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-medium text-text-secondary mb-1 flex items-center gap-1.5">
                    <School className="w-3.5 h-3.5 text-emerald-400" /> Class *
                  </label>
                  <select
                    value={formClassId}
                    onChange={(e) => setFormClassId(e.target.value)}
                    className="w-full h-10 px-3 rounded-md bg-bg-base border border-border text-text-primary text-xs focus:outline-none focus:border-emerald-500"
                  >
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-medium text-text-secondary mb-1 flex items-center gap-1.5">
                    <Building className="w-3.5 h-3.5 text-emerald-400" /> Room / Lab
                  </label>
                  <Input
                    type="text"
                    placeholder="e.g. Lab 2 or Room 301"
                    value={formRoom}
                    onChange={(e) => setFormRoom(e.target.value)}
                    className="bg-bg-base border-border text-text-primary text-xs"
                  />
                </div>
              </div>

              {/* Session Type */}
              <div>
                <label className="font-medium text-text-secondary mb-1.5 flex items-center gap-1.5">
                  Session Type & Visual Card Style
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormSessionType("standard")}
                    className={`p-2.5 rounded-lg border text-left flex items-center gap-2 cursor-pointer transition-all ${
                      formSessionType === "standard"
                        ? "bg-blue-500/20 border-blue-500/50 text-blue-300 font-bold"
                        : "bg-bg-base border-border text-text-muted"
                    }`}
                  >
                    <BookOpen className="w-4 h-4 text-blue-400 shrink-0" />
                    <div>
                      <div className="text-xs">Standard</div>
                      <div className="text-[10px] text-text-muted font-normal">Blue card style</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormSessionType("lab")}
                    className={`p-2.5 rounded-lg border text-left flex items-center gap-2 cursor-pointer transition-all ${
                      formSessionType === "lab"
                        ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300 font-bold"
                        : "bg-bg-base border-border text-text-muted"
                    }`}
                  >
                    <FlaskConical className="w-4 h-4 text-emerald-400 shrink-0" />
                    <div>
                      <div className="text-xs">Lab Session</div>
                      <div className="text-[10px] text-text-muted font-normal">Green card style</div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Day & Times */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="font-medium text-text-secondary mb-1 block">Day</label>
                  <select
                    value={formDayOfWeek}
                    onChange={(e) => setFormDayOfWeek(Number(e.target.value))}
                    className="w-full h-9 px-2 rounded-md bg-bg-base border border-border text-text-primary text-xs focus:outline-none focus:border-emerald-500"
                  >
                    {DAYS.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.fullName}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-medium text-text-secondary mb-1 block">Start Time</label>
                  <Input
                    type="time"
                    value={formStartTime}
                    onChange={(e) => setFormStartTime(e.target.value)}
                    className="bg-bg-base border-border text-text-primary text-xs h-9"
                  />
                </div>

                <div>
                  <label className="font-medium text-text-secondary mb-1 block">End Time</label>
                  <Input
                    type="time"
                    value={formEndTime}
                    onChange={(e) => setFormEndTime(e.target.value)}
                    className="bg-bg-base border-border text-text-primary text-xs h-9"
                  />
                </div>
              </div>

              {/* Late Warning Email Alert Checkbox Only */}
              <div className="bg-bg-base border border-border rounded-lg p-3">
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="font-medium text-text-primary flex items-center gap-1.5">
                    <Bell className="w-3.5 h-3.5 text-amber-400" /> Enable Late Warning Email Alert
                  </span>
                  <input
                    type="checkbox"
                    checked={formReminderEnabled}
                    onChange={(e) => setFormReminderEnabled(e.target.checked)}
                    className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
                  />
                </label>
                <p className="text-[10px] text-text-muted mt-1.5">
                  Uses your global late warning delay ({defaultDelayMinutes} min) configured in Global Timetable Options.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-border/60">
              <Button
                variant="outline"
                onClick={() => setIsModalOpen(false)}
                className="border-border text-text-secondary text-xs"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveModalEntry}
                disabled={saving}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs flex items-center gap-1.5 shadow-md shadow-emerald-950/40 cursor-pointer"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" /> Save Entry
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* EXCEL IMPORT REPORT MODAL */}
      {importReport && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm overflow-y-auto">
          <div
            className="relative max-w-xl w-full my-8 bg-bg-surface border border-border rounded-2xl p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200"
            style={{
              backgroundColor: "var(--bg-surface, #111118)",
              borderColor: "var(--border, #2A2A3A)",
            }}
          >
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <h2 className="text-lg font-bold text-text-primary flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-400" /> Excel Import Report
              </h2>
              <button
                onClick={() => setImportReport(null)}
                className="text-text-muted hover:text-text-primary p-1 rounded transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="max-h-[50vh] overflow-y-auto space-y-2 pr-1 text-xs">
              {importReport.map((resItem, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded-lg border flex flex-col gap-1 ${
                    resItem.status === "created"
                      ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
                      : "bg-rose-500/10 border-rose-500/20 text-rose-300"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold flex items-center gap-1.5">
                      {resItem.status === "created" ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                      )}
                      Row {resItem.row}: {resItem.subject || "Unnamed Entry"}
                    </span>
                    <span className="font-mono text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-bg-base/60">
                      {resItem.status}
                    </span>
                  </div>

                  {resItem.reason && (
                    <div className="text-[11px] text-rose-400 pl-5">
                      Reason: {resItem.reason}
                    </div>
                  )}

                  {resItem.note && (
                    <div className="text-[11px] text-amber-400 pl-5 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 shrink-0" /> {resItem.note}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-3 border-t border-border/60">
              <Button
                onClick={() => setImportReport(null)}
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium cursor-pointer"
              >
                Close Report
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
