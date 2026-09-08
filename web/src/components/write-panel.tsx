import { useMemo, useState } from "react";
import { Check, Copy, Download, Eye, EyeOff, Link2 } from "lucide-react";
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
import {
  depositFuse,
  depositLetter,
  fetchServerId,
  getFuseServer,
} from "@/lib/fuse-client";
import { serverTag } from "@/lib/server-tag";
import { encodeArmor, FUSE_TTL_DAYS, MAX_PLAINTEXT } from "@/lib/payload";
import { copyText } from "@/lib/clipboard";
import { cn } from "@/lib/utils";

type ShareMode = "link" | "cipher";

export function WritePanel() {
  const [body, setBody] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [mode, setMode] = useState<ShareMode>("link");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [share, setShare] = useState<string | null>(null);
  const [shareKind, setShareKind] = useState<ShareMode>("link");
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
    if (password.length < 8) {
      setError("Passphrase must be at least 8 characters. A phrase only the two of you know works best.");
      return;
    }
    const server = getFuseServer();
    if (!server) {
      setError("No fuse server configured. Open Settings and set your server address.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "cipher") {
        // Offline flow: deposit only the one-time fuse server-side, keep the
        // whole ciphertext on the device, and hand the recipient a self-contained
        // armored blob they can send through any channel.
        const fuse = newFuse();
        const deposited = await depositFuse({ fuse });
        const payload = await sealPlaintext(text, password, deposited.id, fuse);
        setShare(encodeArmor(payload));
        setShareKind("cipher");
      } else {
        // Link flow: store the ciphertext on the server and share a short id.
        const info = await fetchServerId();
        const tag = await serverTag(info.serverId);
        const fuse = newFuse();
        const payload = await sealPlaintext(text, password, fuse, fuse);
        const deposited = await depositLetter({ fuse, ct: JSON.stringify(payload) });
        setShare(`${tag}.${deposited.id}`);
        setShareKind("link");
      }
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      if (code === "NOSERVER" || code === "SERVER_INFO_FAILED" || code === "DEPOSIT_FAILED") {
        setError("No fuse server configured. Open Settings and set your server address.");
      } else {
        setError("Sealing failed. Check your connection and try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  function shareLink(): string {
    // Prefer the web app's own origin so the link opens the reader, not the
    // fuse API. In the Android WebView (file:// or a localhost dev origin) there
    // is no shareable web origin, so fall back to the fuse server address.
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const webOrigin =
      origin &&
      origin !== "null" &&
      !origin.startsWith("file:") &&
      !/^https?:\/\/localhost/.test(origin)
        ? origin
        : "";
    const base = webOrigin || getFuseServer();
    return base ? `${base.replace(/\/+$/, "")}/#${share}` : "";
  }

  async function onCopy() {
    if (!share) return;
    try {
      await copyText(share);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError("Copy failed. Long-press the text and copy manually.");
    }
  }

  async function onCopyLink() {
    const link = shareLink();
    if (!link) return;
    try {
      await copyText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError("Copy failed. Long-press the text and copy manually.");
    }
  }

  async function onDownload() {
    if (!share) return;
    try {
      const blob = new Blob([share], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "taildog-letter.taildog";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("Download failed. Save the text below manually.");
    }
  }

  function onReset() {
    setShare(null);
    setBody("");
    setPassword("");
    setError(null);
  }

  if (share) {
    const link = shareKind === "link" ? shareLink() : "";
    const isLink = shareKind === "link";
    return (
      <section className="flex flex-1 flex-col gap-5">
        <header className="space-y-1">
          <h2 className="font-display text-2xl font-medium tracking-tight text-ink">Sealed</h2>
          <p className="text-sm leading-relaxed text-ink-muted text-pretty">
            {isLink ? (
              <>
                Send this ID to the recipient (for example over chat). Send the passphrase separately
                — never in the same message. Once opened, this letter is destroyed; it also expires
                after {FUSE_TTL_DAYS} days if never opened.
              </>
            ) : (
              <>
                Send this ciphertext to the recipient over any channel (WeChat, email, a file). The
                fuse that unlocks it lives on your server and is spent the moment they open it. Send
                the passphrase separately — never in the same message. It also expires after{" "}
                {FUSE_TTL_DAYS} days if never opened.
              </>
            )}
          </p>
        </header>
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-paper-2 px-4 py-3 font-mono text-xs leading-relaxed text-ink-muted shadow-[var(--shadow-border)]">
          {share}
        </pre>
        <div className="grid grid-cols-2 gap-3">
          <Button type="button" onClick={onCopy}>
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? "Copied" : "Copy"}
          </Button>
          {isLink && link ? (
            <Button type="button" variant="outline" onClick={onCopyLink}>
              {copied ? <Check className="size-4" /> : <Link2 className="size-4" />}
              {copied ? "Copied" : "Copy link"}
            </Button>
          ) : !isLink ? (
            <Button type="button" variant="outline" onClick={onDownload}>
              <Download className="size-4" />
              Download
            </Button>
          ) : null}
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
        <Label>Share as</Label>
        <div className="grid grid-cols-2 gap-2 rounded-lg border border-ink/8 bg-paper-2/40 p-1">
          <button
            type="button"
            onClick={() => setMode("link")}
            className={cn(
              "rounded-md px-3 py-2 text-sm font-medium transition-colors",
              mode === "link" ? "bg-paper text-ink shadow-[var(--shadow-border)]" : "text-ink-muted",
            )}
          >
            Link
          </button>
          <button
            type="button"
            onClick={() => setMode("cipher")}
            className={cn(
              "rounded-md px-3 py-2 text-sm font-medium transition-colors",
              mode === "cipher"
                ? "bg-paper text-ink shadow-[var(--shadow-border)]"
                : "text-ink-muted",
            )}
          >
            Ciphertext
          </button>
        </div>
        <p className="text-xs text-ink-subtle">
          {mode === "link"
            ? "Store the letter on your server and share a short link/ID."
            : "Keep the ciphertext on your device and send it yourself (works offline)."}
        </p>
      </div>

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
