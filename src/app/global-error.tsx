"use client";

import { useEffect } from "react";
import { reportCrash } from "@/lib/crash";

// Backstop for throws that escape the board's own ErrorBoundary (root layout,
// routing, anything rendered above it). Replaces Next's built-in error page so
// the crash is reported instead of only reaching the console.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportCrash(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif",
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          background: "#f8fafc",
          margin: 0,
        }}
      >
        <div
          style={{
            maxWidth: 420,
            width: "100%",
            background: "#fff",
            border: "1px solid #e2e8f0",
            borderRadius: 12,
            padding: 20,
          }}
        >
          <h1 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>
            Something broke
          </h1>
          <p style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
            The error has been reported. Your cards are safe on the server.
          </p>
          <pre
            style={{
              fontSize: 11,
              color: "#475569",
              background: "#f8fafc",
              padding: 8,
              borderRadius: 6,
              overflow: "auto",
              maxHeight: 120,
            }}
          >
            {error.message}
            {error.digest ? `\n\ndigest: ${error.digest}` : ""}
          </pre>
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button
              onClick={reset}
              style={{
                border: "1px solid #cbd5e1",
                background: "#fff",
                borderRadius: 6,
                padding: "6px 12px",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                border: "none",
                background: "#1e293b",
                color: "#fff",
                borderRadius: 6,
                padding: "6px 12px",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Reload
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
