import * as React from "react";

import { cn } from "./utils";

// F2's field treatment: 40px tall, hairline-strong border on an elevated
// surface, a two-step focus (border + soft ring) in the active role accent.
const fieldClass =
  "w-full h-10 rounded-[var(--radius-md)] border border-border-hover bg-bg-elevated px-3 text-base text-text-primary " +
  "placeholder:text-text-muted outline-none transition-[color,border-color,box-shadow] duration-150 " +
  "focus:border-accent-500 focus:ring-2 focus:ring-accent-500/15 " +
  "disabled:cursor-not-allowed disabled:opacity-50 " +
  "aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/15";

function Input({ className, type, ...props }) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(fieldClass, "file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground", className)}
      {...props}
    />
  );
}

export { Input, fieldClass };
