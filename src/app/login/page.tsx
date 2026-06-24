"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const EDITORS = ["Vignesh", "Mrunal", "Samyukta"];
  const [password, setPassword] = useState("");
  const [name, setName] = useState("Guest");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const isEditor = EDITORS.includes(name);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(false);
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, name }),
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
        <p className="text-sm text-slate-500">Who are you?</p>
        <select
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-slate-500"
        >
          {EDITORS.map((n) => (
            <option key={n} value={n}>
              {n} (editor)
            </option>
          ))}
          <option value="Guest">Guest (view only)</option>
        </select>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
          placeholder={isEditor ? "Editor password" : "Guest password"}
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
