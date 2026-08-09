import { API_BASE_URL } from "../../config/api.js";
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import {
  Calendar,
  Clock,
  BookOpen,
  School,
  Bell,
  ArrowRight,
  ArrowLeft,
  Plus,
  Trash2,
  CheckCircle2,
  Sparkles,
  RotateCcw,
  Edit3,
  Check,
  X,
  Loader2,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";

const DAYS = [
  { id: 0, name: "Monday" },
  { id: 1, name: "Tuesday" },
  { id: 2, name: "Wednesday" },
  { id: 3, name: "Thursday" },
  { id: 4, name: "Friday" },
  { id: 5, name: "Saturday" },
  { id: 6, name: "Sunday" },
];

export function TimetableSetup() {
  const navigate = useNavigate();

  // Master State
  const [classes, setClasses] = useState([]);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [fetchingExisting, setFetchingExisting] = useState(true);
  const [saving, setSaving] = useState(false);

  // Existing entries from DB
  const [entries, setEntries] = useState([]);

  // Wizard State
  const [currentDayIndex, setCurrentDayIndex] = useState(0); // 0-6
  const [subStep, setSubStep] = useState("DAY_ASK"); // 'DAY_ASK' | 'LECTURE_FORM' | 'REMINDER_ASK' | 'REMINDER_DELAY' | 'ADD_ANOTHER_ASK' | 'REVIEW'
  const [currentLectureIndex, setCurrentLectureIndex] = useState(1);

  // Form State for current lecture being constructed
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [subject, setSubject] = useState("");
  const [classId, setClassId] = useState("");
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderDelayMinutes, setReminderDelayMinutes] = useState("10");

  // Error / Validation state
  const [stepError, setStepError] = useState("");

  // Mode: 'WIZARD' or 'SUMMARY_PREVIEW'
  const [mode, setMode] = useState("WIZARD");

  // Fetch classes and existing timetable on mount
  useEffect(() => {
    const fetchData = async () => {
      const token = localStorage.getItem("edusync_token");
      if (!token) {
        navigate("/login");
        return;
      }

      try {
        // Fetch classes
        const classesRes = await fetch(`${API_BASE_URL}/classes`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (classesRes.ok) {
          const cData = await classesRes.json();
          setClasses(cData.classes || []);
          if (cData.classes && cData.classes.length > 0) {
            setClassId(String(cData.classes[0].id));
          }
        } else {
          toast.error("Failed to load classes");
        }

        // Fetch existing timetable
        const timetableRes = await fetch(`${API_BASE_URL}/timetable/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (timetableRes.ok) {
          const tData = await timetableRes.json();
          if (tData.entries && tData.entries.length > 0) {
            setEntries(tData.entries);
            setMode("SUMMARY_PREVIEW");
          }
        }
      } catch (err) {
        toast.error("Error connecting to server");
      } finally {
        setLoadingClasses(false);
        setFetchingExisting(false);
      }
    };

    fetchData();
  }, [navigate]);

  const currentDay = DAYS[currentDayIndex];

  // Helper to reset draft lecture form fields
  const resetForm = () => {
    setStartTime("09:00");
    setEndTime("10:00");
    setSubject("");
    if (classes.length > 0) setClassId(String(classes[0].id));
    setReminderEnabled(false);
    setReminderDelayMinutes("10");
    setStepError("");
  };

  // ── Step Navigation Handlers ──────────────────────────────────────────────

  const handleDayAskResponse = (hasLectures) => {
    setStepError("");
    if (hasLectures) {
      setCurrentLectureIndex(1);
      resetForm();
      setSubStep("LECTURE_FORM");
    } else {
      // Advance to next day or review
      advanceToNextDay();
    }
  };

  const handleSaveLectureForm = () => {
    setStepError("");
    if (!subject.trim()) {
      setStepError("Subject name is required.");
      return;
    }
    if (!startTime) {
      setStepError("Start time is required.");
      return;
    }
    if (!endTime) {
      setStepError("End time is required.");
      return;
    }
    if (startTime >= endTime) {
      setStepError("End time must be later than start time.");
      return;
    }
    if (!classId) {
      setStepError("Please select a class.");
      return;
    }

    setSubStep("REMINDER_ASK");
  };

  const handleReminderAskResponse = (wantReminder) => {
    setReminderEnabled(wantReminder);
    setStepError("");
    if (wantReminder) {
      setSubStep("REMINDER_DELAY");
    } else {
      // Save lecture to entries list without reminder
      saveCurrentDraftEntry(false, null);
      setSubStep("ADD_ANOTHER_ASK");
    }
  };

  const handleReminderDelayConfirm = () => {
    setStepError("");
    const delayNum = Number(reminderDelayMinutes);
    if (!reminderDelayMinutes || isNaN(delayNum) || delayNum <= 0) {
      setStepError("Reminder delay minutes is required and must be greater than 0.");
      return;
    }

    saveCurrentDraftEntry(true, delayNum);
    setSubStep("ADD_ANOTHER_ASK");
  };

  const saveCurrentDraftEntry = (remEnabled, remDelay) => {
    const selectedClass = classes.find((c) => String(c.id) === String(classId));
    const newEntry = {
      tempId: Date.now() + Math.random(),
      day_of_week: currentDayIndex,
      start_time: startTime,
      end_time: endTime,
      subject: subject.trim(),
      class_id: Number(classId),
      class_name: selectedClass ? selectedClass.name : "Class #" + classId,
      reminder_enabled: remEnabled,
      reminder_delay_minutes: remEnabled ? remDelay : null,
    };

    setEntries((prev) => [...prev, newEntry]);
  };

  const handleAddAnotherResponse = (addAnother) => {
    if (addAnother) {
      setCurrentLectureIndex((prev) => prev + 1);
      resetForm();
      setSubStep("LECTURE_FORM");
    } else {
      advanceToNextDay();
    }
  };

  const advanceToNextDay = () => {
    if (currentDayIndex < 6) {
      setCurrentDayIndex((prev) => prev + 1);
      setSubStep("DAY_ASK");
    } else {
      setSubStep("REVIEW");
    }
  };

  const removeEntry = (indexToRemove) => {
    setEntries((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  // Submit all entries to server
  const handleFinalSave = async () => {
    setSaving(true);
    const token = localStorage.getItem("edusync_token");

    // Server-side strict validation check before POSTing
    for (let i = 0; i < entries.length; i++) {
      const item = entries[i];
      if (item.reminder_enabled && (!item.reminder_delay_minutes || Number(item.reminder_delay_minutes) <= 0)) {
        toast.error(`Entry ${i + 1} (${item.subject}) has reminder enabled but no delay minutes specified.`);
        setSaving(false);
        return;
      }
    }

    try {
      // First, fetch existing entries to clear/replace or update
      // For a fresh wizard save, we send POST /timetable/entries
      const payload = entries.map((e) => ({
        day_of_week: e.day_of_week,
        start_time: e.start_time,
        end_time: e.end_time,
        subject: e.subject,
        class_id: e.class_id,
        reminder_enabled: e.reminder_enabled,
        reminder_delay_minutes: e.reminder_enabled ? Number(e.reminder_delay_minutes) : null,
      }));

      const res = await fetch(`${API_BASE_URL}/timetable/entries`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.message || "Failed to save timetable");
        return;
      }

      toast.success("Timetable saved successfully!");
      navigate("/teacher");
    } catch (err) {
      toast.error("Network error while saving timetable");
    } finally {
      setSaving(false);
    }
  };

  const startFreshWizard = () => {
    setEntries([]);
    setCurrentDayIndex(0);
    setCurrentLectureIndex(1);
    resetForm();
    setSubStep("DAY_ASK");
    setMode("WIZARD");
  };

  if (loadingClasses || fetchingExisting) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center text-text-muted gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
        <p className="text-sm font-medium">Loading timetable wizard...</p>
      </div>
    );
  }

  // ── MODE: SUMMARY PREVIEW (existing timetable found) ─────────────────────────
  if (mode === "SUMMARY_PREVIEW" && subStep !== "REVIEW") {
    return (
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text-primary tracking-tight flex items-center gap-2">
              <Calendar className="w-6 h-6 text-emerald-400" />
              Weekly Timetable
            </h1>
            <p className="text-sm text-text-secondary mt-1">
              Your recurring weekly schedule is set up. You can view, edit, or rerun the conversational setup wizard.
            </p>
          </div>
          <Button
            onClick={startFreshWizard}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium flex items-center gap-2 shadow-lg shadow-emerald-950/40"
          >
            <RotateCcw className="w-4 h-4" />
            Rerun Setup Wizard
          </Button>
        </div>

        {/* Day Grouped Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {DAYS.map((day) => {
            const dayEntries = entries.filter((e) => Number(e.day_of_week) === day.id);
            return (
              <div
                key={day.id}
                className="bg-bg-surface border border-border rounded-xl p-5 shadow-lg flex flex-col justify-between"
                style={{
                  backgroundColor: "var(--bg-surface, #111118)",
                  borderColor: "var(--border, #2A2A3A)",
                }}
              >
                <div className="flex items-center justify-between border-b border-border/60 pb-3 mb-3">
                  <span className="font-semibold text-text-primary text-base flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    {day.name}
                  </span>
                  <span className="text-xs text-text-muted font-mono px-2 py-0.5 rounded bg-bg-base border border-border/80">
                    {dayEntries.length} {dayEntries.length === 1 ? "lecture" : "lectures"}
                  </span>
                </div>

                {dayEntries.length === 0 ? (
                  <p className="text-xs text-text-muted italic py-3">No lectures scheduled</p>
                ) : (
                  <div className="space-y-2">
                    {dayEntries.map((item, idx) => (
                      <div
                        key={idx}
                        className="bg-bg-base/60 border border-border/60 rounded-lg p-3 text-xs flex flex-col gap-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-text-primary text-sm flex items-center gap-1.5">
                            <BookOpen className="w-3.5 h-3.5 text-emerald-400" />
                            {item.subject}
                          </span>
                          <span className="text-emerald-400 font-mono text-[11px] bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                            {item.start_time} - {item.end_time}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-text-secondary text-[11px]">
                          <span className="flex items-center gap-1">
                            <School className="w-3 h-3 text-text-muted" />
                            {item.class_name || "Class #" + item.class_id}
                          </span>
                          {item.reminder_enabled ? (
                            <span className="flex items-center gap-1 text-amber-400">
                              <Bell className="w-3 h-3" />
                              {item.reminder_delay_minutes}m reminder
                            </span>
                          ) : (
                            <span className="text-text-muted">No reminder</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── MODE: CONVERSATIONAL WIZARD ───────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      {/* Header & Progress Indicator */}
      <div className="bg-bg-surface border border-border rounded-xl p-5 shadow-xl" style={{ backgroundColor: "var(--bg-surface, #111118)", borderColor: "var(--border, #2A2A3A)" }}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-emerald-400" />
            <h1 className="text-lg font-semibold text-text-primary">Timetable Setup Wizard</h1>
          </div>
          <span className="text-xs font-mono font-medium px-2.5 py-1 rounded bg-bg-base border border-border text-emerald-400">
            Day {currentDayIndex + 1} of 7 • {currentDay.name}
          </span>
        </div>

        {/* Days Progress Bar */}
        <div className="grid grid-cols-7 gap-1.5 mt-2">
          {DAYS.map((d, i) => (
            <div
              key={d.id}
              className={`h-2 rounded-full transition-all duration-300 ${
                i < currentDayIndex
                  ? "bg-emerald-500"
                  : i === currentDayIndex
                  ? "bg-emerald-400 shadow-sm shadow-emerald-500/50"
                  : "bg-bg-base border border-border/50"
              }`}
              title={d.name}
            />
          ))}
        </div>
      </div>

      {/* Main Question Card Container with CSS fade+slide animation */}
      <div
        key={`${currentDayIndex}-${subStep}-${currentLectureIndex}`}
        className="bg-bg-surface border border-border rounded-2xl p-7 shadow-2xl space-y-6 animate-in fade-in slide-in-from-right-4 duration-300"
        style={{
          backgroundColor: "var(--bg-surface, #111118)",
          borderColor: "var(--border, #2A2A3A)",
          boxShadow: "0 20px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.08)",
        }}
      >
        {/* SUBSTEP 1: DAY ASK */}
        {subStep === "DAY_ASK" && (
          <div className="space-y-6 text-center py-4">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto shadow-inner">
              <Calendar className="w-7 h-7" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-text-primary">
                Do you have any lectures on {currentDay.name}?
              </h2>
              <p className="text-xs text-text-secondary">
                We'll build your timetable day-by-day. Select Yes to add lectures for {currentDay.name}.
              </p>
            </div>
            <div className="flex items-center justify-center gap-4 pt-2">
              <Button
                onClick={() => handleDayAskResponse(false)}
                variant="outline"
                className="w-32 border-border text-text-secondary hover:text-text-primary hover:bg-bg-base cursor-pointer"
              >
                No
              </Button>
              <Button
                onClick={() => handleDayAskResponse(true)}
                className="w-32 bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow-lg shadow-emerald-950/50 cursor-pointer"
              >
                Yes, I do
              </Button>
            </div>
          </div>
        )}

        {/* SUBSTEP 2: LECTURE FORM */}
        {subStep === "LECTURE_FORM" && (
          <div className="space-y-5">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div>
                <span className="text-xs font-mono text-emerald-400 uppercase tracking-wider font-semibold">
                  {currentDay.name} • Lecture #{currentLectureIndex}
                </span>
                <h2 className="text-lg font-bold text-text-primary mt-0.5">Lecture Details</h2>
              </div>
              <span className="text-xs text-text-muted">Step 1 of 3</span>
            </div>

            {stepError && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
                <X className="w-4 h-4 shrink-0" />
                {stepError}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-text-secondary mb-1.5 flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-emerald-400" />
                  Subject Name
                </label>
                <Input
                  type="text"
                  placeholder="e.g. Data Structures & Algorithms"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="bg-bg-base border-border text-text-primary focus:border-emerald-500 text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-text-secondary mb-1.5 flex items-center gap-1.5">
                  <School className="w-3.5 h-3.5 text-emerald-400" />
                  Which Class?
                </label>
                {classes.length === 0 ? (
                  <p className="text-xs text-rose-400">No classes found in the system. Please ask an admin to add classes first.</p>
                ) : (
                  <select
                    value={classId}
                    onChange={(e) => setClassId(e.target.value)}
                    className="w-full h-10 px-3 rounded-md bg-bg-base border border-border text-text-primary text-sm focus:outline-none focus:border-emerald-500"
                  >
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-text-secondary mb-1.5 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-emerald-400" />
                    Start Time
                  </label>
                  <Input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="bg-bg-base border-border text-text-primary text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-text-secondary mb-1.5 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-emerald-400" />
                    End Time
                  </label>
                  <Input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="bg-bg-base border-border text-text-primary text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-border/60">
              <Button
                onClick={handleSaveLectureForm}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium flex items-center gap-2 cursor-pointer shadow-lg shadow-emerald-950/50"
              >
                Next <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {/* SUBSTEP 3: REMINDER ASK */}
        {subStep === "REMINDER_ASK" && (
          <div className="space-y-6 text-center py-4">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto shadow-inner">
              <Bell className="w-7 h-7" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-text-primary">
                Want a reminder email if this lecture hasn't started on time?
              </h2>
              <p className="text-xs text-text-secondary max-w-md mx-auto">
                EduSync will monitor your scheduled timetable and send you an email alert if you forget to start your live broadcast on time.
              </p>
            </div>
            <div className="flex items-center justify-center gap-4 pt-2">
              <Button
                onClick={() => handleReminderAskResponse(false)}
                variant="outline"
                className="w-32 border-border text-text-secondary hover:text-text-primary hover:bg-bg-base cursor-pointer"
              >
                No thanks
              </Button>
              <Button
                onClick={() => handleReminderAskResponse(true)}
                className="w-32 bg-amber-600 hover:bg-amber-500 text-white font-medium shadow-lg shadow-amber-950/50 cursor-pointer"
              >
                Yes, remind me
              </Button>
            </div>
          </div>
        )}

        {/* SUBSTEP 4: REMINDER DELAY INPUT (User Addition 1 Strict Validation) */}
        {subStep === "REMINDER_DELAY" && (
          <div className="space-y-5">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div>
                <span className="text-xs font-mono text-amber-400 uppercase tracking-wider font-semibold">
                  Reminder Delay Setting
                </span>
                <h2 className="text-lg font-bold text-text-primary mt-0.5">
                  How many minutes late should I wait before reminding you?
                </h2>
              </div>
            </div>

            {stepError && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
                <X className="w-4 h-4 shrink-0" />
                {stepError}
              </div>
            )}

            <div className="space-y-3 py-2">
              <label className="text-xs font-medium text-text-secondary flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                Delay Threshold (Minutes)
              </label>
              <Input
                type="number"
                min="1"
                max="60"
                placeholder="e.g. 5, 10, 15"
                value={reminderDelayMinutes}
                onChange={(e) => {
                  setReminderDelayMinutes(e.target.value);
                  setStepError("");
                }}
                className="bg-bg-base border-border text-text-primary text-base font-semibold w-full text-center h-12 focus:border-amber-500"
              />
              <p className="text-[11px] text-text-muted text-center">
                For example, entering 10 means an email will trigger if the broadcast is not started by 10 minutes past {startTime}.
              </p>
            </div>

            <div className="flex justify-end pt-3 border-t border-border/60">
              <Button
                onClick={handleReminderDelayConfirm}
                className="bg-amber-600 hover:bg-amber-500 text-white font-medium flex items-center gap-2 cursor-pointer shadow-lg shadow-amber-950/50"
              >
                Continue <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {/* SUBSTEP 5: ADD ANOTHER LECTURE ASK */}
        {subStep === "ADD_ANOTHER_ASK" && (
          <div className="space-y-6 text-center py-4">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto shadow-inner">
              <Plus className="w-7 h-7" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-text-primary">
                Add another lecture on {currentDay.name}?
              </h2>
              <p className="text-xs text-text-secondary">
                You've configured {currentLectureIndex} {currentLectureIndex === 1 ? "lecture" : "lectures"} for {currentDay.name}.
              </p>
            </div>
            <div className="flex items-center justify-center gap-4 pt-2">
              <Button
                onClick={() => handleAddAnotherResponse(false)}
                variant="outline"
                className="w-36 border-border text-text-secondary hover:text-text-primary hover:bg-bg-base cursor-pointer"
              >
                No, next day
              </Button>
              <Button
                onClick={() => handleAddAnotherResponse(true)}
                className="w-36 bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow-lg shadow-emerald-950/50 cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Plus className="w-4 h-4" /> Add Lecture
              </Button>
            </div>
          </div>
        )}

        {/* SUBSTEP 6: REVIEW SUMMARY BEFORE FINAL POST */}
        {subStep === "REVIEW" && (
          <div className="space-y-6">
            <div className="border-b border-border/60 pb-3 flex items-center justify-between">
              <div>
                <span className="text-xs font-mono text-emerald-400 uppercase tracking-wider font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" /> Final Step
                </span>
                <h2 className="text-xl font-bold text-text-primary mt-0.5">Review Your Timetable</h2>
              </div>
              <span className="text-xs text-text-muted font-mono bg-bg-base border border-border px-2.5 py-1 rounded">
                Total: {entries.length} {entries.length === 1 ? "entry" : "entries"}
              </span>
            </div>

            {entries.length === 0 ? (
              <div className="text-center py-8 text-text-muted space-y-3">
                <p className="text-sm">No lectures were added to your timetable.</p>
                <Button onClick={startFreshWizard} variant="outline" className="text-xs border-border">
                  Start Over
                </Button>
              </div>
            ) : (
              <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
                {DAYS.map((day) => {
                  const dayEntries = entries.filter((e) => Number(e.day_of_week) === day.id);
                  if (dayEntries.length === 0) return null;
                  return (
                    <div key={day.id} className="bg-bg-base/80 border border-border/80 rounded-xl p-4 space-y-2">
                      <div className="text-xs font-bold text-emerald-400 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        {day.name} ({dayEntries.length})
                      </div>
                      <div className="space-y-2">
                        {dayEntries.map((item) => {
                          const masterIndex = entries.findIndex((e) => e === item);
                          return (
                            <div
                              key={masterIndex}
                              className="bg-bg-surface border border-border rounded-lg p-3 text-xs flex items-center justify-between gap-3"
                            >
                              <div className="space-y-1">
                                <div className="font-semibold text-text-primary flex items-center gap-2">
                                  <span>{item.subject}</span>
                                  <span className="text-emerald-400 font-mono text-[11px] bg-emerald-500/10 px-2 py-0.5 rounded">
                                    {item.start_time} - {item.end_time}
                                  </span>
                                </div>
                                <div className="text-text-muted text-[11px] flex items-center gap-3">
                                  <span>Class: {item.class_name || "Class #" + item.class_id}</span>
                                  {item.reminder_enabled ? (
                                    <span className="text-amber-400 flex items-center gap-1">
                                      <Bell className="w-3 h-3" /> {item.reminder_delay_minutes}m late alert
                                    </span>
                                  ) : (
                                    <span>No alert</span>
                                  )}
                                </div>
                              </div>
                              <button
                                onClick={() => removeEntry(masterIndex)}
                                className="text-text-muted hover:text-rose-400 p-1.5 rounded transition-colors cursor-pointer"
                                title="Remove entry"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex items-center justify-between pt-4 border-t border-border/60">
              <Button
                onClick={startFreshWizard}
                variant="outline"
                className="border-border text-text-secondary hover:text-text-primary text-xs"
              >
                Start Over
              </Button>
              <Button
                onClick={handleFinalSave}
                disabled={saving || entries.length === 0}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium flex items-center gap-2 cursor-pointer shadow-lg shadow-emerald-950/50"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Saving...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" /> Confirm & Save Timetable
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
