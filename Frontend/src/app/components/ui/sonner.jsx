import { Toaster as Sonner } from "sonner";

// theme is passed explicitly by the layout (StudentLayout tracks it in local
// state) — the app doesn't wire up next-themes, so useTheme() here would be
// meaningless. Colors are driven entirely by the CSS vars below, which read
// from the same tokens as the rest of the app (theme.css) and therefore
// already adapt to light/dark on their own; `theme` only nudges Sonner's own
// default chrome (default icons, close button) to match.
function Toaster({ theme = "dark", ...props }) {
  return (
    <Sonner
      theme={theme}
      className="toaster group"
      style={{
        "--normal-bg": "var(--bg-elevated)",
        "--normal-text": "var(--text-primary)",
        "--normal-border": "var(--border)",
        "--success-bg": "var(--bg-elevated)",
        "--success-text": "var(--accent-success)",
        "--success-border": "color-mix(in srgb, var(--accent-success) 30%, var(--border))",
        "--error-bg": "var(--bg-elevated)",
        "--error-text": "var(--accent-critical)",
        "--error-border": "color-mix(in srgb, var(--accent-critical) 30%, var(--border))",
        "--warning-bg": "var(--bg-elevated)",
        "--warning-text": "var(--accent-warning)",
        "--warning-border": "color-mix(in srgb, var(--accent-warning) 30%, var(--border))",
        "--info-bg": "var(--bg-elevated)",
        "--info-text": "var(--accent-info)",
        "--info-border": "color-mix(in srgb, var(--accent-info) 30%, var(--border))",
        "--border-radius": "var(--radius-md)",
        "--font-sans": "var(--font-sans)",
        "--font-mono": "var(--font-mono)",
      }}
      toastOptions={{
        classNames: {
          toast: "font-sans shadow-none",
          actionButton: "!bg-accent-info !text-white",
          cancelButton: "!bg-bg-surface-3 !text-text-secondary",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
