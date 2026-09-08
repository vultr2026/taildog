import { Capacitor } from "@capacitor/core";

/**
 * Copy text to the system clipboard.
 *
 * On Android the app runs inside a Capacitor WebView. The web Async Clipboard
 * API (`navigator.clipboard.writeText`) is frequently blocked there — the
 * WebView is not granted the clipboard-write capability, so the call throws
 * `NotAllowedError` or silently no-ops. We therefore bridge to the native
 * `@capacitor/clipboard` plugin, which calls Android's `ClipboardManager`
 * directly. On the web we use the standard API, and as a last resort we fall
 * back to the legacy `execCommand("copy")` path, which a WebView still honors
 * for a focused text selection.
 */
export async function copyText(text: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const { Clipboard } = await import("@capacitor/clipboard");
    await Clipboard.write({ string: text });
    return;
  }

  if (
    navigator.clipboard &&
    typeof window.isSecureContext !== "undefined" &&
    window.isSecureContext &&
    typeof navigator.clipboard.writeText === "function"
  ) {
    await navigator.clipboard.writeText(text);
    return;
  }

  legacyCopy(text);
}

function legacyCopy(text: string): void {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.top = "-9999px";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  ta.setSelectionRange(0, text.length);
  const ok = document.execCommand("copy");
  document.body.removeChild(ta);
  if (!ok) {
    throw new Error("copy-failed");
  }
}
