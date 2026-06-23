"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(false);
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setLoading(false);
    if (res.ok) {
      router.push("/");
      router.refresh();
    } else {
      setError(true);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm"
      >
        <h1 className="text-xl font-semibold">Roadmap</h1>
        <p className="text-sm text-slate-500">Enter the shared password.</p>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
          placeholder="Password"
        />
        {error && (
          <p className="text-sm text-red-600">Wrong password. Try again.</p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-slate-900 py-2 font-medium text-white disabled:opacity-50"
        >
          {loading ? "Checking…" : "Enter"}
        </button>
      </form>
    </div>
  );
}
