// Per-page tour tracking, kept client-side in localStorage — separate from the
// single global `has_seen_tour` flag on the user record (that one only covers
// the sidebar orientation tour shown on first dashboard visit).
const STORAGE_KEY = "edusync_page_tours_seen";

function readSeen() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

export function hasSeenPageTour(pageKey) {
  return Boolean(readSeen()[pageKey]);
}

export function markPageTourSeen(pageKey) {
  const seen = readSeen();
  seen[pageKey] = true;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(seen));
}
