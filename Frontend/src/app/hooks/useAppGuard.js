import { useState, useEffect, useRef } from "react";
import { getSocket } from "../store/socket";
import { API_BASE_URL } from "../config/api.js";

/**
 * useAppGuard — Per-Class OS-Level App Allow-List (Broadcast Sessions)
 *
 * A sibling to useFocusGuard.js, not a modification of it — kept separate
 * for the same isolation reason useFocusGuard.js documents: this hook owns
 * a completely different concern (OS process enforcement vs. browser
 * fullscreen/visibility) and needs to stay independently swappable.
 *
 * Real enforcement only exists in the Electron build (window.electronAPI —
 * see Frontend/electron/main.cjs's app-guard IPC handlers). A browser has
 * no API to see or close other OS processes at all — on plain web this
 * hook only fetches and exposes the allow-list for display, it never
 * attempts enforcement.
 *
 * Public interface: { allowList } — the class's configured entries
 * ({ id, process_name, display_name }[]), for the "allowed apps" banner.
 *
 * Props:
 *   sessionId — string | null: current session id (for the violation socket event)
 *   studentId — string | null: current student id (for the violation socket event)
 *   classId   — string | number | null: the student's class, used to fetch the allow-list
 *   enabled   — boolean: no-op when false (student not in an active broadcast)
 */
export function useAppGuard({ sessionId, studentId, classId, enabled }) {
  const [allowList, setAllowList] = useState([]);
  const unsubscribeRef = useRef(null);
  const sessionIdRef = useRef(sessionId);
  const studentIdRef = useRef(studentId);
  sessionIdRef.current = sessionId;
  studentIdRef.current = studentId;

  useEffect(() => {
    if (!enabled || !classId) {
      setAllowList([]);
      return;
    }

    let cancelled = false;

    async function loadAndStart() {
      try {
        const token = localStorage.getItem("edusync_token");
        const res = await fetch(`${API_BASE_URL}/app-allowlist/class/${classId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (cancelled) return;

        const entries = data.entries || [];
        setAllowList(entries);

        if (window.electronAPI?.isElectron) {
          await window.electronAPI.startAppGuard(entries.map((e) => e.process_name));
          unsubscribeRef.current = window.electronAPI.onAppViolation((payload) => {
            const socket = getSocket();
            if (!socket || !sessionIdRef.current || !studentIdRef.current) return;
            socket.emit("student:app_violation", {
              session_id: sessionIdRef.current,
              student_id: studentIdRef.current,
              process_name: payload.processName,
              timestamp: payload.timestamp,
            });
          });
        }
      } catch (err) {
        console.warn("[useAppGuard] Failed to load class allow-list:", err.message);
      }
    }

    loadAndStart();

    return () => {
      cancelled = true;
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      if (window.electronAPI?.isElectron) {
        window.electronAPI.stopAppGuard();
      }
    };
  }, [enabled, classId]);

  return { allowList };
}
