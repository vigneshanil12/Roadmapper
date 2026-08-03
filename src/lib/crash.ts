"use client";

// Client crash capture. The board is a long-lived client component with a lot
// of racy state (drag + 3s poll + realtime), and a render-time throw unmounts
// the whole tree into Next's built-in error page — the stack lands in the
// browser console and is gone the moment the user reloads. This module keeps a
// rolling breadcrumb trail and ships crashes to /api/client-error so a report
// survives the reload.

export interface Breadcrumb {
  t: number; // ms since page load
  kind: string; // "drag:start", "poll:apply", "card:add", ...
  detail?: string;
}

// Last N actions before the crash. Small on purpose: this is a debugging aid,
// not analytics — nothing here is read unless something throws.
const MAX_BREADCRUMBS = 30;
const trail: Breadcrumb[] = [];

// Cap reports per page load. A crash loop (report -> re-render -> crash) would
// otherwise hammer the API.
const MAX_REPORTS = 3;
let reportCount = 0;
// Dedupe the common case where the same error reaches us twice (error boundary
// + window.onerror) within the same tick.
let lastKey = "";
let lastKeyAt = 0;

export function recordAction(kind: string, detail?: string) {
  trail.push({ t: Math.round(performance.now()), kind, detail });
  if (trail.length > MAX_BREADCRUMBS) trail.shift();
}

export function getBreadcrumbs(): Breadcrumb[] {
  return trail.slice();
}

function readCookie(name: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

function clamp(s: string | undefined | null, max: number): string | null {
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

export function reportCrash(error: unknown, componentStack?: string | null) {
  if (typeof window === "undefined") return;
  if (reportCount >= MAX_REPORTS) return;

  const err =
    error instanceof Error
      ? error
      : new Error(typeof error === "string" ? error : JSON.stringify(error));
  const key = `${err.name}:${err.message}`;
  const now = Date.now();
  if (key === lastKey && now - lastKeyAt < 2000) return;
  lastKey = key;
  lastKeyAt = now;
  reportCount++;

  const payload = {
    message: clamp(`${err.name}: ${err.message}`, 1000),
    stack: clamp(err.stack, 8000),
    component_stack: clamp(componentStack, 8000),
    breadcrumbs: getBreadcrumbs(),
    url: clamp(window.location.href, 500),
    user_agent: clamp(navigator.userAgent, 500),
    user_name: clamp(readCookie("rm_name"), 100),
    session_id: clamp(localStorage.getItem("rm_session_id"), 100),
  };

  // keepalive: the report must survive the reload the user is about to hit.
  try {
    fetch("/api/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Never let the reporter throw on top of the original error.
  }
}

// Async throws (a poll `.then`, a realtime callback) never reach a React error
// boundary — they surface as an uncaught error or an unhandled rejection.
// Install once per page load.
let installed = false;
export function installCrashHandlers() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (e) => {
    reportCrash(e.error ?? e.message);
  });
  window.addEventListener("unhandledrejection", (e) => {
    reportCrash(e.reason ?? "unhandledrejection");
  });
}
