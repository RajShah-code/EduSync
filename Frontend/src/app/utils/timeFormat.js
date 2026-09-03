import { useSyncExternalStore } from "react";

// ── App-wide time-of-day format preference ──────────────────────────────────
//
// EduSync shows 24-hour time ("14:30") everywhere by default. A single
// per-device toggle in Settings switches every time display to 12-hour with
// an AM/PM suffix ("2:30 PM"). The choice is client-only (localStorage) — it
// never touches the backend or syncs across devices.
//
// Usage:
//   const { formatTimeOfDay, formatClockString } = useTimeFormat();
//   formatTimeOfDay(session.started_at)      // Date | ISO | epoch  → "14:30"
//   formatClockString(entry.start_time)      // "14:30:00" DB time  → "14:30"
//
// Outside React (module-scope helpers), call the bare functions — they read
// the current preference on each call.

const STORAGE_KEY = "edusync_time_format";
const CHANGE_EVENT = "edusync:timeformat-changed";

export const TIME_FORMAT_24H = "24h";
export const TIME_FORMAT_12H = "12h";

export function getTimeFormat() {
  try {
    return localStorage.getItem(STORAGE_KEY) === TIME_FORMAT_12H
      ? TIME_FORMAT_12H
      : TIME_FORMAT_24H;
  } catch {
    return TIME_FORMAT_24H;
  }
}

export function setTimeFormat(value) {
  const next = value === TIME_FORMAT_12H ? TIME_FORMAT_12H : TIME_FORMAT_24H;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* private mode / storage disabled — the in-memory event still fires */
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: next }));
  return next;
}

export function isHour12(fmt = getTimeFormat()) {
  return fmt === TIME_FORMAT_12H;
}

function toDate(value) {
  if (value instanceof Date) return value;
  if (value === null || value === undefined || value === "") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Format a Date / ISO string / epoch as a time of day.
 * @param {Date|string|number} value
 * @param {{ seconds?: boolean, fmt?: string }} [opts]
 */
export function formatTimeOfDay(value, opts = {}) {
  const d = toDate(value);
  if (!d) return "";
  return d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    ...(opts.seconds ? { second: "2-digit" } : {}),
    hour12: isHour12(opts.fmt),
  });
}

/**
 * Format a bare "HH:MM" / "HH:MM:SS" clock string (e.g. a DB `time` column)
 * for display. Returns the input unchanged if it isn't a clock string.
 * @param {string} timeStr
 * @param {{ fmt?: string }} [opts]
 */
export function formatClockString(timeStr, opts = {}) {
  if (typeof timeStr !== "string") return timeStr ?? "";
  const [h, m] = timeStr.split(":");
  const hh = Number(h);
  const mm = Number(m);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return timeStr;
  const mmStr = String(mm).padStart(2, "0");
  if (!isHour12(opts.fmt)) return `${String(hh).padStart(2, "0")}:${mmStr}`;
  const period = hh >= 12 ? "PM" : "AM";
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${mmStr} ${period}`;
}

/**
 * Date + time stamp. The date part stays locale-default; only the time part
 * follows the 12/24-hour preference.
 * @param {Date|string|number} value
 * @param {{ seconds?: boolean, dateStyle?: object, fmt?: string }} [opts]
 */
export function formatDateTime(value, opts = {}) {
  const d = toDate(value);
  if (!d) return "";
  const datePart = d.toLocaleDateString(
    [],
    opts.dateStyle || { year: "numeric", month: "short", day: "numeric" }
  );
  return `${datePart}, ${formatTimeOfDay(d, opts)}`;
}

// ── React binding ──────────────────────────────────────────────────────────

function subscribe(callback) {
  window.addEventListener(CHANGE_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

/**
 * Subscribe a component to the time-format preference. Re-renders on change
 * (including changes made in another tab). Returns preference-bound
 * formatters so call sites don't thread `fmt` through by hand.
 */
export function useTimeFormat() {
  const timeFormat = useSyncExternalStore(
    subscribe,
    getTimeFormat,
    () => TIME_FORMAT_24H
  );
  return {
    timeFormat,
    isHour12: timeFormat === TIME_FORMAT_12H,
    setTimeFormat,
    formatTimeOfDay: (value, opts) =>
      formatTimeOfDay(value, { ...opts, fmt: timeFormat }),
    formatClockString: (value, opts) =>
      formatClockString(value, { ...opts, fmt: timeFormat }),
    formatDateTime: (value, opts) =>
      formatDateTime(value, { ...opts, fmt: timeFormat }),
  };
}
