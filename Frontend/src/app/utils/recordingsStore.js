// Client-side metadata index for teacher session recordings.
//
// This feature is intentionally backend-less — PRODUCT.md scopes session
// recording as teacher-side only, local capture via MediaRecorder, no
// server, no database, no upload. This store is just a local index of what
// has already been saved to disk (filename, when, how long, how it was
// saved), never a copy of the video data itself.
const STORAGE_KEY = "edusync_recordings";

export function getRecordings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];
    return [...list].sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
  } catch {
    return [];
  }
}

function persist(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (err) {
    console.error("[recordingsStore] Failed to persist recordings list:", err);
  }
}

/**
 * entry: {
 *   id: string,
 *   filename: string,
 *   startedAt: ISO string,
 *   durationSeconds: number,
 *   sizeBytes: number | null,
 *   lectureName: string | null,
 *   subject: string | null,
 *   // How/where it was saved — determines what the Recordings page can
 *   // offer as a "find it" action:
 *   kind: "electron" | "fsa" | "download",
 *   filePath: string | null,   // only set for kind === "electron" (real path)
 * }
 */
export function addRecording(entry) {
  const list = getRecordings();
  list.unshift(entry);
  persist(list);
  return entry;
}

export function deleteRecording(id) {
  persist(getRecordings().filter((r) => r.id !== id));
}
