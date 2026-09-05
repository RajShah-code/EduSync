import { API_BASE_URL } from "../../config/api.js";
import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import { IconCalendar as Calendar, IconCalendarWeek as CalendarWeek, IconClock as Clock, IconBook as BookOpen, IconChalkboard as School, IconBell as Bell, IconBellRinging as BellRinging, IconPlus as Plus, IconTrash as Trash2, IconPencil as Edit3, IconLoader2 as Loader2, IconFileSpreadsheet as FileSpreadsheet, IconDownload as Download, IconFileTypeXls as FileTypeXls, IconX as X, IconCircleCheck as CheckCircle2, IconAlertTriangle as AlertTriangle, IconAdjustmentsHorizontal as Sliders, IconCalendarSmile as CalendarSmile, IconMapPin as MapPin, IconPencilCode as PencilCode, IconDeviceDesktopCode as DeviceDesktopCode } from "@tabler/icons-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Field, SimpleSelect } from "../../components/ui/field";
import { TimePicker } from "../../components/ui/time-picker";
import { Switch } from "../../components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Tooltip, TooltipTrigger, TooltipContent } from "../../components/ui/tooltip";
import { Skeleton } from "../../components/ui/skeleton";
import { DateMultiPicker } from "../../components/ui/date-range-picker";
import { cn } from "../../components/ui/utils";
import PageShell from "../../components/PageShell";
import { formatClockString } from "../../utils/timeFormat";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "../../components/ui/alert-dialog";

// Late-warning delay presets — the "Custom" chip covers everything else.
const DELAY_PRESETS = [5, 10, 20];

// Shared spring for the Save Entry button's hover label-collapse — same
// curve as the Live Lecture Setup Modal's Start Lecture button
// (LiveBroadcast.jsx's PILL_TRANSITION), so the two modals' pill buttons
// feel identical.
const PILL_TRANSITION = { type: "spring", bounce: 0, duration: 0.45 };

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
 * Extract subject acronym e.g. "Data Structure & Algorithm" -> "DSA"
 */
function getSubjectAcronym(subject) {
  if (!subject || typeof subject !== "string") return "";
  const tokens = subject.trim().split(/\s+/);
  const chars = [];
  for (const token of tokens) {
    const match = token.match(/[a-zA-Z0-9]/);
    if (match) {
      chars.push(match[0].toUpperCase());
    }
  }
  return chars.join("") || subject;
}

/**
 * Determines whether a subject should be abbreviated to an acronym.
 * Returns false for single-word subjects or short subjects (<= 12 chars).
 * Returns true only when multi-word AND length > 12.
 */
function shouldAbbreviateSubject(subject) {
  if (!subject || typeof subject !== "string") return false;
  const trimmed = subject.trim();
  if (trimmed.length <= 12) return false;
  const words = trimmed.split(/\s+/);
  return words.length > 1;
}

/**
 * Client-side "today" must agree with the IST convention Backend/utils/
 * istTime.js already uses (0=Monday..6=Sunday) — a raw new Date().getDay()
 * reads the browser's local timezone, which silently disagrees with the
 * server's notion of "today" (and the reminder cron) for any teacher not
 * physically in IST. Mirrors istTime.js's Intl.DateTimeFormat approach
 * instead of reintroducing that mismatch client-side.
 */
function getISTDayOfWeek(date = new Date()) {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
  }).format(date);
  const weekdayMap = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  return weekdayMap[weekday] ?? 0;
}

