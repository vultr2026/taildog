import type { TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "min-h-40 w-full resize-y rounded-lg bg-paper-2 px-4 py-3 text-base leading-relaxed text-ink shadow-[var(--shadow-border)]",
        "placeholder:text-ink-subtle",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35",
        "disabled:opacity-40",
        className,
      )}
      {...props}
    />
  );
}
