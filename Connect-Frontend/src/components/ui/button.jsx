import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-md)] text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 btn-press cursor-pointer",
  {
    variants: {
      variant: {
        default:
          "bg-accent-700 hover:bg-accent-700/90 text-white shadow-none",
        accent:
          "bg-accent-500 hover:bg-accent-500/90 text-white shadow-none",
        destructive:
          "bg-accent-critical hover:bg-accent-critical/90 text-white shadow-none",
        outline:
          "border border-border bg-bg-surface hover:bg-bg-surface-3 hover:text-text-primary text-text-secondary",
        secondary:
          "bg-bg-elevated hover:bg-bg-surface-3 text-text-primary border border-border",
        ghost:
          "hover:bg-bg-surface-3 text-text-secondary hover:text-text-primary",
        link:
          "text-accent-500 underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-[var(--radius-sm)] px-3 text-xs",
        lg: "h-10 rounded-[var(--radius-md)] px-6",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

const Button = React.forwardRef(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
