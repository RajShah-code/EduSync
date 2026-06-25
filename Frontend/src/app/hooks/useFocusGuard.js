import { useState, useEffect, useRef, useCallback } from "react";
import { getSocket } from "../store/socket";

/**
 * useFocusGuard — Session Lockdown Hook
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ISOLATION CONTRACT (read before modifying):
 *
 * This hook is the ONLY place in the codebase that touches:
 *   • document.requestFullscreen / document.exitFullscreen
 *   • fullscreenchange event
 *   • visibilitychange event
 *
 * LiveSession.jsx consumes the public interface below and never calls browser
 * fullscreen/visibility APIs directly. This isolation exists so that when
 * EduSync is wrapped as an Electron desktop app, THIS FILE is swapped for a
 * native implementation (kiosk mode, global shortcut blocking, OS-level focus
 * detection) without touching LiveSession.jsx, the Socket.io events, or the
 * teacher-side notification UI.
 *
 * Do NOT move fullscreen/visibility logic into LiveSession.jsx or any other
 * component, even for "just a quick fix". Keep it here.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Public interface:
 * {
 *   containerRef,      — React ref: attach to the lockdown container <div>
 *   isFullscreen,      — boolean: browser is currently in fullscreen
 *   hasFocus,          — boolean: page is visible AND in fullscreen
 *   focusLossCount,    — number: total focus-loss events this session
 *   needsGesture,      — boolean: fullscreen was blocked (needs a user click to retry)
 *   requestFullscreen, — () => void: call to enter fullscreen on containerRef
 * }
 *
 * Props:
 *   sessionId  — string | null: current session id (used for socket events)
 *   studentId  — string | null: current student id (used for socket events)
 *   enabled    — boolean: hook is a no-op when false (student not in active session)
 */
