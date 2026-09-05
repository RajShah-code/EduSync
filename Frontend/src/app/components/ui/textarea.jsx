import * as React from "react";

import { cn } from "./utils";
import { fieldClass } from "./input";

function Textarea({ className, ...props }) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(fieldClass, "h-auto min-h-16 py-2.5 leading-relaxed resize-y field-sizing-content", className)}
      {...props}
    />
  );
}

export { Textarea };
