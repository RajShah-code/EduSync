import { useState, useEffect } from "react";
import { Sun, Moon } from "lucide-react";

const STORAGE_KEY = "edusync_theme";

/**
 * Theme toggle button — switches between light and dark mode.
 *
 * Reads `localStorage("edusync_theme")`, defaults to "dark" if unset.
 * Toggles the `.dark` class on `<html>` and persists the choice.
 *
 * Known limitation: useEffect runs after first paint, so there may be a
 * brief flash-of-wrong-theme on hard reload if the stored theme differs
 * from the server-rendered default. This is acceptable for a first pass.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState(() => {
    // Read from localStorage synchronously during state init to minimise flash
    if (typeof window !== "undefined") {
      return localStorage.getItem(STORAGE_KEY) || "dark";
    }
    return "dark";
  });

  // Apply the theme class on mount and whenever theme changes
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const toggle = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  const isDark = theme === "dark";

  return (
    <button
      onClick={toggle}
      className="p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-base transition-std"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? (
        <Sun className="w-4 h-4" />
      ) : (
        <Moon className="w-4 h-4" />
      )}
    </button>
  );
}
