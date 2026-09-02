import { useEffect, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SealMark } from "@/components/seal-mark";
import { cn } from "@/lib/utils";

const SIZES = ["text-base", "text-lg", "text-xl"] as const;

export function ReaderView({
  text,
  onClose,
}: {
  text: string;
  onClose: () => void;
}) {
  const [size, setSize] = useState(1);

  useEffect(() => {
    const burn = () => onClose();
    const onHide = () => {
      if (document.visibilityState === "hidden") burn();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", burn);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", burn);
    };
  }, [onClose]);

  useEffect(() => {
    const block = (e: Event) => e.preventDefault();
    document.addEventListener("copy", block);
    document.addEventListener("cut", block);
    return () => {
      document.removeEventListener("copy", block);
      document.removeEventListener("cut", block);
    };
  }, []);

  const paragraphs = text.split(/\n+/).filter((p) => p.length > 0);

  return (
    <div className="flex min-h-dvh flex-col bg-paper text-ink">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-ink/8 bg-paper/90 px-4 py-3 backdrop-blur-sm pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-2">
          <SealMark className="size-8 text-sm" />
          <p className="text-xs text-ink-muted">Fuse withdrawn · burns on exit</p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-10 min-h-10"
            onClick={() => setSize((n) => Math.max(0, n - 1))}
            aria-label="Smaller text"
          >
            <Minus className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-10 min-h-10"
            onClick={() => setSize((n) => Math.min(SIZES.length - 1, n + 1))}
            aria-label="Larger text"
          >
            <Plus className="size-4" />
          </Button>
        </div>
      </header>

      <article
        className={cn(
          "mx-auto w-full max-w-lg flex-1 px-6 py-8 font-display leading-[1.9] text-pretty select-none",
          SIZES[size],
        )}
      >
        {paragraphs.map((p, i) => (
          <p key={i} className="mb-6 last:mb-0">
            {p}
          </p>
        ))}
      </article>

      <footer className="sticky bottom-0 border-t border-ink/8 bg-paper px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Button type="button" variant="ink" className="w-full" onClick={onClose}>
          Close
        </Button>
      </footer>
    </div>
  );
}
