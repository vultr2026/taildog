import { useCallback, useState, type ReactNode } from "react";
import { FileText, PenLine, Settings } from "lucide-react";
import { OpenPanel } from "@/components/open-panel";
import { ReaderView } from "@/components/reader-view";
import { SealMark } from "@/components/seal-mark";
import { WritePanel } from "@/components/write-panel";
import { SettingsPanel } from "@/components/settings-panel";
import { hasFuseServer } from "@/lib/fuse-client";
import { cn } from "@/lib/utils";

type Tab = "write" | "open" | "settings";

export default function App() {
  const [tab, setTab] = useState<Tab>("write");
  const [reading, setReading] = useState<string | null>(null);
  const [serverConfigured, setServerConfigured] = useState<boolean>(() => hasFuseServer());

  const closeReader = useCallback(() => {
    setReading(null);
  }, []);

  if (reading !== null) {
    return <ReaderView text={reading} onClose={closeReader} />;
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs tracking-[0.28em] text-ink-subtle">TAILDOG</p>
          <h1 className="font-display text-3xl font-medium tracking-tight text-ink">Taildog</h1>
          <p className="text-sm text-ink-muted">A letter you can open only once.</p>
        </div>
        <SealMark />
      </header>

      {!serverConfigured && tab !== "settings" ? (
        <div className="mb-5 flex items-center justify-between gap-3 rounded-lg border border-warn/30 bg-warn/10 px-4 py-3">
          <p className="text-sm text-ink">
            No fuse server configured. Letters cannot be sealed or opened until you set one.
          </p>
          <button
            type="button"
            onClick={() => setTab("settings")}
            className="shrink-0 text-sm font-medium text-accent"
          >
            Configure
          </button>
        </div>
      ) : null}

      <div className="flex-1 pb-32">
        <div className={cn(tab !== "write" && "hidden")}>
          <WritePanel />
        </div>
        <div className={cn(tab !== "open" && "hidden")}>
          <OpenPanel onOpened={setReading} />
        </div>
        <div className={cn(tab !== "settings" && "hidden")}>
          <SettingsPanel onServerChanged={setServerConfigured} />
        </div>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-ink/8 bg-paper/95 backdrop-blur-sm">
        <div className="mx-auto grid max-w-lg grid-cols-3 px-5 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2">
          <TabButton
            active={tab === "write"}
            icon={<PenLine className="size-4" />}
            label="Write"
            onClick={() => setTab("write")}
          />
          <TabButton
            active={tab === "open"}
            icon={<FileText className="size-4" />}
            label="Open"
            onClick={() => setTab("open")}
          />
          <TabButton
            active={tab === "settings"}
            icon={<Settings className="size-4" />}
            label="Settings"
            onClick={() => setTab("settings")}
          />
        </div>
      </nav>
    </div>
  );
}

function TabButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-md text-xs font-medium transition-colors duration-[var(--motion-quick)]",
        active ? "text-accent" : "text-ink-muted",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