export function TimetableSetup() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const prefersReducedMotion = useReducedMotion();

  // Core state
  const [classes, setClasses] = useState([]);
  const [entries, setEntries] = useState([]);
  const [exceptions, setExceptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState(null);

  // Global Timetable Options State (Teacher-level single setting)
  const [defaultDelayMinutes, setDefaultDelayMinutes] = useState(5);
  const [updatingDelay, setUpdatingDelay] = useState(false);
  // Late-warning delay is a preset chip (5/10/20) unless the loaded/entered
  // value doesn't match one — then it's "Custom" with its own inline field.
  // customDelayMode is a UI-only flag: it opens on an explicit "Custom"
  // click or a non-preset value, and only closes when a preset is clicked
  // directly (never auto-closes mid-edit just because a typed value happens
  // to pass through a preset number).
  const [customDelayMode, setCustomDelayMode] = useState(false);
  const [customDelayDraft, setCustomDelayDraft] = useState("");
  const customDelayInputRef = useRef(null);
  // A flexible, possibly-scattered set of ISO dates — the picker itself
  // handles both drag-a-range and click-a-single-day, already expanded to
  // exact dates by the time onChange fires here.
  const [selectedExceptionDates, setSelectedExceptionDates] = useState([]);
  const [addingException, setAddingException] = useState(false);

  // Modal State for Add / Edit Entry
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isModalClosing, setIsModalClosing] = useState(false);
  const closeModal = () => {
    setIsModalClosing(true);
    setTimeout(() => {
      setIsModalOpen(false);
      setIsModalClosing(false);
    }, 150);
  };
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
  const [formTouched, setFormTouched] = useState(false);
  // Hover state for the Save Entry button's icon-centers/label-collapses
  // treatment, mirroring the Setup Modal's Start Lecture button.
  const [saveButtonHovered, setSaveButtonHovered] = useState(false);

  // Excel Import Report Modal State
  const [importReport, setImportReport] = useState(null);
  const [importReportClosing, setImportReportClosing] = useState(false);
  const closeImportReport = () => {
    setImportReportClosing(true);
    setTimeout(() => {
      setImportReport(null);
      setImportReportClosing(false);
    }, 150);
  };

  // Empty state banner visibility
  const [showEmptyBanner, setShowEmptyBanner] = useState(true);

  // Today's day_of_week in the app's Monday=0..Saturday=5 grid convention,
  // IST-aware (see getISTDayOfWeek above). Sunday (6) has no column in this
  // grid, so todayDow is null and no column gets highlighted.
  const istDayOfWeek = getISTDayOfWeek();
  const todayDow = istDayOfWeek === 6 ? null : istDayOfWeek;
  const defaultDay = todayDow ?? 0;

  // Real-time form errors
  const timeError =
    formStartTime && formEndTime && formEndTime <= formStartTime
      ? "End time must be later than start time."
      : "";
  const subjectError =
    formTouched && !formSubject.trim() ? "Subject name is required." : "";
  const classError =
    formTouched && !formClassId ? "Please select a class." : "";

  const isFormValid =
    formSubject.trim() !== "" &&
    formClassId !== "" &&
    formStartTime !== "" &&
    formEndTime !== "" &&
    !timeError;

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
      } else {
        setLoadError(true);
        return;
      }

      // 3. Fetch reminder suppression exception dates
      const exceptionsRes = await fetch(`${API_BASE_URL}/timetable/exceptions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (exceptionsRes.ok) {
        const exData = await exceptionsRes.json();
        setExceptions(exData.exceptions || []);
      }
      setLoadError(false);
    } catch (err) {
      toast.error("Error connecting to server");
      setLoadError(true);
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

  // Keep the "Custom" chip in sync with a loaded/committed value that isn't
  // one of the presets — deliberately one-directional (only ever turns
  // custom mode ON here); turning it back off only happens when a preset
  // chip is clicked directly (see handleSelectDelayPreset), never as a side
  // effect of a value passing through a preset number mid-edit.
  useEffect(() => {
    if (!DELAY_PRESETS.includes(defaultDelayMinutes)) {
      setCustomDelayMode(true);
      setCustomDelayDraft(String(defaultDelayMinutes));
    }
  }, [defaultDelayMinutes]);

  const handleSelectDelayPreset = (mins) => {
    setCustomDelayMode(false);
    handleUpdateGlobalDelay(mins);
  };

  const handleOpenCustomDelay = () => {
    setCustomDelayDraft(String(defaultDelayMinutes));
    setCustomDelayMode(true);
    requestAnimationFrame(() => customDelayInputRef.current?.focus());
  };

  const commitCustomDelay = () => {
    const parsed = parseInt(customDelayDraft, 10);
    const clamped = Number.isFinite(parsed) ? Math.min(180, Math.max(0, parsed)) : defaultDelayMinutes;
    setCustomDelayDraft(String(clamped));
    if (clamped !== defaultDelayMinutes) handleUpdateGlobalDelay(clamped);
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
  const handleOpenAddModal = (dayIndex = defaultDay) => {
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
    setFormTouched(false);
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
    setFormTouched(false);
    setIsModalOpen(true);
  };

  // Save (Create / Update) timetable entry
  const handleSaveModalEntry = async () => {
    setFormTouched(true);
    setFormError("");

    if (!formSubject.trim() || !formStartTime || !formEndTime || formStartTime >= formEndTime || !formClassId) {
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
      closeModal();
      fetchInitialData();
    } catch (err) {
      setFormError("Network error while saving entry");
    } finally {
      setSaving(false);
    }
  };

  // Delete entry handler — confirmation is a controlled AlertDialog (see
  // deleteTargetId state), matching the app-wide themed-confirm convention
  // instead of a raw window.confirm().
  const handleDeleteEntry = (entryId, e) => {
    e.stopPropagation();
    setDeleteTargetId(entryId);
  };

  const confirmDeleteEntry = async () => {
    const entryId = deleteTargetId;
    setDeleteTargetId(null);
    if (!entryId) return;

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

  // Add Date Exception(s) (Reminder Suppression) — selectedExceptionDates is
  // already an exact, deduplicated array of ISO dates by the time it gets
  // here (the picker itself expands any dragged ranges), so this is just a
  // straight submit. The backend only has a single-date endpoint, so
  // multiple dates are a sequential loop over it rather than a bulk route —
  // sequential (not Promise.all) so a slow/rate-limited backend isn't hit
  // with a burst.
  const handleAddException = async () => {
    const dates = selectedExceptionDates;
    if (dates.length === 0) {
      toast.error("Please select at least one date first");
      return;
    }

    setAddingException(true);
    const token = localStorage.getItem("edusync_token");
    let added = 0;
    let alreadyMarked = 0;
    let failed = 0;

    for (const dateStr of dates) {
      try {
        const res = await fetch(`${API_BASE_URL}/timetable/exceptions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ exception_date: dateStr }),
        });
        if (res.ok) {
          added += 1;
        } else {
          const data = await res.json().catch(() => ({}));
          if (data.message === "Exception date already marked") {
            alreadyMarked += 1;
          } else {
            failed += 1;
          }
        }
      } catch (err) {
        failed += 1;
      }
    }

    if (added > 0) {
      const parts = [`${added} date${added === 1 ? "" : "s"} marked`];
      if (alreadyMarked > 0) parts.push(`${alreadyMarked} already marked`);
      if (failed > 0) parts.push(`${failed} failed`);
      toast.success(parts.join(" · "));
      setSelectedExceptionDates([]);
      fetchInitialData();
    } else if (alreadyMarked > 0 && failed === 0) {
      toast.error(
        dates.length === 1
          ? "That date is already marked"
          : "Every one of those dates is already marked"
      );
    } else {
      toast.error("Failed to add date exception");
    }

    setAddingException(false);
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
      <PageShell>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-bg-surface border border-border rounded-[var(--radius-lg)] p-5">
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-80" />
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-32" />
            <Skeleton className="h-9 w-32" />
            <Skeleton className="h-9 w-40" />
          </div>
        </div>

        <div className="bg-bg-surface border border-border rounded-[var(--radius-lg)] p-5 overflow-x-auto w-full">
          <div className="min-w-[900px] space-y-2">
            <div className="grid grid-cols-[56px_repeat(6,1fr)] gap-2">
              <Skeleton className="h-8 w-8 mx-auto rounded-[var(--radius-md)]" />
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-8 w-full rounded-[var(--radius-pill)]" />
              ))}
            </div>
            {[0, 1, 2].map((row) => (
              <div key={row} className="grid grid-cols-[56px_repeat(6,1fr)] gap-2">
                <Skeleton className="h-28 w-8 mx-auto" />
                {[0, 1, 2, 3, 4, 5].map((col) => (
                  <Skeleton key={col} className="h-28 w-full rounded-[var(--radius-md)]" />
                ))}
              </div>
            ))}
          </div>
        </div>
      </PageShell>
    );
  }

  if (loadError) {
    return (
      <PageShell>
        <div className="bg-bg-surface border border-accent-critical/25 rounded-[var(--radius-lg)] flex flex-col items-center justify-center gap-3 py-16">
          <p className="text-sm text-text-secondary">Couldn't load your timetable.</p>
          <Button
            onClick={fetchInitialData}
            variant="outline"
            size="sm"
            className="btn-press rounded-full text-xs font-semibold"
          >
            Try again
          </Button>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      {/* Hidden File Input for Excel Import */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".xlsx, .xls"
        className="hidden"
      />

      {/* A. HEADER ROW */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-bg-surface border border-border rounded-[var(--radius-lg)] p-5">
        <div>
          <h1 className="text-[length:var(--text-xl)] font-medium text-text-primary tracking-tight flex items-center gap-2.5">
            <CalendarWeek className="w-7 h-7 text-accent-info" />
            Weekly Timetable
          </h1>
          <p className="text-[length:var(--text-sm)] text-text-secondary mt-1">
            Directly configure your weekly lecture and lab schedule across Monday through Saturday.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <Button size="sm" variant="default" onClick={() => handleOpenAddModal(defaultDay)}>
            <Plus className="w-4 h-4" />
            Add lecture
          </Button>

          <div className="flex items-center gap-2 border-l border-border pl-3">
            <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={importing}>
              {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileTypeXls className="w-3.5 h-3.5" />}
              Import Excel
            </Button>

            <Button size="sm" variant="outline" onClick={handleDownloadTemplate}>
              <Download className="w-3.5 h-3.5" />
              Download template
            </Button>
          </div>
        </div>
      </div>

      {/* Empty-state banner for first-time setup */}
      {entries.length === 0 && showEmptyBanner && (
        <div className="bg-accent-info/10 border border-accent-info/20 rounded-[var(--radius-lg)] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="p-2.5 rounded-lg bg-accent-info/20 border border-accent-info/30 text-accent-info shrink-0 mt-0.5 sm:mt-0">
              <Calendar className="w-[22px] h-[22px]" />
            </div>
            <div>
              <p className="text-[length:var(--text-base)] text-text-primary font-medium">
                Get started: import your Excel timetable, or use + Add Lecture above to add your first one.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              className="btn-press rounded-full border-border text-text-secondary hover:text-text-primary hover:bg-bg-base cursor-pointer flex items-center gap-2 text-[length:var(--text-xs)] h-8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-info focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface"
            >
              {importing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileTypeXls className="w-4 h-4" />
              )}
              Import Excel
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowEmptyBanner(false)}
              className="btn-press rounded-full border-border text-text-secondary hover:text-text-primary hover:bg-bg-base cursor-pointer text-[length:var(--text-xs)] h-8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-info focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface"
            >
              Dismiss
            </Button>
          </div>
        </div>
      )}

      {/* B. WEEKLY GRID (SERIAL NUMBER ROWS 1, 2, 3...) — CSS Grid rather
          than a <table>, so today's entire column can be one column-
          spanning element (header + every cell beneath it) for the mount
          highlight below, instead of scattered per-<tr> cells. */}
      <div className="bg-bg-surface border border-border rounded-[var(--radius-lg)] p-5 overflow-x-auto w-full">
        <div
          className="relative grid gap-x-2 gap-y-2 min-w-[900px]"
          style={{
            gridTemplateColumns: "56px repeat(6, 1fr)",
            gridTemplateRows: `auto repeat(${totalSerialRows}, minmax(108px, auto))`,
          }}
        >
          {/* Today column highlight — animates in brighter on mount, fades
              to a quiet resting tint over ~2s, then stays put (no loop).
              initial→animate only ever fires once per mount, which is
              exactly "once per page visit" here since this grid itself
              only mounts once loading finishes. */}
          {todayDow !== null && (
            <motion.div
              aria-hidden="true"
              className="rounded-[var(--radius-lg)]"
              style={{
                gridColumn: todayDow + 2,
                gridRow: `1 / span ${totalSerialRows + 1}`,
                margin: "-6px -4px",
                zIndex: 0,
              }}
              initial={
                prefersReducedMotion
                  ? false
                  : {
                      backgroundColor: "color-mix(in srgb, var(--accent-500) 20%, transparent)",
                      boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--accent-500) 45%, transparent)",
                    }
              }
              animate={{
                backgroundColor: "color-mix(in srgb, var(--accent-500) 5%, transparent)",
                boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--accent-500) 18%, transparent)",
              }}
              transition={{
                duration: prefersReducedMotion ? 0.01 : 2.2,
                delay: prefersReducedMotion ? 0 : 0.25,
                ease: [0.23, 1, 0.32, 1],
              }}
            />
          )}

          {/* Header row */}
          <div
            style={{ gridColumn: 1, gridRow: 1, zIndex: 1 }}
            className="pb-3 text-center text-[length:var(--text-xs)] font-medium text-text-muted uppercase tracking-wider border-b border-border/80"
          >
            #
          </div>
          {DAYS.map((day, dayIdx) => {
            const isToday = day.id === todayDow;
            return (
              <div
                key={day.id}
                style={{ gridColumn: dayIdx + 2, gridRow: 1, zIndex: 1 }}
                className="pb-3 flex justify-center border-b border-border/80"
              >
                <div
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-[var(--radius-pill)] border text-[length:var(--text-xs)] font-semibold uppercase tracking-wider ${
                    isToday
                      ? "bg-accent-500/15 border-accent-500/40 text-accent-500"
                      : "bg-bg-base border-border/60 text-text-primary"
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${isToday ? "bg-accent-500" : "bg-text-muted"}`} />
                  <span>{day.fullName}</span>
                  {isToday && <span className="text-[10px] font-bold tracking-normal normal-case opacity-80">· Today</span>}
                </div>
              </div>
            );
          })}

          {/* Lecture rows */}
          {serialRowIndices.map((serialNum, rowIdx) => (
            <React.Fragment key={serialNum}>
              <div
                style={{ gridColumn: 1, gridRow: rowIdx + 2, zIndex: 1 }}
                className="flex items-center justify-center text-[length:var(--text-xs)] tnum text-text-muted"
              >
                {serialNum}
              </div>

              {DAYS.map((day, dayIdx) => {
                const dayLectures = getDayEntries(day.id);
                const entry = dayLectures[serialNum - 1]; // 0-indexed lecture for this row
                const typeAccent = entry?.session_type === "lab" ? "accent-live" : "accent-info";

                return (
                  <div key={day.id} style={{ gridColumn: dayIdx + 2, gridRow: rowIdx + 2, zIndex: 1 }} className="h-full">
                    {!entry ? (
                      /* Empty slot — quiet at rest, the add affordance only
                         asserts itself on hover/focus rather than sitting
                         as a permanent dashed button on every open slot. */
                      <button
                        onClick={() => handleOpenAddModal(day.id)}
                        className="group/cell w-full h-full min-h-28 rounded-[var(--radius-md)] border border-dashed border-transparent hover:border-accent-info/40 hover:bg-accent-info/5 transition-[border-color,background-color] duration-150 ease-[var(--ease-out-strong)] flex flex-col items-center justify-center gap-1.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-info focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface"
                      >
                        <div className="w-6 h-6 rounded-full border border-border/60 opacity-0 group-hover/cell:opacity-100 group-focus-visible/cell:opacity-100 flex items-center justify-center text-text-muted group-hover/cell:text-accent-info group-hover/cell:border-accent-info/40 transition-[opacity,color,border-color] duration-150">
                          <Plus className="w-4 h-4" />
                        </div>
                        <span className="text-[length:var(--text-xs)] font-medium text-text-muted opacity-0 group-hover/cell:opacity-100 group-focus-visible/cell:opacity-100 group-hover/cell:text-accent-info transition-opacity duration-150">
                          Add Lecture
                        </span>
                      </button>
                    ) : (
                      /* Filled slot — a thin left accent bar carries the
                         standard/lab distinction; card body stays neutral
                         (bg-surface, primary/secondary text) so color reads
                         as a category marker, not a full-card tint that
                         fights the text for attention. */
                      <div
                        className="group/card relative h-full min-h-28 rounded-[var(--radius-md)] border border-border bg-bg-surface hover:border-border-hover transition-colors duration-150 overflow-hidden"
                      >
                        <span
                          className="absolute left-0 top-0 bottom-0 w-[3px]"
                          style={{ background: `var(--${typeAccent})` }}
                          aria-hidden="true"
                        />

                        <div className="h-full flex flex-col justify-between gap-2 pl-4 pr-2.5 py-2.5">
                          {/* Action buttons on hover */}
                          <div className="absolute top-2 right-2 opacity-0 group-hover/card:opacity-100 group-focus-within/card:opacity-100 transition-opacity flex items-center gap-1 bg-bg-elevated p-1 rounded-[var(--radius-sm)] border border-border shadow-sm z-10">
                            <button
                              onClick={(e) => handleOpenEditModal(entry, e)}
                              className="p-1.5 hover:text-accent-info text-text-secondary transition-[transform,color] duration-100 ease-[var(--ease-out-strong)] active:scale-95 cursor-pointer rounded-[var(--radius-sm)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-info focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface"
                              title="Edit lecture"
                              aria-label="Edit lecture"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={(e) => handleDeleteEntry(entry.id, e)}
                              className="p-1.5 hover:text-accent-critical text-text-secondary transition-[transform,color] duration-100 ease-[var(--ease-out-strong)] active:scale-95 cursor-pointer rounded-[var(--radius-sm)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-info focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface"
                              title="Delete lecture"
                              aria-label="Delete lecture"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>

                          {/* 1st line: subject */}
                          <div className="font-semibold text-text-primary text-[length:var(--text-sm)] flex items-center gap-1.5 pr-12 min-w-0">
                            {entry.session_type === "lab" ? (
                              <DeviceDesktopCode className="w-4 h-4 text-accent-live shrink-0" />
                            ) : (
                              <PencilCode className="w-4 h-4 text-accent-info shrink-0" />
                            )}
                            {shouldAbbreviateSubject(entry.subject) ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="cursor-help font-bold tracking-wide">
                                    {getSubjectAcronym(entry.subject)}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent className="bg-bg-elevated border border-border text-text-primary text-xs font-medium px-2.5 py-1.5 rounded-md shadow-lg z-50">
                                  {entry.subject}
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              <span className="truncate" title={entry.subject}>
                                {entry.subject}
                              </span>
                            )}
                          </div>

                          {/* 2nd line: time range */}
                          <div className="tnum text-[length:var(--text-xs)] font-medium text-text-secondary">
                            {formatClockString(entry.start_time)} - {formatClockString(entry.end_time)}
                          </div>

                          {/* 3rd line: class / room & reminder indicator */}
                          <div className="flex items-start justify-between text-[length:var(--text-xs)] text-text-secondary pt-1.5 border-t border-border/40 gap-1">
                            <div className="flex items-start gap-1 min-w-0">
                              <School className="w-3.5 h-3.5 text-text-muted shrink-0 mt-0.5" />
                              <span className="break-words leading-tight">
                                {entry.class_name || "Class #" + entry.class_id}
                                {entry.room && ` • ${entry.room}`}
                              </span>
                            </div>

                            {entry.reminder_enabled && (
                              <span
                                className="flex items-center gap-1 text-accent-warning shrink-0"
                                title="Reminder enabled"
                              >
                                <BellRinging className="w-4 h-4" />
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
        <p className="text-[length:var(--text-xs)] text-text-secondary mt-4">
          Each day's lectures are listed in the order they occur — row numbers are not synced across days.
        </p>
      </div>

      {/* C. LATE WARNING DELAY & REMINDER SUPPRESSION DATES PANEL */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Late Warning Delay Card (Teacher setting) */}
        <div className="card-hover bg-bg-surface border border-border rounded-[var(--radius-lg)] p-5 space-y-4 flex flex-col justify-between">
          <div className="space-y-1">
            <h3 className="text-[length:var(--text-base)] font-semibold text-text-primary flex items-center gap-2">
              <Sliders className="w-[18px] h-[18px] text-accent-info" />
              Late Warning Delay
            </h3>
            <p className="text-[length:var(--text-sm)] text-text-secondary">
              Your global late-warning email threshold, applied to every lecture with reminders enabled.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-[length:var(--text-sm)] font-medium text-text-secondary flex items-center gap-1.5">
              <Bell className="w-4 h-4 text-accent-info" />
              Warn at
            </label>
            <div className="flex items-center gap-1.5 flex-wrap">
              {DELAY_PRESETS.map((mins) => {
                const isActive = !customDelayMode && defaultDelayMinutes === mins;
                return (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => handleSelectDelayPreset(mins)}
                    aria-pressed={isActive}
                    className={cn(
                      "px-3 py-1.5 rounded-[var(--radius-pill)] text-[length:var(--text-xs)] font-semibold border cursor-pointer transition-[transform,background-color,border-color,color] duration-150 ease-[var(--ease-out-strong)] active:scale-[0.96]",
                      isActive
                        ? "bg-accent-info border-accent-info text-white"
                        : "bg-bg-base border-border text-text-secondary hover:border-border-hover hover:text-text-primary"
                    )}
                  >
                    {mins} min
                  </button>
                );
              })}

              <button
                type="button"
                onClick={handleOpenCustomDelay}
                aria-pressed={customDelayMode}
                className={cn(
                  "px-3 py-1.5 rounded-[var(--radius-pill)] text-[length:var(--text-xs)] font-semibold border cursor-pointer transition-[transform,background-color,border-color,color] duration-150 ease-[var(--ease-out-strong)] active:scale-[0.96]",
                  customDelayMode
                    ? "bg-accent-info border-accent-info text-white"
                    : "bg-bg-base border-border text-text-secondary hover:border-border-hover hover:text-text-primary"
                )}
              >
                Custom
              </button>

              {customDelayMode && (
                <div className="flex items-center gap-1 bg-bg-base border border-border rounded-[var(--radius-pill)] pl-3 pr-1.5 py-1 transition-colors duration-200 focus-within:border-accent-info animate-in fade-in zoom-in-95 duration-150">
                  <input
                    ref={customDelayInputRef}
                    type="number"
                    min={0}
                    max={180}
                    value={customDelayDraft}
                    onChange={(e) => setCustomDelayDraft(e.target.value)}
                    onBlur={commitCustomDelay}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                    }}
                    className="w-8 bg-transparent border-0 outline-none text-text-primary text-[length:var(--text-xs)] font-semibold tnum text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <span className="text-[length:var(--text-xs)] text-text-muted pr-1">min</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Reminder Suppression Dates Card */}
        <div className="card-hover bg-bg-surface border border-border rounded-[var(--radius-lg)] p-5 space-y-4">
          <div className="space-y-1">
            <h3 className="text-[length:var(--text-base)] font-semibold text-text-primary flex items-center gap-2">
              <CalendarSmile className="w-[18px] h-[18px] text-accent-info" />
              Reminder Suppression Dates
            </h3>
            <p className="text-[length:var(--text-sm)] text-text-secondary">
              Mark specific dates (holidays, leave) when email alerts are paused.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <DateMultiPicker
              value={selectedExceptionDates}
              onChange={setSelectedExceptionDates}
              disabled={addingException}
              className="flex-1 min-w-0"
            />
            <Button
              onClick={handleAddException}
              disabled={addingException || selectedExceptionDates.length === 0}
              className="rounded-full bg-accent-info hover:bg-accent-info/90 text-white font-semibold text-[length:var(--text-xs)] h-9 cursor-pointer flex items-center justify-center gap-1.5 shrink-0 transition-[background-color,transform] duration-150 ease-[var(--ease-out-strong)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-info focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface"
            >
              {addingException ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              {selectedExceptionDates.length > 1
                ? `Mark ${selectedExceptionDates.length} Dates`
                : "Mark Date"}
            </Button>
          </div>

          {/* List of Marked Exception Dates */}
          {exceptions.length === 0 ? (
            <p className="text-[length:var(--text-xs)] text-text-secondary italic pt-1">No suppression dates marked.</p>
          ) : (
            <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto pt-1">
              {exceptions.map((ex) => (
                <div
                  key={ex.id}
                  className="badge-enter flex items-center gap-2 px-2.5 py-1 rounded-[var(--radius-md)] bg-accent-info/10 border border-accent-info/30 text-accent-info text-[length:var(--text-xs)] tnum transition-colors duration-150 hover:border-accent-info/50"
                >
                  <span>{ex.exception_date}</span>
                  <button
                    onClick={() => handleDeleteException(ex.id)}
                    className="hover:text-accent-critical hover:bg-accent-critical/10 text-accent-info transition-[transform,background-color,color] duration-150 ease-[var(--ease-out-strong)] active:scale-90 cursor-pointer p-0.5 rounded-[var(--radius-sm)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-info focus-visible:ring-offset-1 focus-visible:ring-offset-bg-surface"
                    title="Remove suppression date"
                    aria-label={`Remove suppression date ${ex.exception_date}`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ADD / EDIT LECTURE — F2 (frontend-teacher) form */}
      <Dialog
        open={isModalOpen}
        onOpenChange={(open) => {
          setIsModalOpen(open);
          if (!open) setIsModalClosing(false);
        }}
      >
        <DialogContent data-role="teacher" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editingEntryId ? (
                <Edit3 className="w-[18px] h-[18px] text-accent-500" strokeWidth={1.75} />
              ) : (
                <Plus className="w-[18px] h-[18px] text-accent-500" strokeWidth={1.75} />
              )}
              {editingEntryId ? "Edit Lecture" : "Add New Lecture"}
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-3.5">
            <Field label="Subject" error={subjectError || undefined}>
              <Input
                value={formSubject}
                onChange={(e) => {
                  setFormSubject(e.target.value);
                  setFormTouched(true);
                }}
                placeholder="e.g. Operating Systems"
              />
            </Field>

            <Field label="Day">
              <SimpleSelect
                value={String(formDayOfWeek)}
                onChange={(e) => setFormDayOfWeek(Number(e.target.value))}
                options={DAYS.map((d) => ({ value: String(d.id), label: d.fullName }))}
              />
            </Field>

            <Field label="Class" error={classError || undefined}>
              <SimpleSelect
                value={formClassId}
                onChange={(e) => {
                  setFormClassId(e.target.value);
                  setFormTouched(true);
                }}
                placeholder="Select a class"
                options={classes.map((c) => ({ value: String(c.id), label: c.name }))}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Start" error={timeError || undefined}>
                <TimePicker
                  value={formStartTime}
                  onChange={(v) => {
                    setFormStartTime(v);
                    setFormTouched(true);
                  }}
                />
              </Field>
              <Field label="End">
                <TimePicker
                  value={formEndTime}
                  onChange={(v) => {
                    setFormEndTime(v);
                    setFormTouched(true);
                  }}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field
                label={
                  <>
                    Room <span className="font-normal text-text-muted">(optional)</span>
                  </>
                }
              >
                <Input
                  value={formRoom}
                  onChange={(e) => setFormRoom(e.target.value)}
                  placeholder="LAB 301"
                />
              </Field>
              <Field label="Type">
                <SimpleSelect
                  value={formSessionType}
                  onChange={(e) => setFormSessionType(e.target.value)}
                  options={[
                    { value: "standard", label: "Standard" },
                    { value: "lab", label: "Lab" },
                  ]}
                />
              </Field>
            </div>

            <label className="flex items-center justify-between rounded-[var(--radius-md)] border border-border px-3 py-2.5">
              <span className="text-sm text-text-secondary">Remind me before it starts</span>
              <Switch checked={formReminderEnabled} onCheckedChange={setFormReminderEnabled} />
            </label>

            {formError && <p className="text-sm text-accent-critical">{formError}</p>}

            <Button
              variant="default"
              onClick={handleSaveModalEntry}
              disabled={saving || !isFormValid}
              className="mt-1"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Saving…
                </>
              ) : editingEntryId ? (
                "Save Changes"
              ) : (
                "Add to Timetable"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Lecture Confirmation */}
      <AlertDialog open={deleteTargetId !== null} onOpenChange={(open) => !open && setDeleteTargetId(null)}>
        <AlertDialogContent className="bg-bg-surface border-border text-text-primary">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-text-primary">Delete this lecture?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes it from your recurring weekly timetable. This action can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteEntry}
              className="bg-accent-critical hover:bg-accent-critical/90 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* EXCEL IMPORT REPORT MODAL (BG-ELEVATED) */}
      {importReport && (
        <div
          className={`fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm overflow-y-auto ${
            importReportClosing
              ? "opacity-0 transition-opacity duration-150 ease-in"
              : "opacity-100 animate-in fade-in duration-200 ease-[var(--ease-out-strong)]"
          }`}
        >
          <div
            className={`relative max-w-xl w-full my-8 bg-bg-elevated border border-border rounded-[var(--radius-lg)] p-6 shadow-[var(--shadow-modal)] space-y-4 ${
              importReportClosing
                ? "animate-out fade-out zoom-out-95 duration-150 ease-in"
                : "animate-in fade-in zoom-in-95 duration-200 ease-[var(--ease-out-strong)]"
            }`}
          >
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <h2 className="text-[length:var(--text-base)] font-semibold text-text-primary flex items-center gap-2">
                <FileSpreadsheet className="w-[18px] h-[18px] text-accent-500" strokeWidth={1.75} /> Excel Import Report
              </h2>
              <button
                onClick={closeImportReport}
                className="text-text-secondary hover:text-text-primary p-1.5 rounded transition-[transform,color] duration-100 ease-[var(--ease-out-strong)] active:scale-95 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-info focus-visible:ring-offset-2 focus-visible:ring-offset-bg-elevated"
                aria-label="Close"
              >
                <X className="w-[18px] h-[18px]" />
              </button>
            </div>

            <div className="max-h-[50vh] overflow-y-auto space-y-2 pr-1 text-[length:var(--text-sm)]">
              {importReport.map((resItem, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded-[var(--radius-md)] border flex flex-col gap-1 ${
                    resItem.status === "created"
                      ? "bg-accent-live/10 border-accent-live/20 text-accent-live"
                      : "bg-accent-critical/10 border-accent-critical/20 text-accent-critical"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold flex items-center gap-1.5">
                      {resItem.status === "created" ? (
                        <CheckCircle2 className="w-[18px] h-[18px] text-accent-live shrink-0" />
                      ) : (
                        <AlertTriangle className="w-[18px] h-[18px] text-accent-critical shrink-0" />
                      )}
                      Row {resItem.row}: {resItem.subject || "Unnamed Entry"}
                    </span>
                    <span className="tracking-wide text-[length:var(--text-xs)] uppercase font-bold px-2 py-0.5 rounded-[var(--radius-pill)] bg-bg-base/60">
                      {resItem.status}
                    </span>
                  </div>

                  {resItem.reason && (
                    <div className="text-[length:var(--text-xs)] text-accent-critical pl-5">
                      Reason: {resItem.reason}
                    </div>
                  )}

                  {resItem.note && (
                    <div className="text-[length:var(--text-xs)] text-accent-warning pl-5 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {resItem.note}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-3 border-t border-border/60">
              <Button
                onClick={closeImportReport}
                className="btn-press rounded-full bg-accent-info hover:bg-accent-info/90 text-white text-[length:var(--text-sm)] font-medium cursor-pointer h-9 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-info focus-visible:ring-offset-2 focus-visible:ring-offset-bg-elevated"
              >
                Close Report
              </Button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
