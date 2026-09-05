import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";

import { cn } from "./utils";

// Styling mirrors frontend-teacher (F2): system-font medium weight, a soft
// spring-less transition, an `active:scale` press, and a single ring-based
// focus style. Variant NAMES are kept identical to F1's so no call site
// changes — only the visual treatment is F2's.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium shrink-0 outline-none " +
    "transition-[transform,background-color,color,border-color,opacity] duration-150 ease-[var(--ease-out-strong)] " +
    "active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base " +
    "[&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0 " +
    "aria-invalid:ring-destructive/20 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-transparent text-destructive border border-destructive/30 hover:bg-destructive/10",
        outline:
          "bg-transparent text-foreground border border-border-hover hover:border-text-primary hover:bg-bg-surface-3",
        secondary: "bg-bg-surface-3 text-foreground hover:bg-bg-surface-3/80",
        ghost: "bg-transparent text-text-secondary hover:bg-bg-surface-3 hover:text-text-primary",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 text-base rounded-[var(--radius-md)] has-[>svg]:px-3.5",
        sm: "h-8 px-3 text-sm gap-1.5 rounded-[var(--radius-sm)] has-[>svg]:px-2.5",
        lg: "h-12 px-6 text-md rounded-[var(--radius-md)] has-[>svg]:px-4",
        icon: "size-9 rounded-[var(--radius-md)]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({ className, variant, size, asChild = false, ...props }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
