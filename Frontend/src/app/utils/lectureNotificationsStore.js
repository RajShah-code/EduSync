// Client-side, per-lecture notification feed backing the Notification
// Center in TeacherLayout.jsx.
//
// sessionStorage, not localStorage — this feed is scoped to the tab and to
// the active lecture on purpose: it should survive a mid-lecture refresh
// (same as sessionInfo rehydration in TeacherLayout does) but must never
// bleed into a future lecture or a different tab. Keyed per session_id so
// stale entries from a previous lecture in the same tab can never surface
// under a new one. See recordingsStore.js for the sibling pattern this
// mirrors (get/persist shape) — that one is intentionally localStorage
// because recordings outlive the tab; notifications intentionally do not.
const STORAGE_PREFIX = "edusync_lecture_notifications_";

function storageKey(sessionId) {
  return `${STORAGE_PREFIX}${sessionId}`;
}

export function getNotifications(sessionId) {
  if (!sessionId) return [];
  try {
    const raw = sessionStorage.getItem(storageKey(sessionId));
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function persist(sessionId, list) {
  try {
    sessionStorage.setItem(storageKey(sessionId), JSON.stringify(list));
  } catch (err) {
    console.error("[lectureNotificationsStore] Failed to persist notifications:", err);
  }
}

/**
 * entry: {
 *   id: string,
 *   category: 'lecture' | 'task' | 'monitor',
 *   message: string,
 *   timestamp: number | string,
 *   read: boolean,
 *   actionable: boolean,
 *   meta: object,
 * }
 */
export function addNotification(sessionId, entry) {
  if (!sessionId) return entry;
  const list = getNotifications(sessionId);
  list.unshift(entry);
  persist(sessionId, list);
  return entry;
}

export function removeNotification(sessionId, id) {
  if (!sessionId) return;
  persist(sessionId, getNotifications(sessionId).filter((n) => n.id !== id));
}

export function clearNotifications(sessionId) {
  if (!sessionId) return;
  try {
    sessionStorage.removeItem(storageKey(sessionId));
  } catch (err) {
    console.error("[lectureNotificationsStore] Failed to clear notifications:", err);
  }
}
