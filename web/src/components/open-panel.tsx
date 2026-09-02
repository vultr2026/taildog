import { useState, type ChangeEvent } from "react";
import { Eye, EyeOff, FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { hasSubtleCrypto, openPlaintext, verifyPassword } from "@/lib/crypto";
import { consumeFuse } from "@/lib/fuse-client";
import { decodeArmor } from "@/lib/payload";

function formatOpenError(code: string): string {
  switch (code) {
    case "EMPTY":
      return "Paste the ciphertext, or choose a .taildog file.";
    case "FORMAT":
      return "This does not look like Taildog ciphertext. Check that you copied it in full.";
    case "PASSWORD":
      return "Wrong passphrase. The letter is still intact — it will not burn from a wrong guess.";
    case "NOSERVER":
      return "No fuse server configured. Open Settings and set your server address.";
    case "consumed":
      return "This letter has already been opened and cannot be read again.";
    case "expired":
      return "This letter has expired; the fuse has been voided.";
    case "missing":
      return "This letter could not be found. The ciphertext may be incomplete, or it belongs to another server.";
    case "CIPHER":
      return "The ciphertext is damaged. The fuse has been withdrawn and cannot be retried.";
    case "HTTPS":
      return "Cannot decrypt in this environment. Open the app over HTTPS.";
    default:
      return "Opening failed. Check your connection and try again.";
  }
}

export function OpenPanel({
  onOpened,
}: {
  onOpened: (plaintext: string) => void;
}) {
  const [raw, setRaw] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      setRaw(text);
      setError(null);
    } catch {
      setError("Could not read this file.");
    }
  }

  async function onOpen() {
    setError(null);
    if (!hasSubtleCrypto()) {
      setError(formatOpenError("HTTPS"));
      return;
    }
    if (password.length < 1) {
      setError("Enter the passphrase.");
      return;
    }
    setBusy(true);
    try {
      const payload = decodeArmor(raw);
      const pwBits = await verifyPassword(payload, password);
      const consumed = await consumeFuse({ id: payload.id });
      if (consumed.status !== "ok") {
        setError(formatOpenError(consumed.status));
        return;
      }
      const plaintext = await openPlaintext(payload, pwBits, consumed.fuse);
      onOpened(plaintext);
      setRaw("");
      setPassword("");
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      setError(formatOpenError(code));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-1 flex-col gap-5">
      <header className="space-y-1">
        <h2 className="font-display text-2xl font-medium tracking-tight text-ink">Open</h2>
        <p className="text-sm leading-relaxed text-ink-muted text-pretty">
          The passphrase is checked on this device first. Only a correct passphrase withdraws the
          fuse. Once read — or once you leave the page — this ciphertext can never be opened again.
        </p>
      </header>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="sealed-body">Ciphertext</Label>
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 text-xs font-medium text-accent">
            <FileUp className="size-3.5" />
            Choose file
            <input
              type="file"
              accept=".taildog,.txt,text/plain"
              className="sr-only"
              onChange={onFile}
            />
          </label>
        </div>
        <Textarea
          id="sealed-body"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder="Paste ciphertext starting with taildog-1. …"
          className="min-h-40 font-mono text-xs leading-relaxed"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="open-pw">Passphrase</Label>
        <div className="relative">
          <Input
            id="open-pw"
            type={showPw ? "text" : "password"}
            autoComplete="off"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="The passphrase you agreed on"
            className="pr-12"
          />
          <button
            type="button"
            className="absolute right-1 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center text-ink-muted"
            onClick={() => setShowPw((v) => !v)}
            aria-label={showPw ? "Hide passphrase" : "Show passphrase"}
          >
            {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </div>

      {error ? <p className="text-sm text-accent">{error}</p> : null}

      <Button type="button" onClick={onOpen} disabled={busy} className="w-full">
        {busy ? "Opening…" : "Open"}
      </Button>
    </section>
  );
}
