"use client";

import React from "react";
import { reportCrash, installCrashHandlers, recordAction } from "@/lib/crash";

// Catches render/lifecycle throws from the board and reports them with the
// React component stack (which Next's built-in error page does not give us).
// Shows a recovery panel instead of blowing the whole tree away, so the user
// can retry without losing their place.
export default class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  componentDidMount() {
    installCrashHandlers();
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    reportCrash(error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h1 className="text-sm font-semibold text-slate-900">
            The board hit an error
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            It has been reported with the details needed to fix it. Your cards
            are safe on the server — reloading picks up where you left off.
          </p>
          <pre className="mt-3 max-h-32 overflow-auto rounded bg-slate-50 p-2 font-mono text-[11px] text-slate-600">
            {error.message}
          </pre>
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => {
                recordAction("recover:retry");
                this.setState({ error: null });
              }}
              className="rounded border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-100"
            >
              Try again
            </button>
            <button
              onClick={() => window.location.reload()}
              className="rounded bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
            >
              Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
