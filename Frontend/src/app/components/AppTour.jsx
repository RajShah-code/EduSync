import { API_BASE_URL } from "../config/api.js";
import React from "react";
import Joyride, { STATUS, ACTIONS } from "react-joyride";

/**
 * Custom Tooltip component styled to match Obsidian Command dark theme
 */
function CustomTooltip({
  continuous,
  index,
  step,
  backProps,
  closeProps,
  primaryProps,
  skipProps,
  tooltipProps,
  size,
  isLastStep,
}) {
  return (
    <div
      {...tooltipProps}
      className="bg-bg-elevated border border-border rounded-[var(--radius-lg)] shadow-[var(--shadow-modal)] p-5 max-w-sm w-full font-sans text-text-primary animate-in fade-in zoom-in duration-150 z-[10000]"
    >
      {/* Step Title */}
      {step.title && (
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <h3 className="font-display text-base font-semibold text-text-primary tracking-tight">
            {step.title}
          </h3>
          <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded-[var(--radius-sm)] bg-bg-base border border-border text-text-muted">
            {index + 1} / {size}
          </span>
        </div>
      )}

      {/* Step Description */}
      <div className="text-xs text-text-secondary leading-relaxed mb-5">
        {step.content}
      </div>

      {/* Footer / Controls */}
      <div className="flex items-center justify-between border-t border-border pt-3 mt-1">
        {/* Skip Link */}
        <button
          {...skipProps}
          className="text-xs text-text-muted hover:text-text-secondary transition-colors underline cursor-pointer"
        >
          Skip tour
        </button>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {index > 0 && (
            <button
              {...backProps}
              className="px-3 py-1.5 rounded-[var(--radius-sm)] text-xs font-medium text-text-secondary hover:text-text-primary bg-bg-base hover:bg-bg-surface-3 border border-border transition-all cursor-pointer"
            >
              Back
            </button>
          )}

          <button
            {...primaryProps}
            className="px-4 py-1.5 rounded-[var(--radius-sm)] text-xs font-semibold bg-accent-info text-white hover:bg-accent-info/90 transition-all cursor-pointer"
          >
            {isLastStep ? "Finish" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AppTour({ steps, run, onFinish, isManualReplay = false, stepIndex, callback }) {
  const handleJoyrideCallback = async (data) => {
    const { status, action } = data;

    if (callback) {
      callback(data);
    }

    if (status === STATUS.FINISHED || status === STATUS.SKIPPED || action === ACTIONS.CLOSE) {
      if (!isManualReplay) {
        try {
          const token = localStorage.getItem("edusync_token");
          if (token) {
            const res = await fetch(`${API_BASE_URL}/users/me/tour-complete`, {
              method: "PUT",
              headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
              const data = await res.json();
              const existing = JSON.parse(localStorage.getItem("edusync_user") || "{}");
              const updated = { ...existing, has_seen_tour: true };
              localStorage.setItem("edusync_user", JSON.stringify(updated));
              window.dispatchEvent(new Event("edusync:user-updated"));
            }
          }
        } catch (err) {
          console.error("[AppTour] Failed to sync tour complete flag:", err);
        }
      }

      if (onFinish) {
        onFinish();
      }
    }
  };

  if (!steps || steps.length === 0) return null;

  // Ensure disableBeacon is true for every step and build complete step list with welcome moment
  const welcomeStep = {
    target: "body",
    placement: "center",
    title: "Welcome to EduSync",
    content: "Take a quick guided walkthrough to discover your workspace features and lab tools.",
    disableBeacon: true,
  };

  const processedSteps = [
    welcomeStep,
    ...steps.map((s) => ({
      ...s,
      disableBeacon: true,
    })),
  ];

  const joyrideProps = {
    steps: processedSteps,
    run,
    continuous: true,
    showSkipButton: true,
    disableOverlayClose: true,
    disableScrolling: false,
    disableScrollParentFix: true,
    spotlightClicks: true,
    tooltipComponent: CustomTooltip,
    callback: handleJoyrideCallback,
    styles: {
      options: {
        zIndex: 10000,
        primaryColor: "var(--accent-info)",
        backgroundColor: "var(--bg-elevated)",
        textColor: "var(--text-primary)",
        overlayColor: "color-mix(in srgb, var(--bg-base) 80%, transparent)",
        // Hairline ring instead of a blurred glow — matches the no-glow direction.
        spotlightShadow: "0 0 0 9999px color-mix(in srgb, var(--bg-base) 80%, transparent), 0 0 0 2px var(--accent-info)",
      },
      spotlight: {
        borderRadius: 8,
      },
    },
    floaterProps: {
      disableAnimation: false,
    },
  };

  if (typeof stepIndex === "number") {
    joyrideProps.stepIndex = stepIndex;
  }

  return <Joyride {...joyrideProps} />;
}
