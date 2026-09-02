import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-12 w-full rounded-md bg-paper-2 px-4 text-base text-ink shadow-[var(--shadow-border)]",
        "placeholder:text-ink-subtle",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35",
        "disabled:opacity-40",
        className,
      )}
      {...props}
    />
  );
}