export function useFocusGuard({ sessionId, studentId, enabled }) {
  const containerRef = useRef(null);

  // isFullscreen: true when document.fullscreenElement is our container
  const [isFullscreen, setIsFullscreen] = useState(false);

  // isVisible: true when the tab is not hidden (visibilityState === 'visible')
  const [isVisible, setIsVisible] = useState(true);

  // hasFocus: true only when BOTH conditions are met.
  // This is what LiveSession.jsx checks to show/hide the focus-loss overlay.
  const [hasFocus, setHasFocus] = useState(true);

  // focusLossCount: increments every time focus is lost. Exposed so teacher-side
  // socket listeners can display "left view Nx" per student.
  const [focusLossCount, setFocusLossCount] = useState(0);

  // needsGesture: true when requestFullscreen() failed because the browser blocked
  // it (requires a direct user gesture). Triggers the "click anywhere to enter
  // fullscreen" overlay in LiveSession.jsx.
  const [needsGesture, setNeedsGesture] = useState(false);

  // Internal ref to track whether the previous state was focused. Used to
  // distinguish a genuine focus-loss from the initial mount.
  const prevHadFocusRef = useRef(true);


  // hasEnteredFullscreenOnce: guards against counting the initial "not yet fullscreen"
  // state as a focus-loss event. Starts false; flipped to true the FIRST time
  // isFullscreen becomes true (i.e., requestFullscreen() succeeded). Only after
  // this flag is true will focus-loss events be emitted / counted.
  const hasEnteredFullscreenOnce = useRef(false);

  // Stable ref for current sessionId/studentId so event handlers registered once
  // always have the latest values without needing to re-register.
  const sessionIdRef = useRef(sessionId);
  const studentIdRef = useRef(studentId);
  sessionIdRef.current = sessionId;
  studentIdRef.current = studentId;

  // ── requestFullscreen ──────────────────────────────────────────────────────
  // Called by LiveSession.jsx on join and on the "click to re-enter" button.
  // Uses containerRef so the entire LiveSession container goes fullscreen,
  // not just an inner element.
  const requestFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    el.requestFullscreen({ navigationUI: "hide" }).then(() => {
      setNeedsGesture(false);
    }).catch((err) => {
      // The most common reason for failure is that requestFullscreen was called
      // outside of a user-gesture handler. Set needsGesture so the overlay shows.
      if (err.name === "NotAllowedError" || err.name === "TypeError") {
        setNeedsGesture(true);
      }
      // Other errors (e.g. fullscreen not supported) are silently ignored.
      // The session still works — fullscreen is best-effort in the browser.
      console.warn("[useFocusGuard] requestFullscreen failed:", err.message);
    });
  }, []);

  // ── Emit socket events ─────────────────────────────────────────────────────
  const emitFocusLost = useCallback(() => {
    const socket = getSocket();
    if (!socket || !sessionIdRef.current || !studentIdRef.current) return;
    socket.emit("student:focus_lost", {
      session_id: sessionIdRef.current,
      student_id: studentIdRef.current,
      timestamp: Date.now(),
    });
  }, []);

  const emitFocusRegained = useCallback(() => {
    const socket = getSocket();
    if (!socket || !sessionIdRef.current || !studentIdRef.current) return;
    socket.emit("student:focus_regained", {
      session_id: sessionIdRef.current,
      student_id: studentIdRef.current,
      timestamp: Date.now(),
    });
  }, []);

  // ── Derived hasFocus ───────────────────────────────────────────────────────
  // Recompute whenever isFullscreen or isVisible changes.
  // Emit socket events and update focusLossCount on transitions.
  useEffect(() => {
    if (!enabled) return;
    const currentlyFocused = isFullscreen && isVisible;
    setHasFocus(currentlyFocused);

    // Mark that fullscreen has been entered at least once, so subsequent
    // exits are treated as genuine focus-loss events, not the initial state.
    if (isFullscreen && !hasEnteredFullscreenOnce.current) {
      hasEnteredFullscreenOnce.current = true;
    }

    if (!currentlyFocused && prevHadFocusRef.current) {
      // Focus just LOST — only count/emit after fullscreen was entered at least once.
      // This prevents the initial "not-yet-fullscreen" state (before requestFullscreen
      // resolves) from being misread as a focus-loss transition.
      if (hasEnteredFullscreenOnce.current) {
        setFocusLossCount((n) => n + 1);
        emitFocusLost();
      }
    } else if (currentlyFocused && !prevHadFocusRef.current) {
      // Focus just REGAINED
      emitFocusRegained();
    }
    prevHadFocusRef.current = currentlyFocused;

  }, [isFullscreen, isVisible, enabled, emitFocusLost, emitFocusRegained]);

  // ── Browser event listeners ────────────────────────────────────────────────
  // Registered once when enabled=true, removed when enabled=false or unmount.
  // These are the ONLY browser APIs related to focus/fullscreen in this file.
  useEffect(() => {
    if (!enabled) {
      // Ensure we reset state cleanly when session ends
      setIsFullscreen(false);
      setIsVisible(true);
      setHasFocus(true);
      setNeedsGesture(false);
      prevHadFocusRef.current = true;
      return;
    }

    const onFullscreenChange = () => {
      // document.fullscreenElement is null when exiting fullscreen
      setIsFullscreen(document.fullscreenElement !== null);
    };

    const onVisibilityChange = () => {
      setIsVisible(document.visibilityState === "visible");
    };

    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("visibilitychange", onVisibilityChange);

    // Sync initial state in case the hook mounts after fullscreen is already active
    setIsFullscreen(document.fullscreenElement !== null);
    setIsVisible(document.visibilityState === "visible");

    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [enabled]);

  // ── Reset on session change ────────────────────────────────────────────────
  // If the student joins a different session (edge case), reset the loss counter
  // and the fullscreen-entered flag so a fresh session starts clean.
  useEffect(() => {
    if (enabled) {
      setFocusLossCount(0);
      prevHadFocusRef.current = true;
      hasEnteredFullscreenOnce.current = false;
    }
  }, [sessionId, enabled]);

  return {
    containerRef,
    isFullscreen,
    hasFocus,
    focusLossCount,
    needsGesture,
    requestFullscreen,
  };
}
