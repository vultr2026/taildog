import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getFuseServer, setFuseServer, testFuseServer } from "@/lib/fuse-client";

export function SettingsPanel({
  onServerChanged,
}: {
  onServerChanged: (has: boolean) => void;
}) {
  const [url, setUrl] = useState(() => getFuseServer() ?? "");
  const [status, setStatus] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  function onSave() {
    const trimmed = url.trim().replace(/\/+$/, "");
    setUrl(trimmed);
    setFuseServer(trimmed);
    onServerChanged(trimmed.length > 0);
    setStatus(trimmed ? "Saved." : "Server address cleared.");
  }

  async function onTest() {
    const trimmed = url.trim();
    if (!trimmed) {
      setStatus("Enter a server address first.");
      return;
    }
    setTesting(true);
    setStatus(null);
    const ok = await testFuseServer(trimmed);
    setTesting(false);
    setStatus(
      ok
        ? "Connected — the server is reachable."
        : "Could not reach the server. Check the address and make sure it is running.",
    );
  }

  return (
    <section className="flex flex-1 flex-col gap-5">
      <header className="space-y-1">
        <h2 className="font-display text-2xl font-medium tracking-tight text-ink">Settings</h2>
        <p className="text-sm leading-relaxed text-ink-muted text-pretty">
          The fuse server stores the one-time keys that let a letter be opened exactly once. Point
          this app at your own server (for example http://192.168.1.10:8787). It never sees your
          message or passphrase.
        </p>
      </header>

      <div className="space-y-2">
        <Label htmlFor="fuse-server">Fuse server URL</Label>
        <Input
          id="fuse-server"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="http://your-server:8787"
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      {status ? <p className="text-sm text-ink-muted">{status}</p> : null}

      <div className="grid grid-cols-2 gap-3">
        <Button type="button" onClick={onSave}>
          Save
        </Button>
        <Button type="button" variant="outline" onClick={onTest} disabled={testing}>
          {testing ? "Testing…" : "Test"}
        </Button>
      </div>
    </section>
  );
}
