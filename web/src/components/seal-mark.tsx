import { cn } from "@/lib/utils";

export function SealMark({
  className,
  label = "S",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex size-11 items-center justify-center rounded-sm",
        "border-[1.5px] border-accent text-accent",
        "font-display text-lg font-medium tracking-[0.2em]",
        "rotate-[-8deg]",
        className,
      )}
    >
      {label}
    </span>
  );
}
