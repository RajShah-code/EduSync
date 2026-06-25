import { useEffect, useState } from "react";
import { cn } from "../components/ui/utils";

export function Timer({ seconds, onExpire, size = "md", className }) {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    setRemaining(seconds);
  }, [seconds]);

  useEffect(() => {
    if (remaining <= 0) {
      onExpire?.();
      return;
    }

    const interval = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          onExpire?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [remaining, onExpire]);

  const formatTime = (secs) => {
    const hours = Math.floor(secs / 3600);
    const minutes = Math.floor((secs % 3600) / 60);
    const seconds = secs % 60;

    if (hours > 0) {
      return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    }
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  };

  const getColorClass = () => {
    if (remaining <= 0) return "text-accent-locked";
    if (remaining < 300) return "text-accent-critical"; // < 5 min
    if (remaining < 600) return "text-accent-warning"; // < 10 min
    return "text-text-primary";
  };

  const sizeClasses = {
    sm: "text-base",
    md: "text-lg",
    lg: "text-xl",
    xl: "text-2xl",
  };

  const isCritical = remaining < 300 && remaining > 0;

  return (
    <span
      className={cn(
        "font-mono font-medium tabular-nums",
        sizeClasses[size],
        getColorClass(),
        isCritical && "glow-critical",
        className
      )}
    >
      {formatTime(remaining)}
    </span>
  );
}

// Utility component for displaying elapsed time (counting up)
export function ElapsedTimer({ startTime, size = "md", className }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const updateElapsed = () => {
      const now = new Date();
      const start = startTime instanceof Date ? startTime : new Date(startTime);
      const startTimeMs = isNaN(start.getTime()) ? now.getTime() : start.getTime();
      const diff = Math.floor((now.getTime() - startTimeMs) / 1000);
      setElapsed(diff);
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);

    return () => clearInterval(interval);
  }, [startTime]);

  const formatTime = (secs) => {
    const hours = Math.floor(secs / 3600);
    const minutes = Math.floor((secs % 3600) / 60);
    const seconds = secs % 60;

    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  };

  const sizeClasses = {
    sm: "text-base",
    md: "text-lg",
    lg: "text-xl",
    xl: "text-2xl",
  };

  return (
    <span
      className={cn(
        "font-mono font-medium tabular-nums text-text-primary",
        sizeClasses[size],
        className
      )}
    >
      {formatTime(elapsed)}
    </span>
  );
}
