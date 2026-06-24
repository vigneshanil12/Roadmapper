"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Identity = {
  name: string;
  label: string;
  role: "editor" | "guest";
  color: string;
};

const IDENTITIES: Identity[] = [
  { name: "Vignesh", label: "Vignesh", role: "editor", color: "bg-rose-500" },
  { name: "Mrunal", label: "Mrunal", role: "editor", color: "bg-amber-500" },
  { name: "Samyukta", label: "Samyukta", role: "editor", color: "bg-emerald-500" },
  { name: "Guest", label: "Guest", role: "guest", color: "bg-slate-400" },
];

function initials(name: string): string {
  return name.slice(0, 1).toUpperCase();
}

export default function LoginPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<Identity | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setLoading(true);
    setError(false);
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, name: selected.name }),
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
      <div className="w-full max-w-sm space-y-6 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold">Roadmap</h1>

        {!selected ? (
          <>
            <p className="text-sm text-slate-500">Choose your avatar</p>
            <div className="grid grid-cols-2 gap-3">
              {IDENTITIES.map((id) => (
                <button
                  key={id.name}
                  type="button"
                  onClick={() => {
                    setSelected(id);
                    setPassword("");
                    setError(false);
                  }}
                  className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 p-4 transition hover:border-slate-400 hover:bg-slate-50"
                >
                  <span
                    className={`flex h-12 w-12 items-center justify-center rounded-full text-lg font-semibold text-white ${id.color}`}
                  >
                    {initials(id.name)}
                  </span>
                  <span className="text-sm font-medium text-slate-700">
                    {id.label}
                  </span>
                  <span className="text-xs text-slate-400">
                    {id.role === "editor" ? "editor" : "view only"}
                  </span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="flex items-center gap-3">
              <span
                className={`flex h-10 w-10 items-center justify-center rounded-full text-base font-semibold text-white ${selected.color}`}
              >
                {initials(selected.name)}
              </span>
              <div className="flex-1">
                <div className="text-sm font-medium text-slate-700">
                  {selected.label}
                </div>
                <div className="text-xs text-slate-400">
                  {selected.role === "editor" ? "editor" : "view only"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelected(null);
                  setError(false);
                }}
                className="text-xs text-slate-500 underline hover:text-slate-700"
              >
                Change
              </button>
            </div>
            <input
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
              placeholder={
                selected.role === "editor" ? "Editor password" : "Guest password"
              }
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
        )}
      </div>
    </div>
  );
}
