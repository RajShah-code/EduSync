import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router";

export function SessionResume() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const currentPath = location.pathname;

    // Session-resume only applies when landing on / or /login
    if (currentPath !== "/" && currentPath !== "/login") {
      return;
    }

    const token = localStorage.getItem("edusync_token");
    const userStr = localStorage.getItem("edusync_user");

    if (!token || !userStr) {
      return;
    }

    try {
      const user = JSON.parse(userStr);
      const role = user?.role;

      if (role === "admin") {
        console.log("[SessionResume] Active admin session detected. Resuming to /admin...");
        navigate("/admin");
      } else if (role === "teacher") {
        console.log("[SessionResume] Active teacher session detected. Resuming to /teacher...");
        navigate("/teacher");
      } else if (role === "student") {
        console.log("[SessionResume] Active student session detected. Resuming to /student...");
        navigate("/student");
      }
    } catch (err) {
      console.warn("[SessionResume] Failed to parse edusync_user from localStorage:", err);
    }
  }, [location.pathname, navigate]);

  return null;
}
