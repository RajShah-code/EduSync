import { useEffect } from "react";
import { useNavigate } from "react-router";
import { API_BASE_URL, WINDOWS_CLIENT_KEY } from "../config/api.js";
import { initSocket } from "../store/socket.js";

export function WindowsAutoLogin() {
  const navigate = useNavigate();

  useEffect(() => {
    // Check if running in Electron environment with IPC exposed
    if (typeof window === "undefined" || !window.electronAPI?.getWindowsUsername) {
      return;
    }

    // Do not attempt if user is already logged in
    const existingToken = localStorage.getItem("edusync_token");
    if (existingToken) return;

    // Do not re-attempt if auto-login already ran during this app session (e.g. after manual logout)
    if (sessionStorage.getItem("edusync_windows_autologin_attempted") === "true") {
      console.log("[WindowsAutoLogin] Auto-login already attempted this session, skipping.");
      return;
    }

    let isMounted = true;

    async function attemptWindowsLogin() {
      try {
        sessionStorage.setItem("edusync_windows_autologin_attempted", "true");

        const username = await window.electronAPI.getWindowsUsername();
        if (!username || !isMounted) {
          console.log("[WindowsAutoLogin] No Windows username returned from main process");
          return;
        }

        const clientKey = WINDOWS_CLIENT_KEY || import.meta.env.VITE_WINDOWS_CLIENT_KEY;
        if (!clientKey) {
          console.warn("[WindowsAutoLogin] VITE_WINDOWS_CLIENT_KEY is missing");
          return;
        }

        console.log(`[WindowsAutoLogin] Captured username "${username}". Sending POST /auth/windows-login...`);

        const res = await fetch(`${API_BASE_URL}/auth/windows-login`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Edusync-Client-Key": clientKey,
          },
          body: JSON.stringify({ windows_username: username }),
        });

        const data = await res.json();
        console.log(`[WindowsAutoLogin] Backend response (${res.status}):`, data);

        if (!res.ok) {
          console.log("[WindowsAutoLogin] Auto-login failed silently:", data.message);
          return; // Silent fallback to normal login
        }

        // Store credentials exactly like normal login
        localStorage.setItem("edusync_token", data.token);
        localStorage.setItem("edusync_user", JSON.stringify(data.user));

        // Initialize socket connection
        initSocket(data.token);

        // Route user depending on role (admin / teacher / student)
        const role = data.user?.role;
        if (role === "admin") {
          console.log("[WindowsAutoLogin] Auto-login successful as admin. Redirecting to /admin...");
          navigate("/admin");
        } else if (role === "teacher") {
          console.log("[WindowsAutoLogin] Auto-login successful as teacher. Redirecting to /teacher...");
          navigate("/teacher");
        } else if (role === "student") {
          console.log("[WindowsAutoLogin] Auto-login successful as student. Redirecting to /student...");
          navigate("/student");
        } else {
          console.log("[WindowsAutoLogin] Unexpected or invalid user role received, falling back to login:", role);
          return;
        }
      } catch (err) {
        console.log("[WindowsAutoLogin] Silent fallback due to error:", err.message);
      }
    }

    attemptWindowsLogin();

    return () => {
      isMounted = false;
    };
  }, [navigate]);

  return null;
}
