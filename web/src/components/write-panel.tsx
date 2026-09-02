import { useMemo, useState } from "react";
import { Check, Copy, Download, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  hasSubtleCrypto,
  newFuse,
  passwordStrength,
  sealPlaintext,
} from "@/lib/crypto";
import { depositFuse } from "@/lib/fuse-client";
import { encodeArmor, FUSE_TTL_DAYS, MAX_PLAINTEXT } from "@/lib/payload";
import { cn } from "@/lib/utils";

export function WritePanel() {
  const [body, setBody] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [armor, setArmor] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const strength = useMemo(() => passwordStrength(password), [password]);

  async function onSeal() {
    setError(null);
    if (!hasSubtleCrypto()) {
      setError("Cannot encrypt in this environment. Open the app over HTTPS.");
      return;
    }
    const text = body.trim();
    if (!text) {
      setError("Write your message first.");
      return;
    }
    if (text.length > MAX_PLAINTEXT) {
      setError(`Message is too long. Maximum ${MAX_PLAINTEXT.toLocaleString()} characters.`);
      return;
    }
    if (password.length < 4) {
      setError("Passphrase must be at least 4 characters. A phrase only the two of you know works best.");
      return;
    }
    setBusy(true);
    try {
      const fuse = newFuse();
      const deposited = await depositFuse({ fuse });
      const payload = await sealPlaintext(text, password, deposited.id, fuse);
      setArmor(encodeArmor(payload));
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      if (code === "NOSERVER") {
        setError("No fuse server configured. Open Settings and set your server address.");
      } else {
        setError("Sealing failed. Check your connection and try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function onCopy() {
    if (!armor) return;
    try {
      await navigator.clipboard.writeText(armor);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError("Copy failed. Long-press the text and copy manually.");
    }
  }

  function onDownload() {
    if (!armor) return;
    const blob = new Blob([armor], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "letter.taildog";
    a.click();
    URL.revokeObjectURL(url);
  }

  function onReset() {
    setArmor(null);
    setBody("");
    setPassword("");
    setError(null);
  }

  if (armor) {
    return (
      <section className="flex flex-1 flex-col gap-5">
        <header className="space-y-1">
          <h2 className="font-display text-2xl font-medium tracking-tight text-ink">Sealed</h2>
          <p className="text-sm leading-relaxed text-ink-muted text-pretty">
            Send the ciphertext below to the recipient. Send the passphrase separately — never in
            the same message. Once opened, this ciphertext becomes invalid; it also expires after{" "}
            {FUSE_TTL_DAYS} days if never opened.
          </p>
        </header>
        <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-paper-2 px-4 py-3 font-mono text-xs leading-relaxed text-ink-muted shadow-[var(--shadow-border)]">
          {armor}
        </pre>
        <div className="grid grid-cols-2 gap-3">
          <Button type="button" onClick={onCopy}>
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? "Copied" : "Copy ciphertext"}
          </Button>
          <Button type="button" variant="outline" onClick={onDownload}>
            <Download className="size-4" />
            Download file
          </Button>
        </div>
        <Button type="button" variant="ghost" onClick={onReset}>
          Write another
        </Button>
      </section>
    );
  }

  return (
    <section className="flex flex-1 flex-col gap-5">
      <header className="space-y-1">
        <h2 className="font-display text-2xl font-medium tracking-tight text-ink">Write</h2>
        <p className="text-sm leading-relaxed text-ink-muted text-pretty">
          Your message is encrypted on this device only. What you send is ciphertext; the recipient
          opens it once with the same reader and passphrase.
        </p>
      </header>

      <div className="space-y-2">
        <Label htmlFor="letter-body">Message</Label>
        <Textarea
          id="letter-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write your message…"
          className="min-h-52 font-display leading-loose"
        />
        <p className="text-right text-xs tabular-nums text-ink-subtle">
          {body.trim().length} / {MAX_PLAINTEXT.toLocaleString()}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="letter-pw">Passphrase</Label>
        <div className="relative">
          <Input
            id="letter-pw"
            type={showPw ? "text" : "password"}
            autoComplete="off"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="A phrase only the two of you know"
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
        {password.length > 0 ? (
          <p
            className={cn(
              "text-xs",
              strength === "weak" && "text-warn",
              strength === "ok" && "text-ink-muted",
              strength === "strong" && "text-ok",
            )}
          >
            {strength === "weak"
              ? "Passphrase is weak. If intercepted before opening, it could still be guessed."
              : strength === "ok"
                ? "Fair. A longer phrase is safer."
                : "Strong enough."}
          </p>
        ) : null}
      </div>

      {error ? <p className="text-sm text-accent">{error}</p> : null}

      <Button type="button" onClick={onSeal} disabled={busy} className="w-full">
        {busy ? "Sealing…" : "Seal"}
      </Button>
    </section>
  );
}
