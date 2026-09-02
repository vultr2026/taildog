import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "ink" | "outline" | "ghost";
type Size = "lg" | "md" | "sm" | "icon";

const variantClasses: Record<Variant, string> = {
  primary: "bg-accent text-accent-fg shadow-[var(--shadow-border)] hover:opacity-90",
  ink: "bg-ink text-paper shadow-[var(--shadow-border)] hover:opacity-90",
  outline: "bg-transparent text-ink shadow-[var(--shadow-border)] hover:bg-paper-2",
  ghost: "bg-transparent text-ink-muted hover:text-ink hover:bg-paper-2",
};

const sizeClasses: Record<Size, string> = {
  lg: "h-12 min-h-12 rounded-lg px-5 text-sm",
  md: "h-11 min-h-11 rounded-md px-4 text-sm",
  sm: "h-9 min-h-9 rounded-sm px-3 text-xs",
  icon: "size-11 min-h-11 rounded-md",
};

export function Button({
  className,
  variant = "primary",
  size = "lg",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-[opacity,transform,background-color,color] duration-[var(--motion-quick)] ease-[var(--ease-smooth-out)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:pointer-events-none disabled:opacity-40 active:scale-[0.98] select-none",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    />
  );
}
