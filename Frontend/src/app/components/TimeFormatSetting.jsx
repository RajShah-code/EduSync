import { toast } from "sonner";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "./ui/card";
import { IconClock as Clock } from "@tabler/icons-react";
import {
  useTimeFormat,
  TIME_FORMAT_24H,
  TIME_FORMAT_12H,
} from "../utils/timeFormat";

// Per-device toggle between 24-hour (default) and 12-hour AM/PM time. Drops
// into any role's Settings page. The choice is stored in localStorage and
// applies to every time display across the app immediately — no reload.
const OPTIONS = [
  { value: TIME_FORMAT_24H, label: "24-hour", sample: "14:30" },
  { value: TIME_FORMAT_12H, label: "12-hour", sample: "2:30 PM" },
];

export function TimeFormatSetting() {
  const { timeFormat, setTimeFormat, formatTimeOfDay } = useTimeFormat();

  const handleSelect = (value) => {
    if (value === timeFormat) return;
    setTimeFormat(value);
    toast.success(
      value === TIME_FORMAT_12H
        ? "Time now shows as 12-hour (AM/PM)"
        : "Time now shows as 24-hour"
    );
  };

  return (
    <Card className="bg-bg-surface border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base font-semibold text-text-primary">
          <Clock className="h-[18px] w-[18px] text-accent-500" strokeWidth={1.75} />
          Time format
        </CardTitle>
        <CardDescription className="text-xs text-text-secondary">
          How times appear throughout EduSync. Saved on this device.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div
          role="radiogroup"
          aria-label="Time format"
          className="inline-flex items-center gap-1 rounded-[var(--radius-lg)] border border-border p-1"
        >
          {OPTIONS.map((opt) => {
            const active = timeFormat === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => handleSelect(opt.value)}
                className={`flex flex-col items-start gap-0.5 rounded-[var(--radius-md)] px-3.5 py-2 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface ${
                  active
                    ? "bg-accent-700 text-white"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                <span className="text-xs font-semibold">{opt.label}</span>
                <span
                  className={`text-[11px] tnum ${
                    active ? "text-white/70" : "text-text-muted"
                  }`}
                >
                  {opt.sample}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-text-muted">
          Right now:{" "}
          <span className="tnum text-text-secondary">
            {formatTimeOfDay(new Date(), { seconds: true })}
          </span>
        </p>
      </CardContent>
    </Card>
  );
}
