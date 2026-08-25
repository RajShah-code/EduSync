import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/**
 * Parses classroom display names of various formats:
 * - "FYBCA(Math)" -> { title: "FYBCA", detail: "Math", raw: "FYBCA(Math)" }
 * - "DSA(Mr. Shah)" -> { title: "DSA", detail: "Mr. Shah", raw: "DSA(Mr. Shah)" }
 * - "FYBCA" -> { title: "FYBCA", detail: null, raw: "FYBCA" }
 * - "Data Structures" -> { title: "Data Structures", detail: null, raw: "Data Structures" }
 */
export function parseClassroomDisplayName(displayName = "") {
  if (!displayName || typeof displayName !== "string") {
    return { title: "Untitled Class", detail: null, raw: "" };
  }

  const trimmed = displayName.trim();
  const match = trimmed.match(/^([^()]+)\s*\(([^()]+)\)$/);

  if (match) {
    return {
      title: match[1].trim(),
      detail: match[2].trim(),
      raw: trimmed,
    };
  }

  return {
    title: trimmed,
    detail: null,
    raw: trimmed,
  };
}

/**
 * Gets a clean 2-letter uppercase monogram from a class/subject string.
 */
export function getClassMonogram(title = "") {
  if (!title) return "CL";
  const words = title.trim().split(/\s+/);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return title.slice(0, 2).toUpperCase();
}
